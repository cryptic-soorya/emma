// app/lib/tts.ts
let currentAudio: HTMLAudioElement | null = null;

export const stopAllSpeech = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();
};

const cleanForSpeech = (text: string): string =>
  text
    .replace(/[*#_`~]/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();

const browserFallback = (text: string): void => {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) =>
      v.name.includes("Zira") ||
      v.name.includes("Jenny") ||
      v.name.includes("Aria") ||
      (v.name.includes("Google") && v.lang === "en-US")
  );
  if (preferred) utterance.voice = preferred;
  utterance.rate = 1.05;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
};

export const playNeuralTTS = async (text: string): Promise<void> => {
  stopAllSpeech();
  const clean = cleanForSpeech(text).substring(0, 800);
  if (!clean) return;

  try {
    console.log("🎙️ Trying TTS route...");
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const blob = await res.blob();
    if (blob.size < 500) throw new Error("Audio too small");

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    console.log("✅ Neural TTS played");
  } catch (err) {
    console.warn("⚠️ Neural failed, using browser fallback:", err);
    browserFallback(clean);
  }
};