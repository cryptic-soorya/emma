# Mika CAT — Product Plan

## Current Implementation Status (updated 2026-07-13, automated run)

Mapped against the phases in CLAUDE.md (the authoritative spec):

| Phase (CLAUDE.md) | Status | Notes |
|---|---|---|
| Phase 1 — CAT Foundation | ✅ Done | All ten files exist: `catTypes.ts`, `save-cat-result` API, `SectionTimer`, `CATQuestionCard`, `CATNavigator`, `/cat` picker, `/cat/session`, `/cat/results`, `/cat/review`, `/institute` (stub+). Dashboard has the CAT entry. CAT scoring (+3/-1 MCQ, +3/0 TITA), sectional lock-out, and behavioral capture are in place. |
| Phase 2 — Behavioral Tracking | ✅ Done | `StudentBehaviorProfile` computed and upserted in `save-cat-result`; chapter stats, skip recommendations, rush detection all live. |
| Phase 3 — Institute Dashboard | ✅ Done (basic) | `/institute?instituteId=...` reads `instituteInsights`; recomputed after each mock submit. Auth still TODO. |
| Phase 4 — Credit Middleware | ⬜ Not started | No credit check in `app/api/chat/route.ts` yet. |
| Phase 5 — PYQ Bank seeding + RAG-lite | ✅ Done | `scripts/seed-cat-questions.ts` parses PDFs from `scripts/pyq-source/<year>-slot<N>/` via Gemini and writes to `catQuestions` (idempotent, `npm run seed:cat`, `--dry-run` supported). `/cat/review` now shows a "Similar past questions" panel (same `questionType` + `chapter`, structured Firestore query, no vector DB). |

### Math rendering (2026-07-13)

KaTeX (`remark-math` + `rehype-katex`) was already wired into `CATQuestionCard`, `/cat/review`, `/cat/drill`, `/cat/revision` — but nothing told Gemini to *emit* LaTeX, so parsed questions/explanations came back as plain text (`x^2`, `pi`) with nothing for KaTeX to render. Fixed by adding explicit LaTeX-formatting instructions (wrap math in `$...$`/`$$...$$`, no unicode math symbols) to: `app/api/parse-cat-exam/route.ts` (PDF parsing prompt), `app/cat/review/page.tsx` (live Mika chat context), and `scripts/seed-cat-questions.ts` (bulk PYQ seeding prompt).

### Value-Add Student Features (added 2026-07-13)

Three features beyond CLAUDE.md's spec, chosen because they turn the diagnosis Mika already produces into daily practice, using only existing infra (Firestore + existing data model):

1. **Revision Queue — spaced repetition of missed questions** (`/cat/revision`, `revisionQueues/{studentId}`). Every wrong attempt from a mock is auto-queued by `save-cat-result` on a 1→3→7→14 day schedule. Correct on re-test advances the interval (retires after 14d); wrong resets to 1 day. Rationale: CAT prep fails mostly by repeating the same mistakes; we already record every wrong attempt, so spaced re-testing is nearly free and high-yield.
2. **Weak Chapter Drill Mode** (`/cat/drill`). Reads the student's `chapterStats`, surfaces chapters with <60% accuracy over ≥3 attempts, and serves untimed question sets from the `catQuestions` bank with instant feedback + explanations. Rationale: skip recommendations tell a student what's broken; drill mode is where they either fix it or confirm the skip.
3. **Study Streak tracker** (`studentProfiles.streak`, shown on `/cat`). A study day = mock submitted, drill finished, or revision cleared. Rationale: consistency is the #1 behavioral predictor for CAT outcomes and it costs one small field on an existing doc.

Shared pure logic lives in `app/lib/catStudy.ts`; new types (`RevisionItem`, `RevisionQueue`, `StudyStreak`) in `catTypes.ts`.

### Open TODOs

