# CLAUDE.md — Mika CAT Edition

## Project Context

**Mika** is an AI-powered CAT exam intelligence platform sold B2B to coaching institutes. It is built on Next.js 15 App Router, Gemini AI (`@google/generative-ai`), Firebase Firestore + Auth, Framer Motion, and Tailwind CSS v4.

The actual Next.js app lives in `mika-two/`. All file paths below are relative to `mika-two/`.

**What already exists (do not recreate):**
- `app/lib/firebase.ts` — Firebase config, `auth` and `db` exports
- `app/lib/examTypes.ts` — NEET types (will be superseded by catTypes.ts — keep the file, just add new types alongside)
- `app/api/chat/route.ts` — Gemini chat API (do not modify)
- `app/components/SpotlightBackground.tsx` — reusable background (keep, recolor via className)
- `app/components/CursorSparkles.tsx` — can be removed or kept, do not touch unless asked
- `app/dashboard/page.tsx` — main dashboard with chat; modify ONLY where specified
- `app/exam/*` — NEET exam pages; will be replaced by CAT versions
- All API routes under `app/api/`

**Installed packages (do not install new ones without checking here first):**
- `@google/generative-ai` — Gemini SDK
- `firebase` — Firestore, Auth
- `framer-motion` — animations
- `lucide-react` — icons
- `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-raw` — markdown + math
- `tailwind-merge`, `clsx` — class utilities
- `katex` — math rendering

---

## Tech Constraints

- All pages are `'use client'` unless they are API routes
- API routes are in `app/api/*/route.ts` — never `'use client'`
- Never expose `GEMINI_API_KEY` or Firebase credentials in client-side code
- Use `sessionStorage` for in-flight exam state (questions, answers during a live session)
- Use Firestore for anything that must persist across sessions (results, profiles, institute data)
- Do not use `localStorage` — sessionStorage only for exam state

---

## UI Design System

### Color Tokens

The existing app uses pink/purple. **Every new file uses these tokens instead:**

```
Page background:  bg-[#0a0f1e]
Surface/cards:    bg-[#111827]  or  bg-gray-900
Borders:          border-gray-800
Primary accent:   text-amber-400  /  bg-amber-500  /  border-amber-500
Success:          text-emerald-400
Error/danger:     text-red-400
Warning:          text-orange-400
Text primary:     text-white
Text muted:       text-gray-400
Text dim:         text-gray-600
```

### Typography Rules

- All H1/H2: `font-bold tracking-tight`
- Cards and labels: `font-semibold` (not `font-medium`)
- No italic text in UI — italics only for actual quoted content
- Monospace numbers (timers, scores): `font-mono`

### Iconography

- Use `BrainCircuit`, `Target`, `TrendingUp`, `BarChart2`, `ClipboardList` for CAT features
- Do not use `Sparkles`, `Heart`, `Smile` icons in new files — they read as feminine/casual
- `Zap` is acceptable for speed/performance contexts

### Animations

