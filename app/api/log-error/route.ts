import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/app/lib/logger';

// Catch-all for client-side errors (window.onerror, unhandled rejections,
// React render errors from global-error.tsx) — funnels them into the same
// logs/errors.log file that server routes write to.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source, message, stack, ...meta } = body ?? {};
    await logError(source ?? 'client', { message: message ?? 'Unknown client error', stack }, meta);
  } catch (err) {
    console.error('log-error route failed:', err);
  }
  return NextResponse.json({ ok: true });
}
