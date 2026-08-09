'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'react-render',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0a0f1e] text-white flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 px-4">
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-gray-400">The error has been logged to logs/errors.log.</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
