/**
 * One-time / re-runnable seed script for the CAT PYQ question bank.
 *
 * Usage:
 *   npm run seed:cat                 -- parses every folder in scripts/pyq-source and writes to Firestore
 *   npm run seed:cat -- --dry-run    -- parses and prints a summary, writes nothing
 *   npm run seed:cat -- --dir=other/path
 *
 * Source layout (create these yourself — PDFs are not checked in):
 *   scripts/pyq-source/2023-slot1/question.pdf
 *   scripts/pyq-source/2023-slot1/answerkey.pdf   (optional but improves accuracy)
 *   scripts/pyq-source/2023-slot2/question.pdf
 *   ...
 *
 * Folder name must match ^(\d{4})-slot([123])$ — year and slot are parsed from it
 * and stamped onto every question, so the actual PDF filenames inside don't matter
 * beyond "question.pdf" / "answerkey.pdf".
 *
 * Writes to Firestore collection `catQuestions` with a deterministic doc id
 * (`{year}-s{slot}-{n}`), so re-running the script overwrites rather than duplicates.
 *
 * Auth: uses the Firebase Admin SDK (not the client SDK) so it can write to
 * catQuestions regardless of the client-facing security rules, which don't
 * grant public write access. Requires a service account key —
 * download one from Firebase Console > Project Settings > Service Accounts >
 * "Generate new private key" and save it as scripts/service-account.json
 * (gitignored, never commit it).
 */

import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CATQuestion, CATSection, QuestionType } from '../app/lib/catTypes';

const SERVICE_ACCOUNT_PATH = path.resolve(process.cwd(), 'scripts/service-account.json');

