"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { 
  Menu, Plus, MessageSquare, BookOpen, Edit3, Sparkles, Send, Trash2, 
  Paperclip, X, FileText, ChevronLeft, Flame, Timer, LogOut, UploadCloud, 
  BrainCircuit, Mic, Volume2, VolumeX, AlertTriangle, StopCircle
} from "lucide-react";
import { useRouter } from "next/navigation";

// Firebase
import { auth, db } from "../lib/firebase"; 
import { onAuthStateChanged, signOut } from "firebase/auth";
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc 
} from "firebase/firestore";

// Helpers
import { compressImage, readPdfBase64 } from "../lib/compress";
import { playNeuralTTS, stopAllSpeech } from "../lib/tts"; // IMPORT NEW VOICE ENGINE

import "../globals.css";

// --- SAKURA ---
const SakuraRain = () => {
  const [petals, setPetals] = useState<any[]>([]);
  useEffect(() => {
    setPetals(Array.from({ length: 15 }).map((_, i) => ({
      id: i, left: `${Math.random() * 100}%`, delay: Math.random() * 5, duration: 15 + Math.random() * 10
    })));
  }, []);
  if (!petals.length) return null;
  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      {petals.map(p => (
        <motion.div key={p.id} initial={{ y: -50, opacity: 0 }} animate={{ y: "110vh", opacity: [0, 0.4, 0], rotate: 360, x: [0, 20, -20, 0] }} transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "linear" }} className="absolute text-pink-400/20 text-xl" style={{ left: p.left }}>🌸</motion.div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  
  // Data & UI State
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]); 
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarMode, setRightSidebarMode] = useState<'notebook' | 'mistakes'>('notebook');
  const [activeFile, setActiveFile] = useState<{file: File, preview: string, type: 'image' | 'pdf', base64: string} | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragActive, setDragActive] = useState(false);
  
  // Features
  const [streak, setStreak] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timerPhase, setTimerPhase] = useState<'work' | 'short' | 'long'>('work');
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [toast, setToast] = useState<string | null>(null);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AUTH & LISTENERS
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/"); return; }
      setUser(u);

      const statsRef = doc(db, "users", u.uid, "stats", "general");
      const statsSnap = await getDoc(statsRef);
      const todayStr = new Date().toISOString().split('T')[0]; // "2026-04-25"

      if (!statsSnap.exists()) {
        await setDoc(statsRef, { streak: 1, lastLoginDate: todayStr });
        setStreak(1);
      } else {
        const data = statsSnap.data();
        const lastDate = data.lastLoginDate || '';
        const currentStreak = data.streak || 1;

        if (lastDate === todayStr) {
          // Already logged in today — no change
          setStreak(currentStreak);
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const newStreak = lastDate === yesterdayStr ? currentStreak + 1 : 1;
          setStreak(newStreak);
          await updateDoc(statsRef, { streak: newStreak, lastLoginDate: todayStr });
        }
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const qChats = query(collection(db, "users", user.uid, "chats"), orderBy("createdAt", "desc"));
    const unsubChats = onSnapshot(qChats, (snap) => setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qNotes = query(collection(db, "users", user.uid, "notes"), orderBy("updatedAt", "desc"));
    const unsubNotes = onSnapshot(qNotes, (snap) => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qMistakes = query(collection(db, "users", user.uid, "mistakes"), orderBy("createdAt", "desc"));
    const unsubMistakes = onSnapshot(qMistakes, (snap) => setMistakes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubChats(); unsubNotes(); unsubMistakes(); };
  }, [user]);

  useEffect(() => {
    if (!user || !activeSessionId) { setMessages([]); setActiveFile(null); return; }
    const qMsgs = query(collection(db, "users", user.uid, "chats", activeSessionId, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [user, activeSessionId]);

  // TIMER
  useEffect(() => {
    if (!timerActive || timeLeft > 0) {
      const interval = timerActive ? setInterval(() => setTimeLeft(t => t - 1), 1000) : null;
      return () => { if (interval) clearInterval(interval); };
    }
    // Phase complete
    setTimerActive(false);
    if (timerPhase === 'work') {
      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);
      if (newCount % 4 === 0) {
        setTimerPhase('long');
        setTimeLeft(15 * 60);
        setToast(`${newCount} sessions done! Long break time — 15 min 🌸`);
      } else {
        setTimerPhase('short');
        setTimeLeft(5 * 60);
        setToast(`Focus session done! Short break — 5 min ✨`);
      }
    } else {
      setTimerPhase('work');
      setTimeLeft(25 * 60);
      setToast("Break over! Back to work 📚");
    }
  }, [timerActive, timeLeft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const resetTimer = () => { setTimerActive(false); setTimerPhase('work'); setTimeLeft(25 * 60); setPomodoroCount(0); };
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const phaseLabel = timerPhase === 'work' ? 'Focus' : timerPhase === 'short' ? 'Break' : 'Long Break';

  // --- SMART VOICE INTERFACE ---
// --- SMART VOICE INTERFACE ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startListening = async () => {
    // If already listening, stop the recording
    if (isListening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];

      setIsListening(true);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        if (audioBlob.size < 1000) return; // Too small, probably empty

        const formData = new FormData();
        formData.append("audio", audioBlob);

        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.transcript?.trim()) {
            setInput(data.transcript);
            performSend(data.transcript);
          } else {
            console.error("No transcript:", data.error);
          }
        } catch (e) {
          console.error("Transcription failed:", e);
        }
      };

      // Auto-stop after 10 seconds
      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") mediaRecorder.stop();
      }, 10000);

    } catch (err: any) {
      console.error("Mic error:", err);
      if (err.name === "NotAllowedError") {
        alert("Microphone blocked! Click the mic icon in Brave's address bar and allow access for localhost.");
      }
      setIsListening(false);
    }
  };

  const stopSpeaking = () => stopAllSpeech();
    // Also hacky stop for HTML audio if we track it, but global cancel usually works
  

  // --- SEND LOGIC ---
  const performSend = async (textToSend: string, isSystemCommand = false) => {
    if ((!textToSend.trim() && !activeFile) || isLoading || !user) return;

    let chatId = activeSessionId;
    if (!chatId) {
      const docRef = await addDoc(collection(db, "users", user.uid, "chats"), { title: textToSend.slice(0, 20) || "Study Session", createdAt: serverTimestamp() });
      chatId = docRef.id;
      setActiveSessionId(chatId);
    }

    setIsLoading(true);
    if (!isSystemCommand) setInput(""); 

    const currentContext = activeFile;

    try {
      let dbImageString = null;
      if (currentContext && currentContext.type === 'image') {
        dbImageString = `data:${currentContext.file.type};base64,${currentContext.base64}`;
      }

      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "user",
        text: textToSend,
        image: dbImageString, 
        isPdf: currentContext?.type === 'pdf',
        pdfName: currentContext?.type === 'pdf' ? currentContext.file.name : null,
        createdAt: serverTimestamp()
      });

      // API CALL
      const historyForApi = messages.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: textToSend, 
          history: historyForApi, 
          fileData: currentContext?.base64, 
          mimeType: currentContext?.file.type 
        }),
      });
      const data = await res.json();
      
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "model",
        text: data.response || data.error,
        createdAt: serverTimestamp()
      });

      if (isSpeaking && data.response) {
        playNeuralTTS(data.response);
      }

    } catch (e: any) {
      console.error(e);
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), { role: "model", text: `⚠️ Error: ${e.message}`, createdAt: serverTimestamp() });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendClick = () => performSend(input);

  // MISTAKE LOG
