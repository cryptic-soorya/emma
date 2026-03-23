import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    console.log("GROQ KEY exists:", !!process.env.GROQ_API_KEY);
    const formData = await req.formData();
    const audio = formData.get("audio") as Blob;

    if (!audio) return NextResponse.json({ error: "No audio" }, { status: 400 });

    const groqForm = new FormData();
    groqForm.append("file", audio, "recording.webm");
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("language", "en");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq error:", err);
      return NextResponse.json({ error: err }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ transcript: data.text });

  } catch (err: any) {
    console.error("Transcribe error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}