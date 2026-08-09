'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/app/lib/firebase';
import { Flag } from 'lucide-react';
import SectionTimer from '@/app/components/cat/SectionTimer';
import CATQuestionCard from '@/app/components/cat/CATQuestionCard';
import CATNavigator from '@/app/components/cat/CATNavigator';
import { CATQuestion, CATSection, QuestionAttempt, MockSession, SectionResult } from '@/app/lib/catTypes';

const SECTION_ORDER: CATSection[] = ['VARC', 'DILR', 'QA'];
const SECTION_DURATION_SECONDS = 40 * 60;
const FINAL_FIVE_MIN_CUTOFF = SECTION_DURATION_SECONDS - 300;

interface DraftAttempt {
  selectedAnswer: string | null;
  visitCount: number;
  changedAnswerCount: number;
  wasMarkedForReview: boolean;
  timeSpentSeconds: number;
  sectionElapsedWhenAnswered: number;
}

function scoreMCQ(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected === correct ? 3 : -1;
}

function scoreTITA(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected.trim() === correct.trim() ? 3 : 0;
}

function emptyDraft(): DraftAttempt {
  return {
    selectedAnswer: null,
    visitCount: 0,
    changedAnswerCount: 0,
    wasMarkedForReview: false,
    timeSpentSeconds: 0,
    sectionElapsedWhenAnswered: 0,
  };
}

