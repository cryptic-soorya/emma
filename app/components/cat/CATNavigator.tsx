'use client';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { CATQuestion, CATSection, QuestionAttempt } from '@/app/lib/catTypes';

interface CATNavigatorProps {
  questions: CATQuestion[];
  attempts: Partial<QuestionAttempt>[];
  currentIndex: number;
  activeSection: CATSection;
  lockedSections: CATSection[];
  onJump: (index: number) => void;
}

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];

const SECTION_TAB_COLORS: Record<CATSection, string> = {
  VARC: 'border-blue-500 text-blue-300',
  DILR: 'border-purple-500 text-purple-300',
  QA: 'border-amber-500 text-amber-300',
};

function getButtonStyle(
  attempt: Partial<QuestionAttempt> | undefined,
  isCurrent: boolean,
  isLocked: boolean
): string {
  const base = 'w-9 h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center ';
  const ring = isCurrent ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-gray-900 ' : '';

  if (isLocked) return base + ring + 'bg-gray-800 text-gray-600 cursor-not-allowed';
  if (!attempt?.isAttempted && !attempt?.selectedAnswer && !attempt?.wasMarkedForReview) {
    return base + ring + 'bg-gray-700 text-gray-400 hover:bg-gray-600 cursor-pointer';
  }
  if (attempt?.wasMarkedForReview && !attempt?.selectedAnswer) {
    return base + ring + 'bg-orange-500 text-white cursor-pointer';
  }
  if (attempt?.selectedAnswer && attempt?.wasMarkedForReview) {
    return base + ring + 'bg-orange-500 text-white cursor-pointer';
  }
  if (attempt?.selectedAnswer && !attempt?.isTITA) {
    return base + ring + 'bg-emerald-600 text-white cursor-pointer';
  }
  if (attempt?.selectedAnswer && attempt?.isTITA) {
    return base + ring + 'bg-amber-500 text-black cursor-pointer';
  }
  if ((attempt?.visitCount ?? 0) > 0 && !attempt?.selectedAnswer) {
    return base + ring + 'bg-white text-black cursor-pointer';
  }
  return base + ring + 'bg-gray-700 text-gray-400 hover:bg-gray-600 cursor-pointer';
}

export default function CATNavigator({
  questions,
  attempts,
  currentIndex,
  activeSection,
  lockedSections,
  onJump,
}: CATNavigatorProps) {
  const [tab, setTab] = useState<CATSection>(activeSection);

  const sectionQuestions = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.section === tab);

  return (
    <div className="flex flex-col h-full">
      {/* Section tabs */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        {SECTIONS.map(s => {
          const isLocked = lockedSections.includes(s);
          return (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                tab === s
                  ? SECTION_TAB_COLORS[s]
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {s}
              {isLocked && <Lock size={10} className="text-gray-500" />}
            </button>
          );
        })}
      </div>

      {/* Question grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {sectionQuestions.map(({ q, i }) => {
            const attempt = attempts[i];
            const isLocked = lockedSections.includes(q.section);
            const isCurrent = i === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => !isLocked && onJump(i)}
                className={getButtonStyle(attempt, isCurrent, isLocked)}
                title={`Q${i + 1} — ${q.chapter}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-gray-800 space-y-1.5 flex-shrink-0">
        {[
          { color: 'bg-gray-700', label: 'Not visited' },
          { color: 'bg-white', label: 'Visited, unanswered' },
          { color: 'bg-emerald-600', label: 'Answered (MCQ)' },
          { color: 'bg-amber-500', label: 'Answered (TITA)' },
          { color: 'bg-orange-500', label: 'Marked for review' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${color} flex-shrink-0`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
