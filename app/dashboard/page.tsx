"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  Menu, Plus, MessageSquare, BookOpen, Edit3, Sparkles, Send, Trash2,
  Paperclip, X, FileText, ChevronLeft, Flame, Timer, LogOut, UploadCloud,
  Edit2, BrainCircuit,
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
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // UI
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotesOpen, setNotesOpen] = useState(false);
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

  // Renaming State
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          // FIX: await setDoc so errors surface
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
    return () => {
      unsubChats();
      unsubNotes();
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

  // TIMER — FIX: typed interval correctly, replaced alert with toast
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

  // FILE PROCESSING
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
      // FIX: Clear file after capturing it so UI resets
      setActiveFile(null);

      try {
        let dbImageString: string | null = null;
        if (currentContext && currentContext.type === "image") {
          dbImageString = `${currentContext.file.type};base64,${currentContext.base64}`;
        }

        // SAVE USER MSG
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

        // API CALL
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

        // SAVE AI MSG
        await addDoc(
          collection(db, "users", user.uid, "chats", chatId, "messages"),
          {
            role: "model",
            text: data.response || data.error,
            createdAt: serverTimestamp(),
          }
        );
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
    [activeFile, isLoading, user, activeSessionId, messages]
  );

  const handleSendClick = () => performSend(input);

  // FIX: replaced alert() with toast
  const handleGenerateQuiz = () => {
    if (!activeSessionId) {
      showToast("💬 Start a chat first!");
      return;
    }
    const prompt =
      "Review our conversation above (and any PDF attached). Generate 10 NEET-style Multiple Choice Questions to test my understanding. Do not give the answers immediately. Put answers inside a Spoiler tag at the end.";
    performSend(prompt, true);
  };

  // --- RENAMING LOGIC ---
  const startRenaming = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditChatTitle(currentTitle);
  };

  // FIX: null-check user before using user.uid
  const saveRename = async (id: string) => {
    if (!user) return;
    if (editChatTitle.trim()) {
      await updateDoc(doc(db, "users", user.uid, "chats", id), {
        title: editChatTitle,
      });
    }
    setEditingChatId(null);
  };

  // Drag & Drop
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

  // Note Actions
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

  // FIX: replaced confirm() with inline delete confirm state
  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteSession = async () => {
    if (!deleteConfirmId || !user) return;
    await deleteDoc(doc(db, "users", user.uid, "chats", deleteConfirmId));
    if (activeSessionId === deleteConfirmId) setActiveSessionId(null);
    setDeleteConfirmId(null);
  };

  const activeNote = notes.find((n) => n.id === activeNoteId);

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
              <p className="text-sm text-zinc-300">Delete this chat session?</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteSession}
                  className="flex-1 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 bg-white/5 text-zinc-300 border border-white/10 rounded-xl text-sm hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
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

      {/* SIDEBAR */}
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
                      className="flex-1 bg-zinc-900 text-xs px-2 py-1 rounded border border-pink-500/50 outline-none"
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
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRenaming(e, s.id, s.title)}
                      className="hover:text-white text-zinc-500"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => deleteSession(e, s.id)}
                      className="hover:text-red-400 text-zinc-500"
                    >
                      <Trash2 size={12} />
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
              className="text-xs text-red-400 flex gap-2 items-center"
            >
              <LogOut size={14} /> Sign Out
            </button>
          )}
        </div>
      </motion.aside>

      {/* CHAT */}
      <main className="flex-1 flex flex-col relative z-10 bg-transparent min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/20 bg-pink-500/5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-pink-500" />
              <span className="text-xs font-medium text-pink-400">Online</span>
            </div>
            <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              <Flame size={14} className="fill-orange-400" />
              <span className="text-xs font-bold">{streak} Days</span>
            </div>
            <button
              onClick={() => setTimerActive(!timerActive)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                timerActive
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-white/10 text-zinc-400"
              }`}
            >
              <Timer size={14} />
              <span className="text-xs font-medium">{formatTime(timeLeft)}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateQuiz}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-purple-500/20 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10 text-xs font-medium"
            >
              <BrainCircuit size={14} /> Quiz Me
            </button>
            <button
              onClick={() => setNotesOpen(!isNotesOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 text-xs"
            >
              <BookOpen size={14} /> Notes
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center opacity-50">
              <Sparkles size={40} className="text-pink-400" />
              <p className="text-zinc-400 text-sm">
                Ask Mika anything — paste an image, upload a PDF, or just type!
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-pink-500/15 border border-pink-500/20 text-pink-50"
                    : "bg-zinc-800/60 border border-white/5 text-zinc-200"
                }`}
              >
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="attachment"
                    className="mb-2 rounded-lg max-h-48 object-contain"
                  />
                )}
                {msg.isPdf && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400 bg-white/5 px-2 py-1 rounded-lg">
                    <FileText size={12} />
                    {msg.pdfName}
                  </div>
                )}
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    details: ({ node, ...props }) => (
                      <details
                        className="mt-2 p-2 bg-black/20 rounded-lg border border-white/5 cursor-pointer hover:bg-black/30 open:bg-black/40"
                        {...props}
                      />
                    ),
                    summary: ({ node, ...props }) => (
                      <summary
                        className="font-semibold text-pink-400 select-none outline-none"
                        {...props}
                      />
                    ),
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800/60 border border-white/5 rounded-2xl px-4 py-3 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-white/5">
          {/* File Preview */}
          {activeFile && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10 text-xs text-zinc-400">
              {activeFile.type === "image" ? (
                <img
                  src={activeFile.preview}
                  alt="preview"
                  className="h-8 w-8 object-cover rounded"
                />
              ) : (
                <FileText size={16} className="text-pink-400" />
              )}
              <span className="flex-1 truncate">{activeFile.file.name}</span>
              <button
                onClick={() => setActiveFile(null)}
                className="hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 bg-zinc-900/60 border border-white/10 rounded-2xl px-4 py-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-zinc-500 hover:text-pink-400 transition-colors pb-0.5"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handleChatPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendClick();
                }
              }}
              placeholder={
                activeFile ? "Ask about the file..." : "Ask Mika..."
              }
              rows={1}
              className="flex-1 bg-transparent outline-none resize-none text-sm text-zinc-100 placeholder-zinc-600 max-h-32"
            />
            <button
              onClick={handleSendClick}
              disabled={isLoading || (!input.trim() && !activeFile)}
              className="pb-0.5 text-pink-400 disabled:text-zinc-700 hover:text-pink-300 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>

      {/* NOTES PANEL */}
      <AnimatePresence>
        {isNotesOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full flex-shrink-0 border-l border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col z-20 overflow-hidden"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="font-semibold text-sm text-zinc-200">Notes</span>
              <div className="flex gap-2">
                <button
                  onClick={handleNewNote}
                  className="text-zinc-400 hover:text-pink-400"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => setNotesOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
              {/* Note list */}
              <div className="w-1/3 border-r border-white/5 overflow-y-auto custom-scrollbar">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setActiveNoteId(n.id)}
                    className={`p-3 cursor-pointer text-xs truncate border-b border-white/5 ${
                      activeNoteId === n.id
                        ? "bg-pink-500/10 text-pink-300"
                        : "text-zinc-500 hover:bg-white/5"
                    }`}
                  >
                    {n.title || "Untitled"}
                  </div>
                ))}
              </div>
              {/* Note editor */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {activeNote ? (
                  <div className="flex flex-col h-full">
                    <input
                      value={activeNote.title || ""}
                      onChange={(e) =>
                        updateNote(activeNote.id, { title: e.target.value, content: activeNote.content })
                      }
                      className="px-3 py-2 bg-transparent border-b border-white/5 text-sm font-medium outline-none placeholder-zinc-600"
                      placeholder="Title..."
                    />
                    <textarea
                      value={activeNote.content || ""}
                      onChange={(e) =>
                        updateNote(activeNote.id, { title: activeNote.title, content: e.target.value })
                      }
                      className="flex-1 p-3 bg-transparent text-xs text-zinc-300 resize-none outline-none"
                      placeholder="Type notes here..."
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-zinc-600">
                    Select or create a note
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
