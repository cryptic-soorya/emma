'use client';
/**
 * Revision Queue (spaced repetition) — added 2026-07-13.
 *
 * Every question a student gets wrong in a mock is queued here by
 * /api/save-cat-result with 1 → 3 → 7 → 14 day intervals. Answering a
 * revision item correctly advances the interval; past 14 days it retires
 * as mastered. Missing it again resets to 1 day.
 *
 * Why: CAT prep lives and dies on not repeating mistakes. A wrong PYQ
 * reviewed once is forgotten in a week — spaced re-testing is the cheapest
 * proven fix, and we already have every wrong attempt recorded.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ClipboardList, Loader2, ChevronRight, CheckCircle2, XCircle, Flame } from 'lucide-react';
import { auth, db } from '@/app/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CATQuestion, RevisionItem, RevisionQueue, StudentBehaviorProfile } from '@/app/lib/catTypes';
import { dueItems, reviewRevisionItem, updateStreak } from '@/app/lib/catStudy';
import CATQuestionCard from '@/app/components/cat/CATQuestionCard';

type Phase = 'loading' | 'review' | 'done' | 'empty';

export default function RevisionQueuePage() {
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<RevisionQueue | null>(null);
  const [due, setDue] = useState<RevisionItem[]>([]);
  const [questionCache, setQuestionCache] = useState<Record<string, CATQuestion | null>>({});
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'revisionQueues', user.uid));
        if (!snap.exists()) { setPhase('empty'); return; }
        const q = snap.data() as RevisionQueue;
        setQueue(q);
        const d = dueItems(q.items ?? [], Date.now());
        setDue(d);
        setPhase(d.length > 0 ? 'review' : 'empty');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load revision queue');
        setPhase('empty');
      }
    })();
  }, [user]);

  const item = due[idx];

  // Lazily fetch the full question doc for the current item.
  useEffect(() => {
    if (!item || questionCache[item.questionId] !== undefined) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'catQuestions', item.questionId));
        setQuestionCache(c => ({
          ...c,
          [item.questionId]: snap.exists() ? ({ ...snap.data(), id: snap.id } as CATQuestion) : null,
        }));
      } catch {
        setQuestionCache(c => ({ ...c, [item.questionId]: null }));
      }
    })();
  }, [item, questionCache]);

  const q = item ? questionCache[item.questionId] : undefined;
  const isCorrect = useMemo(
    () => !!q && selected !== null && selected.trim() === q.correctAnswer.trim(),
    [q, selected]
  );

  const persistQueue = async (items: RevisionItem[]) => {
    if (!user) return;
    const updated: RevisionQueue = { studentId: user.uid, updatedAt: Date.now(), items };
    setQueue(updated);
    try { await setDoc(doc(db, 'revisionQueues', user.uid), updated); }
    catch { /* best-effort; next mock submit rewrites the queue anyway */ }
  };

  const check = async () => {
    if (!item || !queue || selected === null) return;
    setRevealed(true);
    const updatedItem = reviewRevisionItem(item, isCorrect, Date.now());
    const rest = queue.items.filter(i => i.questionId !== item.questionId);
    await persistQueue(updatedItem ? [...rest, updatedItem] : rest);
    if (isCorrect) setClearedCount(c => c + 1);
  };

  const next = async () => {
    if (idx + 1 < due.length) {
      setIdx(i => i + 1); setSelected(null); setRevealed(false);
    } else {
      setPhase('done');
      // Clearing due revision items counts as a study day.
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'studentProfiles', user.uid));
          const prev = snap.exists() ? (snap.data() as StudentBehaviorProfile).streak : undefined;
          await setDoc(doc(db, 'studentProfiles', user.uid),
            { streak: updateStreak(prev, Date.now()) }, { merge: true });
        } catch { /* best-effort */ }
      }
    }
  };

  // Question doc missing from the bank (e.g. custom PDF mock) — skip it.
  const skipMissing = async () => {
    if (!item || !queue) return;
    await persistQueue(queue.items.filter(i => i.questionId !== item.questionId));
    if (idx + 1 < due.length) { setIdx(i => i + 1); setSelected(null); setRevealed(false); }
    else setPhase('done');
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/cat" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">← Mocks</Link>
        <div className="h-4 w-px bg-gray-800" />
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-amber-400" />
          <span className="font-semibold text-white">Revision Queue</span>
        </div>
        {phase === 'review' && (
          <span className="ml-auto text-xs text-gray-500 font-mono">{idx + 1} / {due.length} due</span>
        )}
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
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight mb-2">Nothing due for revision</h1>
            <p className="text-gray-400 text-sm mb-2">
              {queue && queue.items.length > 0
                ? `${queue.items.length} question${queue.items.length === 1 ? '' : 's'} scheduled — the next one unlocks when its interval comes up.`
                : 'Wrong answers from your mocks land here automatically, on a 1 → 3 → 7 → 14 day schedule.'}
            </p>
            <Link href="/cat" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all">
              Take a Mock <ChevronRight size={14} />
            </Link>
          </motion.div>
        )}

        {phase === 'review' && item && (
          <motion.div key={item.questionId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-6">
              <h1 className="text-lg font-bold tracking-tight">Re-test yourself</h1>
              <p className="text-xs text-gray-500">
                Missed in {item.sourceMockName} · review #{item.timesReviewed + 1}
                {item.lastErrorType ? ` · last error: ${item.lastErrorType}` : ''}
              </p>
            </div>

            {q === undefined && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              </div>
            )}

            {q === null && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-center">
                <p className="text-gray-400 text-sm mb-4">
                  This question isn&apos;t in the question bank (it came from a custom PDF mock), so it can&apos;t be re-tested.
                </p>
                <button onClick={skipMissing}
                  className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg transition-all">
                  Remove &amp; Continue
                </button>
              </div>
            )}

            {q && (
              <>
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
                        ? <><CheckCircle2 size={16} className="text-emerald-400" /><span className="font-semibold text-emerald-400">Correct — interval advanced</span></>
                        : <><XCircle size={16} className="text-red-400" /><span className="font-semibold text-red-400">Wrong again — answer: {q.correctAnswer}. Back to a 1-day interval.</span></>}
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {q.explanation || 'No explanation available.'}
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
                      {idx + 1 < due.length ? 'Next' : 'Finish'} <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <Flame className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-2">Revision session complete</h1>
            <p className="font-mono text-4xl font-bold text-white mb-2">{clearedCount} / {due.length}</p>
            <p className="text-gray-400 text-sm mb-8">
              Cleared items come back at a longer interval. Missed ones return tomorrow.
            </p>
            <Link href="/cat" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all">
              Back to Mocks <ChevronRight size={14} />
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