async function loadDb() {
  if (!getApps().length) {
    let serviceAccount: object;
    try {
      serviceAccount = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
    } catch {
      throw new Error(
        `No service account key found at ${SERVICE_ACCOUNT_PATH}.\n` +
        `Download one from Firebase Console > Project Settings > Service Accounts > "Generate new private key" and save it there.`
      );
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

const SOURCE_DIR_ARG = process.argv.find(a => a.startsWith('--dir='));
const SOURCE_DIR = SOURCE_DIR_ARG
  ? path.resolve(process.cwd(), SOURCE_DIR_ARG.slice('--dir='.length))
  : path.resolve(process.cwd(), 'scripts/pyq-source');
const DRY_RUN = process.argv.includes('--dry-run');

const MODEL_NAME = process.env.GEMINI_PARSE_MODEL_PRIMARY || 'gemini-3.1-flash-lite';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];
const QUESTION_TYPES: QuestionType[] = [
  'RC-inference', 'RC-vocab', 'RC-tone', 'ParaJumble', 'ParaSummary', 'OddSentence',
  'Grid-DI', 'Bar-DI', 'Table-DI', 'LinearSeating', 'CircularSeating', 'Scheduling', 'Games-Tournament',
  'Arithmetic', 'Algebra', 'Geometry', 'NumberTheory', 'PnC', 'Probability', 'ModernMath',
];

const QUESTION_TYPES_BY_SECTION: Record<CATSection, QuestionType[]> = {
  VARC: ['RC-inference', 'RC-vocab', 'RC-tone', 'ParaJumble', 'ParaSummary', 'OddSentence'],
  DILR: ['Grid-DI', 'Bar-DI', 'Table-DI', 'LinearSeating', 'CircularSeating', 'Scheduling', 'Games-Tournament'],
  QA: ['Arithmetic', 'Algebra', 'Geometry', 'NumberTheory', 'PnC', 'Probability', 'ModernMath'],
};

const SECTION_DESCRIPTION: Record<CATSection, string> = {
  VARC: 'Reading comprehension passages, Para-jumbles, Para-summary, Odd sentence out',
  DILR: 'Data tables, bar/grid charts, seating arrangements, scheduling, tournament puzzles (caselets, usually in sets of 4-6 questions)',
  QA: 'Arithmetic, Algebra, Geometry, Number Theory, P&C, Probability, Modern Math',
};

// One call per section (not one call for the whole ~66-question paper) — a single
// call covering all three sections made the model (gemini flash-lite, solving every
// question itself since no answer key is supplied) lose track partway through and
// silently return a fraction of the paper despite finishReason STOP. Scoping each
// call to ~20-24 questions of one section fixed that.
function buildSectionPrompt(year: number, slot: number, section: CATSection): string {
  const allowedTypes = QUESTION_TYPES_BY_SECTION[section];
  return `You are transcribing the ${section} section ONLY of the official CAT (Common Admission Test) ${year} Slot ${slot} question paper into structured JSON for a question bank. The PDF contains the full paper (VARC + DILR + QA) — find and extract ONLY the ${section} section's questions; ignore the other two sections entirely.

${section} covers: ${SECTION_DESCRIPTION[section]}.

There are approximately 20-24 questions in this section. Extract every single one of them — do not stop early, do not summarize, do not skip any question even if you are unsure of the correct answer (make your best-reasoned attempt).

Return a JSON array ONLY — no markdown, no explanation, no code fences, just raw JSON starting with [ and ending with ].

Each object must have exactly these fields:
{
  "id": "<sequential number within the ${section} section, e.g. 1, 2, 3...>",
  "section": "${section}",
  "questionType": <one of: ${allowedTypes.map(t => `"${t}"`).join(', ')}>,
  "chapter": "<topic, e.g. 'Reading Comprehension', 'Time & Work', 'Seating Arrangement'>",
  "questionText": "<full question text, including any caselet/passage it belongs to>",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "isTITA": false,
  "correctAnswer": "<'A'|'B'|'C'|'D' for MCQ, or the numeric string answer for TITA>",
  "explanation": "<2-4 sentence explanation of the correct approach>",
  "difficulty": <"easy" or "medium" or "hard">
}

CRITICAL RULE ON OPTIONS: Regardless of how the source PDF labels its answer choices (numbers like 1/2/3/4, unlabeled coordinate/expression choices, or letters), you MUST always output exactly four options keyed by the literal strings "A", "B", "C", "D" in the JSON, assigned in the same top-to-bottom order they appear in the source. "correctAnswer" MUST be one of "A", "B", "C", "D" for MCQ — never the option's own text, never a number. Never omit an option; every MCQ question must have all four of A, B, C, D present.

For TITA questions (Type In The Answer — no options):
- Set "isTITA": true
- Omit "options" or set it to null
- "correctAnswer" is the numeric string answer

If a question involves a data table or diagram, include a full text transcription of the data in questionText (numbers, headers, categories) — do not just say "see diagram".

MATH FORMATTING (required for any math notation, in questionText/options/explanation):
- Write ALL mathematical notation as LaTeX, wrapped in $ ... $ for inline math or $$ ... $$ for display/block equations.
- Examples: fractions as $\\frac{22}{7}$, exponents as $x^2$, roots as $\\sqrt{x}$, Greek letters as $\\pi$, $\\theta$, subscripts as $a_1$, inequalities as $x \\geq 5$, sets as $\\{1, 2, 3\\}$.
- Do NOT use unicode math symbols (π, √, ², ×, ÷) or plain-text approximations (x^2, sqrt(x)) — always use proper LaTeX inside $ delimiters instead.
- Plain prose should stay outside the $ delimiters.

Extract every ${section} question in the paper. Do not skip any.`;
}

async function fileToBase64(filePath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return buf.toString('base64');
  } catch {
    return null;
  }
}

interface RawParsedQuestion {
  id: string | number;
  section: CATSection;
  questionType: QuestionType;
  chapter: string;
  questionText: string;
  options?: { A: string; B: string; C: string; D: string } | null;
  isTITA: boolean;
  correctAnswer: string;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

function normalize(raw: RawParsedQuestion, year: number, slot: number, index: number): CATQuestion | null {
  if (!raw || !raw.questionText || !raw.correctAnswer) return null;
  if (!SECTIONS.includes(raw.section)) return null;

  const question: CATQuestion = {
    id: `${year}-s${slot}-${index}`,
    year,
    slot: slot as 1 | 2 | 3,
    section: raw.section,
    questionType: QUESTION_TYPES.includes(raw.questionType) ? raw.questionType : 'Arithmetic',
    chapter: raw.chapter || 'Uncategorized',
    questionText: raw.questionText,
    isTITA: !!raw.isTITA,
    correctAnswer: String(raw.correctAnswer).trim(),
    explanation: raw.explanation || '',
  };
  // Firestore rejects `undefined` field values — only set optional fields when present.
  if (!question.isTITA && raw.options) question.options = raw.options;
  if (raw.difficulty) question.difficulty = raw.difficulty;

  // Defense in depth against the prompt instruction being ignored: MCQ options must be
  // keyed exactly A/B/C/D with correctAnswer pointing at one of them, or the question
  // renders broken in CATQuestionCard. Warn loudly rather than silently write bad data.
  if (!question.isTITA) {
    const keys = question.options ? Object.keys(question.options).sort().join(',') : '';
    if (keys !== 'A,B,C,D') {
      console.warn(`  [warn] ${question.id}: MCQ options not keyed A/B/C/D (keys=[${keys}]) — check manually`);
    } else if (!(question.correctAnswer in question.options!)) {
      console.warn(`  [warn] ${question.id}: correctAnswer "${question.correctAnswer}" is not a valid option key — check manually`);
    }
  }
  return question;
}

// The model sometimes emits LaTeX backslashes (\ge, \sqrt) without doubling them
// for JSON, while correctly doubling others (\\implies) in the same string — a
// naive regex re-escape mangles the already-valid pairs. Walk left-to-right so
// each backslash is judged once: valid JSON escape pairs are passed through,
// anything else gets escaped.
function escapeStrayBackslashes(json: string): string {
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (ch === '\\') {
      const next = json[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        out += ch + next;
        i++;
      } else {
        out += '\\\\';
      }
    } else {
      out += ch;
    }
  }
  return out;
}

async function parseSection(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  year: number,
  slot: number,
  section: CATSection,
  questionPdfBase64: string,
  answerKeyPdfBase64: string | null,
): Promise<RawParsedQuestion[]> {
  const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [buildSectionPrompt(year, slot, section)];
  parts.push({ inlineData: { mimeType: 'application/pdf', data: questionPdfBase64 } });
  if (answerKeyPdfBase64) {
    parts.push({ inlineData: { mimeType: 'application/pdf', data: answerKeyPdfBase64 } });
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await model.generateContent(parts);
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`  [warn] finishReason=${finishReason} for ${year} Slot ${slot} ${section} — output may be truncated`);
    }
    const text = result.response.text();
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      const sanitized = escapeStrayBackslashes(text.replace(/```json|```/g, '').trim());
      try {
        return JSON.parse(sanitized);
      } catch (e2) {
        if (attempt === 2) {
          console.error(`  [error] Gemini returned non-JSON for ${year} Slot ${slot} (${section}) after retry:`, (e2 as Error).message);
          return [];
        }
        console.warn(`  [retry] JSON parse failed for ${year} Slot ${slot} ${section}, retrying once...`);
      }
    }
  }
  return [];
}

