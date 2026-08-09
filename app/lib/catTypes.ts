export type CATSection = 'VARC' | 'DILR' | 'QA';

export type ErrorType =
  | 'calculation'
  | 'concept'
  | 'trap'
  | 'rush'
  | 'careless';

export type QuestionType =
  | 'RC-inference' | 'RC-vocab' | 'RC-tone' | 'ParaJumble' | 'ParaSummary' | 'OddSentence'
  | 'Grid-DI' | 'Bar-DI' | 'Table-DI' | 'LinearSeating' | 'CircularSeating' | 'Scheduling' | 'Games-Tournament'
  | 'Arithmetic' | 'Algebra' | 'Geometry' | 'NumberTheory' | 'PnC' | 'Probability' | 'ModernMath';

export interface CATQuestion {
  id: string;
  year: number;
  slot: 1 | 2 | 3;
  section: CATSection;
  questionType: QuestionType;
  chapter: string;
  questionText: string;
  options?: { A: string; B: string; C: string; D: string };
  isTITA: boolean;
  correctAnswer: string;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface QuestionAttempt {
  questionId: string;
  section: CATSection;
  questionType: QuestionType;
  chapter: string;
  isTITA: boolean;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  isAttempted: boolean;
  timeSpentSeconds: number;
  sectionElapsedWhenAnswered: number;
  visitCount: number;
  wasMarkedForReview: boolean;
  changedAnswerCount: number;
  errorType?: ErrorType;
  knewHowToSolve?: boolean;
}

export interface SectionResult {
  section: CATSection;
  timeAllocatedSeconds: number;
  timeUsedSeconds: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  netScore: number;
  finalFiveMinAttempts: number;
  finalFiveMinCorrect: number;
}

export interface MockSession {
  sessionId: string;
  studentId: string;
  instituteId: string;
  mockName: string;
  takenAt: number;
  totalScore: number;
  percentile?: number;
  sectionResults: { [key in CATSection]: SectionResult };
  attempts: QuestionAttempt[];
}

export interface ChapterStat {
  section: CATSection;
  chapter: string;
  questionType: QuestionType;
  totalAttempts: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  netScoreImpact: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface SkipRecommendation {
  section: CATSection;
  questionType: QuestionType;
  chapter: string;
  currentAccuracy: number;
  netScoreImpact: number;
  projectedGainIfSkipped: number;
  reasoning: string;
}

export interface StudentBehaviorProfile {
  studentId: string;
  instituteId: string;
  updatedAt: number;
  mockCount: number;
  sectionStats: {
    [key in CATSection]: {
      avgAccuracy: number;
      avgAttemptRate: number;
      avgNetScore: number;
      scoreTrend: number[];
      rushPattern: boolean;
      avgTimePerQuestion: number;
    };
  };
  errorBreakdown: { [key in ErrorType]: number };
  chapterStats: ChapterStat[];
  skipRecommendations: SkipRecommendation[];
  optimalSectionOrder: CATSection[];
  streak?: StudyStreak;       // study-consistency tracker (optional, added later)
}

// ─── Value-add features (added 2026-07-13 scheduled run) ───────────────────

/**
 * One wrong/misclassified question queued for spaced-repetition revision.
 * Stored in Firestore: revisionQueues/{studentId} → { items: RevisionItem[] }
 * Intervals: 1 day → 3 days → 7 days → 14 days, then retired.
 */
export interface RevisionItem {
  questionId: string;
  section: CATSection;
  questionType: QuestionType;
  chapter: string;
  addedAt: number;            // ms epoch — when first missed
  dueAt: number;              // ms epoch — next review due
  intervalIndex: number;      // 0..3 into REVISION_INTERVALS_DAYS
  timesReviewed: number;
  timesCorrectOnReview: number;
  lastErrorType?: ErrorType;
  sourceMockName: string;
}

export interface RevisionQueue {
  studentId: string;
  updatedAt: number;
  items: RevisionItem[];
}

export const REVISION_INTERVALS_DAYS = [1, 3, 7, 14] as const;

/**
 * Study-consistency streak. Stored on studentProfiles/{studentId}.streak.
 * A "study day" = submitted a mock, finished a drill, or cleared revision items.
 */
export interface StudyStreak {
  currentStreak: number;      // consecutive study days ending today/yesterday
  longestStreak: number;
  lastActivityDate: string;   // 'YYYY-MM-DD' in local time
  totalStudyDays: number;
}

export interface InstituteData {
  id: string;
  name: string;
  plan: 'starter' | 'pro' | 'unlimited';
  studentSeats: number;
  messagesLimit: number;
  messagesUsed: number;
  resetDate: number;
}

export interface InstituteInsights {
  instituteId: string;
  updatedAt: number;
  activeStudents: number;
  avgScore: number;
  batchWeakAreas: {
    section: CATSection;
    chapter: string;
    questionType: QuestionType;
    studentCount: number;
    avgAccuracy: number;
  }[];
  studentAlerts: {
    studentId: string;
    studentName: string;
    type: 'declining' | 'stagnating' | 'breakthrough';
    detail: string;
  }[];
}
