/**
 * Post-seed audit for the CAT PYQ question bank — checks every MCQ in
 * Firestore `catQuestions` has options keyed exactly A/B/C/D with a valid
 * correctAnswer, and every TITA question has no options and a non-empty
 * correctAnswer. Run this after every `npm run seed:cat`.
 *
 * Usage:
 *   npm run audit:cat                    -- audit the whole collection
 *   npm run audit:cat -- --year=2023     -- audit one year
 *   npm run audit:cat -- --year=2023 --slot=1
 *
 * Uses the same Firebase Admin service account as seed-cat-questions.ts
 * (scripts/service-account.json).
 */

import fs from 'fs/promises';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

const YEAR_ARG = process.argv.find(a => a.startsWith('--year='));
const SLOT_ARG = process.argv.find(a => a.startsWith('--slot='));
const YEAR = YEAR_ARG ? parseInt(YEAR_ARG.slice('--year='.length), 10) : null;
const SLOT = SLOT_ARG ? parseInt(SLOT_ARG.slice('--slot='.length), 10) : null;

interface Flag {
  id: string;
  reason: string;
}

function auditQuestion(id: string, data: FirebaseFirestore.DocumentData): Flag | null {
  const isTITA = !!data.isTITA;

  if (isTITA) {
    if (data.options != null) {
      return { id, reason: 'TITA question has non-null options' };
    }
    if (!data.correctAnswer || typeof data.correctAnswer !== 'string' || !data.correctAnswer.trim()) {
      return { id, reason: 'TITA question missing correctAnswer' };
    }
    return null;
  }

  const options = data.options;
  if (!options || typeof options !== 'object') {
    return { id, reason: 'MCQ question missing options' };
  }
  const keys = Object.keys(options).sort().join(',');
  if (keys !== 'A,B,C,D') {
    return { id, reason: `MCQ options not keyed A/B/C/D (keys=[${keys}])` };
  }
  for (const k of ['A', 'B', 'C', 'D']) {
    if (!options[k] || typeof options[k] !== 'string' || !options[k].trim()) {
      return { id, reason: `MCQ option "${k}" is empty` };
    }
  }
  if (!data.correctAnswer || !(data.correctAnswer in options)) {
    return { id, reason: `correctAnswer "${data.correctAnswer}" is not a valid option key` };
  }
  return null;
}

async function main() {
  const db = await loadDb();
  let query: FirebaseFirestore.Query = db.collection('catQuestions');
  if (YEAR !== null) query = query.where('year', '==', YEAR);
  if (SLOT !== null) query = query.where('slot', '==', SLOT);

  console.log(`Auditing catQuestions${YEAR !== null ? ` (year=${YEAR}${SLOT !== null ? `, slot=${SLOT}` : ''})` : ''}...\n`);

  const snapshot = await query.get();
  const flags: Flag[] = [];
  for (const doc of snapshot.docs) {
    const flag = auditQuestion(doc.id, doc.data());
    if (flag) flags.push(flag);
  }

  console.log(`Checked ${snapshot.size} questions.`);
  if (flags.length === 0) {
    console.log('No issues found.');
  } else {
    console.log(`Found ${flags.length} issue(s):\n`);
    for (const f of flags) {
      console.log(`  [flag] ${f.id}: ${f.reason}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Audit script failed:', err);
    process.exit(1);
  });
