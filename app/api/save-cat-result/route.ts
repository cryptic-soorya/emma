import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/firebase';
import { collection, addDoc, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { logError } from '@/app/lib/logger';
import {
  MockSession,
  QuestionAttempt,
  ChapterStat,
  SkipRecommendation,
  StudentBehaviorProfile,
  CATSection,
  ErrorType,
  InstituteInsights,
  RevisionQueue,
} from '@/app/lib/catTypes';
import { mergeWrongAttemptsIntoQueue, updateStreak } from '@/app/lib/catStudy';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];

function latestSectionTotal(profile: StudentBehaviorProfile, fromEnd: number): number | null {
  let total = 0;
  for (const sec of SECTIONS) {
    const trend = profile.sectionStats[sec]?.scoreTrend ?? [];
    const idx = trend.length - 1 - fromEnd;
    if (idx < 0) return null;
    total += trend[idx];
  }
  return total;
}

function computeStudentAlert(profile: StudentBehaviorProfile): { type: 'declining' | 'stagnating' | 'breakthrough'; detail: string } | null {
  const latest = latestSectionTotal(profile, 0);
  const prev = latestSectionTotal(profile, 1);
  if (latest === null || prev === null) return null;

  const delta = latest - prev;
  const pctChange = prev !== 0 ? delta / Math.abs(prev) : (delta > 0 ? 1 : 0);

  if (delta <= -10 || pctChange <= -0.2) {
    return { type: 'declining', detail: `Score dropped from ${prev} to ${latest} (${delta} marks) in the latest mock` };
  }
  if (delta >= 15 || pctChange >= 0.25) {
    return { type: 'breakthrough', detail: `Score jumped from ${prev} to ${latest} (+${delta} marks) in the latest mock` };
  }
  if (profile.mockCount >= 3 && Math.abs(delta) < 5) {
    return { type: 'stagnating', detail: `Score has stayed flat around ${latest} for the last ${profile.mockCount} mocks` };
  }
  return null;
}

function computeBatchWeakAreas(profiles: StudentBehaviorProfile[]): InstituteInsights['batchWeakAreas'] {
  const map: Record<string, { section: CATSection; chapter: string; questionType: ChapterStat['questionType']; studentCount: number; accSum: number }> = {};
  for (const p of profiles) {
    for (const cs of p.chapterStats) {
      if (cs.totalAttempts < 3 || cs.netScoreImpact >= 0) continue;
      const key = `${cs.section}::${cs.chapter}::${cs.questionType}`;
      if (!map[key]) {
        map[key] = { section: cs.section, chapter: cs.chapter, questionType: cs.questionType, studentCount: 0, accSum: 0 };
      }
      map[key].studentCount++;
      map[key].accSum += cs.accuracy;
    }
  }
  return Object.values(map)
    .map(v => ({
      section: v.section,
      chapter: v.chapter,
      questionType: v.questionType,
      studentCount: v.studentCount,
      avgAccuracy: v.accSum / v.studentCount,
    }))
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 12);
}

function computeChapterStats(attempts: QuestionAttempt[]): ChapterStat[] {
  const map: Record<string, ChapterStat> = {};
  for (const a of attempts) {
    const key = `${a.section}::${a.chapter}::${a.questionType}`;
    if (!map[key]) {
      map[key] = {
        section: a.section,
        chapter: a.chapter,
        questionType: a.questionType,
        totalAttempts: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        accuracy: 0,
        netScoreImpact: 0,
        trend: 'stable',
      };
    }
    const stat = map[key];
    stat.totalAttempts++;
    if (!a.isAttempted) stat.skipped++;
    else if (a.isCorrect) { stat.correct++; stat.netScoreImpact += 3; }
    else if (!a.isTITA) { stat.wrong++; stat.netScoreImpact -= 1; }
  }
  for (const stat of Object.values(map)) {
    const attempted = stat.correct + stat.wrong;
    stat.accuracy = attempted > 0 ? stat.correct / attempted : 0;
  }
  return Object.values(map);
}

function computeSkipRecommendations(chapterStats: ChapterStat[]): SkipRecommendation[] {
  return chapterStats
    .filter(s => s.totalAttempts >= 3 && s.netScoreImpact < 0)
    .map(s => ({
      section: s.section,
      questionType: s.questionType,
      chapter: s.chapter,
      currentAccuracy: s.accuracy,
      netScoreImpact: s.netScoreImpact,
      projectedGainIfSkipped: Math.abs(s.wrong),
      reasoning: `You attempt ${s.chapter} (${s.questionType}) but accuracy is ${Math.round(s.accuracy * 100)}% — net impact: ${s.netScoreImpact} marks. Skipping recovers those marks.`,
    }))
    .sort((a, b) => a.netScoreImpact - b.netScoreImpact);
}

