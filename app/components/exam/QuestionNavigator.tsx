'use client';
import { useState } from 'react';
import { ParsedQuestion, UserAnswer, Subject } from '@/app/lib/examTypes';

interface Props {
  questions: ParsedQuestion[];
  answers: UserAnswer[];
  currentIndex: number;
  onJump: (index: number) => void;
}

const TABS: Subject[] = ['Physics', 'Chemistry', 'Biology'];
const SUBJECT_RANGES: Record<Subject, [number, number]> = {
  Physics: [0, 44],
  Chemistry: [45, 89],
  Biology: [90, 179],
};

function getButtonStyle(ans: UserAnswer, isCurrent: boolean): string {
  let base = 'w-8 h-8 text-xs font-medium rounded-lg transition-all ';
  if (isCurrent) base += 'ring-2 ring-blue-400 ';
  if (!ans.selected && !ans.markedForReview) return base + 'bg-gray-800 text-gray-400';
  if (ans.markedForReview && ans.selected) return base + 'bg-red-500 text-white';
  if (ans.markedForReview) return base + 'bg-orange-500 text-white';
  if (ans.selected) return base + 'bg-green-600 text-white';
  return base + 'bg-gray-600 text-white';
}

export default function QuestionNavigator({ questions, answers, currentIndex, onJump }: Props) {
  const [activeTab, setActiveTab] = useState<Subject>('Physics');
  const [start, end] = SUBJECT_RANGES[activeTab];
  const tabQuestions = questions.slice(start, end + 1);

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${
              activeTab === tab ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab.slice(0, 4)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {tabQuestions.map((_, i) => {
          const globalIndex = start + i;
          const ans = answers[globalIndex];
          if (!ans) return null;
          return (
            <button
              key={globalIndex}
              onClick={() => onJump(globalIndex)}
              className={getButtonStyle(ans, globalIndex === currentIndex)}
            >
              {globalIndex + 1}
            </button>
          );
        })}
      </div>
      <div className="space-y-1 pt-2 border-t border-gray-800">
        {[
          { color: 'bg-green-600', label: 'Answered' },
          { color: 'bg-gray-800', label: 'Not visited' },
          { color: 'bg-gray-600', label: 'Visited' },
          { color: 'bg-orange-500', label: 'Marked' },
          { color: 'bg-red-500', label: 'Marked + answered' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
