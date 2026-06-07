# CLAUDE.md — NEET Exam Simulator Feature

## Project Context
This is **Mika**, an AI study companion built on Next.js 15 App Router, Gemini AI, Firebase Firestore, and Tailwind CSS. We are adding a **NEET Exam Simulator** as a new feature inside this existing project.

Do NOT modify any existing files unless explicitly told to. Add new files only.

---

## Feature Overview
A full NEET exam simulation experience:
1. User uploads a **question paper PDF** + **answer key PDF**
2. Gemini parses both PDFs and returns structured JSON
3. User takes a timed exam (3 hours, pausable) in a clean MCQ UI
4. On submit → results are calculated, wrong questions classified by subject/chapter
5. Wrong questions + subject weakness data saved to Firestore
6. A "Review with Mika" button navigates to `/exam/review` where Mika explains each wrong answer

---

## New Routes to Create

```
app/exam/page.tsx                         <- Upload page (Step 1)
app/exam/session/page.tsx                 <- Live exam UI (Step 3)
app/exam/results/page.tsx                 <- Results + score card (Step 4)
app/exam/review/page.tsx                  <- Mika review mode (Step 5)
app/api/parse-exam/route.ts               <- Server: Gemini PDF parse API
app/api/save-exam-result/route.ts         <- Server: Save results to Firestore
app/components/exam/Timer.tsx             <- Countdown timer component
app/components/exam/QuestionCard.tsx      <- Single MCQ question component
app/components/exam/QuestionNavigator.tsx <- Side panel: question status grid
app/lib/examTypes.ts                      <- All TypeScript types for this feature
```

---

## TypeScript Types — app/lib/examTypes.ts

Create this file with these exact types:

```typescript
export type Subject = 'Physics' | 'Chemistry' | 'Biology';

export interface ParsedQuestion {
  id: number;                    // 1-180
  subject: Subject;
  chapter: string;               // e.g. "Laws of Motion", "Cell Biology"
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;          // Gemini may include this from answer key
}

export interface UserAnswer {
  questionId: number;
  selected: 'A' | 'B' | 'C' | 'D' | null;   // null = not attempted
  markedForReview: boolean;
  timeSpentSeconds: number;
}

export interface ExamSession {
  questions: ParsedQuestion[];
  answers: UserAnswer[];
  startTime: number;             // Date.now()
  pausedTimeMs: number;          // accumulated pause duration
  isPaused: boolean;
  totalDurationMs: number;       // 3 * 60 * 60 * 1000
}

export interface ExamResult {
  sessionId: string;             // Firestore doc ID
  userId?: string;               // optional, for future auth
  createdAt: number;
  totalScore: number;
  maxScore: number;              // 720
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeTakenMs: number;
  subjectBreakdown: {
    [key in Subject]: {
      correct: number;
      wrong: number;
      skipped: number;
      score: number;
    };
  };
  wrongQuestions: ParsedQuestion[];
  weakChapters: { subject: Subject; chapter: string; wrongCount: number }[];
}
```

---

## API Route 1 — app/api/parse-exam/route.ts

Receives two base64-encoded PDFs (question paper + answer key). Sends both to Gemini with a structured prompt. Returns a JSON array of ParsedQuestion[].

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { questionPdfBase64, answerKeyPdfBase64 } = await req.json();

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are parsing a NEET exam paper. Extract ALL questions from the question paper PDF and match them with the answer key PDF.

Return a JSON array ONLY — no markdown, no explanation, no code fences, just raw JSON starting with [ and ending with ].

Each object must have exactly these fields:
{
  "id": <question number 1-180>,
  "subject": <"Physics" or "Chemistry" or "Biology">,
  "chapter": <best guess at chapter name from the topic e.g. "Kinematics", "Organic Chemistry", "Cell Division">,
  "questionText": <full question text>,
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correctAnswer": <"A" or "B" or "C" or "D">,
  "explanation": <1-2 sentence explanation of why the answer is correct>
}

NEET structure: Questions 1-45 are Physics, 46-90 are Chemistry, 91-180 are Biology.
If a question has an image/diagram, write "[Diagram question - see original paper]" in questionText.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'application/pdf', data: questionPdfBase64 } },
      { inlineData: { mimeType: 'application/pdf', data: answerKeyPdfBase64 } },
    ]);

    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(cleaned);

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