- Use Framer Motion for page transitions and card reveals (already installed)
- No floating petal or organic animations — remove `SakuraRain` from any file that has it
- Subtle `opacity` + `y` entrance animations are fine: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}`
- Do not add new animated background elements; use existing `SpotlightBackground` with amber tint if needed

### Component Style Rules

- Buttons: `rounded-lg` (not `rounded-full`) for primary actions
- Cards: `rounded-xl border border-gray-800 bg-gray-900/50`
- Inputs: `bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500`
- Badges: `px-2 py-0.5 rounded text-xs font-semibold` — section colors: VARC=blue, DILR=purple, QA=amber

---

## CAT Exam Facts (Reference)

- **Sections:** VARC (Verbal Ability & Reading Comprehension), DILR (Data Interpretation & Logical Reasoning), QA (Quantitative Aptitude)
- **Duration:** 2 hours total, 40 minutes per section — sections are locked (cannot go back)
- **Questions:** ~66 total (~24 VARC, ~20 DILR, ~22 QA) — varies slightly by year
- **MCQ scoring:** +3 correct, -1 wrong
- **TITA scoring:** +3 correct, 0 wrong (no options, student types the answer)
- **No negative marking on TITA** — never apply -1 to TITA questions
- **PYQ corpus:** CAT 2017–2024 (Slot 1, 2, sometimes 3)

---

## Phase 1 — CAT Foundation

**Goal:** Demo-ready for the institute client. Replaces the NEET exam flow with a proper CAT flow.

### Files to Create

```
app/lib/catTypes.ts
app/api/save-cat-result/route.ts
app/components/cat/SectionTimer.tsx
app/components/cat/CATQuestionCard.tsx
app/components/cat/CATNavigator.tsx
app/cat/page.tsx                          ← exam picker (year/slot selector)
app/cat/session/page.tsx                  ← live exam with sectional timer
app/cat/results/page.tsx                  ← results + skip recommendations
app/cat/review/page.tsx                   ← Mika review with error taxonomy
app/institute/page.tsx                    ← institute dashboard (Phase 4, stub now)
```

### app/lib/catTypes.ts

```typescript
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
  correctAnswer: string;         // 'A'|'B'|'C'|'D' for MCQ, numeric string for TITA
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
```

---

### app/components/cat/SectionTimer.tsx

Props:
```typescript
interface SectionTimerProps {
  section: CATSection;
  totalSeconds: number;           // 2400
  onTick: (remainingSeconds: number) => void;
  onSectionEnd: () => void;       // called when timer hits 0 — parent locks the section
}
```

- Displays `MM:SS` (no hours — it's 40 min)
- `font-mono text-3xl font-bold`
- White when > 5 min remaining, `text-amber-400` when 2–5 min, `text-red-400` when under 2 min
- No pause — CAT sections cannot be paused
- Section label above timer: `VARC | DILR | QA` with appropriate badge color

---

### app/components/cat/CATQuestionCard.tsx

Props:
```typescript
interface CATQuestionCardProps {
  question: CATQuestion;
  selectedAnswer: string | null;
  onSelect: (ans: string) => void;    // 'A'|'B'|'C'|'D' for MCQ, typed string for TITA
  questionNumber: number;
  isLocked: boolean;                  // true when section time is up
}
```

- MCQ: 4 option buttons (A/B/C/D), clicking selected again deselects
- TITA: single number input, no options shown, no negative marking label shown
- Show `[TITA — No negative marking]` badge in amber for TITA questions
- `isLocked` disables all inputs and shows a subtle locked overlay
- Question text rendered with `react-markdown` + `rehype-katex` (math may appear in QA)

---

### app/components/cat/CATNavigator.tsx

Props:
```typescript
interface CATNavigatorProps {
  questions: CATQuestion[];
  attempts: QuestionAttempt[];
  currentIndex: number;
  activeSection: CATSection;
  lockedSections: CATSection[];
  onJump: (index: number) => void;
}
```

- Three tabs: VARC / DILR / QA
- Locked sections show a lock icon on the tab and the grid is non-clickable
- Color coding per button:
  - `bg-gray-700` = not visited
  - `bg-white text-black` = visited but unanswered
  - `bg-emerald-600` = answered (MCQ)
  - `bg-amber-500 text-black` = answered (TITA)
  - `bg-orange-500` = marked for review
  - `ring-2 ring-amber-400` = current question

---

### app/cat/page.tsx — Exam Picker

- Shows a grid of available mocks: CAT year + slot cards
- Each card shows: "CAT 2023 Slot 1", question count, sections
- Also has a "Custom Mock" option that accepts PDF upload (keep as fallback)
- On selecting a year/slot: fetch questions from Firestore `catQuestions` collection filtered by year + slot
- Store in sessionStorage as `catQuestions` and `catMockName`, then push to `/cat/session`
- If no questions found in Firestore for that year, fall back to PDF parse flow

---

### app/cat/session/page.tsx — Live Exam

**Critical CAT rules to enforce:**
1. Sections are sequential: VARC → DILR → QA
2. When a section's 40 min ends, it locks — student cannot return to it
3. Student CAN move to next section early (before 40 min is up) — but cannot go back
4. No pause functionality — CAT has no pause

**Behavioral data to capture per question:**
- `timeSpentSeconds` — time from first visit to leaving the question
- `sectionElapsedWhenAnswered` — seconds into the section when they submitted
- `visitCount` — increment each time they navigate to this question
- `changedAnswerCount` — increment each time they change an already-set answer
- `wasMarkedForReview` — boolean

**Scoring on submit:**
```typescript
function scoreMCQ(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected === correct ? 3 : -1;
}