export default function CATSessionPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<CATQuestion[]>([]);
  const [drafts, setDrafts] = useState<DraftAttempt[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [lockedSections, setLockedSections] = useState<CATSection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const visitStartRef = useRef<number>(Date.now());
  const remainingRef = useRef<Record<CATSection, number>>({ VARC: SECTION_DURATION_SECONDS, DILR: SECTION_DURATION_SECONDS, QA: SECTION_DURATION_SECONDS });
  const timeUsedRef = useRef<Record<CATSection, number>>({ VARC: 0, DILR: 0, QA: 0 });
  const visitedRef = useRef<Set<number>>(new Set());
  const userRef = useRef<{ uid: string; name: string; email: string | null } | null>(null);

  const activeSection = SECTION_ORDER[sectionIdx];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      userRef.current = u ? { uid: u.uid, name: u.displayName || 'Student', email: u.email } : null;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('catQuestions');
    if (!raw) {
      router.replace('/cat');
      return;
    }
    try {
      const qs: CATQuestion[] = JSON.parse(raw);
      if (qs.length === 0) throw new Error('empty');
      setQuestions(qs);
      setDrafts(qs.map(() => emptyDraft()));
      const firstIdx = qs.findIndex(q => q.section === SECTION_ORDER[0]);
      setCurrentIndex(firstIdx >= 0 ? firstIdx : 0);
    } catch {
      router.replace('/cat');
    }
  }, [router]);

  // Track visit + time spent whenever the current question changes.
  useEffect(() => {
    if (questions.length === 0) return;
    visitStartRef.current = Date.now();
    if (!visitedRef.current.has(currentIndex)) {
      visitedRef.current.add(currentIndex);
      setDrafts(prev => prev.map((d, i) => (i === currentIndex ? { ...d, visitCount: d.visitCount + 1 } : d)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions.length]);

  const flushTimeSpent = (index: number) => {
    const elapsed = Math.round((Date.now() - visitStartRef.current) / 1000);
    if (elapsed <= 0) return;
    setDrafts(prev => prev.map((d, i) => (i === index ? { ...d, timeSpentSeconds: d.timeSpentSeconds + elapsed } : d)));
    visitStartRef.current = Date.now();
  };

  const jumpTo = (index: number) => {
    if (index === currentIndex) return;
    flushTimeSpent(currentIndex);
    setCurrentIndex(index);
  };

  const handleSelect = (answer: string) => {
    const value = answer === '' ? null : answer;
    setDrafts(prev =>
      prev.map((d, i) => {
        if (i !== currentIndex) return d;
        const changed = d.selectedAnswer !== null && value !== null && d.selectedAnswer !== value;
        return {
          ...d,
          selectedAnswer: value,
          changedAnswerCount: d.changedAnswerCount + (changed ? 1 : 0),
          sectionElapsedWhenAnswered: SECTION_DURATION_SECONDS - remainingRef.current[activeSection],
        };
      })
    );
  };

  const toggleMarkForReview = () => {
    setDrafts(prev => prev.map((d, i) => (i === currentIndex ? { ...d, wasMarkedForReview: !d.wasMarkedForReview } : d)));
  };

  const goToNextSection = (fromTimerEnd: boolean) => {
    flushTimeSpent(currentIndex);
    timeUsedRef.current[activeSection] = SECTION_DURATION_SECONDS - remainingRef.current[activeSection];
    setLockedSections(prev => (prev.includes(activeSection) ? prev : [...prev, activeSection]));

    if (sectionIdx >= SECTION_ORDER.length - 1) {
      if (fromTimerEnd) void handleSubmit();
      return;
    }
    const nextSection = SECTION_ORDER[sectionIdx + 1];
    const nextIdx = questions.findIndex(q => q.section === nextSection);
    setSectionIdx(sectionIdx + 1);
    if (nextIdx >= 0) setCurrentIndex(nextIdx);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    flushTimeSpent(currentIndex);
    timeUsedRef.current[activeSection] = SECTION_DURATION_SECONDS - remainingRef.current[activeSection];

    // setDrafts updaters run in queued order, so this sees flushTimeSpent's result.
    setDrafts(finalDrafts => {
      const attempts: QuestionAttempt[] = questions.map((q, i) => {
        const d = finalDrafts[i];
        const isAttempted = d.selectedAnswer !== null && d.selectedAnswer !== '';
        const isCorrect = isAttempted && d.selectedAnswer!.trim() === q.correctAnswer.trim();
        return {
          questionId: q.id,
          section: q.section,
          questionType: q.questionType,
          chapter: q.chapter,
          isTITA: q.isTITA,
          selectedAnswer: d.selectedAnswer,
          correctAnswer: q.correctAnswer,
          isCorrect,
          isAttempted,
          timeSpentSeconds: d.timeSpentSeconds,
          sectionElapsedWhenAnswered: d.sectionElapsedWhenAnswered,
          visitCount: d.visitCount,
          wasMarkedForReview: d.wasMarkedForReview,
          changedAnswerCount: d.changedAnswerCount,
        };
      });

      const sectionResults = {} as MockSession['sectionResults'];
      let totalScore = 0;
      for (const sec of SECTION_ORDER) {
        const secAttempts = attempts.filter(a => a.section === sec);
        let netScore = 0;
        let correctCount = 0, wrongCount = 0, skippedCount = 0, attemptCount = 0;
        let finalFiveMinAttempts = 0, finalFiveMinCorrect = 0;
        for (const a of secAttempts) {
          if (!a.isAttempted) { skippedCount++; continue; }
          attemptCount++;
          const score = a.isTITA ? scoreTITA(a.selectedAnswer, a.correctAnswer) : scoreMCQ(a.selectedAnswer, a.correctAnswer);
          netScore += score;
          if (a.isCorrect) correctCount++; else if (!a.isTITA) wrongCount++;
          if (a.sectionElapsedWhenAnswered >= FINAL_FIVE_MIN_CUTOFF) {
            finalFiveMinAttempts++;
            if (a.isCorrect) finalFiveMinCorrect++;
          }
        }
        totalScore += netScore;
        sectionResults[sec] = {
          section: sec,
          timeAllocatedSeconds: SECTION_DURATION_SECONDS,
          timeUsedSeconds: timeUsedRef.current[sec],
          attemptCount,
          correctCount,
          wrongCount,
          skippedCount,
          netScore,
          finalFiveMinAttempts,
          finalFiveMinCorrect,
        };
      }

      const mockName = sessionStorage.getItem('catMockName') || 'CAT Mock';
      const user = userRef.current;
      const session: MockSession & { studentName?: string; studentEmail?: string | null } = {
        sessionId: '',
        studentId: user?.uid || 'anonymous',
        instituteId: 'demo-institute',
        mockName,
        takenAt: Date.now(),
        totalScore,
        sectionResults,
        attempts,
        studentName: user?.name,
        studentEmail: user?.email ?? null,
      };

      sessionStorage.setItem('catResult', JSON.stringify(session));
      sessionStorage.setItem('catQuestionsForReview', JSON.stringify(questions));

      fetch('/api/save-cat-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      })
        .then(res => res.json())
        .then(data => {
          if (data.sessionId) {
            const updated = { ...session, sessionId: data.sessionId };
            sessionStorage.setItem('catResult', JSON.stringify(updated));
          }
        })
        .catch(() => {})
        .finally(() => router.push('/cat/results'));

      return finalDrafts;
    });
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading mock...</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentDraft = drafts[currentIndex];
  const isSectionLocked = lockedSections.includes(activeSection);
  const sectionAttempts = drafts.filter((d, i) => questions[i].section === activeSection);
  const answeredCount = sectionAttempts.filter(d => d.selectedAnswer).length;
  const unansweredCount = sectionAttempts.length - answeredCount;
  const markedCount = sectionAttempts.filter(d => d.wasMarkedForReview).length;
  const isLastSection = sectionIdx === SECTION_ORDER.length - 1;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex">
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-800 p-4 overflow-y-auto">
        <CATNavigator
          questions={questions}
          attempts={drafts}
          currentIndex={currentIndex}
          activeSection={activeSection}
          lockedSections={lockedSections}
          onJump={jumpTo}
        />
      </aside>

      <main className="flex-1 flex flex-col p-6">
        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
          <CATQuestionCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            selectedAnswer={currentDraft?.selectedAnswer ?? null}
            onSelect={handleSelect}
            isLocked={isSectionLocked}
          />

          <div className="mt-8 flex items-center justify-between gap-3 pt-6 border-t border-gray-800">
            <button
              onClick={() => jumpTo(Math.max(questions.findIndex(q => q.section === activeSection), currentIndex - 1))}
              disabled={currentIndex === 0 || questions[currentIndex - 1]?.section !== activeSection}
              className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={toggleMarkForReview}
              disabled={isSectionLocked}
              className={`px-4 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors disabled:opacity-40 ${
                currentDraft?.wasMarkedForReview
                  ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                  : 'border-gray-800 hover:border-gray-600'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {currentDraft?.wasMarkedForReview ? 'Unmark' : 'Mark for Review'}
            </button>
            <button
              onClick={() => jumpTo(Math.min(questions.length - 1, currentIndex + 1))}
              disabled={isSectionLocked || questions[currentIndex + 1]?.section !== activeSection}
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save & Next
            </button>
          </div>
        </div>
      </main>

      <aside className="hidden lg:flex flex-col w-56 border-l border-gray-800 p-4 space-y-6">
        <SectionTimer
          key={activeSection}
          section={activeSection}
          totalSeconds={SECTION_DURATION_SECONDS}
          onTick={remaining => { remainingRef.current[activeSection] = remaining; }}
          onSectionEnd={() => goToNextSection(true)}
        />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>Answered</span>
            <span className="font-semibold text-emerald-400">{answeredCount}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>Unanswered</span>
            <span className="font-semibold text-gray-400">{unansweredCount}</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span>Marked</span>
            <span className="font-semibold text-orange-400">{markedCount}</span>
          </div>
        </div>

        <button
          onClick={() => goToNextSection(false)}
          className="w-full py-2.5 rounded-lg border border-gray-800 hover:border-amber-500/50 text-sm font-semibold transition-colors"
        >
          {isLastSection ? 'End Section' : `End Section — Go to ${SECTION_ORDER[sectionIdx + 1]}`}
        </button>

        {isLastSection && (
          <button
            onClick={() => setShowSubmitModal(true)}
            className="w-full py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
          >
            Submit Mock
          </button>
        )}
      </aside>

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Submit mock?</h2>
            <p className="text-sm text-gray-400">
              Once submitted you cannot change your answers. Sections already locked cannot be revisited.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg border border-gray-800 hover:border-gray-600 text-sm disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 disabled:opacity-40"
              >
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