## API Route 2 — app/api/save-exam-result/route.ts

Receives an ExamResult object, saves it to Firestore collection `examResults`, returns the Firestore doc ID.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function POST(req: NextRequest) {
  try {
    const result = await req.json();
    const docRef = await addDoc(collection(db, 'examResults'), result);
    return NextResponse.json({ sessionId: docRef.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

## Component — app/components/exam/Timer.tsx

Props interface:
```typescript
interface TimerProps {
  totalMs: number;
  pausedMs: number;
  isPaused: boolean;
  onTick: (remainingMs: number) => void;
}
```

- Displays HH:MM:SS countdown
- Uses useRef for the interval (not useState — avoids stale closure issues)
- Counts down from totalMs, subtracting pausedMs
- Fires onTick every second with remaining ms
- When time hits 0, fires onTick(0) — parent handles auto-submit
- Stops interval when isPaused is true
- Large bold monospace display (font-mono text-4xl)
- Color: white normally, turns red when under 5 minutes

---

## Component — app/components/exam/QuestionCard.tsx

Props interface:
```typescript
interface QuestionCardProps {
  question: ParsedQuestion;
  selectedAnswer: 'A' | 'B' | 'C' | 'D' | null;
  onSelect: (ans: 'A' | 'B' | 'C' | 'D') => void;
  questionNumber: number;
}
```

- Shows question number and subject badge at top
- Question text rendered with react-markdown (already installed)
- 4 option buttons labeled A, B, C, D
- Clicking selected option again DESELECTS it
- Selected option: blue border + subtle blue bg
- Hover state on unselected options
- Options are full-width stacked buttons, not inline

---

## Component — app/components/exam/QuestionNavigator.tsx

Props interface:
```typescript
interface QuestionNavigatorProps {
  questions: ParsedQuestion[];
  answers: UserAnswer[];
  currentIndex: number;
  onJump: (index: number) => void;
}
```

- Three tabs: Physics (Q1-45), Chemistry (Q46-90), Biology (Q91-180)
- Inside each tab: grid of numbered buttons (6 columns)
- Color coding per button:
  - bg-gray-700 = not visited
  - bg-white text-black = visited but unanswered
  - bg-green-600 = answered
  - bg-orange-500 = marked for review (unanswered)
  - bg-red-500 = answered + marked for review
  - ring-2 ring-blue-400 = current question
- Clicking jumps to that question via onJump

---

## Page 1 — app/exam/page.tsx (Upload Page)

Full implementation:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SpotlightBackground from '@/app/components/SpotlightBackground';
import { Upload, FileText, Loader2 } from 'lucide-react';

export default function ExamUploadPage() {
  const router = useRouter();
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleParse = async () => {
    if (!questionPdf || !answerKeyPdf) return;
    setLoading(true);
    setError(null);

    try {
      setProgress('Converting PDFs...');
      const [qBase64, aBase64] = await Promise.all([
        toBase64(questionPdf),
        toBase64(answerKeyPdf),
      ]);

      setProgress('Gemini is reading your paper... (this takes ~30 seconds)');
      const res = await fetch('/api/parse-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPdfBase64: qBase64,
          answerKeyPdfBase64: aBase64,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      sessionStorage.setItem('examQuestions', JSON.stringify(data.questions));
      router.push('/exam/session');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <SpotlightBackground />
      <div className="relative z-10 w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">NEET Exam Simulator</h1>
          <p className="text-gray-400">Upload your question paper and answer key to begin</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Question Paper Upload */}
          <label className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${questionPdf ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-400'}`}>
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={e => setQuestionPdf(e.target.files?.[0] || null)}
            />
            <FileText className={`w-8 h-8 ${questionPdf ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="text-center">
              <p className="font-medium text-sm">Question Paper</p>
              <p className="text-xs text-gray-400 mt-1">
                {questionPdf ? questionPdf.name : 'Click to upload PDF'}
              </p>
            </div>
          </label>

          {/* Answer Key Upload */}
          <label className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${answerKeyPdf ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-400'}`}>
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={e => setAnswerKeyPdf(e.target.files?.[0] || null)}
            />
            <Upload className={`w-8 h-8 ${answerKeyPdf ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="text-center">
              <p className="font-medium text-sm">Answer Key</p>
              <p className="text-xs text-gray-400 mt-1">
                {answerKeyPdf ? answerKeyPdf.name : 'Click to upload PDF'}
              </p>
            </div>
          </label>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={!questionPdf || !answerKeyPdf || loading}
          className="w-full py-3 px-6 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </>
          ) : (
            'Parse & Start Exam'
          )}
        </button>
      </div>
    </div>
  );
}
```

---

## Page 2 — app/exam/session/page.tsx (Live Exam)

This is the most complex page. Build it with this structure:

**State:**
```typescript
const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
const [answers, setAnswers] = useState<UserAnswer[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [isPaused, setIsPaused] = useState(false);
const [pausedTimeMs, setPausedTimeMs] = useState(0);
const [showSubmitModal, setShowSubmitModal] = useState(false);
const [activeSubjectTab, setActiveSubjectTab] = useState<Subject>('Physics');
const pauseStartRef = useRef<number | null>(null);
```

**On mount:**
- Load questions from `sessionStorage.getItem('examQuestions')`
- Initialize answers array: `questions.map((q, i) => ({ questionId: i+1, selected: null, markedForReview: false, timeSpentSeconds: 0 }))`
- If no questions found, redirect to `/exam`

**Pause logic:**
- When pausing: record `pauseStartRef.current = Date.now()`
- When resuming: `setPausedTimeMs(prev => prev + (Date.now() - pauseStartRef.current!))`

**Auto-save every 30 seconds:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    sessionStorage.setItem('examAnswers', JSON.stringify(answers));
  }, 30000);
  return () => clearInterval(interval);
}, [answers]);
```

**Layout:**
```tsx
<div className="min-h-screen bg-gray-950 text-white flex">
  {/* Left: Navigator — w-64, hidden on mobile */}
  <div className="hidden lg:flex flex-col w-64 border-r border-gray-800 p-4">
    <QuestionNavigator ... />
  </div>

  {/* Center: Question */}
  <div className="flex-1 flex flex-col p-6 max-w-3xl mx-auto">
    <QuestionCard ... />
    {/* Previous / Mark for Review / Save & Next buttons */}
  </div>

  {/* Right: Timer + stats — w-56 */}
  <div className="hidden lg:flex flex-col w-56 border-l border-gray-800 p-4 space-y-6">
    <Timer ... />
    {/* Stats: Answered/Unanswered counts */}
    <button onClick={() => setShowSubmitModal(true)}>Submit Exam</button>
  </div>
</div>
```

**Submit modal:** Simple confirmation overlay — "Are you sure? You have X unanswered questions." with Cancel and Confirm.

**On confirmed submit:**
```typescript
const handleSubmit = async () => {
  // 1. Calculate results
  const result = calculateExamResult(questions, answers, timeTakenMs);
  // 2. Store in sessionStorage
  sessionStorage.setItem('examResult', JSON.stringify(result));
  // 3. Save to Firestore
  const res = await fetch('/api/save-exam-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
  const { sessionId } = await res.json();
  router.push(`/exam/results?id=${sessionId}`);
};
```

**calculateExamResult function** (put this in the page or a utils file):
```typescript
function calculateExamResult(
  questions: ParsedQuestion[],
  answers: UserAnswer[],
  timeTakenMs: number
): ExamResult {
  const subjects: Subject[] = ['Physics', 'Chemistry', 'Biology'];
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  const subjectBreakdown = {} as ExamResult['subjectBreakdown'];
  subjects.forEach(s => {
    subjectBreakdown[s] = { correct: 0, wrong: 0, skipped: 0, score: 0 };
  });

  const wrongQuestions: ParsedQuestion[] = [];
  const chapterMap: Record<string, { subject: Subject; wrongCount: number }> = {};

  questions.forEach((q, i) => {
    const ans = answers[i];
    const sub = q.subject;

    if (!ans.selected) {
      skippedCount++;
      subjectBreakdown[sub].skipped++;
    } else if (ans.selected === q.correctAnswer) {
      totalScore += 4;
      correctCount++;
      subjectBreakdown[sub].correct++;
      subjectBreakdown[sub].score += 4;
    } else {
      totalScore -= 1;
      wrongCount++;
      subjectBreakdown[sub].wrong++;
      subjectBreakdown[sub].score -= 1;
      wrongQuestions.push(q);
      const key = `${sub}::${q.chapter}`;
      if (!chapterMap[key]) chapterMap[key] = { subject: sub, wrongCount: 0 };
      chapterMap[key].wrongCount++;
    }
  });

  const weakChapters = Object.entries(chapterMap)
    .map(([key, val]) => ({ subject: val.subject, chapter: key.split('::')[1], wrongCount: val.wrongCount }))
    .sort((a, b) => b.wrongCount - a.wrongCount);

  return {
    sessionId: '',
    createdAt: Date.now(),
    totalScore,
    maxScore: 720,
    correctCount,
    wrongCount,
    skippedCount,
    timeTakenMs,
    subjectBreakdown,
    wrongQuestions,
    weakChapters,
  };
}
```

---

## Page 3 — app/exam/results/page.tsx

Load `examResult` from `sessionStorage.getItem('examResult')`.

Display:
1. Hero score: `{result.totalScore} / 720` in large text
2. Grade label based on score:
   - >= 600: "Excellent" (green)
   - >= 450: "Good" (blue)
   - >= 300: "Average" (yellow)
   - < 300: "Needs Work" (red)
3. Three subject cards in a row — each showing correct/wrong/skipped + score
4. Weak chapters section: ordered list of chapters with wrong counts
5. Wrong questions table: Q# | Subject | Chapter | Your Answer | Correct Answer
6. Two buttons: "Review with Mika" (links to /exam/review) | "New Exam" (links to /exam)

---

## Page 4 — app/exam/review/page.tsx

Load `examResult` from sessionStorage. Use `result.wrongQuestions`.

**State:**
```typescript
const [currentWrongIndex, setCurrentWrongIndex] = useState(0);
const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
const [input, setInput] = useState('');
const [loading, setLoading] = useState(false);
```

**Reset messages when question changes** — `useEffect(() => setMessages([]), [currentWrongIndex])`

**Chat handler** — reuse the existing `/api/chat` endpoint. Prepend exam context to user message:
```typescript
const contextualMessage = `[EXAM REVIEW CONTEXT]
Subject: ${q.subject} | Chapter: ${q.chapter}
Question: ${q.questionText}
Options: A) ${q.options.A} | B) ${q.options.B} | C) ${q.options.C} | D) ${q.options.D}
Correct Answer: ${q.correctAnswer}

Student's question: ${input}`;
```

**Question display:**
- Show question text
- Show all 4 options with color coding:
  - User's wrong answer: red background
  - Correct answer: green background
  - Others: gray
- Show explanation in a highlighted box below options
- Progress: "Wrong Question 3 of 17"
- Prev / Next buttons

**Chat area** below question: standard chat bubble UI matching Mika's existing chat style.

---

## Dashboard Update — app/dashboard/page.tsx

Add a card/link to the exam simulator. Find where existing feature cards are in dashboard/page.tsx and add one more card like this:

```tsx
<Link href="/exam" className="group flex flex-col gap-2 p-5 rounded-2xl border border-gray-800 hover:border-gray-600 hover:bg-gray-900 transition-all">
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-lg bg-blue-500/10">
      <ClipboardList className="w-5 h-5 text-blue-400" />
    </div>
    <span className="font-semibold text-white">NEET Exam Simulator</span>
  </div>
  <p className="text-sm text-gray-400">Upload a PYQ paper and simulate a full timed NEET exam with instant Mika review.</p>
</Link>
```

Import `ClipboardList` from `lucide-react` and `Link` from `next/link`.

---

## Build Order

Build files in this exact order:

1. app/lib/examTypes.ts
2. app/api/parse-exam/route.ts
3. app/api/save-exam-result/route.ts
4. app/components/exam/Timer.tsx
5. app/components/exam/QuestionCard.tsx
6. app/components/exam/QuestionNavigator.tsx
7. app/exam/page.tsx
8. app/exam/session/page.tsx
9. app/exam/results/page.tsx
10. app/exam/review/page.tsx
11. Update app/dashboard/page.tsx (add exam card only)

---

## Hard Rules

- Do NOT modify app/api/chat/route.ts
- Do NOT modify app/lib/firebase.ts
- Do NOT install new packages — all dependencies already exist
- Use sessionStorage (not localStorage) for exam state
- All pages are 'use client' except API routes
- API routes must never expose GEMINI_API_KEY to the client
- Keep Tailwind classes consistent with the dark theme already in the project
