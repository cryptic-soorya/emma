import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 300;

type Subject = 'Physics' | 'Chemistry' | 'Biology';

interface Chunk {
  label: string;
  subject: Subject;
  start: number;
  end: number;
}

const CHUNKS: Chunk[] = [
  { label: 'Physics',   subject: 'Physics',   start: 1,   end: 45  },
  { label: 'Chemistry', subject: 'Chemistry', start: 46,  end: 90  },
  { label: 'Botany',    subject: 'Biology',   start: 91,  end: 135 },
  { label: 'Zoology',   subject: 'Biology',   start: 136, end: 180 },
];

const PRIMARY_MODEL = process.env.GEMINI_PARSE_MODEL_PRIMARY || 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = process.env.GEMINI_PARSE_MODEL_FALLBACK || 'gemini-2.5-flash-lite';

function buildPrompt(chunk: Chunk): string {
  const count = chunk.end - chunk.start + 1;
  return `You are extracting a SPECIFIC RANGE of questions from a NEET 2020 exam paper.

== TASK ==
Find and extract ONLY questions numbered Q${chunk.start} through Q${chunk.end} (inclusive). This is the ${chunk.label} section.

== PAPER STRUCTURE (CRITICAL — READ CAREFULLY) ==
The NEET 2020 paper contains exactly 180 questions, consecutively numbered 1 to 180, organized in this order:
  • Q1 – Q45   → PHYSICS section
  • Q46 – Q90  → CHEMISTRY section
  • Q91 – Q135 → BIOLOGY (Botany)
  • Q136 – Q180 → BIOLOGY (Zoology)

Each question is shown TWICE: once in English, then in Hindi (Devanagari script). EXTRACT THE ENGLISH VERSION ONLY.

== HOW TO LOCATE Q${chunk.start} ==
Do not just take the first question you see. Scroll until you find the question explicitly numbered "${chunk.start}." or "Q.${chunk.start}". The question number you extract MUST match the printed number — do not renumber.

If your first extracted question has questionText about ${chunk.label === 'Physics' ? 'biology, chemistry, or anything non-physics' : chunk.label === 'Chemistry' ? 'physics, biology, or anything non-chemistry' : chunk.label === 'Botany' ? 'physics, chemistry, or animal/zoology topics' : 'physics, chemistry, or plant/botany topics'}, you started in the wrong section — scroll further.

== ANSWER KEY ==
Match each question's correctAnswer using the second PDF. The key has multiple SETs (E1, F1, G1, H1, etc.). Use SET E1 by default unless only one set is present.

== HANDLING SPECIAL QUESTION TYPES (CRITICAL) ==
Many NEET questions have a body that you MUST include verbatim in questionText:

(1) MATCH-THE-FOLLOWING — include BOTH columns with their labels.
    Example: "Match the columns:\\nColumn I:\\n(a) Nitrogen\\n(b) Phosphorus\\n\\nColumn II:\\n(i) chlorophyll\\n(ii) energy"

(2) "WHICH IS CORRECT/WRONG" — include all numbered statements.
    Example: "Which is incorrect?\\n(i) Mitochondria have double membrane\\n(ii) Lysosomes have double membrane"

(3) ASSERTION-REASON — include both Assertion and Reason verbatim.

(4) MULTIPLE-CORRECT — include ALL listed statements (a), (b), (c), (d).

Rule: if options reference labels like (a), (i), 1 — those definitions MUST appear in questionText. Never drop them.

== OUTPUT FORMAT ==
Return ONLY a JSON array starting with [ and ending with ]. No prose, no markdown, no code fences.

Each element MUST have exactly these fields:
- id: number (between ${chunk.start} and ${chunk.end} inclusive)
- subject: "${chunk.subject}"
- chapter: string (NCERT chapter name, terse)
- questionText: string (English only, INCLUDING any body text)
- options: { A: string, B: string, C: string, D: string }
- correctAnswer: "A" | "B" | "C" | "D"

Do NOT include an "explanation" field.

Output exactly ${count} objects covering Q${chunk.start} through Q${chunk.end}.`;
}

interface UploadedFile {
  uri: string;
  mimeType: string;
  name: string;
}

