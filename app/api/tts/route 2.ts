// app/api/tts/route.ts
import { NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

    const clean = text.substring(0, 2000);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      "en-US-JennyNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    // ✅ Fix 1 & 2: destructure { audioStream } — it's NOT a direct stream
    const { audioStream } = tts.toStream(clean);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("close", resolve);   // ✅ Fix 3: "close" not "end"
      audioStream.on("error", reject);
    });

    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });

  } catch (err: any) {
    console.error("TTS Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
