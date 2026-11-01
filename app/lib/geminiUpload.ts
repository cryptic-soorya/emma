export interface GeminiFileRef {
  name: string; // files/abc123
  uri: string;
  mimeType: string;
}

type Purpose = 'exam' | 'chat';

async function withTimeout<T>(ms: number, label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function api(body: object, signal: AbortSignal) {
  const res = await fetch('/api/gemini-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Uploads a PDF directly from the browser to the Gemini Files API (no Firebase Storage needed,
 * no Vercel body limit). Google omits a CORS header on the final upload response, so the browser
 * can't always READ the result even when the upload succeeded; we therefore ignore the response
 * and ask our server to look the file up by its unique display name instead.
 */
export async function uploadPdfToGemini(
  file: File,
  purpose: Purpose,
  { uploadTimeoutMs = 120_000 }: { uploadTimeoutMs?: number } = {}
): Promise<GeminiFileRef> {
  const displayName = `${purpose}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;

  const { uploadUrl } = await withTimeout(20_000, 'Starting upload', signal =>
    api({ action: 'start', purpose, displayName, size: file.size }, signal)
  );

  let uploadError: unknown = null;
  try {
    await withTimeout(uploadTimeoutMs, `Uploading ${file.name}`, signal =>
      fetch(uploadUrl, {
        method: 'POST',
        headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
        body: file,
        signal,
      })
    );
  } catch (e) {
    uploadError = e;
  }
  // A timeout is a real failure. Any other error may just be the unreadable-response CORS case.
  if (uploadError instanceof Error && /timed out/.test(uploadError.message)) throw uploadError;

  for (let attempt = 0; attempt < 8; attempt++) {
    const found = await withTimeout(15_000, 'Looking up upload', signal =>
      api({ action: 'resolve', purpose, displayName }, signal)
    );
    if (found.found) return { name: found.name, uri: found.uri, mimeType: found.mimeType };
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(
    `Upload of ${file.name} failed${uploadError instanceof Error ? ` (${uploadError.message})` : ''}. Check your connection and try again.`
  );
}