async function parsePaper(year: number, slot: number, folder: string): Promise<CATQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set (load it via --env-file=.env.local)');

  const questionPdfBase64 = await fileToBase64(path.join(folder, 'question.pdf'));
  if (!questionPdfBase64) {
    console.warn(`  [skip] no question.pdf found in ${folder}`);
    return [];
  }
  const answerKeyPdfBase64 = await fileToBase64(path.join(folder, 'answerkey.pdf'));

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  });

  const questions: CATQuestion[] = [];
  let globalIndex = 0;

  for (const section of SECTIONS) {
    console.log(`  Parsing ${section}...`);
    const rawQuestions = await parseSection(model, year, slot, section, questionPdfBase64, answerKeyPdfBase64);
    const sectionQuestions = rawQuestions
      .map(raw => {
        globalIndex += 1;
        return normalize({ ...raw, section }, year, slot, globalIndex);
      })
      .filter((q): q is CATQuestion => q !== null);
    console.log(`    -> ${sectionQuestions.length} ${section} questions`);
    questions.push(...sectionQuestions);
  }

  return questions;
}

async function writeToFirestore(db: FirebaseFirestore.Firestore, questions: CATQuestion[]) {
  const CHUNK = 400; // Firestore batch limit is 500 writes
  for (let i = 0; i < questions.length; i += CHUNK) {
    const batch = db.batch();
    for (const q of questions.slice(i, i + CHUNK)) {
      batch.set(db.collection('catQuestions').doc(q.id), q);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`Source dir: ${SOURCE_DIR}`);
  console.log(`Model: ${MODEL_NAME}`);
  console.log(DRY_RUN ? 'Mode: DRY RUN (no writes)\n' : 'Mode: LIVE (writing to Firestore)\n');

  const db = DRY_RUN ? null : await loadDb();

  let folders: string[];
  try {
    folders = await fs.readdir(SOURCE_DIR);
  } catch {
    console.error(`No source directory at ${SOURCE_DIR}.`);
    console.error('Create it and add subfolders like "2023-slot1/question.pdf" — see the header comment in this file.');
    process.exit(1);
  }

  const paperFolders = folders.filter(f => /^\d{4}-slot[123]$/.test(f));
  if (paperFolders.length === 0) {
    console.error(`No folders matching "<year>-slot<1|2|3>" found in ${SOURCE_DIR}.`);
    process.exit(1);
  }

  let totalQuestions = 0;
  const sectionCounts: Record<CATSection, number> = { VARC: 0, DILR: 0, QA: 0 };

  for (const folderName of paperFolders) {
    const [yearStr, slotStr] = folderName.split('-slot');
    const year = parseInt(yearStr, 10);
    const slot = parseInt(slotStr, 10);
    const folder = path.join(SOURCE_DIR, folderName);

    console.log(`Parsing CAT ${year} Slot ${slot}...`);
    const questions = await parsePaper(year, slot, folder);

    if (questions.length === 0) {
      console.log(`  -> 0 questions extracted, skipping write.\n`);
      continue;
    }

    for (const q of questions) sectionCounts[q.section]++;
    totalQuestions += questions.length;
    console.log(`  -> ${questions.length} questions extracted (VARC/DILR/QA breakdown pending totals below)`);

    if (!DRY_RUN && db) {
      await writeToFirestore(db, questions);
      console.log(`  -> written to Firestore collection "catQuestions"\n`);
    } else {
      console.log(`  -> dry run, not written\n`);
    }
  }

  console.log('--- Summary ---');
  console.log(`Total questions: ${totalQuestions}`);
  console.log(`VARC: ${sectionCounts.VARC}  DILR: ${sectionCounts.DILR}  QA: ${sectionCounts.QA}`);
  if (DRY_RUN) console.log('(dry run — nothing was written)');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed script failed:', err);
    process.exit(1);
  });
