'use client';
/**
 * Weak Chapter Drill Mode — added 2026-07-13.
 *
 * Pulls the student's worst chapters from their StudentBehaviorProfile
 * (accuracy < 60% with ≥3 attempts, ranked by netScoreImpact), then fetches
 * matching questions from the catQuestions bank for untimed practice with
 * instant feedback + explanations. This turns the skip-recommendation
 * diagnosis into actual remediation: a student either fixes the chapter or
 * confirms it belongs on the skip list.
 *
 * Untimed and unscored on purpose — no mockSessions writes, no -1 anxiety.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { BrainCircuit, Target, Loader2, ChevronRight, CheckCircle2, XCircle, Flame } from 'lucide-react';
import { auth, db } from '@/app/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where, setDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CATQuestion, ChapterStat, StudentBehaviorProfile, CATSection } from '@/app/lib/catTypes';
import { updateStreak } from '@/app/lib/catStudy';
import CATQuestionCard from '@/app/components/cat/CATQuestionCard';

const SECTION_BADGE: Record<CATSection, string> = {
  VARC: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DILR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  QA: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

type Phase = 'loading' | 'pick' | 'drill' | 'done' | 'empty';

export default function WeakChapterDrillPage() {
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [weakChapters, setWeakChapters] = useState<ChapterStat[]>([]);
  const [profile, setProfile] = useState<StudentBehaviorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drill state
  const [drillTitle, setDrillTitle] = useState('');
  const [questions, setQuestions] = useState<CATQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'studentProfiles', user.uid));
        if (!snap.exists()) { setPhase('empty'); return; }
        const p = snap.data() as StudentBehaviorProfile;
        setProfile(p);
        const weak = (p.chapterStats ?? [])
          .filter(s => s.totalAttempts >= 3 && s.accuracy < 0.6)
          .sort((a, b) => a.netScoreImpact - b.netScoreImpact);
        setWeakChapters(weak);
        setPhase(weak.length > 0 ? 'pick' : 'empty');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load profile');
        setPhase('empty');
      }
    })();
  }, [user]);

  const startDrill = async (stat: ChapterStat) => {
    setPhase('loading');
    setError(null);
    try {
      const snap = await getDocs(query(
        collection(db, 'catQuestions'),
        where('questionType', '==', stat.questionType),
        where('chapter', '==', stat.chapter),
        limit(10)
      ));
      if (snap.empty) {
        setError(`No ${stat.chapter} (${stat.questionType}) questions in the bank yet. Ask your institute to seed more PYQs.`);
        setPhase('pick');
        return;
      }
      setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as CATQuestion)));
      setDrillTitle(`${stat.chapter} · ${stat.questionType}`);
      setIdx(0); setSelected(null); setRevealed(false); setCorrectCount(0);
      setPhase('drill');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load questions');
      setPhase('pick');
    }
  };

  const q = questions[idx];
  const isCorrect = useMemo(
    () => q && selected !== null && selected.trim() === q.correctAnswer.trim(),
    [q, selected]
  );

  const check = () => {
    if (selected === null) return;
    setRevealed(true);
    if (isCorrect) setCorrectCount(c => c + 1);
  };

  const next = async () => {
    if (idx + 1 < questions.length) {
      setIdx(i => i + 1); setSelected(null); setRevealed(false);
    } else {
      setPhase('done');
      // Finishing a drill counts as a study day for the streak.
      if (user && profile) {
        try {
          await setDoc(doc(db, 'studentProfiles', user.uid),
            { streak: updateStreak(profile.streak, Date.now()) }, { merge: true });
        } catch { /* streak update is best-effort */ }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/cat" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">← Mocks</Link>
        <div className="h-4 w-px bg-gray-800" />
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-amber-400" />
          <span className="font-semibold text-white">Weak Chapter Drill</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>
        )}

        {phase === 'loading' && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          </div>
        )}

        {phase === 'empty' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Target className="w-10 h-10 text-gray-600 mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight mb-2">No weak chapters found yet</h1>
            <p className="text-gray-400 text-sm mb-6">
              Take at least one mock (ideally 2–3) so Mika can find chapters with under-60% accuracy to drill.
            </p>
            <Link href="/cat" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all">
              Take a Mock <ChevronRight size={14} />
            </Link>
          </motion.div>
        )}

        {phase === 'pick' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Drill your weak chapters</h1>
            <p className="text-gray-400 mb-8">
              Untimed practice pulled from your lowest-accuracy chapters. Fix the chapter — or confirm it belongs on your skip list.
            </p>
            <div className="space-y-3">
              {weakChapters.map(stat => (
                <button
                  key={`${stat.section}-${stat.chapter}-${stat.questionType}`}
                  onClick={() => startDrill(stat)}
                  className="w-full flex items-center justify-between gap-4 p-5 rounded-xl border border-gray-800 bg-gray-900/50 hover:border-amber-500/50 hover:bg-gray-900 transition-all text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold border shrink-0 ${SECTION_BADGE[stat.section]}`}>{stat.section}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{stat.chapter}</p>
                      <p className="text-xs text-gray-500">{stat.questionType} · {stat.totalAttempts} attempts</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-red-400 font-bold">{Math.round(stat.accuracy * 100)}%</p>
                    <p className="text-xs text-gray-500">net {stat.netScoreImpact > 0 ? '+' : ''}{stat.netScoreImpact}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'drill' && q && (
          <motion.div key={q.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-bold tracking-tight">{drillTitle}</h1>
                <p className="text-xs text-gray-500">Question {idx + 1} of {questions.length} · untimed · no negative marking</p>
              </div>
              <span className="font-mono text-sm text-emerald-400 font-semibold">{correctCount} correct</span>
            </div>

            {/* isLocked stays false — its overlay says "Section locked", which is
                wrong for a drill. Selection is frozen after reveal via the guard. */}
            <CATQuestionCard
              question={q}
              selectedAnswer={selected}
              onSelect={ans => { if (!revealed) setSelected(ans === '' ? null : ans); }}
              questionNumber={idx + 1}
              isLocked={false}
            />

            {revealed && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`mt-4 rounded-xl border p-5 ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {isCorrect
                    ? <><CheckCircle2 size={16} className="text-emerald-400" /><span className="font-semibold text-emerald-400">Correct</span></>
                    : <><XCircle size={16} className="text-red-400" /><span className="font-semibold text-red-400">Wrong — answer: {q.correctAnswer}</span></>}
                </div>
                <div className="text-sm text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {q.explanation || 'No explanation available for this question.'}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}

            <div className="flex gap-3 mt-6">
              {!revealed ? (
                <button onClick={check} disabled={selected === null}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Check Answer
                </button>
              ) : (
                <button onClick={next}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all flex items-center gap-2">
                  {idx + 1 < questions.length ? 'Next Question' : 'Finish Drill'} <ChevronRight size={14} />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Flame className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-2">Drill complete</h1>
            <p className="font-mono text-4xl font-bold text-white mb-2">{correctCount} / {questions.length}</p>
            <p className="text-gray-400 text-sm mb-8">
              {correctCount / Math.max(questions.length, 1) >= 0.7
                ? 'This chapter is recovering — keep it in your attempt list.'
                : 'Still shaky. Drill it again tomorrow, or keep it on your skip list for now.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setPhase('pick')}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all">
                Drill Another Chapter
              </button>
              <Link href="/cat" className="px-5 py-2.5 border border-gray-800 hover:border-gray-600 text-gray-300 font-semibold rounded-lg transition-all">
                Back to Mocks
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
