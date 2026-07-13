'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, ChevronLeft, ChevronRight, Send, Lock, AlertTriangle } from 'lucide-react';
import { auth } from '@/app/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  CATQuestion, CATSection, QuestionAttempt, MockSession, SectionResult,
} from '@/app/lib/catTypes';
import SectionTimer from '@/app/components/cat/SectionTimer';
import CATQuestionCard from '@/app/components/cat/CATQuestionCard';
import CATNavigator from '@/app/components/cat/CATNavigator';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];
const SECTION_DURATION = 2400; // 40 minutes

function scoreMCQ(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected === correct ? 3 : -1;
}

function scoreTITA(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected.trim() === correct.trim() ? 3 : 0;
}

export default function CATSessionPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [questions, setQuestions] = useState<CATQuestion[]>([]);
  const [mockName, setMockName] = useState('');
  const [attempts, setAttempts] = useState<Partial<QuestionAttempt>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<CATSection>('VARC');
  const [lockedSections, setLockedSections] = useState<CATSection[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showNextSectionModal, setShowNextSectionModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Per-question timing
  const questionStartTimeRef = useRef<number>(Date.now());
  // Section timing
  const sectionRemainingRef = useRef<number>(SECTION_DURATION);
  const sectionStartTimeRef = useRef<number>(Date.now());
  // Section key forces SectionTimer re-mount on section change
  const [sectionTimerKey, setSectionTimerKey] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { if (u) setUser(u); });
    return () => unsub();
  }, []);

  // Load from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('catQuestions');
    const name = sessionStorage.getItem('catMockName') || 'CAT Mock';
    if (!raw) { router.push('/cat'); return; }

    const qs: CATQuestion[] = JSON.parse(raw);
    setQuestions(qs);
    setMockName(name);

    const initial: Partial<QuestionAttempt>[] = qs.map(q => ({
      questionId: q.id,
      section: q.section,
      questionType: q.questionType,
      chapter: q.chapter,
      isTITA: q.isTITA,
      selectedAnswer: null,
      correctAnswer: q.correctAnswer,
      isCorrect: false,
      isAttempted: false,
      timeSpentSeconds: 0,
      sectionElapsedWhenAnswered: 0,
      visitCount: 0,
      wasMarkedForReview: false,
      changedAnswerCount: 0,
    }));
    setAttempts(initial);
    sectionStartTimeRef.current = Date.now();
  }, [router]);

  // Auto-save every 30s
  useEffect(() => {
    const id = setInterval(() => {
      sessionStorage.setItem('catAttempts', JSON.stringify(attempts));
    }, 30000);
    return () => clearInterval(id);
  }, [attempts]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Record time spent when leaving a question
  const recordTimeSpent = useCallback((idx: number) => {
    const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    setAttempts(prev => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = {
          ...next[idx],
          timeSpentSeconds: (next[idx].timeSpentSeconds ?? 0) + elapsed,
        };
      }
      return next;
    });
  }, []);

  // Navigate to a question
  const goToQuestion = useCallback((idx: number) => {
    recordTimeSpent(currentIndex);
    questionStartTimeRef.current = Date.now();

    // Mark as visited
    setAttempts(prev => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], visitCount: (next[idx].visitCount ?? 0) + 1 };
      }
      return next;
    });

    setCurrentIndex(idx);
    if (questions[idx]) setActiveSection(questions[idx].section);
  }, [currentIndex, questions, recordTimeSpent]);

  // Answer handler
  const handleSelect = (idx: number, value: string) => {
    setAttempts(prev => {
      const next = [...prev];
      const cur = next[idx] ?? {};
      const hadAnswer = !!cur.selectedAnswer;
      next[idx] = {
        ...cur,
        selectedAnswer: value || null,
        isAttempted: !!value,
        isCorrect: value
          ? (questions[idx].isTITA
              ? value.trim() === questions[idx].correctAnswer.trim()
              : value === questions[idx].correctAnswer)
          : false,
        sectionElapsedWhenAnswered: SECTION_DURATION - sectionRemainingRef.current,
        changedAnswerCount: hadAnswer && !!value ? (cur.changedAnswerCount ?? 0) + 1 : (cur.changedAnswerCount ?? 0),
      };
      return next;
    });
  };

  // Mark for review
  const toggleMarkForReview = (idx: number) => {
    setAttempts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], wasMarkedForReview: !next[idx].wasMarkedForReview };
      return next;
    });
  };

  // Section end logic
  const handleSectionEnd = useCallback((section: CATSection, moveNext = false) => {
    setLockedSections(prev => prev.includes(section) ? prev : [...prev, section]);

    const sectionIdx = SECTIONS.indexOf(section);
    const nextSection = SECTIONS[sectionIdx + 1];

    if (!nextSection) {
      // All sections done
      setShowSubmitModal(true);
      return;
    }

    if (!moveNext) {
      setToast(`${section} time is up! Moving to ${nextSection}.`);
    }

    // Find first question of next section
    const nextQ = questions.findIndex(q => q.section === nextSection);
    if (nextQ !== -1) {
      recordTimeSpent(currentIndex);
      questionStartTimeRef.current = Date.now();
      sectionStartTimeRef.current = Date.now();
      sectionRemainingRef.current = SECTION_DURATION;
      setCurrentIndex(nextQ);
      setActiveSection(nextSection);
      setSectionTimerKey(k => k + 1);
    }
  }, [questions, currentIndex, recordTimeSpent]);

  // Submit
  const handleSubmit = async () => {
    recordTimeSpent(currentIndex);
    setIsSaving(true);

    const allAttempts: QuestionAttempt[] = questions.map((q, i) => {
      const a = attempts[i] ?? {};
      return {
        questionId: q.id,
        section: q.section,
        questionType: q.questionType,
        chapter: q.chapter,
        isTITA: q.isTITA,
        selectedAnswer: a.selectedAnswer ?? null,
        correctAnswer: q.correctAnswer,
        isCorrect: a.isCorrect ?? false,
        isAttempted: a.isAttempted ?? false,
        timeSpentSeconds: a.timeSpentSeconds ?? 0,
        sectionElapsedWhenAnswered: a.sectionElapsedWhenAnswered ?? 0,
        visitCount: a.visitCount ?? 0,
        wasMarkedForReview: a.wasMarkedForReview ?? false,
        changedAnswerCount: a.changedAnswerCount ?? 0,
      };
    });

    // Compute section results
    const sectionResults = {} as MockSession['sectionResults'];
    for (const sec of SECTIONS) {
      const secAttempts = allAttempts.filter(a => a.section === sec);
      const finalFiveMin = SECTION_DURATION - 300;
      const late = secAttempts.filter(a => a.sectionElapsedWhenAnswered >= finalFiveMin && a.isAttempted);
      const lateCorrect = late.filter(a => a.isCorrect);
      let netScore = 0;
      for (const a of secAttempts) {
        netScore += a.isTITA ? scoreTITA(a.selectedAnswer, a.correctAnswer) : scoreMCQ(a.selectedAnswer, a.correctAnswer);
      }
      sectionResults[sec] = {
        section: sec,
        timeAllocatedSeconds: SECTION_DURATION,
        timeUsedSeconds: SECTION_DURATION,
        attemptCount: secAttempts.filter(a => a.isAttempted).length,
        correctCount: secAttempts.filter(a => a.isCorrect).length,
        wrongCount: secAttempts.filter(a => a.isAttempted && !a.isCorrect).length,
        skippedCount: secAttempts.filter(a => !a.isAttempted).length,
        netScore,
        finalFiveMinAttempts: late.length,
        finalFiveMinCorrect: lateCorrect.length,
      };
    }

    const totalScore = Object.values(sectionResults).reduce((s, r) => s + r.netScore, 0);

    const session: MockSession = {
      sessionId: '',
      studentId: user?.uid ?? 'anonymous',
      instituteId: 'demo',
      mockName,
      takenAt: Date.now(),
      totalScore,
      sectionResults,
      attempts: allAttempts,
    };

    sessionStorage.setItem('catResult', JSON.stringify(session));

    try {
      const res = await fetch('/api/save-cat-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...session,
          studentName: user?.displayName || user?.email || 'Student',
          studentEmail: user?.email ?? null,
        }),
      });
      const data = await res.json();
      if (data.sessionId) {
        const updated = { ...session, sessionId: data.sessionId };
        sessionStorage.setItem('catResult', JSON.stringify(updated));
      }
    } catch {
      // Non-fatal — results are in sessionStorage
    }

    router.push('/cat/results');
  };

  if (!questions.length) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading exam...</div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAttempt = attempts[currentIndex];
  const currentSectionIdx = SECTIONS.indexOf(activeSection);
  const nextSection = SECTIONS[currentSectionIdx + 1];
  const isLastSection = !nextSection;

  // Check if all questions in current section have been passed by current index
  const sectionQuestionsCount = questions.filter(q => q.section === activeSection).length;
  const sectionFirstIdx = questions.findIndex(q => q.section === activeSection);
  const sectionLastIdx = sectionFirstIdx + sectionQuestionsCount - 1;
  const isAtSectionEnd = currentIndex === sectionLastIdx;

  // Stats
  const answered = attempts.filter(a => !!a.selectedAnswer).length;
  const markedForReview = attempts.filter(a => a.wasMarkedForReview).length;
  const sectionAnswered = attempts.filter((a, i) => questions[i]?.section === activeSection && !!a.selectedAnswer).length;
  const sectionTotal = questions.filter(q => q.section === activeSection).length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between bg-gray-900/50 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-amber-400 text-sm">{mockName}</span>
          <div className="flex gap-2">
            {SECTIONS.map(s => (
              <span key={s} className={`text-xs px-2 py-0.5 rounded font-semibold border ${
                lockedSections.includes(s)
                  ? 'bg-gray-800 text-gray-600 border-gray-700 line-through'
                  : s === activeSection
                    ? s === 'VARC' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : s === 'DILR' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}>
                {lockedSections.includes(s) && <Lock size={8} className="inline mr-1" />}
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{answered}/{questions.length} answered</span>
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors"
          >
            Submit
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left navigator */}
        <div className="hidden lg:flex flex-col w-56 border-r border-gray-800 bg-gray-900/30 flex-shrink-0">
          <CATNavigator
            questions={questions}
            attempts={attempts}
            currentIndex={currentIndex}
            activeSection={activeSection}
            lockedSections={lockedSections}
            onJump={idx => !lockedSections.includes(questions[idx].section) && goToQuestion(idx)}
          />
        </div>

        {/* Center: question */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <CATQuestionCard
                question={currentQuestion}
                selectedAnswer={currentAttempt?.selectedAnswer ?? null}
                onSelect={val => handleSelect(currentIndex, val)}
                questionNumber={currentIndex + 1}
                isLocked={lockedSections.includes(currentQuestion.section)}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right: timer + controls */}
        <div className="hidden lg:flex flex-col w-52 border-l border-gray-800 bg-gray-900/30 p-5 gap-6 flex-shrink-0">
          {/* Section timer */}
          <SectionTimer
            key={`${sectionTimerKey}-${activeSection}`}
            section={activeSection}
            totalSeconds={SECTION_DURATION}
            onTick={s => { sectionRemainingRef.current = s; }}
            onSectionEnd={() => handleSectionEnd(activeSection)}
          />

          {/* Section progress */}
          <div className="space-y-2">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              {activeSection} progress
            </div>
            <div className="text-sm text-white font-mono">
              {sectionAnswered} / {sectionTotal}
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${(sectionAnswered / sectionTotal) * 100}%` }}
              />
            </div>
          </div>

          {/* Mark for review */}
          <button
            onClick={() => toggleMarkForReview(currentIndex)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
              currentAttempt?.wasMarkedForReview
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <Flag size={13} />
            {currentAttempt?.wasMarkedForReview ? 'Unmark' : 'Mark for review'}
          </button>

          {/* Next section / submit */}
          {isAtSectionEnd && !isLastSection && !lockedSections.includes(activeSection) && (
            <button
              onClick={() => setShowNextSectionModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all"
            >
              <Lock size={12} />
              End {activeSection} early
            </button>
          )}
        </div>
      </div>

      {/* Bottom nav bar (mobile + desktop) */}
      <div className="border-t border-gray-800 bg-gray-900/50 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => currentIndex > 0 && goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} /> Prev
        </button>

        <div className="flex-1 flex items-center justify-center gap-2">
          <button
            onClick={() => toggleMarkForReview(currentIndex)}
            className={`lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              currentAttempt?.wasMarkedForReview
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'border-gray-700 text-gray-400'
            }`}
          >
            <Flag size={12} />
            Review
          </button>
          <span className="text-xs text-gray-500 font-mono">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {isAtSectionEnd && !isLastSection && !lockedSections.includes(activeSection) ? (
          <button
            onClick={() => setShowNextSectionModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm font-semibold hover:bg-amber-500/20 transition-all"
          >
            Next Section <Lock size={13} />
          </button>
        ) : (
          <button
            onClick={() => {
              if (currentIndex < questions.length - 1) goToQuestion(currentIndex + 1);
              else setShowSubmitModal(true);
            }}
            disabled={lockedSections.includes(currentQuestion.section) && currentIndex === sectionLastIdx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm disabled:opacity-30 transition-colors"
          >
            {currentIndex === questions.length - 1 ? (
              <><Send size={14} /> Submit</>
            ) : (
              <>Next <ChevronRight size={16} /></>
            )}
          </button>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-4 left-1/2 z-50 px-5 py-3 rounded-xl bg-gray-900 border border-gray-700 text-sm text-white font-semibold shadow-2xl pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next section modal */}
      <AnimatePresence>
        {showNextSectionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertTriangle size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">End {activeSection} early?</h3>
                  <p className="text-xs text-gray-400">You cannot return to this section</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-5">
                You have answered {sectionAnswered} of {sectionTotal} questions in {activeSection}.
                Moving to {nextSection} will lock {activeSection} permanently.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNextSectionModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold transition-colors"
                >
                  Stay in {activeSection}
                </button>
                <button
                  onClick={() => {
                    setShowNextSectionModal(false);
                    handleSectionEnd(activeSection, true);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
                >
                  Move to {nextSection}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="font-bold text-white text-lg mb-2">Submit exam?</h3>
              <div className="space-y-1 mb-5">
                <p className="text-sm text-gray-400">
                  Answered: <span className="text-white font-semibold">{answered}</span> / {questions.length}
                </p>
                <p className="text-sm text-gray-400">
                  Unanswered: <span className="text-amber-400 font-semibold">{questions.length - answered}</span>
                </p>
                {markedForReview > 0 && (
                  <p className="text-sm text-gray-400">
                    Marked for review: <span className="text-orange-400 font-semibold">{markedForReview}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? 'Saving...' : 'Submit & See Results'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
