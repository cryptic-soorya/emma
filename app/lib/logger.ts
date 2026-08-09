import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

interface ErrorLike {
  message: string;
  stack?: string;
}

function normalize(error: unknown): ErrorLike {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { message?: unknown; stack?: unknown };
    return {
      message: String(e.message),
      stack: typeof e.stack === 'string' ? e.stack : undefined,
    };
  }
  return { message: JSON.stringify(error) };
}

// Server-only. Writes one JSON line per error to logs/errors.log for local
// dev/demo reference (`tail -f logs/errors.log`). Never import from a
// 'use client' file — route client errors through /api/log-error instead.
export async function logError(source: string, error: unknown, meta?: Record<string, unknown>) {
  const { message, stack } = normalize(error);
  const entry = { time: new Date().toISOString(), source, message, stack, meta };

  console.error(`[${source}]`, message, meta ?? '');

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (writeErr) {
    console.error('Failed to write to error log file:', writeErr);
  }
}