export async function POST(req: NextRequest) {
  try {
    const body: MockSession & { studentName?: string; studentEmail?: string | null } = await req.json();
    const { studentName, studentEmail, ...session } = body;

    // Save mock session.
    // NOTE: previously this spread `sessionId: undefined` into the doc, which
    // the Firestore client SDK rejects ("Unsupported field value: undefined").
    // Destructure it out instead. Attempts may also carry undefined optional
    // fields (errorType, knewHowToSolve) — strip those too.
    const sessionData: Partial<MockSession> & Omit<MockSession, 'sessionId'> = { ...session };
    delete sessionData.sessionId;
    const cleanAttempts = sessionData.attempts.map(a =>
      Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))
    );
    const docRef = await addDoc(collection(db, 'mockSessions'), {
      ...sessionData,
      attempts: cleanAttempts,
    });
    const sessionId = docRef.id;

    // Compute and upsert StudentBehaviorProfile
    const { studentId, instituteId } = session;
    if (studentId && instituteId) {
      await setDoc(doc(db, 'students', studentId), {
        name: studentName || 'Student',
        email: studentEmail ?? null,
        instituteId,
      }, { merge: true });

      const profileRef = doc(db, 'studentProfiles', studentId);
      const existing = await getDoc(profileRef);
      const prevProfile = existing.exists() ? (existing.data() as StudentBehaviorProfile) : null;

      const chapterStats = computeChapterStats(session.attempts);
      const skipRecs = computeSkipRecommendations(chapterStats);

      const sections: CATSection[] = ['VARC', 'DILR', 'QA'];
      const errorBreakdown: Record<ErrorType, number> = {
        calculation: 0, concept: 0, trap: 0, rush: 0, careless: 0,
      };
      for (const a of session.attempts) {
        if (a.errorType) errorBreakdown[a.errorType]++;
      }

      const sectionStats: StudentBehaviorProfile['sectionStats'] = {} as StudentBehaviorProfile['sectionStats'];
      for (const sec of sections) {
        const sr = session.sectionResults[sec];
        const secAttempts = session.attempts.filter(a => a.section === sec && a.isAttempted);
        const prevStat = prevProfile?.sectionStats?.[sec];
        const prevTrend = prevStat?.scoreTrend ?? [];

        sectionStats[sec] = {
          avgAccuracy: secAttempts.length > 0
            ? secAttempts.filter(a => a.isCorrect).length / secAttempts.length
            : 0,
          avgAttemptRate: sr.attemptCount / (sr.attemptCount + sr.skippedCount || 1),
          avgNetScore: sr.netScore,
          scoreTrend: [...prevTrend.slice(-4), sr.netScore],
          rushPattern: sr.finalFiveMinAttempts >= 3 &&
            (sr.finalFiveMinCorrect / (sr.finalFiveMinAttempts || 1)) < 0.4,
          avgTimePerQuestion: secAttempts.length > 0
            ? secAttempts.reduce((sum, a) => sum + a.timeSpentSeconds, 0) / secAttempts.length
            : 0,
        };
      }

      const now = Date.now();

      const profile: StudentBehaviorProfile = {
        studentId,
        instituteId,
        updatedAt: now,
        mockCount: (prevProfile?.mockCount ?? 0) + 1,
        sectionStats,
        errorBreakdown,
        chapterStats,
        skipRecommendations: skipRecs,
        optimalSectionOrder: ['VARC', 'DILR', 'QA'],
        // Study-consistency streak: submitting a mock counts as a study day.
        streak: updateStreak(prevProfile?.streak, now),
      };

      await setDoc(profileRef, profile, { merge: true });

      // Spaced-repetition revision queue: queue every wrong attempt from this
      // mock (missed again = interval resets). Read-modify-write on one doc.
      const queueRef = doc(db, 'revisionQueues', studentId);
      const queueSnap = await getDoc(queueRef);
      const prevQueue = queueSnap.exists() ? (queueSnap.data() as RevisionQueue) : null;
      const mergedQueue: RevisionQueue = {
        studentId,
        updatedAt: now,
        items: mergeWrongAttemptsIntoQueue(
          prevQueue?.items ?? [],
          session.attempts,
          session.mockName,
          now
        ),
      };
      await setDoc(queueRef, mergedQueue);

      // Recompute institute-wide insights across all students in this institute
      const profilesSnap = await getDocs(
        query(collection(db, 'studentProfiles'), where('instituteId', '==', instituteId))
      );
      const allProfiles = profilesSnap.docs.map(d => d.data() as StudentBehaviorProfile);

      const studentsSnap = await getDocs(
        query(collection(db, 'students'), where('instituteId', '==', instituteId))
      );
      const studentNames: Record<string, string> = {};
      for (const d of studentsSnap.docs) {
        studentNames[d.id] = (d.data().name as string) || 'Student';
      }

      const scores = allProfiles
        .map(p => latestSectionTotal(p, 0))
        .filter((n): n is number => n !== null);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const studentAlerts: InstituteInsights['studentAlerts'] = [];
      for (const p of allProfiles) {
        const alert = computeStudentAlert(p);
        if (alert) {
          studentAlerts.push({
            studentId: p.studentId,
            studentName: studentNames[p.studentId] ?? 'Student',
            type: alert.type,
            detail: alert.detail,
          });
        }
      }

      const insights: InstituteInsights = {
        instituteId,
        updatedAt: Date.now(),
        activeStudents: allProfiles.length,
        avgScore,
        batchWeakAreas: computeBatchWeakAreas(allProfiles),
        studentAlerts,
      };

      await setDoc(doc(db, 'instituteInsights', instituteId), insights);
    }

    return NextResponse.json({ sessionId });
  } catch (error: unknown) {
    await logError('save-cat-result', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
