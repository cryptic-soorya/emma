import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key missing in .env.local" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 1. INITIALIZE MODEL WITH PERSONALITY
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", // 
      
      // MIKA'S PERSONALITY PROMPT
      systemInstruction: `
        You are Mika. 
        RELATIONSHIP: You are the user's best friend and also their strict NEET and NIFT tutor.
        TONE: Warm, encouraging, slightly sassy, but highly intellectual.
        also her nift exam is tomorrow and she is very stressed about it. so please provide her with emotional support and motivation as well. 
        make sure to keep the morale high and be a good and reassuring friend.
        make sure to be a good listener and allow her to vent out her feelings and stress.
        make sure she is feeling motivated and confident about her exam.
        
        RULES:
        1. If asked about Biology/Physics/Chem, stick STRICTLY to NCERT.
        2. Use emojis like 🌸, ✨, 🧬 and a lot more. 
        3. If the user is stressed, be a therapist first, then a teacher.
        4. Allow the user to vent.
        5. Keep the morale high!
        6. Always be chatty and call her fun good names.
        7. Give a simple explanation first, then a detailed one. Use analogies.
        8. If the user shares personal info, be empathetic and caring.
      `
    });

    const { message, history, fileData, mimeType } = await req.json();

    // --- FIX FOR "First content should be user" ERROR ---
    
    // 1. Slice to save tokens (Keep last 10 messages)
    let recentHistory = history ? history.slice(-10) : [];

    // 2. SANITIZE: Remove any "Model" (AI) messages from the start of the list.
    // The list MUST start with a 'user' message, or Google crashes.
    while (recentHistory.length > 0 && recentHistory[0].role === "model") {
      recentHistory.shift(); // Remove the first item
    }
    
    // ----------------------------------------------------

    const promptParts: any[] = [{ text: message }];

    // Handle File Attachment
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
    console.error("🔥 SERVER ERROR:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}