function scoreTITA(selected: string | null, correct: string): number {
  if (!selected) return 0;
  return selected.trim() === correct.trim() ? 3 : 0;  // no negative
}
```

**On submit:**
1. Compute `MockSession` object with all attempts and section results
2. Detect rush pattern per section: `finalFiveMinAttempts` and `finalFiveMinCorrect`
3. Save to Firestore via `/api/save-cat-result`
4. Store in sessionStorage as `catResult`
5. Navigate to `/cat/results`

---

### app/cat/results/page.tsx — Results Page

Load `catResult` from sessionStorage.

Display in this order:
1. **Hero score** — `{totalScore} / 198` (max for 66 questions × 3) in large `font-mono`
2. **Percentile estimate** if available
3. **Section scorecards** — three cards side by side (VARC / DILR / QA):
   - Net score, Attempted/Correct/Wrong/Skipped
   - Rush warning if `finalFiveMinAttempts > 3 && finalFiveMinAccuracy < 0.4`: show amber warning: "Rush detected in final 5 min"
4. **Skip Recommendations** — computed from `chapterStats`. Only show if `netScoreImpact < 0` and `totalAttempts >= 3`. Format:
   - Chapter name + question type
   - `{wrongCount} wrong out of {attempted} — net impact: {netScoreImpact} marks`
   - "Skipping these recovers +{projectedGain} marks"
5. **Error breakdown** — donut or bar: Calculation / Concept / Trap / Rush / Careless (from review data, may be empty on first mock)
6. **Wrong questions table** — Q# | Section | Type | Your Answer | Correct
7. **Two CTAs**: "Review with Mika" → `/cat/review` | "New Mock" → `/cat`

---

### app/cat/review/page.tsx — Review Mode

Load `catResult` from sessionStorage. Iterate over wrong/unattempted questions.

**Error taxonomy prompt (new vs NEET version):**
After each question, show:
```
Did you know how to solve this?  [Yes] [No]

