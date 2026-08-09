'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrainCircuit, RotateCcw, AlertTriangle } from 'lucide-react';
import { MockSession, CATSection, ChapterStat, ErrorType } from '@/app/lib/catTypes';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];
const SECTION_COLOR: Record<CATSection, string> = {
  VARC: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
  DILR: 'text-purple-300 border-purple-500/30 bg-purple-500/10',
  QA: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
};
const ERROR_LABEL: Record<ErrorType, string> = {
  calculation: 'Calculation',
  concept: 'Concept',
  trap: 'Trap option',
  rush: 'Rush',
  careless: 'Careless',
};

function computeChapterStats(session: MockSession): ChapterStat[] {
  const map: Record<string, ChapterStat> = {};
  for (const a of session.attempts) {
    const key = `${a.section}::${a.chapter}::${a.questionType}`;
    if (!map[key]) {
      map[key] = {
        section: a.section, chapter: a.chapter, questionType: a.questionType,
        totalAttempts: 0, correct: 0, wrong: 0, skipped: 0, accuracy: 0, netScoreImpact: 0, trend: 'stable',
      };
    }
    const stat = map[key];
    stat.totalAttempts++;
    if (!a.isAttempted) stat.skipped++;
    else if (a.isCorrect) { stat.correct++; stat.netScoreImpact += 3; }
    else if (!a.isTITA) { stat.wrong++; stat.netScoreImpact -= 1; }
  }
  for (const stat of Object.values(map)) {
    const attempted = stat.correct + stat.wrong;
    stat.accuracy = attempted > 0 ? stat.correct / attempted : 0;
  }
  return Object.values(map);
}

export default function CATResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<MockSession | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('catResult');
    if (!raw) {
      router.replace('/cat');
      return;
    }
    try {
      setResult(JSON.parse(raw));
    } catch {
      router.replace('/cat');
    }
  }, [router]);

  const chapterStats = useMemo(() => (result ? computeChapterStats(result) : []), [result]);
  const skipRecommendations = useMemo(
    () => chapterStats.filter(s => s.totalAttempts >= 3 && s.netScoreImpact < 0).sort((a, b) => a.netScoreImpact - b.netScoreImpact),
    [chapterStats]
  );
  const errorBreakdown = useMemo(() => {
    const counts: Record<ErrorType, number> = { calculation: 0, concept: 0, trap: 0, rush: 0, careless: 0 };
    if (!result) return counts;
    for (const a of result.attempts) if (a.errorType) counts[a.errorType]++;
    return counts;
  }, [result]);
  const hasErrorData = Object.values(errorBreakdown).some(n => n > 0);

  if (!result) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading results...</p>
      </div>
    );
  }

  const wrongQuestions = result.attempts.filter(a => a.isAttempted && !a.isCorrect);
  const maxScore = result.attempts.length * 3;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="text-center space-y-3">
          <p className="text-xs uppercase tracking-widest text-gray-500">{result.mockName}</p>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight font-mono">
            {result.totalScore}
            <span className="text-gray-600 text-3xl md:text-4xl"> / {maxScore}</span>
          </h1>
          {result.percentile !== undefined && (
            <p className="text-amber-400 font-semibold">{result.percentile.toFixed(2)} percentile (est.)</p>
          )}
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SECTIONS.map(sec => {
            const sr = result.sectionResults[sec];
            const rushDetected = sr.finalFiveMinAttempts > 3 && (sr.finalFiveMinCorrect / sr.finalFiveMinAttempts) < 0.4;
            return (
              <div key={sec} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SECTION_COLOR[sec]}`}>{sec}</span>
                  <span className="text-lg font-bold font-mono">{sr.netScore}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-400"><span>Attempted</span><span className="text-white font-semibold">{sr.attemptCount}</span></div>
                  <div className="flex justify-between text-gray-400"><span>Correct</span><span className="text-emerald-400 font-semibold">{sr.correctCount}</span></div>
                  <div className="flex justify-between text-gray-400"><span>Wrong</span><span className="text-red-400 font-semibold">{sr.wrongCount}</span></div>
                  <div className="flex justify-between text-gray-400"><span>Skipped</span><span className="text-gray-300 font-semibold">{sr.skippedCount}</span></div>
                </div>
                {rushDetected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Rush detected in final 5 min
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {skipRecommendations.length > 0 && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Skip Recommendations</h2>
            <div className="space-y-3">
              {skipRecommendations.map(s => (
                <div key={`${s.section}-${s.chapter}-${s.questionType}`} className="border-b border-gray-800 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SECTION_COLOR[s.section]}`}>{s.section}</span>
                      <span className="font-semibold text-white text-sm">{s.chapter}</span>
                      <span className="text-xs text-gray-500">{s.questionType}</span>
                    </div>
                    <span className="text-emerald-400 text-sm font-semibold">Skipping recovers +{Math.abs(s.wrong)} marks</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {s.wrong} wrong out of {s.totalAttempts - s.skipped} — net impact: {s.netScoreImpact} marks
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
          <h2 className="text-lg font-bold tracking-tight">Error Breakdown</h2>
          {hasErrorData ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(Object.keys(errorBreakdown) as ErrorType[]).map(key => (
                <div key={key} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-white">{errorBreakdown[key]}</p>
                  <p className="text-xs text-gray-400 mt-1">{ERROR_LABEL[key]}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Classify your wrong answers in Review to build an error profile.</p>
          )}
        </section>

        {wrongQuestions.length > 0 && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Wrong Questions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4">Section</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Your Answer</th>
                    <th className="py-2">Correct</th>
                  </tr>
                </thead>
                <tbody>
                  {wrongQuestions.map((a, i) => (
                    <tr key={`${a.questionId}-${i}`} className="border-b border-gray-800/60 last:border-0">
                      <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SECTION_COLOR[a.section]}`}>{a.section}</span></td>
                      <td className="py-2 pr-4 text-gray-400">{a.questionType}</td>
                      <td className="py-2 pr-4 text-red-400 font-medium">{a.selectedAnswer}</td>
                      <td className="py-2 text-emerald-400 font-medium">{a.correctAnswer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link href="/cat/review" className="flex-1 py-3 px-6 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2">
            <BrainCircuit className="w-4 h-4" /> Review with Mika
          </Link>
          <Link href="/cat" className="flex-1 py-3 px-6 rounded-lg border border-gray-800 hover:border-gray-600 text-white font-semibold transition-colors flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> New Mock
          </Link>
        </div>
      </div>
    </div>
  );
}
