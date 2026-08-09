/**
 * Pure helper functions for the spaced-repetition revision queue and the
 * study-streak tracker. No Firebase imports — safe to use on client or server.
 * Added 2026-07-13 (scheduled migration run).
 */
import {
  QuestionAttempt,
  RevisionItem,
  StudyStreak,
  REVISION_INTERVALS_DAYS,
} from './catTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' local-date key for streak bookkeeping. */
export function toDateKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Merge wrong attempts from a just-submitted mock into an existing revision
 * queue. A question already in the queue gets its interval reset to 0 (missed
 * again = relearn). New wrong questions start at interval 0 (due in 1 day).
 * Correct answers are NOT queued — only genuinely missed MCQ/TITA attempts.
 */
export function mergeWrongAttemptsIntoQueue(
  existing: RevisionItem[],
  attempts: QuestionAttempt[],
  mockName: string,
  now: number
): RevisionItem[] {
  const byId = new Map(existing.map(i => [i.questionId, i]));

  for (const a of attempts) {
    if (!a.isAttempted || a.isCorrect) continue;
    const prev = byId.get(a.questionId);
    // NOTE: Firestore rejects `undefined` field values, so lastErrorType is
    // only included when actually known.
    if (prev) {
      // Missed again — reset the interval, keep review history.
      const errorType = a.errorType ?? prev.lastErrorType;
      byId.set(a.questionId, {
        ...prev,
        intervalIndex: 0,
        dueAt: now + REVISION_INTERVALS_DAYS[0] * DAY_MS,
        ...(errorType ? { lastErrorType: errorType } : {}),
      });
    } else {
      byId.set(a.questionId, {
        questionId: a.questionId,
        section: a.section,
        questionType: a.questionType,
        chapter: a.chapter,
        addedAt: now,
        dueAt: now + REVISION_INTERVALS_DAYS[0] * DAY_MS,
        intervalIndex: 0,
        timesReviewed: 0,
        timesCorrectOnReview: 0,
        ...(a.errorType ? { lastErrorType: a.errorType } : {}),
        sourceMockName: mockName,
      });
    }
  }
  return [...byId.values()].sort((x, y) => x.dueAt - y.dueAt);
}

/**
 * Apply a review outcome to one item.
 * Correct → advance interval; past the last interval the item is retired
 * (returns null → remove from queue). Wrong → back to interval 0.
 */
export function reviewRevisionItem(
  item: RevisionItem,
  wasCorrect: boolean,
  now: number
): RevisionItem | null {
  const timesReviewed = item.timesReviewed + 1;
  const timesCorrectOnReview = item.timesCorrectOnReview + (wasCorrect ? 1 : 0);
  if (wasCorrect) {
    const nextIndex = item.intervalIndex + 1;
    if (nextIndex >= REVISION_INTERVALS_DAYS.length) return null; // mastered
    return {
      ...item,
      intervalIndex: nextIndex,
      dueAt: now + REVISION_INTERVALS_DAYS[nextIndex] * DAY_MS,
      timesReviewed,
      timesCorrectOnReview,
    };
  }
  return {
    ...item,
    intervalIndex: 0,
    dueAt: now + REVISION_INTERVALS_DAYS[0] * DAY_MS,
    timesReviewed,
    timesCorrectOnReview,
  };
}

/** Items due for review right now. */
export function dueItems(items: RevisionItem[], now: number): RevisionItem[] {
  return items.filter(i => i.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Update a streak given a new study activity at `now`.
 * Same day → no change. Yesterday → +1. Gap → reset to 1.
 */
export function updateStreak(prev: StudyStreak | undefined, now: number): StudyStreak {
  const today = toDateKey(now);
  const yesterday = toDateKey(now - DAY_MS);

  if (!prev) {
    return { currentStreak: 1, longestStreak: 1, lastActivityDate: today, totalStudyDays: 1 };
  }
  if (prev.lastActivityDate === today) return prev;

  const currentStreak = prev.lastActivityDate === yesterday ? prev.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(prev.longestStreak, currentStreak),
    lastActivityDate: today,
    totalStudyDays: prev.totalStudyDays + 1,
  };
}

/** True if the streak is still alive (activity today or yesterday). */
export function isStreakAlive(streak: StudyStreak | undefined, now: number): boolean {
  if (!streak) return false;
  return (
    streak.lastActivityDate === toDateKey(now) ||
    streak.lastActivityDate === toDateKey(now - DAY_MS)
  );
}