async function uploadPdf(
  base64: string,
  displayName: string,
  fileManager: GoogleAIFileManager
): Promise<UploadedFile> {
  const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.pdf`);
  await fs.writeFile(tmpPath, Buffer.from(base64, 'base64'));
  try {
    const uploadResult = await fileManager.uploadFile(tmpPath, {
      mimeType: 'application/pdf',
      displayName,
    });
    let file = await fileManager.getFile(uploadResult.file.name);
    const startedAt = Date.now();
    while (file.state === FileState.PROCESSING) {
      if (Date.now() - startedAt > 60_000) {
        throw new Error(`${displayName} stuck in PROCESSING for >60s`);
      }
      await new Promise(r => setTimeout(r, 2000));
      file = await fileManager.getFile(uploadResult.file.name);
    }
    if (file.state !== FileState.ACTIVE) {
      throw new Error(`${displayName} upload failed: state=${file.state}`);
    }
    return { uri: file.uri, mimeType: file.mimeType, name: file.name };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

function parseRetryDelaySec(msg: string): number | null {
  const m = msg.match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(60, Math.ceil(parseFloat(m[1])));
  return null;
}

async function generateWithRetry(
  chunk: Chunk,
  questionFile: UploadedFile,
  answerKeyFile: UploadedFile,
  apiKey: string,
  attempt = 1,
  useFallbackModel = false
): Promise<string> {
  const modelName = useFallbackModel ? FALLBACK_MODEL : PRIMARY_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 65536,
    },
  });

  try {
    const result = await model.generateContent([
      buildPrompt(chunk),
      { fileData: { mimeType: questionFile.mimeType, fileUri: questionFile.uri } },
      { fileData: { mimeType: answerKeyFile.mimeType, fileUri: answerKeyFile.uri } },
    ]);
    return result.response.text();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const is429 = /429|quota|rate limit/i.test(msg);
    const is503 = /503|overloaded|unavailable|high demand/i.test(msg);
    const isNetwork = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
    const isDailyQuota = /per day|FreeTier|GenerateRequestsPerDay/i.test(msg);

    if (is429 && isDailyQuota && !useFallbackModel && PRIMARY_MODEL !== FALLBACK_MODEL) {
      console.warn(`${chunk.label}: daily quota on ${PRIMARY_MODEL}, falling back to ${FALLBACK_MODEL}`);
      return generateWithRetry(chunk, questionFile, answerKeyFile, apiKey, 1, true);
    }

    if (is429 && isDailyQuota) {
      throw new Error(`${chunk.label}: daily free quota exhausted on both ${PRIMARY_MODEL} and ${FALLBACK_MODEL}. Wait for UTC reset or enable billing.`);
    }

    if ((is429 || is503 || isNetwork) && attempt < 4) {
      const hinted = parseRetryDelaySec(msg);
      const delaySec = hinted ?? Math.min(30, 2 ** attempt);
      console.warn(`${chunk.label} attempt ${attempt} got transient error, retrying in ${delaySec}s: ${msg.slice(0, 120)}`);
      await new Promise(r => setTimeout(r, delaySec * 1000));
      return generateWithRetry(chunk, questionFile, answerKeyFile, apiKey, attempt + 1, useFallbackModel);
    }
    throw e;
  }
}

async function parseChunk(
  chunk: Chunk,
  questionFile: UploadedFile,
  answerKeyFile: UploadedFile,
  apiKey: string
): Promise<unknown[]> {
  const text = await generateWithRetry(chunk, questionFile, answerKeyFile, apiKey);
  if (!text || !text.trim()) throw new Error(`${chunk.label}: empty response`);

  let cleaned = text.replace(/```json|```/g, '').trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('not an array');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'parse error';
    console.error(`${chunk.label} parse failed. Last 300 chars:`, text.slice(-300));
    throw new Error(`${chunk.label}: JSON parse failed (${msg})`);
  }

  const arr = parsed as Array<{ id?: number }>;
  const ids = arr.map(q => q?.id).filter((n): n is number => typeof n === 'number');
  const inRange = ids.filter(n => n >= chunk.start && n <= chunk.end).length;
  console.log(`${chunk.label}: ${arr.length} items, ${inRange} in range Q${chunk.start}-${chunk.end}`);

  if (inRange < arr.length * 0.5) {
    const sample = ids.slice(0, 10).join(', ');
    throw new Error(`${chunk.label}: wrong section. Expected ${chunk.start}-${chunk.end}, got [${sample}...]`);
  }

  return arr.filter(q => typeof q.id === 'number' && q.id >= chunk.start && q.id <= chunk.end);
}

interface QuestionRow {
  id: number;
  subject: Subject;
  chapter?: string;
  questionText?: string;
  options?: { A: string; B: string; C: string; D: string };
  correctAnswer?: 'A' | 'B' | 'C' | 'D';
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  let questionFile: UploadedFile | null = null;
  let answerKeyFile: UploadedFile | null = null;

  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { questionPdfBase64, answerKeyPdfBase64 } = await req.json();
    if (!questionPdfBase64 || !answerKeyPdfBase64) {
      return NextResponse.json({ error: 'Missing PDF data' }, { status: 400 });
    }

    const fileManager = new GoogleAIFileManager(apiKey);

    // Upload both PDFs once, then run all 4 chunks in parallel against the URIs.
    console.log('Uploading PDFs to Gemini File API...');
    const uploadStart = Date.now();
    [questionFile, answerKeyFile] = await Promise.all([
      uploadPdf(questionPdfBase64, 'qp.pdf', fileManager),
      uploadPdf(answerKeyPdfBase64, 'ak.pdf', fileManager),
    ]);
    console.log(`Uploads ready in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`);

    console.log(`Parsing all 4 chunks in parallel. primary=${PRIMARY_MODEL}, fallback=${FALLBACK_MODEL}`);
    const parseStart = Date.now();
    const settled = await Promise.allSettled(
      CHUNKS.map(c => parseChunk(c, questionFile!, answerKeyFile!, apiKey))
    );
    console.log(`All chunks settled in ${((Date.now() - parseStart) / 1000).toFixed(1)}s`);

    const results: { chunk: Chunk; data?: unknown[]; error?: string }[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return { chunk: CHUNKS[i], data: r.value };
      return { chunk: CHUNKS[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });

    // Half-split fallback for any failed chunk
    for (let i = 0; i < results.length; i++) {
      if (!results[i].error) continue;
      const chunk = results[i].chunk;
      const mid = Math.floor((chunk.start + chunk.end) / 2);
      const half1: Chunk = { ...chunk, label: `${chunk.label} (Q${chunk.start}-${mid})`, end: mid };
      const half2: Chunk = { ...chunk, label: `${chunk.label} (Q${mid + 1}-${chunk.end})`, start: mid + 1 };
      console.log(`Retrying ${chunk.label} as ${half1.label} + ${half2.label}`);
      try {
        const [a, b] = await Promise.all([
          parseChunk(half1, questionFile!, answerKeyFile!, apiKey),
          parseChunk(half2, questionFile!, answerKeyFile!, apiKey),
        ]);
        results[i] = { chunk, data: [...a, ...b] };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results[i] = { chunk, error: `${chunk.label}: ${msg}` };
      }
    }

    const failures = results.filter(r => r.error).map(r => r.error!);
    if (failures.length > 0) {
      return NextResponse.json({ error: `Parsing failed for: ${failures.join(' | ')}` }, { status: 500 });
    }

    const all: QuestionRow[] = results.flatMap(r =>
      (r.data as unknown[]).map(q => ({ ...(q as QuestionRow), subject: r.chunk.subject }))
    );
    const questions = all.sort((a, b) => a.id - b.id);

    if (questions.length < 150) {
      return NextResponse.json({ error: `Only ${questions.length} questions parsed (expected ~180).` }, { status: 500 });
    }

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('parse-exam fatal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Always clean up uploaded files so they don't sit in storage for 48h.
    if (apiKey && (questionFile || answerKeyFile)) {
      const fm = new GoogleAIFileManager(apiKey);
      await Promise.allSettled([
        questionFile ? fm.deleteFile(questionFile.name) : Promise.resolve(),
        answerKeyFile ? fm.deleteFile(answerKeyFile.name) : Promise.resolve(),
      ]);
    }
  }
}