- Firestore security rules for `catQuestions` (read-only), `revisionQueues`, `studentProfiles`, `mockSessions`, `instituteInsights` — no `firebase.json`/`.firebaserc` in this repo yet, so rules currently live only in the Firebase console; needs the CLI project linked before rules can be version-controlled
- ~~Run `npm run seed:cat` against real CAT PYQ PDFs~~ Done 2026-07-20: CAT 2023 Slots 1–3 seeded to Firestore `catQuestions` (197 questions: VARC 71, DILR 60, QA 66). Only 2023 slots available so far — 2017–2022, 2024 still need PDFs dropped into `scripts/pyq-source/`.
- ~~Post-seed audit found 4/197 questions (2%) with malformed `options`~~ Fixed 2026-07-23: `buildSectionPrompt()` in `scripts/seed-cat-questions.ts` now has a "CRITICAL RULE ON OPTIONS" instruction forcing canonical A/B/C/D keys regardless of source labeling, plus defense-in-depth validation in `normalize()` that warns on any malformed shape instead of silently writing it. Added `scripts/audit-cat-questions.ts` (`npm run audit:cat`, supports `--year=`/`--slot=`) to make the post-seed audit scripted instead of manual — ran against all 198 live questions in Firestore, 0 issues found.
- Firestore composite index likely needed for the drill query and the new similar-questions query (`questionType == X && chapter == Y`) — Firestore will print the index-creation link on first live run
- Credit middleware in chat route (Phase 4)
- Auth on `/institute` (currently query-param only, per spec)
- Similar-question RAG-lite panel in review mode

---

## What We're Building

Mika is pivoting from a NEET study companion to a **CAT exam intelligence platform** sold B2B to coaching institutes. The core proposition is not just a chat interface — it's a system that tells students their personal CAT strategy based on behavioral data across mocks, and gives the institute owner class-wide insight they can't get anywhere else.

**Client context:** One coaching institute owner (the prospect). First deal is a pilot. Build for him, then generalise.

---

## The Positioning

> "The only tool that tells you your personal CAT strategy — not just your score."

This is not ChatGPT with a timer. The differentiation is behavioral intelligence: skip recommendations, rush detection, error taxonomy, and mock-to-mock pattern tracking. No existing tool does this for CAT.

---

## UI Redesign — From Girlish to Sharp

### What Needs to Change

| Current | Target |
|---|---|
| Pink/purple gradients | Deep navy (`#0a0f1e`) + electric amber (`#f59e0b`) accent |
| Sakura petals animation | Subtle grid or particle background — geometric, not organic |
| `text-pink-500` everywhere | `text-amber-400` for primary accent |
| "Hello, Doctor." | "Hello, {name}." — no role assumption |
| Sparkles icon as brand | Sharp geometric icon — `BrainCircuit` or `Target` from lucide |
| Rounded pill borders | Sharper `rounded-lg` (not `rounded-full`) on key elements |
| Italic motivational quotes | Crisp stat line: "3 mocks • 47% DILR accuracy • 2 weak chapters" |

### Color Tokens (Tailwind)

```
Background:   bg-[#0a0f1e]         (deep navy, not pure black)
Surface:      bg-[#111827]         (cards, panels)
Border:       border-gray-800
Accent:       text-amber-400 / bg-amber-500
Success:      text-emerald-400
Danger:       text-red-400
Text primary: text-white
Text muted:   text-gray-400
```

### Typography

- Font weight heavier across the board: `font-semibold` instead of `font-medium` in headings
- Tracking tighter: `tracking-tight` on all H1/H2
- No italic UI text anywhere except direct quotes

### What NOT to Touch in Phase 1

- The chat bubble UI structure (already good)
- The SpotlightBackground component (keep, just recolor)
- Firebase auth flow

---

## Feature Set

### Already Built (NEET, needs CAT conversion)
- Exam session page with timer, question navigator, MCQ cards
- Results page with subject breakdown and wrong question table
- Review page with Mika chat per question
- API routes for parsing PDFs and saving results

### Phase 1 — CAT Foundation
1. New type system (`catTypes.ts`) — sections, TITA questions, CAT scoring
2. Replace NEET scoring (+4/-1) with CAT scoring (+3/-1 MCQ, +3/0 TITA)
3. Sectional timer with lock-out (40 min per section, no going back)
4. PYQ Question Bank in Firestore — pre-load CAT 2017–2024 papers
5. Exam page: pick year/slot from bank instead of PDF upload
6. UI color token swap (navy + amber)
7. Remove SakuraRain, replace with GeometricBackground

### Phase 2 — Behavioral Tracking
1. Track per-question behavioral data during session:
   - `timeSpentSeconds`, `visitCount`, `changedAnswerCount`, `sectionElapsedWhenAnswered`
2. After submit, compute `StudentBehaviorProfile` and save to Firestore
3. Rush detection: flag if final-5-min accuracy < 50% of overall section accuracy
4. Skip Recommendation Engine: `netScoreImpact` per chapter/type, surface anything negative

