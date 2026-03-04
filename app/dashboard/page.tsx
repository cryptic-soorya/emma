"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  Menu, Plus, MessageSquare, BookOpen, Edit3, Sparkles, Send, Trash2,
  Paperclip, X, FileText, ChevronLeft, Flame, Timer, LogOut, UploadCloud,
  Edit2, BrainCircuit, Mic, Volume2, VolumeX, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";

// Firebase
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc,
} from "firebase/firestore";

// Helpers
import { compressImage, readPdfBase64 } from "../lib/compress";
import "../globals.css";

// --- Toast Component ---
const Toast = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    className="fixed bottom-6 right-6 z-[100] bg-zinc-800 border border-white/10 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
  >
    <span>{message}</span>
    <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={14} /></button>
  </motion.div>
);

// --- SAKURA ---
const SakuraRain = () => {
  const [petals, setPetals] = useState<any[]>([]);
  useEffect(() => {
    setPetals(
      Array.from({ length: 15 }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 5,
        duration: 15 + Math.random() * 10,
      }))
    );
  }, []);
  if (!petals.length) return null;
  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      {petals.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: "110vh", opacity: [0, 0.4, 0], rotate: 360, x: [0, 20, -20, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "linear" }}
          className="absolute text-pink-400/20 text-xl"
          style={{ left: p.left }}
        >
          🌸
        </motion.div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  // Data
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // UI
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarMode, setRightSidebarMode] = useState<"notebook" | "mistakes">("notebook");
  const [toast, setToast] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Context & Files
  const [activeFile, setActiveFile] = useState<{
    file: File;
    preview: string;
    type: "image" | "pdf";
    base64: string;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragActive, setDragActive] = useState(false);

  // Features
  const [streak, setStreak] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Renaming State
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // 1. AUTH & LISTENERS
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/");
      } else {
        setUser(u);
        const statsRef = doc(db, "users", u.uid, "stats", "general");
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) {
          setStreak(statsSnap.data().streak || 0);
        } else {
          await setDoc(statsRef, { streak: 1, lastLogin: serverTimestamp() });
          setStreak(1);
        }
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const qChats = query(
      collection(db, "users", user.uid, "chats"),
      orderBy("createdAt", "desc")
    );
    const unsubChats = onSnapshot(qChats, (snap) =>
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const qNotes = query(
      collection(db, "users", user.uid, "notes"),
      orderBy("updatedAt", "desc")
    );
    const unsubNotes = onSnapshot(qNotes, (snap) =>
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const qMistakes = query(
      collection(db, "users", user.uid, "mistakes"),
      orderBy("createdAt", "desc")
    );
    const unsubMistakes = onSnapshot(qMistakes, (snap) =>
      setMistakes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubChats();
      unsubNotes();
      unsubMistakes();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !activeSessionId) {
      setMessages([]);
      setActiveFile(null);
      return;
    }
    const qMsgs = query(
      collection(db, "users", user.uid, "chats", activeSessionId, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100
      );
    });
  }, [user, activeSessionId]);

  // TIMER
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
      setTimeLeft(25 * 60);
      showToast("🌸 Pomodoro Complete! Great work!");
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft, showToast]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

