export type Subject = 'Physics' | 'Chemistry' | 'Biology';

export interface ParsedQuestion {
  id: number;
  subject: Subject;
  chapter: string;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
}

export interface UserAnswer {
  questionId: number;
  selected: 'A' | 'B' | 'C' | 'D' | null;
  markedForReview: boolean;
  timeSpentSeconds: number;
}

export interface ExamResult {
  sessionId: string;
  createdAt: number;
  totalScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeTakenMs: number;
  subjectBreakdown: {
    [key in Subject]: { correct: number; wrong: number; skipped: number; score: number };
  };
  wrongQuestions: ParsedQuestion[];
  weakChapters: { subject: Subject; chapter: string; wrongCount: number }[];
}
