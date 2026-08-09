'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrainCircuit, RotateCcw } from 'lucide-react';
import { ExamResult, Subject } from '@/app/lib/examTypes';

const SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Biology'];

function getGrade(score: number): { label: string; color: string } {
  if (score >= 600) return { label: 'Excellent', color: 'text-emerald-400' };
  if (score >= 450) return { label: 'Good', color: 'text-blue-400' };
  if (score >= 300) return { label: 'Average', color: 'text-orange-400' };
  return { label: 'Needs Work', color: 'text-red-400' };
}

export default function ExamResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ExamResult | null>(null);

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

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading results...</p>
      </div>
    );
  }

  const grade = getGrade(result.totalScore);

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="text-center space-y-3">
          <p className="text-xs uppercase tracking-widest text-gray-500">Exam Result</p>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
            {result.totalScore}
            <span className="text-gray-600 text-3xl md:text-4xl"> / {result.maxScore}</span>
          </h1>
          <p className={`text-xl font-semibold ${grade.color}`}>{grade.label}</p>
          <div className="flex justify-center gap-6 text-sm text-gray-400 pt-2">
            <span><span className="text-emerald-400 font-semibold">{result.correctCount}</span> correct</span>
            <span><span className="text-red-400 font-semibold">{result.wrongCount}</span> wrong</span>
            <span><span className="text-gray-300 font-semibold">{result.skippedCount}</span> skipped</span>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUBJECTS.map(sub => {
            const b = result.subjectBreakdown[sub];
            return (
              <div key={sub} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{sub}</h3>
                  <span className="text-lg font-bold">{b.score}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Correct</span><span className="text-emerald-400 font-medium">{b.correct}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Wrong</span><span className="text-red-400 font-medium">{b.wrong}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Skipped</span><span className="text-gray-300 font-medium">{b.skipped}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {result.weakChapters.length > 0 && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Weak Chapters</h2>
            <ol className="space-y-2">
              {result.weakChapters.map((wc, i) => (
                <li key={`${wc.subject}-${wc.chapter}`} className="flex items-center justify-between text-sm border-b border-gray-800 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 w-5">{i + 1}.</span>
                    <span className="text-white">{wc.chapter}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{wc.subject}</span>
                  </div>
                  <span className="text-red-400 font-medium">{wc.wrongCount} wrong</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {result.wrongQuestions.length > 0 && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Wrong Questions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4">Q#</th>
                    <th className="py-2 pr-4">Subject</th>
                    <th className="py-2 pr-4">Chapter</th>
                    <th className="py-2">Correct Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {result.wrongQuestions.map(q => (
                    <tr key={q.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="py-2 pr-4 text-gray-300">{q.id}</td>
                      <td className="py-2 pr-4 text-gray-300">{q.subject}</td>
                      <td className="py-2 pr-4 text-gray-400">{q.chapter}</td>
                      <td className="py-2 text-emerald-400 font-medium">{q.correctAnswer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/exam/review"
            className="flex-1 py-3 px-6 rounded-xl bg-white text-black font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <BrainCircuit className="w-4 h-4" />
            Review with Mika
          </Link>
          <Link
            href="/exam"
            className="flex-1 py-3 px-6 rounded-xl border border-gray-700 hover:border-gray-500 text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            New Exam
          </Link>
        </div>
      </div>
    </div>
  );
}
