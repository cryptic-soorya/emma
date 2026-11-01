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

// Vercel rejects request bodies over ~4.5MB. Google only accepts non-final chunks in multiples
// of 8MB, so relaying through our server works only when the whole file fits in ONE request
// (a single "final" chunk has no size rule).
const RELAY_MAX_BYTES = 4_000_000;

async function startSession(file: File, purpose: Purpose, displayName: string): Promise<string> {
  const { uploadUrl } = await withTimeout(20_000, 'Starting upload', signal =>
    api({ action: 'start', purpose, displayName, size: file.size }, signal)
  );
  return uploadUrl;
}

/** Small files: browser -> our server -> Google, in one request. No CORS involved. */
async function uploadViaRelay(file: File, uploadUrl: string, timeoutMs: number): Promise<GeminiFileRef> {
  const qs = new URLSearchParams({ uploadUrl, offset: '0', final: '1' });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
    try {
      const data = await withTimeout(Math.min(timeoutMs, 60_000), `Uploading ${file.name}`, async signal => {
        const res = await fetch(`/api/gemini-upload-chunk?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
          signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
      });
      return { name: data.name, uri: data.uri, mimeType: data.mimeType };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Upload failed');
}

/**
 * Large files: browser -> Google directly. Google omits a CORS header on the response, so the
 * browser can't READ the result even when the upload succeeds; we ignore it and have our server
 * look the file up by its unique display name instead.
 */
async function uploadDirect(
  file: File,
  purpose: Purpose,
  displayName: string,
  uploadUrl: string,
  timeoutMs: number
): Promise<GeminiFileRef> {
  let uploadError: unknown = null;
  try {
    await withTimeout(timeoutMs, `Uploading ${file.name}`, signal =>
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
  if (uploadError instanceof Error && /timed out/.test(uploadError.message)) throw uploadError;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const found = await withTimeout(30_000, 'Looking up upload', signal =>
        api({ action: 'resolve', purpose, displayName }, signal)
      );
      if (found.found) return { name: found.name, uri: found.uri, mimeType: found.mimeType };
    } catch {
      // transient lookup failure: retry
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(
    `Upload of ${file.name} failed${uploadError instanceof Error ? ` (${uploadError.message})` : ''}. Try a PDF under 4MB, or check your connection.`
  );
}

export async function uploadPdfToGemini(
  file: File,
  purpose: Purpose,
  { uploadTimeoutMs = 120_000 }: { uploadTimeoutMs?: number } = {}
): Promise<GeminiFileRef> {
  const displayName = `${purpose}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
  const uploadUrl = await startSession(file, purpose, displayName);
  return file.size <= RELAY_MAX_BYTES
    ? uploadViaRelay(file, uploadUrl, uploadTimeoutMs)
    : uploadDirect(file, purpose, displayName, uploadUrl, uploadTimeoutMs);
}
