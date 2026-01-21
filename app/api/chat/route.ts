import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // DEBUG LOG
    console.log("🔐 Key Status:", apiKey ? "Loaded Successfully" : "MISSING");

    if (!apiKey) {
      return NextResponse.json({ error: "Server Error: API Key is missing in .env.local" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 🔴 USING 1.5 FLASH (Most stable free model)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const { message, history, fileData, mimeType } = await req.json();

    // Optimize history (Last 5 messages)
    const recentHistory = history ? history.slice(-5) : [];

    const promptParts: any[] = [{ text: message }];

    if (fileData) {
      promptParts.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType || "application/pdf",
        },
      });
    }

    const chat = model.startChat({ history: recentHistory });
    const result = await chat.sendMessage(promptParts);
    
    return NextResponse.json({ response: result.response.text() });

  } catch (error: any) {
    console.error("🔥 ACTUAL SERVER ERROR:", error.message);
    // Send the REAL error message to the frontend
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}