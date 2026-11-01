import { NextRequest, NextResponse } from 'next/server';

// Mints a resumable-upload session on the Gemini Files API so the BROWSER can send the PDF
// straight to Google (bypassing the ~4.5MB Vercel request body cap), then lets the client
// look the finished file up by display name. The API key never leaves the server:
// Google embeds `key=` in the upload URL, so we strip it before returning.

const API = 'https://generativelanguage.googleapis.com';

// Files are owned by the key that uploaded them, so each purpose must match the key
// the consuming route (parse-exam / chat) uses to read them.
function keyFor(purpose: string): string | undefined {
  return purpose === 'chat'
    ? process.env.GEMINI_API_KEY_MIKA || process.env.GEMINI_API_KEY
    : process.env.GEMINI_API_KEY;
}

export async function POST(req: NextRequest) {
  try {
    const { action, purpose = 'exam', displayName, size, mimeType = 'application/pdf' } = await req.json();
    const apiKey = keyFor(purpose);
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    if (typeof displayName !== 'string' || !/^[\w.-]{1,120}$/.test(displayName)) {
      return NextResponse.json({ error: 'Invalid displayName' }, { status: 400 });
    }

    if (action === 'start') {
      if (typeof size !== 'number' || size <= 0 || size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'File must be between 1 byte and 50MB' }, { status: 400 });
      }
      const res = await fetch(`${API}/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(size),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      });
      const uploadUrl = res.headers.get('x-goog-upload-url');
      if (!res.ok || !uploadUrl) {
        return NextResponse.json({ error: `Could not start upload (HTTP ${res.status})` }, { status: 502 });
      }
      const u = new URL(uploadUrl);
      u.searchParams.delete('key');
      return NextResponse.json({ uploadUrl: u.toString() });
    }

    if (action === 'resolve') {
      const res = await fetch(`${API}/v1beta/files?pageSize=100&key=${apiKey}`);
      if (!res.ok) return NextResponse.json({ error: `File lookup failed (HTTP ${res.status})` }, { status: 502 });
      const data = (await res.json()) as { files?: { name: string; uri: string; mimeType: string; displayName?: string; state?: string }[] };
      const file = (data.files || []).find(f => f.displayName === displayName);
      if (!file) return NextResponse.json({ found: false });
      return NextResponse.json({ found: true, name: file.name, uri: file.uri, mimeType: file.mimeType, state: file.state });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