### Phase 3 — Error Taxonomy in Review Mode
1. After reviewing each wrong question, prompt student: "Did you know how to solve this?"
2. Show 5-button error classifier: Calculation error / Concept gap / Trap option / Rush / Careless
3. Store `errorType` and `knewHowToSolve` on the `QuestionAttempt`
4. Surface error breakdown on results page: "6 trap options, 3 concept gaps, 2 calculation errors"

### Phase 4 — Institute Dashboard
1. New route `/institute` — behind a simple `instituteId` query param for now (no full auth)
2. Show:
   - Class-wide weak chapters ranked by student count
   - Per-student score trend (last 5 mocks)
   - Student alerts: declining / stagnating / breakthrough
   - Credit usage bar (messages used / limit this month)
3. This is what the institute owner pays for — it's his visibility into the batch

### Phase 5 — Credit / Usage System
1. Firestore `institutes/{id}` document with `messagesLimit`, `messagesUsed`, `resetDate`
2. Middleware in `/api/chat` route: check limit before calling Gemini, decrement after
3. Student sees a soft wall when limit hit: "Your institute's monthly limit is reached"
4. Monthly reset via a simple cron or manual trigger (keep it manual for first client)

### Phase 6 — RAG for PYQs (post-pilot)
1. Pre-parse all CAT PYQs once via Gemini, store as structured JSON in Firestore
2. Exam page loads questions from Firestore by year/slot — instant start, no PDF parse
3. In review mode: retrieve 2–3 similar past questions to show the student recurring patterns
4. This uses Firestore vector search (already available, no new package needed)

---

## Firestore Schema

```
institutes/{instituteId}
  name, plan, messagesLimit, messagesUsed, resetDate, studentSeats

students/{studentId}
  name, email, instituteId, messagesUsedThisMonth

catQuestions/{questionId}
  year, slot, section, questionType, chapter, questionText,
  options, isTITA, correctAnswer, explanation, difficulty

mockSessions/{sessionId}
  studentId, instituteId, mockName, takenAt, totalScore,
  sectionResults{VARC,DILR,QA}, attempts[]

studentProfiles/{studentId}
  mockCount, sectionStats, chapterStats, errorBreakdown,
  skipRecommendations, optimalSectionOrder, updatedAt

instituteInsights/{instituteId}
  batchWeakAreas, studentAlerts, avgScore, updatedAt
```

---

## Business Model

### Pricing to Pitch

| Tier | Price/month | Seats | Messages/student/month |
|---|---|---|---|
| Starter | ₹8,000 | 50 | 30 |
| Pro | ₹18,000 | 200 | 100 |
| Unlimited | ₹35,000 | Unlimited | Unlimited |

### Cost Structure

- Gemini API (review chat): ~₹0.10–0.30 per message
- PDF parsing: absorbed one-time during PYQ bank setup (not per student)
- Worst case at Pro tier (200 students × 100 msgs): ~₹4,000/month Gemini cost
- Margin at Pro: ₹14,000/month

### Go-to-Market

1. Pilot with this one institute — free first month
2. Use their student data to build the behavioral profiles (this is what makes the product defensible)
3. After pilot: take testimonial + results screenshot → approach 2 more institutes
4. Do not build a self-serve signup flow until 3 paying clients — keep it manual

---

## Build Priority Order

```
Phase 1 (Demo-ready):
  1. catTypes.ts
  2. CAT exam session (sectional timer, TITA, +3/-1 scoring)
  3. Results page updated for CAT
  4. UI color/theme swap
  5. Landing page copy update

Phase 2 (After first session with client):
  6. Behavioral tracking in session
  7. StudentBehaviorProfile computation
  8. Skip recommendations on results page

Phase 3 (After 3 mocks of data):
  9. Error taxonomy in review
  10. Institute dashboard
  11. Credit middleware

Phase 4 (Post-pilot):
  12. PYQ Firestore bank
  13. RAG-based similar question retrieval
```

---

## Hard Constraints

- Do not add new npm packages without checking if the functionality exists in already-installed ones
- Gemini API key stays server-side only — never in client code
- sessionStorage for in-flight exam state, Firestore for persisted results
- Institute dashboard is read-only for the owner — no editing student data from that view
- All monetary decisions (pricing, billing) handled outside the app for now — manual invoicing
