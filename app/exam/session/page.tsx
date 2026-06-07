'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Flag } from 'lucide-react';
import Timer from '@/app/components/exam/Timer';
import QuestionCard from '@/app/components/exam/QuestionCard';
import QuestionNavigator from '@/app/components/exam/QuestionNavigator';
import { ParsedQuestion, UserAnswer, Subject, ExamResult } from '@/app/lib/examTypes';

const TOTAL_DURATION_MS = 3 * 60 * 60 * 1000;

function calculateExamResult(
  questions: ParsedQuestion[],
  answers: UserAnswer[],
  timeTakenMs: number
): ExamResult {
  const subjects: Subject[] = ['Physics', 'Chemistry', 'Biology'];
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  const subjectBreakdown = {} as ExamResult['subjectBreakdown'];
  subjects.forEach(s => {
    subjectBreakdown[s] = { correct: 0, wrong: 0, skipped: 0, score: 0 };
  });

  const wrongQuestions: ParsedQuestion[] = [];
  const chapterMap: Record<string, { subject: Subject; wrongCount: number }> = {};

  questions.forEach((q, i) => {
    const ans = answers[i];
    const sub = q.subject;
    if (!ans.selected) {
      skippedCount++;
      subjectBreakdown[sub].skipped++;
    } else if (ans.selected === q.correctAnswer) {
      totalScore += 4;
      correctCount++;
      subjectBreakdown[sub].correct++;
      subjectBreakdown[sub].score += 4;
    } else {
      totalScore -= 1;
      wrongCount++;
      subjectBreakdown[sub].wrong++;
      subjectBreakdown[sub].score -= 1;
      wrongQuestions.push(q);
      const key = `${sub}::${q.chapter}`;
      if (!chapterMap[key]) chapterMap[key] = { subject: sub, wrongCount: 0 };
      chapterMap[key].wrongCount++;
    }
  });

  const weakChapters = Object.entries(chapterMap)
    .map(([key, val]) => ({
      subject: val.subject,
      chapter: key.split('::')[1],
      wrongCount: val.wrongCount,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount);

  return {
    sessionId: '',
    createdAt: Date.now(),
    totalScore,
    maxScore: 720,
    correctCount,
    wrongCount,
    skippedCount,
    timeTakenMs,
    subjectBreakdown,
    wrongQuestions,
    weakChapters,
  };
}

export default function ExamSessionPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const remainingMsRef = useRef(TOTAL_DURATION_MS);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const raw = sessionStorage.getItem('examQuestions');
    if (!raw) {
      router.replace('/exam');
      return;
    }
    try {
      const qs: ParsedQuestion[] = JSON.parse(raw);
      setQuestions(qs);
      setAnswers(
        qs.map((_, i) => ({
          questionId: i + 1,
          selected: null,
          markedForReview: false,
          timeSpentSeconds: 0,
        }))
      );
    } catch {
      router.replace('/exam');
    }
  }, [router]);

  useEffect(() => {
    if (answers.length === 0) return;
    const interval = setInterval(() => {
      sessionStorage.setItem('examAnswers', JSON.stringify(answers));
    }, 30000);
    return () => clearInterval(interval);
  }, [answers]);

  const handleSelect = (ans: 'A' | 'B' | 'C' | 'D') => {
    setAnswers(prev =>
      prev.map((a, i) =>
        i === currentIndex
          ? { ...a, selected: a.selected === ans ? null : ans }
          : a
      )
    );
  };

  const toggleMarkForReview = () => {
    setAnswers(prev =>
      prev.map((a, i) =>
        i === currentIndex ? { ...a, markedForReview: !a.markedForReview } : a
      )
    );
  };

  const goPrev = () => setCurrentIndex(i => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex(i => Math.min(questions.length - 1, i + 1));

  const handleTick = (remainingMs: number) => {
    remainingMsRef.current = remainingMs;
    if (remainingMs === 0) {
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const timeTakenMs = TOTAL_DURATION_MS - remainingMsRef.current;
    const result = calculateExamResult(questions, answers, timeTakenMs);
    sessionStorage.setItem('examResult', JSON.stringify(result));
    try {
      const res = await fetch('/api/save-exam-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      const data = await res.json();
      if (data.sessionId) {
        const updated = { ...result, sessionId: data.sessionId };
        sessionStorage.setItem('examResult', JSON.stringify(updated));
        router.push(`/exam/results?id=${data.sessionId}`);
        return;
      }
    } catch {
      // Continue to results page even if save fails
    }
    router.push('/exam/results');
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading exam...</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const answeredCount = answers.filter(a => a.selected !== null).length;
  const unansweredCount = questions.length - answeredCount;
  const markedCount = answers.filter(a => a.markedForReview).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-800 p-4 overflow-y-auto">
        <QuestionNavigator
          questions={questions}
          answers={answers}
          currentIndex={currentIndex}
          onJump={setCurrentIndex}
        />
      </aside>

      <main className="flex-1 flex flex-col p-6">
        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
          {currentAnswer && (
            <QuestionCard
              question={currentQuestion}
              questionNumber={currentIndex + 1}
              selectedAnswer={currentAnswer.selected}
              onSelect={handleSelect}
            />
          )}

          <div className="mt-8 flex items-center justify-between gap-3 pt-6 border-t border-gray-800">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="px-4 py-2 text-sm rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={toggleMarkForReview}
              className={`px-4 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors ${
                currentAnswer?.markedForReview
                  ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {currentAnswer?.markedForReview ? 'Unmark' : 'Mark for Review'}
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === questions.length - 1}
              className="px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save & Next
            </button>
          </div>
        </div>
      </main>

      <aside className="hidden lg:flex flex-col w-56 border-l border-gray-800 p-4 space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-gray-500">Time Remaining</p>
          <Timer totalMs={TOTAL_DURATION_MS} isPaused={isPaused} onTick={handleTick} />
          <button
            onClick={() => setIsPaused(p => !p)}
            className="w-full mt-2 py-2 text-sm rounded-lg border border-gray-700 hover:border-gray-500 flex items-center justify-center gap-2"
          >
            {isPaused ? <><Play className="w-3.5 h-3.5" />Resume</> : <><Pause className="w-3.5 h-3.5" />Pause</>}
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>Answered</span>
            <span className="font-semibold text-green-400">{answeredCount}</span>
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
          onClick={() => setShowSubmitModal(true)}
          className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
        >
          Submit Exam
        </button>
      </aside>

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">Submit exam?</h2>
            <p className="text-sm text-gray-400">
              You have <span className="text-white font-semibold">{unansweredCount}</span> unanswered question{unansweredCount === 1 ? '' : 's'}.
              Once submitted you cannot change your answers.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-sm disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-white text-black font-semibold text-sm hover:bg-gray-100 disabled:opacity-40"
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