// --- VOICE INPUT ---
const startListening = () => {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast("⚠️ Browser does not support voice input.");
    return;
  }

  // Toggle off if already listening
  if (isListening && recognitionRef.current) {
    recognitionRef.current.stop();
    return;
  }

  const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
      showToast(`🎙 Mic error: ${e.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  };

  // --- TTS OUTPUT ---
  const speakText = useCallback(
    (text: string) => {
      if (!isSpeaking) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;

      const assignVoiceAndSpeak = (voices: SpeechSynthesisVoice[]) => {
        const preferred = voices.find(
          (v) => v.name.includes("Google US English") || v.localService
        );
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        assignVoiceAndSpeak(voices);
      } else {
        window.speechSynthesis.addEventListener(
          "voiceschanged",
          () => assignVoiceAndSpeak(window.speechSynthesis.getVoices()),
          { once: true }
        );
      }
    },
    [isSpeaking]
  );

  // --- FILE PROCESSING ---
  const processFile = useCallback(async (file: File) => {
    const isPdf = file.type === "application/pdf";
    let base64 = "";
    if (isPdf) {
      base64 = await readPdfBase64(file);
    } else {
      base64 = await compressImage(file);
    }
    setActiveFile({
      file,
      preview: isPdf ? "" : URL.createObjectURL(file),
      type: isPdf ? "pdf" : "image",
      base64,
    });
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleChatPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) processFile(file);
      }
    }
  };

  // --- SEND LOGIC ---
  const performSend = useCallback(
    async (textToSend: string, isSystemCommand = false) => {
      if ((!textToSend.trim() && !activeFile) || isLoading || !user) return;

      let chatId = activeSessionId;
      if (!chatId) {
        const docRef = await addDoc(
          collection(db, "users", user.uid, "chats"),
          {
            title: textToSend.slice(0, 30) || "Study Session",
            createdAt: serverTimestamp(),
          }
        );
        chatId = docRef.id;
        setActiveSessionId(chatId);
      }

      setIsLoading(true);
      if (!isSystemCommand) setInput("");

      const currentContext = activeFile;
      setActiveFile(null);

      try {
        let dbImageString: string | null = null;
        if (currentContext && currentContext.type === "image") {
          dbImageString = `${currentContext.file.type};base64,${currentContext.base64}`;
        }

        await addDoc(
          collection(db, "users", user.uid, "chats", chatId, "messages"),
          {
            role: "user",
            text: textToSend,
            image: dbImageString,
            isPdf: currentContext?.type === "pdf",
            pdfName:
              currentContext?.type === "pdf" ? currentContext.file.name : null,
            createdAt: serverTimestamp(),
          }
        );

        const historyForApi = messages
          .slice(-6)
          .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: textToSend,
            history: historyForApi,
            fileData: currentContext?.base64,
            mimeType: currentContext?.file.type,
          }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        await addDoc(
          collection(db, "users", user.uid, "chats", chatId, "messages"),
          {
            role: "model",
            text: data.response || data.error,
            createdAt: serverTimestamp(),
          }
        );

        if (isSpeaking && data.response) {
          speakText(data.response.replace(/[*#`]/g, ""));
        }
      } catch (e: any) {
        console.error(e);
        await addDoc(
          collection(db, "users", user.uid, "chats", chatId, "messages"),
          {
            role: "model",
            text: `⚠️ Error: ${e.message}`,
            createdAt: serverTimestamp(),
          }
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeFile, isLoading, user, activeSessionId, messages, isSpeaking, speakText]
  );

  const handleSendClick = () => performSend(input);

  const handleGenerateQuiz = () => {
    if (!activeSessionId) {
      showToast("💬 Start a chat first!");
      return;
    }
    performSend(
      "Review our conversation above (and any PDF attached). Generate 10 NEET-style Multiple Choice Questions to test my understanding. Do not give the answers immediately. Put answers inside a HTML <details> spoiler tag at the end.",
      true
    );
  };

  // --- MISTAKE LOG ---
  const saveToMistakes = async (msg: any) => {
    if (!user) return;
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const question =
      msgIndex > 0 ? messages[msgIndex - 1].text : "Context Question";
    await addDoc(collection(db, "users", user.uid, "mistakes"), {
      question,
      answer: msg.text,
      createdAt: serverTimestamp(),
    });
    showToast("⚠️ Saved to Mistake Log!");
  };

  const deleteMistake = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "mistakes", id));
    showToast("Removed from log.");
  };

  // --- RENAMING ---
  const startRenaming = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditChatTitle(currentTitle);
  };

  const saveRename = async (id: string) => {
    if (!user) return;
    if (editChatTitle.trim()) {
      await updateDoc(doc(db, "users", user.uid, "chats", id), {
        title: editChatTitle,
      });
    }
    setEditingChatId(null);
  };

  // --- DRAG & DROP ---
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
    },
    [processFile]
  );

  // --- NOTE ACTIONS ---
  const handleNewNote = async () => {
    if (!user) return;
    const ref = await addDoc(collection(db, "users", user.uid, "notes"), {
      title: "Untitled",
      content: "",
      updatedAt: serverTimestamp(),
    });
    setActiveNoteId(ref.id);
  };

  const updateNote = async (id: string, data: any) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "notes", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteSession = async () => {
    if (!deleteConfirmId || !user) return;
    await deleteDoc(
      doc(db, "users", user.uid, "chats", deleteConfirmId)
    );
    if (activeSessionId === deleteConfirmId) setActiveSessionId(null);
    setDeleteConfirmId(null);
  };

  const activeNote = notes.find((n) => n.id === activeNoteId);

  // ─────────────── RENDER ───────────────
  return (
    <div
      className="flex h-screen w-full bg-[#050505] text-zinc-100 font-sans overflow-hidden"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {/* Cursor glow */}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(236, 72, 153, 0.08), transparent 40%)`,
        }}
      />
      <SakuraRain />

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Drag Overlay */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-pink-500/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-pink-400 m-4 rounded-3xl pointer-events-none"
          >
            <div className="text-2xl font-bold flex flex-col items-center gap-4">
              <UploadCloud size={64} className="animate-bounce" />
              Drop to Analyze
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 w-72"
            >
              <p className="text-sm text-zinc-300">
                Delete this chat session?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteSession}
                  className="px-4 py-2 text-sm rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── LEFT SIDEBAR ─── */}
      <motion.aside
        animate={{ width: isSidebarOpen ? 280 : 70 }}
        className="h-full flex-shrink-0 border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col z-20 shadow-2xl"
      >
        <div className="p-5 flex items-center justify-between">
          {isSidebarOpen ? (
            <span className="font-bold text-lg text-pink-400">Mika 2.0</span>
          ) : (
            <span className="font-bold mx-auto text-pink-500">M</span>
          )}
          <button onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu size={20} className="text-zinc-500 hover:text-white" />
          </button>
        </div>

        <div className="px-3 mb-4">
          <button
            onClick={() => {
              setActiveSessionId(null);
              setActiveFile(null);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5"
          >
            <Plus size={18} className="text-pink-500" />
            {isSidebarOpen && (
              <span className="text-sm font-medium">New Session</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                activeSessionId === s.id
                  ? "bg-pink-500/10 border border-pink-500/20"
                  : "hover:bg-white/5 border border-transparent"
              }`}
            >
              <MessageSquare
                size={16}
                className={
                  activeSessionId === s.id ? "text-pink-400" : "text-zinc-600"
                }
              />
              {isSidebarOpen && (
                <>
                  {editingChatId === s.id ? (
                    <input
                      autoFocus
                      value={editChatTitle}
                      onChange={(e) => setEditChatTitle(e.target.value)}
                      onBlur={() => saveRename(s.id)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && saveRename(s.id)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-zinc-800 text-xs text-zinc-100 rounded px-2 py-1 outline-none border border-pink-500/40"
                    />
                  ) : (
                    <span
                      className={`text-sm truncate flex-1 ${
                        activeSessionId === s.id
                          ? "text-pink-100"
                          : "text-zinc-400"
                      }`}
                    >
                      {s.title}
                    </span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRenaming(e, s.id, s.title)}
                      className="hover:text-blue-400 text-zinc-600"
                    >
                      <Edit2 size={11} />
                    </button>
                    <button
                      onClick={(e) => deleteSession(e, s.id)}
                      className="hover:text-red-400 text-zinc-600"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5">
          {isSidebarOpen && (
            <button
              onClick={() => signOut(auth)}
              className="text-xs text-red-400 flex gap-2 items-center hover:text-red-300"
            >
              <LogOut size={14} /> Sign Out
            </button>
          )}
        </div>
      </motion.aside>

      {/* ─── MAIN CHAT ─── */}
      <main className="flex-1 flex flex-col relative z-10 bg-transparent min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Streak */}
            <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              <Flame size={14} className="fill-orange-400" />
              <span className="text-xs font-bold">{streak} Days</span>
            </div>

            {/* Pomodoro */}
            <button
              onClick={() => setTimerActive(!timerActive)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
                timerActive
                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                  : "border-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              <Timer size={14} />
              <span className="text-xs font-mono">{formatTime(timeLeft)}</span>
            </button>

            {/* Quiz */}
            <button
              onClick={handleGenerateQuiz}
              className="flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            >
              <BrainCircuit size={14} />
              <span className="text-xs font-bold">Quiz</span>
            </button>

            {/* TTS Toggle */}
            <button
              onClick={() => {
                setIsSpeaking((prev) => !prev);
                window.speechSynthesis.cancel();
              }}
              title={isSpeaking ? "Disable voice output" : "Enable voice output"}
              className={`p-2 rounded-full transition-colors ${
                isSpeaking
                  ? "text-pink-400 bg-pink-500/10"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {isSpeaking ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>

          {/* Right panel toggles */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRightSidebarMode("mistakes");
                setRightSidebarOpen(true);
              }}
              className={`p-2 rounded-lg transition-colors ${
                isRightSidebarOpen && rightSidebarMode === "mistakes"
                  ? "text-yellow-400 bg-yellow-500/10"
                  : "text-zinc-500 hover:text-white"
              }`}
              title="Mistake Log"
            >
              <AlertTriangle size={20} />
            </button>
            <button
              onClick={() => {
                setRightSidebarMode("notebook");
                setRightSidebarOpen(true);
              }}
              className={`p-2 rounded-lg transition-colors ${
                isRightSidebarOpen && rightSidebarMode === "notebook"
                  ? "text-pink-400 bg-pink-500/10"
                  : "text-zinc-500 hover:text-white"
              }`}
              title="Notebook"
            >
              <BookOpen size={20} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-80">
              <Sparkles size={50} className="text-pink-400 mb-4" />
              <h2 className="text-xl font-bold text-white">
                Focus Mode Engaged.
              </h2>
              <p className="text-zinc-500 text-sm mt-2">
                Ask anything or drop a file to begin.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-4 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg text-xs font-bold ${
                    msg.role === "user"
                      ? "bg-zinc-800 text-zinc-300"
                      : "bg-gradient-to-br from-pink-600 to-purple-600"
                  }`}
                >
                  {msg.role === "user" ? "YOU" : <Sparkles size={16} />}
                </div>
                <div
                  className={`flex flex-col gap-2 max-w-[80%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {msg.image && (
                    <img
                      src={msg.image}
                      className="max-w-[300px] rounded-xl border border-white/10 shadow-lg mb-1"
                      alt="uploaded"
                    />
                  )}
                  {msg.isPdf && (
                    <div className="flex items-center gap-2 bg-pink-900/30 border border-pink-500/30 p-3 rounded-xl mb-1 text-pink-200 text-sm">
                      <FileText size={16} />
                      <span className="font-medium">
                        PDF Analyzed: {msg.pdfName}
                      </span>
                    </div>
                  )}
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed shadow-md prose prose-invert max-w-none group relative ${
                      msg.role === "user"
                        ? "bg-zinc-800 border border-white/5"
                        : "bg-white/5 border border-white/10 backdrop-blur-md"
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        details: ({ node, ...props }: any) => (
                          <details
                            className="mt-2 p-2 bg-black/20 rounded-lg cursor-pointer hover:bg-black/30 open:bg-black/40"
                            {...props}
                          />
                        ),
                        summary: ({ node, ...props }: any) => (
                          <summary
                            className="font-semibold text-pink-400 select-none outline-none"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>

                    {msg.role === "model" && (
                      <button
                        onClick={() => saveToMistakes(msg)}
                        className="absolute -right-8 top-2 p-1.5 text-zinc-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Save to Mistake Log"
                      >
                        <AlertTriangle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="pl-14 text-sm text-zinc-500 animate-pulse flex items-center gap-2">
              <Sparkles size={14} className="text-pink-500" /> Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-6">
          {activeFile && (
            <div className="mb-2 flex items-center gap-2 bg-pink-900/40 border border-pink-500/40 px-3 py-2 rounded-lg text-xs text-pink-200 w-fit backdrop-blur-md shadow-lg">
              <FileText size={14} />
              <span>
                Using Context: <strong>{activeFile.file.name}</strong>
              </span>
              <button
                onClick={() => setActiveFile(null)}
                className="hover:text-white ml-2 bg-black/20 rounded-full p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex items-center bg-zinc-900/80 border border-white/10 rounded-2xl px-2 py-2 shadow-2xl backdrop-blur-xl">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-pink-400"
              title="Attach file or PDF"
            >
              <Paperclip size={20} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSendClick()
              }
              onPaste={handleChatPaste}
              placeholder={isListening ? "🎙 Listening..." : "Ask Mika..."}
              className="flex-1 bg-transparent outline-none px-4 text-sm text-zinc-200 placeholder-zinc-600"
            />
            {/* Mic */}
            <button
              onClick={startListening}
              title={isListening ? "Stop listening" : "Voice input"}
              className={`p-3 rounded-xl transition-colors ${
                isListening
                  ? "text-red-500 animate-pulse bg-red-500/10"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <Mic size={20} />
            </button>
            <button
              onClick={handleSendClick}
              disabled={isLoading}
              className="p-3 rounded-xl text-white bg-gradient-to-br from-pink-600 to-purple-600 shadow-lg disabled:opacity-50 hover:brightness-110 transition-all"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>

      {/* ─── RIGHT SIDEBAR ─── */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 border-l border-white/5 bg-zinc-950/90 backdrop-blur-2xl flex flex-col z-20 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="h-16 border-b border-white/5 flex items-center justify-between px-5 bg-zinc-900/50 min-w-[400px]">
              <span className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                {rightSidebarMode === "notebook" ? (
                  <>
                    <Edit3 size={14} className="text-pink-500" /> Notebook
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-yellow-500" />{" "}
                    Mistake Log
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                {rightSidebarMode === "notebook" && !activeNoteId && (
                  <button onClick={handleNewNote} title="New note">
                    <Plus size={18} className="text-zinc-400 hover:text-white" />
                  </button>
                )}
                <button onClick={() => setRightSidebarOpen(false)}>
                  <X size={18} className="text-zinc-500 hover:text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-w-[400px]">
              {rightSidebarMode === "notebook" ? (
                activeNoteId && activeNote ? (
                  <div className="flex flex-col h-full">
                    <input
                      value={activeNote.title}
                      onChange={(e) =>
                        updateNote(activeNoteId, { title: e.target.value })
                      }
                      className="bg-transparent text-lg font-bold p-6 pb-2 outline-none text-zinc-100 placeholder-zinc-600 border-b border-white/5 mx-6"
                      placeholder="Title..."
                    />
                    <textarea
                      value={activeNote.content}
                      onChange={(e) =>
                        updateNote(activeNoteId, { content: e.target.value })
                      }
                      className="flex-1 bg-transparent p-6 text-zinc-300 text-sm resize-none focus:outline-none"
                      placeholder="Type notes here..."
                    />
                    <div className="p-4 border-t border-white/5">
                      <button
                        onClick={() => setActiveNoteId(null)}
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
                      >
                        <ChevronLeft size={16} /> Back to List
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 space-y-1">
                    {notes.length === 0 && (
                      <div className="text-center text-zinc-500 mt-10 text-sm">
                        No notes yet. Hit <strong>+</strong> to create one.
                      </div>
                    )}
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => setActiveNoteId(n.id)}
                        className="p-4 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/5"
                      >
                        <h4 className="text-sm font-medium text-zinc-200 truncate">
                          {n.title}
                        </h4>
                        <p className="text-xs text-zinc-500 mt-1 truncate">
                          {n.content || "Empty note"}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="p-4 space-y-3">
                  {mistakes.length === 0 && (
                    <div className="text-center text-zinc-500 mt-10 text-sm">
                      No mistakes logged yet.
                      <br />
                      Hover an AI reply and click ⚠️ to save one.
                    </div>
                  )}
                  {mistakes.map((m) => (
                    <div
                      key={m.id}
                      className="p-4 rounded-xl bg-yellow-900/10 border border-yellow-500/20 group relative"
                    >
                      <div className="text-xs text-yellow-500 font-bold mb-1 truncate">
                        Q: {m.question}
                      </div>
                      <div className="text-sm text-zinc-300 line-clamp-4">
                        {m.answer}
                      </div>
                      <button
                        onClick={() => deleteMistake(m.id)}
                        className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