const saveToMistakes = async (msg: any) => {
  const msgIndex = messages.findIndex(m => m.id === msg.id);
  let question = msgIndex > 0 ? messages[msgIndex - 1].text : "Context Question";
  
  if (question.includes("Generate 3 NEET-style")) {
    question = "NEET Quiz Revision";
  }

  try {
    await addDoc(collection(db, "users", user.uid, "mistakes"), {
      question,
      answer: msg.text,
      createdAt: serverTimestamp()
    });
    alert("Saved to mistake log!");
  } catch (error) {
    console.error("Error saving mistake:", error);
    alert("Failed to save mistake.");
  }
};
const handleGenerateQuiz = () => {
  if (!activeSessionId) return alert("Start a chat or upload a PDF first! 🌸");
  performSend("Generate 3 NEET-style Multiple Choice Questions based on our current topic or the attached document. Format them clearly. Hide the correct answers and explanations at the very bottom using the <details> tag.", true);
};
  const deleteMistake = async (id: string) => { if(confirm("Remove?")) await deleteDoc(doc(db, "users", user.uid, "mistakes", id)); };

  // FILE HANDLING
  const processFile = async (file: File) => {
    const isPdf = file.type === "application/pdf";
    let base64 = isPdf ? await readPdfBase64(file) : await compressImage(file);
    setActiveFile({ file, preview: isPdf ? "" : URL.createObjectURL(file), type: isPdf ? 'pdf' : 'image', base64 });
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) processFile(e.target.files[0]); };
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

  // NOTEBOOK
  const handleNewNote = async () => { const ref = await addDoc(collection(db, "users", user.uid, "notes"), { title: "Untitled", content: "", updatedAt: serverTimestamp() }); setActiveNoteId(ref.id); };
  const updateNote = async (id: string, data: any) => { await updateDoc(doc(db, "users", user.uid, "notes", id), { ...data, updatedAt: serverTimestamp() }); };
  const deleteSession = async (e:any, id: string) => { e.stopPropagation(); if(confirm("Delete?")) await deleteDoc(doc(db, "users", user.uid, "chats", id)); };
  
  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-100 font-sans overflow-hidden" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
      <div className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300" style={{ background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(236, 72, 153, 0.08), transparent 40%)` }}/>
      <SakuraRain />

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -20, x: '-50%' }} className="fixed top-5 left-1/2 z-50 px-5 py-3 rounded-2xl bg-zinc-900/95 border border-white/10 backdrop-blur-xl shadow-2xl text-sm text-white font-medium pointer-events-none">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT SIDEBAR */}
      <motion.aside animate={{ width: isSidebarOpen ? 280 : 70 }} className="h-full flex-shrink-0 border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col z-20 shadow-2xl">
        <div className="p-5 flex items-center justify-between">
           {isSidebarOpen ? <span className="font-bold text-lg text-pink-400">Mika 2.0</span> : <span className="font-bold mx-auto text-pink-500">M</span>}
           <button onClick={() => setSidebarOpen(!isSidebarOpen)}><Menu size={20} className="text-zinc-500 hover:text-white"/></button>
        </div>
        <div className="px-3 mb-4">
           <button onClick={() => { setActiveSessionId(null); setActiveFile(null); }} className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5"><Plus size={18} className="text-pink-500" />{isSidebarOpen && <span className="text-sm font-medium">New Session</span>}</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
           {sessions.map(s => (
             <div key={s.id} onClick={() => setActiveSessionId(s.id)} className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${activeSessionId === s.id ? 'bg-pink-500/10 border border-pink-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
               <MessageSquare size={16} className={activeSessionId === s.id ? "text-pink-400" : "text-zinc-600"} />
               {isSidebarOpen && <span className={`text-sm truncate flex-1 ${activeSessionId === s.id ? "text-pink-100" : "text-zinc-400"}`}>{s.title}</span>}
               {isSidebarOpen && <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={12}/></button>}
             </div>
           ))}
        </div>
        <div className="p-4 border-t border-white/5">{isSidebarOpen && <button onClick={() => signOut(auth)} className="text-xs text-red-400 flex gap-2 items-center"><LogOut size={14}/> Sign Out</button>}</div>
      </motion.aside>

      {/* CHAT AREA */}
      <main className="flex-1 flex flex-col relative z-10 bg-transparent min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20"><Flame size={14} className="fill-orange-400" /><span className="text-xs font-bold">{streak} Days</span></div>
             <div className="flex items-center gap-1">
               <button onClick={() => setTimerActive(!timerActive)} className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${timerActive ? (timerPhase === 'work' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' : 'border-blue-500/30 text-blue-400 bg-blue-500/5') : 'border-white/10 text-zinc-400 hover:text-white'}`}>
                 <Timer size={14} />
                 <span className="text-xs font-mono">{formatTime(timeLeft)}</span>
                 <span className="text-xs opacity-50">· {phaseLabel}</span>
                 {pomodoroCount > 0 && <span className="text-xs text-orange-400 font-bold ml-0.5">×{pomodoroCount}</span>}
               </button>
               {!timerActive && (timerPhase !== 'work' || timeLeft !== 25 * 60) && (
                 <button onClick={resetTimer} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Reset timer"><X size={12}/></button>
               )}
             </div>
             <button onClick={handleGenerateQuiz} title="Generate Quiz" className="flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors">
             <BrainCircuit size={14} />
             <span className="text-xs font-bold">Quiz Me</span>
            </button>
             {/* VOICE TOGGLE */}
             <button onClick={() => { setIsSpeaking(!isSpeaking); stopSpeaking(); }} className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${isSpeaking ? 'bg-pink-500/10 border-pink-500/30 text-pink-400' : 'border-white/10 text-zinc-500'}`}>
                {isSpeaking ? <Volume2 size={14}/> : <VolumeX size={14}/>}
                <span className="text-xs font-bold">{isSpeaking ? "Voice ON" : "Voice OFF"}</span>
             </button>
           </div>
           
           <div className="flex gap-2">
             <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'mistakes') setRightSidebarOpen(false); else { setRightSidebarMode('mistakes'); setRightSidebarOpen(true); } }} className={`p-2 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'mistakes' ? 'text-yellow-400 bg-yellow-500/10' : 'text-zinc-500 hover:text-white'}`} title="Mistake Log"><AlertTriangle size={20} /></button>
             <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'notebook') setRightSidebarOpen(false); else { setRightSidebarMode('notebook'); setRightSidebarOpen(true); } }} className={`p-2 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'notebook' ? 'text-pink-400 bg-pink-500/10' : 'text-zinc-500 hover:text-white'}`} title="Notebook"><BookOpen size={20} /></button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
           {messages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center opacity-80">
               <Sparkles size={50} className="text-pink-400 mb-4" />
               <h2 className="text-xl font-bold text-white">Ready to Study.</h2>
               <p className="text-zinc-500 text-sm mt-2">I am listening.</p>
             </div>
           ) : (
             messages.map((msg, i) => (
               <div key={i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${msg.role === "user" ? "bg-zinc-800" : "bg-gradient-to-br from-pink-600 to-purple-600"}`}>{msg.role === "user" ? "YOU" : <Sparkles size={16}/>}</div>
                  <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.image && <img src={msg.image} className="max-w-[300px] rounded-xl border border-white/10 shadow-lg mb-1" />}
                    {msg.isPdf && <div className="flex items-center gap-2 bg-pink-900/30 border border-pink-500/30 p-3 rounded-xl mb-1 text-pink-200 text-sm"><FileText size={16} /><span className="font-medium">PDF Analyzed: {msg.pdfName}</span></div>}
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-md group relative ${msg.role === "user" ? "bg-zinc-800 border border-white/5" : "bg-white/5 border border-white/10 backdrop-blur-md"}`}>
                       <div className="markdown-content">
                         <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{msg.text}</ReactMarkdown>
                       </div>
                       {msg.role === 'model' && (
                         <div className="mt-2 pt-2 border-t border-white/5 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => saveToMistakes(msg)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-yellow-400 transition-colors px-2 py-1 rounded-lg hover:bg-yellow-500/10">
                             <AlertTriangle size={11} /> Save to mistakes
                           </button>
                         </div>
                       )}
                    </div>
                  </div>
               </div>
             ))
           )}
           {isLoading && <div className="pl-14 text-sm text-zinc-500 animate-pulse">Thinking...</div>}
           <div ref={messagesEndRef} />
        </div>

        <div className="p-6">
           {activeFile && <div className="mb-2 flex items-center gap-2 bg-pink-900/40 border border-pink-500/40 px-3 py-2 rounded-lg text-xs text-pink-200 w-fit backdrop-blur-md shadow-lg"><FileText size={14}/><span>Context: <strong>{activeFile.file.name}</strong></span><button onClick={() => setActiveFile(null)} className="hover:text-white ml-2 bg-black/20 rounded-full p-0.5"><X size={12}/></button></div>}
           <div className={`flex items-center bg-zinc-900/80 border ${isListening ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-2 py-2 shadow-2xl backdrop-blur-xl transition-colors`}>
             <button onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-pink-400"><Paperclip size={20}/></button>
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileSelect}/>
             <input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleSendClick()} 
                onPaste={handleChatPaste}
                placeholder={isListening ? "I'm listening..." : "Ask Mika..."} 
                className="flex-1 bg-transparent outline-none px-4 text-sm text-zinc-200"
             />
             {/* MIC BUTTON */}
             <button onClick={startListening} className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-zinc-500 hover:text-white'}`}>
               {isListening ? <StopCircle size={20} /> : <Mic size={20} />}
             </button>
             <button onClick={handleSendClick} disabled={isLoading} className="p-3 rounded-xl text-white bg-gradient-to-br from-pink-600 to-purple-600 shadow-lg"><Send size={18}/></button>
           </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR (NOTEBOOK / MISTAKES) */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 400, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex-shrink-0 border-l border-white/5 bg-zinc-950/90 backdrop-blur-2xl flex flex-col z-20 shadow-2xl">
             <div className="h-16 border-b border-white/5 flex items-center justify-between px-5 bg-zinc-900/50 min-w-[400px]">
               <span className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                 {rightSidebarMode === 'notebook' ? <><Edit3 size={14} className="text-pink-500"/> Notebook</> : <><AlertTriangle size={14} className="text-yellow-500"/> Mistake Log</>}
               </span>
               <div className="flex items-center gap-2">
                 {rightSidebarMode === 'notebook' && !activeNoteId && <button onClick={handleNewNote}><Plus size={18} className="text-zinc-400 hover:text-white"/></button>}
                 <button onClick={() => setRightSidebarOpen(false)}><X size={18} className="text-zinc-500 hover:text-white"/></button>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-0 min-w-[400px]">
               {rightSidebarMode === 'notebook' ? (
                 // NOTEBOOK VIEW
                 activeNoteId && activeNote ? (
                   <div className="flex flex-col h-full">
                     <input value={activeNote.title} onChange={(e) => updateNote(activeNoteId, { title: e.target.value })} className="bg-transparent text-lg font-bold p-6 pb-2 outline-none text-zinc-100 placeholder-zinc-600 border-b border-white/5 mx-6" placeholder="Title..." />
                     <textarea value={activeNote.content} onChange={e => updateNote(activeNoteId, { content: e.target.value })} className="flex-1 bg-transparent p-6 text-zinc-300 text-sm resize-none focus:outline-none" placeholder="Type notes..." />
                     <div className="p-4 border-t border-white/5"><button onClick={() => setActiveNoteId(null)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ChevronLeft size={16}/> Back</button></div>
                   </div>
                 ) : (
                   <div className="p-3 space-y-1">
                     {notes.map(n => (
                       <div key={n.id} onClick={() => setActiveNoteId(n.id)} className="p-4 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/5 group">
                         <h4 className="text-sm font-medium text-zinc-200 mb-1 truncate">{n.title}</h4>
                       </div>
                     ))}
                   </div>
                 )
               ) : (
                 // MISTAKES VIEW
                 <div className="p-4 space-y-3">
                   {mistakes.length === 0 && <div className="text-center text-zinc-500 mt-10">No mistakes logged yet.</div>}
                   {mistakes.map(m => (
                     <div key={m.id} className="p-4 rounded-xl bg-yellow-900/10 border border-yellow-500/20 group relative">
                        <div className="text-xs text-yellow-500 font-bold mb-2 pr-6">
                          {m.question.length > 60 ? m.question.substring(0, 60) + '…' : m.question}
                        </div>
                        <div className="text-sm text-zinc-300 markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{m.answer}</ReactMarkdown>
                        </div>
                        <button onClick={() => deleteMistake(m.id)} className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
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