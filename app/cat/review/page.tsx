'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import {
  ChevronLeft, ChevronRight, Send, BrainCircuit, Target,
  Check, X, AlertTriangle, Layers, ChevronDown,
} from 'lucide-react';
import { auth, db } from '@/app/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { MockSession, QuestionAttempt, ErrorType, CATSection, CATQuestion } from '@/app/lib/catTypes';
import Link from 'next/link';

const ERROR_TYPES: { key: ErrorType; label: string }[] = [
  { key: 'calculation', label: 'Calculation error' },
  { key: 'concept', label: 'Concept gap' },
  { key: 'trap', label: 'Trap option' },
  { key: 'rush', label: 'Rush' },
  { key: 'careless', label: 'Careless' },
];

const SECTION_COLORS: Record<CATSection, string> = {
  VARC: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DILR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  QA: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function CATReviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<MockSession | null>(null);
  const [reviewQueue, setReviewQueue] = useState<QuestionAttempt[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Error taxonomy state
  const [knewHowToSolve, setKnewHowToSolve] = useState<boolean | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorType | null>(null);
  const [taxonomySaved, setTaxonomySaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { if (u) setUser(u); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('catResult');
    if (!raw) { router.push('/cat'); return; }
    const s: MockSession = JSON.parse(raw);
    setSession(s);
    // Review only wrong questions (attempted but incorrect)
    const queue = s.attempts.filter(a => a.isAttempted && !a.isCorrect);
    setReviewQueue(queue);
  }, [router]);

  // Reset chat + taxonomy when question changes
  useEffect(() => {
    setMessages([]);
    setKnewHowToSolve(null);
    setSelectedError(null);
    setTaxonomySaved(false);
  }, [currentIdx]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentAttempt = reviewQueue[currentIdx];
  const currentQuestion = session
    ? session.attempts.find(a => a.questionId === currentAttempt?.questionId)
    : null;

  // Find the full question data (with text + options) from sessionStorage
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  useEffect(() => {
    const raw = sessionStorage.getItem('catQuestions');
    if (raw) setAllQuestions(JSON.parse(raw));
  }, []);

  const fullQuestion = allQuestions.find(q => q.id === currentAttempt?.questionId);

  // Similar past questions (RAG-lite): same questionType + chapter, from the catQuestions bank
  const [similarQuestions, setSimilarQuestions] = useState<CATQuestion[]>([]);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);

  useEffect(() => {
    setSimilarQuestions([]);
    setSimilarOpen(false);
    if (!currentAttempt) return;

    let cancelled = false;
    setSimilarLoading(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'catQuestions'),
          where('questionType', '==', currentAttempt.questionType),
          where('chapter', '==', currentAttempt.chapter),
          limit(4)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const results = snap.docs
          .map(d => d.data() as CATQuestion)
          .filter(qn => qn.id !== currentAttempt.questionId)
          .slice(0, 3);
        setSimilarQuestions(results);
      } catch {
        if (!cancelled) setSimilarQuestions([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentAttempt?.questionId, currentAttempt?.questionType, currentAttempt?.chapter]);

  const saveTaxonomy = async (knowHow: boolean, errorType: ErrorType) => {
    setKnewHowToSolve(knowHow);
    setSelectedError(errorType);
    setTaxonomySaved(true);

    // Update in session storage
    if (session) {
      const updatedAttempts = session.attempts.map(a =>
        a.questionId === currentAttempt.questionId
          ? { ...a, knewHowToSolve: knowHow, errorType }
          : a
      );
      const updatedSession = { ...session, attempts: updatedAttempts };
      sessionStorage.setItem('catResult', JSON.stringify(updatedSession));
      setSession(updatedSession);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !fullQuestion || !currentAttempt) return;
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    const contextualMessage = `[CAT REVIEW CONTEXT]
Section: ${currentAttempt.section} | Type: ${currentAttempt.questionType} | Chapter: ${currentAttempt.chapter}
Question: ${fullQuestion.questionText}
${fullQuestion.isTITA
  ? '[TITA question — no options]'
  : `Options: A) ${fullQuestion.options?.A} | B) ${fullQuestion.options?.B} | C) ${fullQuestion.options?.C} | D) ${fullQuestion.options?.D}`}
Correct Answer: ${currentAttempt.correctAnswer}
Student's error classification: ${selectedError ?? 'not classified yet'}

For QA questions: show 2-3 different approaches (brute force, approximation, algebraic).
For DILR: explain how to set up the caselet before solving.
For VARC RC: explain the reasoning process, not just the answer.

Formatting: write ALL math as LaTeX wrapped in $ ... $ (inline) or $$ ... $$ (block) — e.g. $\\frac{22}{7}$, $x^2$, $\\sqrt{x}$, $\\pi$, $\\theta$. Never use unicode math symbols or plain-text notation like x^2 or sqrt(x) outside of $ delimiters.

Student's question: ${userText}`;

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: contextualMessage, history }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'model', text: data.response || data.error }]);
    } catch {
      setMessages(prev => [...prev, { role: 'model', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!session || reviewQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center gap-4">
        <BrainCircuit size={40} className="text-amber-400" />
        {reviewQueue.length === 0 && session ? (
          <>
            <p className="text-white font-semibold text-lg">No wrong questions!</p>
            <p className="text-gray-400 text-sm">Perfect score or no answers attempted.</p>
            <Link href="/cat/results" className="text-amber-400 hover:underline text-sm">← Back to results</Link>
          </>
        ) : (
          <div className="text-gray-400 text-sm">Loading review...</div>
        )}
      </div>
    );
  }

  const isFirst = currentIdx === 0;
  const isLast = currentIdx === reviewQueue.length - 1;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/cat/results" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Results
          </Link>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <BrainCircuit size={16} className="text-amber-400" />
            <span className="font-semibold text-white">Review with Mika</span>
          </div>
        </div>
        <span className="text-sm text-gray-400 font-mono">
          {currentIdx + 1} / {reviewQueue.length} wrong
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: question + taxonomy */}
        <div className="w-full lg:w-[480px] flex flex-col border-r border-gray-800 flex-shrink-0 overflow-y-auto">
          {/* Question navigation */}
          <div className="p-5 border-b border-gray-800 flex items-center gap-3">
            <button
              onClick={() => !isFirst && setCurrentIdx(i => i - 1)}
              disabled={isFirst}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-xs text-gray-500">Wrong Question</span>
              <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${((currentIdx + 1) / reviewQueue.length) * 100}%` }}
                />
              </div>
            </div>
            <button
              onClick={() => !isLast && setCurrentIdx(i => i + 1)}
              disabled={isLast}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {fullQuestion && currentAttempt && (
            <div className="p-5 space-y-5 flex-1">
              {/* Meta */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SECTION_COLORS[currentAttempt.section]}`}>
                  {currentAttempt.section}
                </span>
                <span className="text-xs text-gray-500">{currentAttempt.chapter}</span>
                {fullQuestion.isTITA && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">TITA</span>
                )}
              </div>

              {/* Question text */}
              <div className="text-white text-sm leading-relaxed markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                  {fullQuestion.questionText}
                </ReactMarkdown>
              </div>

              {/* Options with color coding */}
              {!fullQuestion.isTITA && fullQuestion.options && (
                <div className="space-y-2">
                  {(['A', 'B', 'C', 'D'] as const).map(key => {
                    const isCorrect = key === currentAttempt.correctAnswer;
                    const isWrong = key === currentAttempt.selectedAnswer && !isCorrect;
                    return (
                      <div
                        key={key}
                        className={`px-4 py-2.5 rounded-xl border text-sm ${
                          isCorrect ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' :
                          isWrong ? 'border-red-500/60 bg-red-500/10 text-red-300' :
                          'border-gray-800 text-gray-400'
                        }`}
                      >
                        <span className="font-semibold mr-2">{key}.</span>
                        {fullQuestion.options[key]}
                        {isCorrect && <Check size={14} className="inline ml-2 text-emerald-400" />}
                        {isWrong && <X size={14} className="inline ml-2 text-red-400" />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TITA answer comparison */}
              {fullQuestion.isTITA && (
                <div className="flex gap-3">
                  <div className="flex-1 p-3 rounded-xl border border-red-500/40 bg-red-500/10">
                    <div className="text-xs text-red-400 font-semibold mb-1">Your answer</div>
                    <div className="font-mono text-red-300">{currentAttempt.selectedAnswer || '—'}</div>
                  </div>
                  <div className="flex-1 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10">
                    <div className="text-xs text-emerald-400 font-semibold mb-1">Correct answer</div>
                    <div className="font-mono text-emerald-300">{currentAttempt.correctAnswer}</div>
                  </div>
                </div>
              )}

              {/* Explanation */}
              {fullQuestion.explanation && (
                <div className="p-4 rounded-xl border border-gray-700 bg-gray-900/50">
                  <div className="text-xs text-amber-400 font-semibold mb-2 uppercase tracking-wider">Explanation</div>
                  <div className="text-sm text-gray-300 leading-relaxed markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                      {fullQuestion.explanation}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Similar past questions (RAG-lite) */}
              {!similarLoading && similarQuestions.length > 0 && (
                <div className="rounded-xl border border-gray-700 bg-gray-900/50 overflow-hidden">
                  <button
                    onClick={() => setSimilarOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      <Layers size={12} className="text-amber-400" />
                      Similar past questions ({similarQuestions.length})
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-gray-500 transition-transform ${similarOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {similarOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
                      {similarQuestions.map(sq => (
                        <div key={sq.id} className="p-3 rounded-lg border border-gray-800 bg-gray-950/50">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                              CAT {sq.year} Slot {sq.slot}
                            </span>
                            {sq.difficulty && (
                              <span className="text-xs text-gray-500 capitalize">{sq.difficulty}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-300 leading-relaxed markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                              {sq.questionText}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error taxonomy */}
              <div className="p-4 rounded-xl border border-gray-700 bg-gray-900/50 space-y-4">
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={12} className="text-amber-400" />
                  Error Classification
                </div>

                {!taxonomySaved ? (
                  <>
                    <div>
                      <div className="text-xs text-gray-500 mb-2">Did you know how to solve this?</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setKnewHowToSolve(true)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                            knewHowToSolve === true
                              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                              : 'border-gray-700 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setKnewHowToSolve(false)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                            knewHowToSolve === false
                              ? 'border-red-500/60 bg-red-500/15 text-red-300'
                              : 'border-gray-700 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-2">What went wrong?</div>
                      <div className="flex flex-wrap gap-2">
                        {ERROR_TYPES.map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setSelectedError(key)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                              selectedError === key
                                ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                                : 'border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {knewHowToSolve !== null && selectedError && (
                      <button
                        onClick={() => saveTaxonomy(knewHowToSolve!, selectedError)}
                        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
                      >
                        Save classification
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <Check size={14} className="text-emerald-400" />
                    Classified as <span className="text-amber-300 font-semibold">{selectedError}</span>
                    {knewHowToSolve !== null && (
                      <span className="text-gray-500">· {knewHowToSolve ? 'Knew how' : 'Concept gap'}</span>
                    )}
                    <button onClick={() => setTaxonomySaved(false)} className="text-gray-600 hover:text-gray-400 ml-auto">
                      edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Mika chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
            <Target size={15} className="text-amber-400" />
            <span className="text-sm font-semibold text-white">Ask Mika about this question</span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-60 text-center">
                <BrainCircuit size={36} className="text-amber-400 mb-3" />
                <p className="text-sm text-gray-400">Ask Mika to explain this question.</p>
                <p className="text-xs text-gray-600 mt-1">
                  {currentAttempt?.section === 'QA' && 'Tip: Ask for multiple solution approaches.'}
                  {currentAttempt?.section === 'DILR' && 'Tip: Ask how to set up the caselet.'}
                  {currentAttempt?.section === 'VARC' && 'Tip: Ask about the reasoning process.'}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  msg.role === 'user' ? 'bg-gray-800 text-gray-300' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {msg.role === 'user' ? 'YOU' : <BrainCircuit size={14} />}
                </div>
                <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gray-800 border border-gray-700'
                    : 'bg-white/5 border border-white/10'
                }`}>
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <BrainCircuit size={14} className="text-amber-400" />
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm text-gray-400 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4 border-t border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 focus-within:border-amber-500/50 transition-colors">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about this question..."
                className="flex-1 bg-transparent outline-none text-sm text-gray-200 placeholder:text-gray-600"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
