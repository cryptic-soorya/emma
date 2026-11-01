import { NextRequest, NextResponse } from 'next/server';

// Relays one chunk of a resumable Gemini Files API upload. The browser can't talk to Google
// directly (no CORS headers), and Vercel caps request bodies at ~4.5MB, so the client slices
// the PDF into small chunks and sends each one here. The session URL comes from
// /api/gemini-upload (action: 'start'); we only accept Google upload URLs to avoid SSRF.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const uploadUrl = sp.get('uploadUrl') || '';
    const offset = Number(sp.get('offset'));
    const isFinal = sp.get('final') === '1';

    let u: URL;
    try {
      u = new URL(uploadUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid uploadUrl' }, { status: 400 });
    }
    if (u.protocol !== 'https:' || u.hostname !== 'generativelanguage.googleapis.com') {
      return NextResponse.json({ error: 'Invalid uploadUrl host' }, { status: 400 });
    }
    if (!Number.isFinite(offset) || offset < 0) {
      return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
    }

    const body = await req.arrayBuffer();
    const res = await fetch(u.toString(), {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Offset': String(offset),
        'X-Goog-Upload-Command': isFinal ? 'upload, finalize' : 'upload',
        'Content-Type': 'application/octet-stream',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: `Chunk upload failed (HTTP ${res.status}) ${text.slice(0, 200)}` }, { status: 502 });
    }
    if (!isFinal) return NextResponse.json({ ok: true });

    const data = (await res.json()) as { file?: { name: string; uri: string; mimeType: string } };
    if (!data.file) return NextResponse.json({ error: 'Upload finished but no file returned' }, { status: 502 });
    return NextResponse.json({ name: data.file.name, uri: data.file.uri, mimeType: data.file.mimeType });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
