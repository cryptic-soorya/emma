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

// Must be a multiple of 256KB (Google requirement) and stay under Vercel's ~4.5MB body cap.
const CHUNK_SIZE = 4 * 256 * 1024; // 1 MB: small bodies survive flaky networks / TLS middleboxes

/**
 * Uploads a PDF to the Gemini Files API by relaying it in chunks through our own server
 * (/api/gemini-upload-chunk). The browser never contacts Google directly, which avoids CORS
 * and Vercel's request body limit.
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

  const perChunkTimeout = Math.min(uploadTimeoutMs, 60_000);
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const isFinal = end >= file.size;
    const qs = new URLSearchParams({ uploadUrl, offset: String(offset), final: isFinal ? '1' : '0' });

    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
      try {
        const data = await withTimeout(perChunkTimeout, `Uploading ${file.name}`, async signal => {
          const res = await fetch(`/api/gemini-upload-chunk?${qs}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file.slice(offset, end),
            signal,
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
          return json;
        });
        if (isFinal) return { name: data.name, uri: data.uri, mimeType: data.mimeType };
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr instanceof Error ? lastErr : new Error('Upload failed');
  }
  throw new Error(`Upload of ${file.name} failed. Check your connection and try again.`);
}
