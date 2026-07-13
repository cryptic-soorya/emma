'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Target, TrendingUp, AlertTriangle, ChevronRight,
  BarChart2, BookOpen, RotateCcw, Zap,
} from 'lucide-react';
import { MockSession, CATSection } from '@/app/lib/catTypes';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];

const SECTION_COLORS = {
  VARC: {
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    bar: 'bg-blue-500',
    card: 'border-blue-500/20 bg-blue-500/5',
    text: 'text-blue-300',
  },
  DILR: {
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    bar: 'bg-purple-500',
    card: 'border-purple-500/20 bg-purple-500/5',
    text: 'text-purple-300',
  },
  QA: {
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    bar: 'bg-amber-500',
    card: 'border-amber-500/20 bg-amber-500/5',
    text: 'text-amber-300',
  },
};

function scoreToPercentile(score: number): number {
  // Rough estimate based on CAT score distributions
  if (score >= 150) return 99;
  if (score >= 130) return 98;
  if (score >= 115) return 97;
  if (score >= 100) return 95;
  if (score >= 85) return 90;
  if (score >= 70) return 85;
  if (score >= 55) return 75;
  if (score >= 40) return 60;
  if (score >= 25) return 40;
  return Math.max(1, Math.round((score / 25) * 40));
}

export default function CATResultsPage() {
  const router = useRouter();
  const [session, setSession] = useState<MockSession | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('catResult');
    if (!raw) { router.push('/cat'); return; }
    setSession(JSON.parse(raw));
  }, [router]);

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading results...</div>
      </div>
    );
  }

  const percentile = session.percentile ?? scoreToPercentile(session.totalScore);
  const totalQuestions = session.attempts.length;
  const totalAttempted = session.attempts.filter(a => a.isAttempted).length;
  const totalCorrect = session.attempts.filter(a => a.isCorrect).length;
  const totalWrong = session.attempts.filter(a => a.isAttempted && !a.isCorrect).length;
  const totalSkipped = totalQuestions - totalAttempted;

  // Skip recommendations from chapterStats
  const chapterMap: Record<string, { wrong: number; correct: number; section: CATSection; type: string }> = {};
  for (const a of session.attempts) {
    const key = `${a.section}::${a.chapter}::${a.questionType}`;
    if (!chapterMap[key]) chapterMap[key] = { wrong: 0, correct: 0, section: a.section, type: a.questionType };
    if (a.isAttempted) {
      if (a.isCorrect) chapterMap[key].correct++;
      else chapterMap[key].wrong++;
    }
  }
  const skipRecs = Object.entries(chapterMap)
    .filter(([, v]) => (v.wrong + v.correct) >= 3 && v.wrong > v.correct)
    .map(([key, v]) => {
      const [section, chapter] = key.split('::');
      const netImpact = v.correct * 3 - v.wrong;
      return { section, chapter, wrong: v.wrong, correct: v.correct, attempted: v.wrong + v.correct, netImpact };
    })
    .sort((a, b) => a.netImpact - b.netImpact)
    .slice(0, 4);

  const wrongQuestions = session.attempts.filter(a => a.isAttempted && !a.isCorrect);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target size={18} className="text-amber-400" />
          <span className="font-bold text-white">{session.mockName} — Results</span>
        </div>
        <Link href="/cat" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          New Mock →
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Hero score */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="text-7xl font-mono font-black text-amber-400 tracking-tighter">
            {session.totalScore}
          </div>
          <div className="text-gray-400 text-lg">out of 198 · ~{percentile}th percentile</div>
          <div className="flex justify-center gap-6 text-sm text-gray-400">
            <span><span className="text-emerald-400 font-bold">{totalCorrect}</span> correct</span>
            <span><span className="text-red-400 font-bold">{totalWrong}</span> wrong</span>
            <span><span className="text-gray-500 font-bold">{totalSkipped}</span> skipped</span>
          </div>
        </motion.div>

        {/* Section scorecards */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Section Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SECTIONS.map((sec, i) => {
              const r = session.sectionResults[sec];
              const colors = SECTION_COLORS[sec];
              const accuracy = r.attemptCount > 0 ? Math.round((r.correctCount / r.attemptCount) * 100) : 0;
              const rushWarning = r.finalFiveMinAttempts > 3 &&
                (r.finalFiveMinCorrect / (r.finalFiveMinAttempts || 1)) < 0.4;
              return (
                <motion.div
                  key={sec}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`rounded-xl border p-5 space-y-3 ${colors.card}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${colors.badge}`}>{sec}</span>
                    <span className={`font-mono text-xl font-bold ${colors.text}`}>{r.netScore}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>Attempted: <span className="text-white font-semibold">{r.attemptCount}</span></span>
                    <span>Correct: <span className="text-emerald-400 font-semibold">{r.correctCount}</span></span>
                    <span>Wrong: <span className="text-red-400 font-semibold">{r.wrongCount}</span></span>
                    <span>Skipped: <span className="text-gray-500 font-semibold">{r.skippedCount}</span></span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Accuracy</span>
                      <span>{accuracy}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${colors.bar} rounded-full`} style={{ width: `${accuracy}%` }} />
                    </div>
                  </div>
                  {rushWarning && (
                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <Zap size={11} className="fill-amber-400/30" />
                      Rush detected in final 5 min
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Skip recommendations */}
        {skipRecs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Skip Strategy — Recover Marks
              </h2>
            </div>
            <div className="space-y-3">
              {skipRecs.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-4 p-4 rounded-xl border border-gray-800 bg-gray-900/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${
                        SECTION_COLORS[r.section as CATSection]?.badge ?? 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>{r.section}</span>
                      <span className="text-sm font-semibold text-white">{r.chapter}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {r.wrong} wrong out of {r.attempted} — net impact:{' '}
                      <span className="text-red-400 font-semibold">{r.netImpact} marks</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-emerald-400 font-bold font-mono">
                      +{r.wrong} marks
                    </div>
                    <div className="text-xs text-gray-500">if skipped</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Wrong questions table */}
        {wrongQuestions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={16} className="text-red-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Wrong Questions ({wrongQuestions.length})
              </h2>
            </div>
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Q#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Section</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chapter</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Answer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Correct</th>
                  </tr>
                </thead>
                <tbody>
                  {wrongQuestions.slice(0, 20).map((a, i) => {
                    const qIdx = session.attempts.indexOf(a);
                    return (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono">{qIdx + 1}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${
                            SECTION_COLORS[a.section]?.badge
                          }`}>{a.section}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{a.chapter}</td>
                        <td className="px-4 py-3 text-red-400 font-mono font-semibold">{a.selectedAnswer ?? '—'}</td>
                        <td className="px-4 py-3 text-emerald-400 font-mono font-semibold">{a.correctAnswer}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {wrongQuestions.length > 20 && (
                <div className="px-4 py-3 text-center text-xs text-gray-500 border-t border-gray-800">
                  +{wrongQuestions.length - 20} more in review mode
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Link
            href="/cat/review"
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
          >
            <BookOpen size={18} />
            Review with Mika
          </Link>
          <Link
            href="/cat"
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-gray-700 hover:border-gray-500 text-white font-semibold transition-colors"
          >
            <RotateCcw size={16} />
            New Mock
          </Link>
        </div>
      </div>
    </div>
  );
}
