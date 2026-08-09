import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logError } from '@/app/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { questionPdfBase64, answerKeyPdfBase64 } = await req.json();

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are parsing a CAT (Common Admission Test) exam paper. Extract ALL questions from the question paper PDF and match them with the answer key PDF.

Return a JSON array ONLY — no markdown, no explanation, no code fences, just raw JSON starting with [ and ending with ].

Each object must have exactly these fields:
{
  "id": "<unique string id, e.g. 'q1'>",
  "year": 2024,
  "slot": 1,
  "section": <"VARC" or "DILR" or "QA">,
  "questionType": <one of: "RC-inference", "RC-vocab", "RC-tone", "ParaJumble", "ParaSummary", "OddSentence", "Grid-DI", "Bar-DI", "Table-DI", "LinearSeating", "CircularSeating", "Scheduling", "Games-Tournament", "Arithmetic", "Algebra", "Geometry", "NumberTheory", "PnC", "Probability", "ModernMath">,
  "chapter": "<topic, e.g. 'Reading Comprehension', 'Time & Work', 'Seating Arrangement'>",
  "questionText": "<full question text>",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "isTITA": false,
  "correctAnswer": <"A" or "B" or "C" or "D" for MCQ>,
  "explanation": "<1-2 sentence explanation>",
  "difficulty": <"easy" or "medium" or "hard">
}

For TITA questions (Type In The Answer — no options):
- Set "isTITA": true
- Set "options": null
- Set "correctAnswer": "<the numeric string answer>"

CAT structure:
- VARC (Verbal Ability & Reading Comprehension): Reading comprehension passages, Para-jumbles, Para-summary, Odd sentence
- DILR (Data Interpretation & Logical Reasoning): Data tables, bar charts, logical puzzles, seating arrangements
- QA (Quantitative Aptitude): Arithmetic, Algebra, Geometry, Number Theory, P&C, Probability

If a question involves a data table or diagram, include a text description of the data in the questionText.

MATH FORMATTING (required for QA/DILR questions with math):
- Write ALL mathematical notation as LaTeX, wrapped in $ ... $ for inline math or $$ ... $$ for display/block equations.
- This applies to "questionText", "options", and "explanation".
- Examples: fractions as $\\frac{22}{7}$, exponents as $x^2$, roots as $\\sqrt{x}$, Greek letters as $\\pi$, $\\theta$, subscripts as $a_1$, inequalities as $x \\geq 5$, sets as $\\{1, 2, 3\\}$.
- Do NOT use unicode math symbols (π, √, ², ×, ÷) or plain-text approximations (x^2, sqrt(x)) — always use proper LaTeX inside $ delimiters instead.
- Plain prose (non-math words) should stay outside the $ delimiters.`;

    const parts: any[] = [prompt];
    if (questionPdfBase64) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: questionPdfBase64 } });
    }
    if (answerKeyPdfBase64) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: answerKeyPdfBase64 } });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(cleaned);

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    await logError('parse-cat-exam', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
