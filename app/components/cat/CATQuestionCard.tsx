'use client';
import { CATQuestion } from '@/app/lib/catTypes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

interface CATQuestionCardProps {
  question: CATQuestion;
  selectedAnswer: string | null;
  onSelect: (ans: string) => void;
  questionNumber: number;
  isLocked: boolean;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

const SECTION_BADGE: Record<string, string> = {
  VARC: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DILR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  QA: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function CATQuestionCard({
  question,
  selectedAnswer,
  onSelect,
  questionNumber,
  isLocked,
}: CATQuestionCardProps) {
  const handleSelect = (key: string) => {
    if (isLocked) return;
    onSelect(selectedAnswer === key ? '' : key);
  };

  return (
    <div className={`relative space-y-5 ${isLocked ? 'pointer-events-none' : ''}`}>
      {isLocked && (
        <div className="absolute inset-0 bg-gray-900/60 rounded-xl z-10 flex items-center justify-center">
          <span className="text-gray-400 text-sm font-semibold border border-gray-700 bg-gray-900 px-4 py-2 rounded-lg">
            Section locked
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-400">Q{questionNumber}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${SECTION_BADGE[question.section]}`}>
          {question.section}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
          {question.chapter}
        </span>
        {question.isTITA && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
            TITA — No negative marking
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="text-white text-base leading-relaxed markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
        >
          {question.questionText}
        </ReactMarkdown>
      </div>

      {/* Options */}
      {question.isTITA ? (
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Your answer</label>
          <input
            type="text"
            value={selectedAnswer ?? ''}
            onChange={e => onSelect(e.target.value)}
            disabled={isLocked}
            placeholder="Type your numerical answer..."
            className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500 font-mono text-lg transition-colors"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {OPTION_KEYS.map(key => {
            const isSelected = selectedAnswer === key;
            return (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                disabled={isLocked}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-gray-700 hover:border-gray-500 text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                <span className="font-semibold mr-3 text-gray-400">{key}.</span>
                {question.options![key as keyof typeof question.options]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
