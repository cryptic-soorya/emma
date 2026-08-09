'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/app/lib/firebase';
import { ChevronLeft, ChevronRight, Send, BrainCircuit, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MockSession, QuestionAttempt, CATQuestion, ErrorType } from '@/app/lib/catTypes';

type ChatMessage = { role: 'user' | 'model'; text: string };

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
const ERROR_TYPES: { key: ErrorType; label: string }[] = [
  { key: 'calculation', label: 'Calculation error' },
  { key: 'concept', label: 'Concept gap' },
  { key: 'trap', label: 'Trap option' },
  { key: 'rush', label: 'Rush' },
  { key: 'careless', label: 'Careless' },
];

export default function CATReviewPage() {
  const router = useRouter();
  const [result, setResult] = useState<MockSession | null>(null);
  const [questionBank, setQuestionBank] = useState<CATQuestion[]>([]);
  const [currentWrongIndex, setCurrentWrongIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('catResult');
    const qbRaw = sessionStorage.getItem('catQuestionsForReview');
    if (!raw || !qbRaw) {
      router.replace('/cat');
      return;
    }
    try {
      setResult(JSON.parse(raw));
      setQuestionBank(JSON.parse(qbRaw));
    } catch {
      router.replace('/cat');
    }
  }, [router]);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [currentWrongIndex]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!result) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading review...</p>
      </div>
    );
  }

  const wrongAttempts = result.attempts.filter(a => a.isAttempted && !a.isCorrect);

  if (wrongAttempts.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col items-center justify-center px-4 space-y-4">
        <BrainCircuit className="w-10 h-10 text-emerald-400" />
        <h1 className="text-2xl font-bold tracking-tight">No wrong answers!</h1>
        <p className="text-gray-400 text-sm">Nothing to review — go you.</p>
        <Link href="/cat/results" className="mt-2 px-5 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm">Back to results</Link>
      </div>
    );
  }

  const attempt = wrongAttempts[currentWrongIndex];
  const q = questionBank.find(bq => bq.id === attempt.questionId);

  const persistAttemptUpdate = async (updates: Partial<QuestionAttempt>) => {
    const nextAttempts = result.attempts.map(a =>
      a.questionId === attempt.questionId ? { ...a, ...updates } : a
    );
    const updated = { ...result, attempts: nextAttempts };
    setResult(updated);
    sessionStorage.setItem('catResult', JSON.stringify(updated));
    if (result.sessionId) {
      try {
        await updateDoc(doc(db, 'mockSessions', result.sessionId), { attempts: nextAttempts });
      } catch {
        // Best-effort — classification still persists in sessionStorage for this session.
      }
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !q) return;

    const contextual = `[CAT REVIEW CONTEXT]
Section: ${q.section} | Type: ${q.questionType} | Chapter: ${q.chapter}
Question: ${q.questionText}
${q.isTITA ? `[TITA question — no options]` : `Options: A) ${q.options!.A} | B) ${q.options!.B} | C) ${q.options!.C} | D) ${q.options!.D}`}
Correct Answer: ${q.correctAnswer}
Student's error classification: ${attempt.errorType ?? 'not classified yet'}

For QA questions: show 2-3 different approaches (brute force, approximation, algebraic).
For DILR: explain how to set up the caselet before solving.
For VARC RC: explain the reasoning process, not just the answer.

Student's question: ${trimmed}`;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const historyForApi = messages.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: contextual, history: historyForApi }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'model', text: data.response || data.error || 'No response' }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setMessages(prev => [...prev, { role: 'model', text: `⚠️ Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const goPrev = () => setCurrentWrongIndex(i => Math.max(0, i - 1));
  const goNext = () => setCurrentWrongIndex(i => Math.min(wrongAttempts.length - 1, i + 1));

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/cat/results" className="text-sm text-gray-400 hover:text-white">← Back to results</Link>
          <p className="text-sm text-gray-400">
            Wrong Question <span className="text-white font-semibold">{currentWrongIndex + 1}</span> of {wrongAttempts.length}
          </p>
        </div>

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-300 border border-gray-700">{attempt.section}</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">{attempt.chapter}</span>
            {attempt.isTITA && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">TITA</span>
            )}
          </div>

          {q ? (
            <>
              <div className="text-white text-base leading-relaxed">
                <ReactMarkdown>{q.questionText}</ReactMarkdown>
              </div>

              {!q.isTITA && (
                <div className="space-y-2">
                  {OPTION_KEYS.map(key => {
                    const isCorrect = q.correctAnswer === key;
                    const isYours = attempt.selectedAnswer === key;
                    return (
                      <div
                        key={key}
                        className={`px-4 py-3 rounded-lg border text-sm ${
                          isCorrect
                            ? 'border-emerald-500 bg-emerald-500/15 text-white'
                            : isYours
                              ? 'border-red-500 bg-red-500/15 text-white'
                              : 'border-gray-800 bg-gray-800/40 text-gray-300'
                        }`}
                      >
                        <span className="font-semibold mr-3">{key}.</span>
                        {q.options![key]}
                        {isCorrect && <span className="ml-2 text-xs text-emerald-400 font-semibold">✓ Correct</span>}
                        {isYours && !isCorrect && <span className="ml-2 text-xs text-red-400 font-semibold">Your answer</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {q.isTITA && (
                <div className="flex gap-4 text-sm">
                  <div><span className="text-gray-500">Your answer: </span><span className="text-red-400 font-mono font-semibold">{attempt.selectedAnswer}</span></div>
                  <div><span className="text-gray-500">Correct: </span><span className="text-emerald-400 font-mono font-semibold">{q.correctAnswer}</span></div>
                </div>
              )}

              {q.explanation && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">Explanation</p>
                  {q.explanation}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Question details unavailable for this session.</p>
          )}

          {/* Error taxonomy */}
          <div className="space-y-3 pt-2 border-t border-gray-800">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Did you know how to solve this?</span>
              <button
                onClick={() => persistAttemptUpdate({ knewHowToSolve: true })}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${attempt.knewHowToSolve === true ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-gray-800 text-gray-400 hover:border-gray-600'}`}
              >Yes</button>
              <button
                onClick={() => persistAttemptUpdate({ knewHowToSolve: false })}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${attempt.knewHowToSolve === false ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-gray-800 text-gray-400 hover:border-gray-600'}`}
              >No</button>
            </div>
            <div className="space-y-2">
              <span className="text-sm text-gray-400">What went wrong?</span>
              <div className="flex flex-wrap gap-2">
                {ERROR_TYPES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => persistAttemptUpdate({ errorType: key })}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${attempt.errorType === key ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-gray-800 text-gray-400 hover:border-gray-600'}`}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={goPrev}
              disabled={currentWrongIndex === 0}
              className="px-4 py-2 text-sm rounded-lg border border-gray-800 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button
              onClick={goNext}
              disabled={currentWrongIndex === wrongAttempts.length - 1}
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-4">
          <div className="flex items-center gap-2 px-2">
            <BrainCircuit className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Ask Mika about this question</h2>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto px-2">
            {messages.length === 0 && !loading && (
              <p className="text-sm text-gray-500 text-center py-8">
                Ask why the correct answer works, or where you went wrong.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${msg.role === 'user' ? 'bg-gray-800 text-gray-300' : 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'}`}>
                  {msg.role === 'user' ? 'YOU' : <BrainCircuit size={14} />}
                </div>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-gray-800 border border-gray-700' : 'bg-gray-900 border border-gray-800'}`}>
                  {msg.role === 'model' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center flex-shrink-0">
                  <BrainCircuit size={14} />
                </div>
                <div className="p-3 rounded-2xl bg-gray-900 border border-gray-800 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Mika is thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={e => { e.preventDefault(); sendMessage(); }}
            className="flex gap-2 pt-2 border-t border-gray-800"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Mika anything about this question..."
              disabled={loading}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
