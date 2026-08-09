'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Send, BrainCircuit, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ExamResult, ParsedQuestion } from '@/app/lib/examTypes';

type ChatMessage = { role: 'user' | 'model'; text: string };

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export default function ExamReviewPage() {
  const router = useRouter();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [currentWrongIndex, setCurrentWrongIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('examResult');
    if (!raw) {
      router.replace('/exam');
      return;
    }
    try {
      setResult(JSON.parse(raw));
    } catch {
      router.replace('/exam');
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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading review...</p>
      </div>
    );
  }

  if (result.wrongQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 space-y-4">
        <BrainCircuit className="w-10 h-10 text-emerald-400" />
        <h1 className="text-2xl font-bold">No wrong answers!</h1>
        <p className="text-gray-400 text-sm">Nothing to review — go you.</p>
        <Link href="/exam/results" className="mt-2 px-5 py-2 rounded-xl bg-white text-black font-semibold text-sm">Back to results</Link>
      </div>
    );
  }

  const q: ParsedQuestion = result.wrongQuestions[currentWrongIndex];

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const contextual = `[EXAM REVIEW] Subject: ${q.subject} | Chapter: ${q.chapter} | Question: ${q.questionText} | Correct: ${q.correctAnswer} | Student asks: ${trimmed}`;

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
  const goNext = () => setCurrentWrongIndex(i => Math.min(result.wrongQuestions.length - 1, i + 1));

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/exam/results" className="text-sm text-gray-400 hover:text-white">← Back to results</Link>
          <p className="text-sm text-gray-400">
            Question <span className="text-white font-semibold">{currentWrongIndex + 1}</span> of {result.wrongQuestions.length}
          </p>
        </div>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{q.subject}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{q.chapter}</span>
            <span className="text-xs text-gray-500 ml-auto">Q{q.id}</span>
          </div>

          <p className="text-white text-base leading-relaxed whitespace-pre-wrap">{q.questionText}</p>

          <div className="space-y-2">
            {OPTION_KEYS.map(key => {
              const isCorrect = q.correctAnswer === key;
              return (
                <div
                  key={key}
                  className={`px-4 py-3 rounded-xl border text-sm ${
                    isCorrect
                      ? 'border-emerald-500 bg-emerald-500/15 text-white'
                      : 'border-gray-700 bg-gray-800/40 text-gray-300'
                  }`}
                >
                  <span className="font-semibold mr-3">{key}.</span>
                  {q.options[key]}
                  {isCorrect && <span className="ml-2 text-xs text-emerald-400 font-medium">✓ Correct</span>}
                </div>
              );
            })}
          </div>

          {q.explanation && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300 mb-1">Explanation</p>
              {q.explanation}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button
              onClick={goPrev}
              disabled={currentWrongIndex === 0}
              className="px-4 py-2 text-sm rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button
              onClick={goNext}
              disabled={currentWrongIndex === result.wrongQuestions.length - 1}
              className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-4">
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${msg.role === 'user' ? 'bg-zinc-800 text-gray-300' : 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'}`}>
                  {msg.role === 'user' ? 'YOU' : <BrainCircuit size={14} />}
                </div>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-800 border border-white/5' : 'bg-white/5 border border-white/10'}`}>
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
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-sm text-gray-400 flex items-center gap-2">
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
              className="flex-1 bg-zinc-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