What went wrong?
[Calculation error]  [Concept gap]  [Trap option]  [Rush]  [Careless]
```
These buttons save `errorType` and `knewHowToSolve` to the attempt in Firestore.

**CAT-specific context injected into Mika's prompt:**
```typescript
const contextualMessage = `[CAT REVIEW CONTEXT]
Section: ${q.section} | Type: ${q.questionType} | Chapter: ${q.chapter}
Question: ${q.questionText}
${q.isTITA ? `[TITA question — no options]` : `Options: A) ${q.options!.A} | B) ${q.options!.B} | C) ${q.options!.C} | D) ${q.options!.D}`}
Correct Answer: ${q.correctAnswer}
Student's error classification: ${attempt.errorType ?? 'not classified yet'}

For QA questions: show 2-3 different approaches (brute force, approximation, algebraic).
For DILR: explain how to set up the caselet before solving.
For VARC RC: explain the reasoning process, not just the answer.

Student's question: ${input}`;
```

---

## Phase 2 — Behavioral Tracking

After Phase 1 is stable.

### StudentBehaviorProfile Computation

After each mock submits, compute and upsert a `studentProfiles/{studentId}` doc in Firestore:

```typescript
function computeSkipRecommendations(chapterStats: ChapterStat[]): SkipRecommendation[] {
  return chapterStats
    .filter(s => s.totalAttempts >= 3 && s.netScoreImpact < 0)
    .map(s => ({
      section: s.section,
      questionType: s.questionType,
      chapter: s.chapter,
      currentAccuracy: s.accuracy,
      netScoreImpact: s.netScoreImpact,
      projectedGainIfSkipped: Math.abs(s.wrong),
      reasoning: `You attempt ${s.chapter} (${s.questionType}) but accuracy is ${Math.round(s.accuracy * 100)}% — net impact: ${s.netScoreImpact} marks. Skipping recovers those marks.`
    }))
    .sort((a, b) => a.netScoreImpact - b.netScoreImpact);
}
```

Rush detection logic:
```typescript
function detectRush(attempts: QuestionAttempt[], sectionDuration: number): boolean {
  const finalFiveMin = sectionDuration - 300;  // last 300 seconds
  const lateAttempts = attempts.filter(a => a.sectionElapsedWhenAnswered >= finalFiveMin && a.isAttempted);
  const lateCorrect = lateAttempts.filter(a => a.isCorrect);
  const overallAccuracy = attempts.filter(a => a.isAttempted).length > 0
    ? attempts.filter(a => a.isCorrect).length / attempts.filter(a => a.isAttempted).length
    : 0;
  const lateAccuracy = lateAttempts.length > 0 ? lateCorrect.length / lateAttempts.length : 0;
  return lateAttempts.length >= 3 && lateAccuracy < overallAccuracy * 0.5;
}
```

---

## Phase 3 — Institute Dashboard

Route: `app/institute/page.tsx`

Access pattern for now: `?instituteId=xyz` query param. No separate auth — the institute owner bookmarks this URL. Add proper auth later.

**What to display:**
1. Institute name + plan badge + credit bar
2. Batch overview: total students, avg score, avg percentile
3. Weak area heatmap: section × chapter grid, colour by avg accuracy
4. Student alerts table: name | trend | last score | detail
5. Per-student drill-down: click student name → their `StudentBehaviorProfile` summary

**Data source:** `instituteInsights/{instituteId}` doc, recomputed after each student's mock via a server-side function in the save API route.

---

## Phase 4 — Credit Middleware

Add to `app/api/chat/route.ts` (the only modification allowed to this file):

At the top of the POST handler, before calling Gemini:
```typescript
// Credit check
const { studentId, instituteId } = await extractIdentifiers(req);
if (studentId && instituteId) {
  const allowed = await checkAndDecrementCredit(instituteId, studentId);
  if (!allowed) {
    return NextResponse.json({ error: 'CREDIT_LIMIT_REACHED' }, { status: 402 });
  }
}
```

`checkAndDecrementCredit` reads `students/{studentId}.messagesUsedThisMonth`, compares to `institutes/{instituteId}.messagesLimit / studentSeats`, increments if under limit, returns false if over.

On the client, catch `CREDIT_LIMIT_REACHED` and show: *"Your institute's monthly message limit has been reached. Contact your institute admin."*

---

## Phase 5 — PYQ Question Bank + RAG

### Admin Upload Script

Create `scripts/seed-cat-questions.ts` — a one-time Node script:
1. Reads CAT PYQ PDFs from a local folder
2. Sends each to Gemini for parsing (same approach as parse-exam API)
3. Writes structured `CATQuestion[]` to Firestore `catQuestions` collection
4. Run once: `npx ts-node scripts/seed-cat-questions.ts`

### Similar Question Retrieval (RAG-lite)

In review mode, after loading a wrong question, fetch similar past questions:
```typescript
const similar = await getDocs(
  query(
    collection(db, 'catQuestions'),
    where('questionType', '==', q.questionType),
    where('chapter', '==', q.chapter),
    limit(3)
  )
);
```
Show these in a collapsible "Similar past questions" panel below the Mika chat.

No vector DB needed — structured Firestore queries are sufficient because questions are already categorized by type and chapter.

---

## API Routes Reference

| Route | Purpose | Do not modify? |
|---|---|---|
| `app/api/chat/route.ts` | Gemini chat | Only for credit middleware addition |
| `app/api/parse-exam/route.ts` | PDF → questions (NEET) | Leave as-is |
| `app/api/save-exam-result/route.ts` | Save NEET result | Leave as-is |
| `app/api/save-cat-result/route.ts` | Save CAT MockSession + update StudentBehaviorProfile | Create new |
| `app/api/transcribe/route.ts` | Voice transcription | Do not touch |
| `app/api/tts/route.ts` | Text-to-speech | Do not touch |

---

## Dashboard Update (app/dashboard/page.tsx)

Only modification allowed: add a CAT card in the features/cards section:

```tsx
<Link href="/cat" className="group flex flex-col gap-2 p-5 rounded-xl border border-gray-800 hover:border-amber-500/50 hover:bg-gray-900 transition-all">
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-lg bg-amber-500/10">
      <Target className="w-5 h-5 text-amber-400" />
    </div>
    <span className="font-semibold text-white">CAT Mock Simulator</span>
  </div>
  <p className="text-sm text-gray-400">Take a full CAT mock with sectional timers. Get your personal skip strategy after every attempt.</p>
</Link>
```

Import `Target` from `lucide-react`. `Link` is already imported.

---

## Hard Rules

- Never modify `app/lib/firebase.ts`
- Never modify `app/api/chat/route.ts` except for adding credit middleware
- Never modify `app/api/transcribe/route.ts` or `app/api/tts/route.ts`
- Never install new npm packages without confirming they don't duplicate existing ones
- GEMINI_API_KEY must never appear in any client-side file
- sessionStorage only for in-flight exam data; Firestore for everything persisted
- All new UI uses the navy+amber color system — no pink, no purple gradients in new files
- No `SakuraRain` or petal animations in new files
- TITA questions never get -1 for wrong answers — always 0
- Sections lock permanently when timer hits 0 — no override, no resume
