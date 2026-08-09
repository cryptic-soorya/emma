'use client';

import { useEffect } from 'react';

function report(source: string, message: string, stack?: string, meta?: Record<string, unknown>) {
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, message, stack, ...meta }),
  }).catch(() => {});
}

// Mounted once in the root layout. Catches errors that React's own error
// boundaries (global-error.tsx) don't see: plain JS exceptions and
// unhandled promise rejections anywhere on the page.
export default function ErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report('client-window', event.message, event.error?.stack, {
        filename: event.filename,
        lineno: event.lineno,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
        'client-unhandledrejection',
        reason instanceof Error ? reason.message : String(reason),
        reason instanceof Error ? reason.stack : undefined
      );
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
