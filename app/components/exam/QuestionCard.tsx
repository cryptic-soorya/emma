'use client';
import { ParsedQuestion } from '@/app/lib/examTypes';

interface Props {
  question: ParsedQuestion;
  questionNumber: number;
  selectedAnswer: 'A' | 'B' | 'C' | 'D' | null;
  onSelect: (ans: 'A' | 'B' | 'C' | 'D') => void;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export default function QuestionCard({ question, questionNumber, selectedAnswer, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-400">Q{questionNumber}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{question.subject}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{question.chapter}</span>
      </div>
      <p className="text-white text-base leading-relaxed whitespace-pre-wrap">{question.questionText}</p>
      <div className="space-y-3">
        {OPTION_KEYS.map(key => {
          const isSelected = selectedAnswer === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-gray-700 hover:border-gray-500 text-gray-300'
              }`}
            >
              <span className="font-semibold mr-3">{key}.</span>
              {question.options[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
