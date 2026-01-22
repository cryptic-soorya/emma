"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Menu, Plus, MessageSquare, BookOpen, Settings, Edit3, Sparkles, Send, Trash2, 
  Paperclip, X, FileText, ChevronLeft, Flame, Timer, LogOut, UploadCloud
} from "lucide-react";
import { useRouter } from "next/navigation";

// Firebase
import { auth, db } from "../lib/firebase"; 
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc } from "firebase/firestore";

// Helpers
import { compressImage, readPdfBase64 } from "../lib/compress";

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
  const [activeFile, setActiveFile] = useState<{file: File, preview: string, type: 'image' | 'pdf'} | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragActive, setDragActive] = useState(false);

  // Features
  const [streak, setStreak] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. AUTH & LISTENERS
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) router.push("/");
      else {
        setUser(u);
        const statsRef = doc(db, "users", u.uid, "stats", "general");
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) setStreak(statsSnap.data().streak || 0);
        else { setDoc(statsRef, { streak: 1, lastLogin: serverTimestamp() }); setStreak(1); }
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
    return () => { unsubChats(); unsubNotes(); };
  }, [user]);

  useEffect(() => {
    if (!user || !activeSessionId) { setMessages([]); return; }
    const qMsgs = query(collection(db, "users", user.uid, "chats", activeSessionId, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [user, activeSessionId]);

  // TIMER
  useEffect(() => {
    let interval: any;
    if (timerActive && timeLeft > 0) interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    else if (timeLeft === 0) { setTimerActive(false); alert("Pomodoro Complete! 🌸"); setTimeLeft(25 * 60); }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // FILE SELECTION
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const isPdf = file.type === "application/pdf";
      setActiveFile({ 
        file, 
        preview: isPdf ? "" : URL.createObjectURL(file), // No preview URL for PDF to save memory
        type: isPdf ? 'pdf' : 'image' 
      });
    }
  };

  // --- SEND LOGIC (FIXED FOR PDF) ---
  const handleSend = async () => {
    if ((!input.trim() && !activeFile) || isLoading || !user) return;

    let chatId = activeSessionId;
    if (!chatId) {
      const docRef = await addDoc(collection(db, "users", user.uid, "chats"), { title: input.slice(0, 20) || "Study Session", createdAt: serverTimestamp() });
      chatId = docRef.id;
      setActiveSessionId(chatId);
    }

    setIsLoading(true);
    const text = input;
    const currentFile = activeFile;
    setInput(""); setActiveFile(null);

    try {
      let base64String = null;
      let dbImageString = null; // What we save to Firestore

      if (currentFile) {
        if (currentFile.type === 'image') {
          // 1. IMAGE: Compress -> Send to AI -> Save to DB (It's small enough)
          base64String = await compressImage(currentFile.file);
          dbImageString = `data:${currentFile.file.type};base64,${base64String}`;
        } else {
          // 2. PDF: Read Raw -> Send to AI -> DO NOT SAVE TO DB (Too big)
          base64String = await readPdfBase64(currentFile.file);
          // We don't save the base64 to Firestore to avoid 1MB limit crash
          dbImageString = null; 
        }
      }

      // SAVE USER MSG TO DB
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "user",
        text: text,
        // If it's a PDF, we save a marker text instead of the file data
        image: dbImageString,
        isPdf: currentFile?.type === 'pdf',
        pdfName: currentFile?.type === 'pdf' ? currentFile.file.name : null,
        createdAt: serverTimestamp()
      });

      // API CALL
      const historyForApi = messages.slice(-5).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text, 
          history: historyForApi, 
          fileData: base64String, // Send the heavy data to AI
          mimeType: currentFile?.file.type 
        }),
      });
      const data = await res.json();
      
      // SAVE AI MSG TO DB
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "model",
        text: data.response || data.error,
        createdAt: serverTimestamp()
      });

    } catch (e: any) {
      console.error(e);
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), { role: "model", text: `⚠️ Error: ${e.message}`, createdAt: serverTimestamp() });
    } finally {
      setIsLoading(false);
    }
  };

  // Drag & Drop
  const handleDrag = (e: any) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
  const handleDrop = (e: any) => { 
    e.preventDefault(); e.stopPropagation(); setDragActive(false); 
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      const isPdf = file.type === "application/pdf";
      setActiveFile({ file, preview: isPdf ? "" : URL.createObjectURL(file), type: isPdf ? 'pdf' : 'image' });
    }
  };

  // Note Actions
  const handleNewNote = async () => { const ref = await addDoc(collection(db, "users", user.uid, "notes"), { title: "Untitled", content: "", updatedAt: serverTimestamp() }); setActiveNoteId(ref.id); };
  const updateNote = async (id: string, data: any) => { await updateDoc(doc(db, "users", user.uid, "notes", id), { ...data, updatedAt: serverTimestamp() }); };
  const deleteSession = async (e:any, id: string) => { e.stopPropagation(); if(confirm("Delete?")) await deleteDoc(doc(db, "users", user.uid, "chats", id)); };

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-100 font-sans overflow-hidden" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })} onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}>
      <div className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300" style={{ background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(236, 72, 153, 0.08), transparent 40%)` }}/>
      <SakuraRain />

      {/* Drag Overlay */}
      <AnimatePresence>{dragActive && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-pink-500/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-pink-400 m-4 rounded-3xl pointer-events-none"><div className="text-2xl font-bold flex flex-col items-center gap-4"><UploadCloud size={64} className="animate-bounce" />Drop to Analyze</div></motion.div>}</AnimatePresence>

      {/* SIDEBAR */}
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

      {/* CHAT */}
      <main className="flex-1 flex flex-col relative z-10 bg-transparent min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/20 bg-pink-500/5"><span className="w-1.5 h-1.5 rounded-full animate-pulse bg-pink-500"></span><span className="text-xs font-medium text-pink-400">Online</span></div>
             <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20"><Flame size={14} className="fill-orange-400" /><span className="text-xs font-bold">{streak} Days</span></div>
             <button onClick={() => setTimerActive(!timerActive)} className={`flex items-center gap-2 px-3 py-1 rounded-full border ${timerActive ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>
                <Timer size={14} />
                <span className="text-xs font-mono">{formatTime(timeLeft)}</span>
             </button>
           </div>
           <button onClick={() => setNotesOpen(!isNotesOpen)} className={`p-2 rounded-lg transition-colors ${isNotesOpen ? 'text-pink-400 bg-pink-500/10' : 'text-zinc-500 hover:text-white'}`}><BookOpen size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
           {messages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center opacity-80">
               <Sparkles size={50} className="text-pink-400 mb-4" />
               <h2 className="text-xl font-bold text-white">Focus Mode Engaged.</h2>
             </div>
           ) : (
             messages.map((msg, i) => (
               <div key={i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${msg.role === "user" ? "bg-zinc-800" : "bg-gradient-to-br from-pink-600 to-purple-600"}`}>{msg.role === "user" ? "YOU" : <Sparkles size={16}/>}</div>
                  <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    
                    {/* DISPLAY LOGIC: Show image if exists, or show PDF badge if isPdf */}
                    {msg.image && <img src={msg.image} className="max-w-[300px] rounded-xl border border-white/10 shadow-lg mb-1" />}
                    {msg.isPdf && (
                      <div className="flex items-center gap-2 bg-pink-900/30 border border-pink-500/30 p-3 rounded-xl mb-1 text-pink-200 text-sm">
                        <FileText size={16} /> 
                        <span className="font-medium">PDF Analyzed: {msg.pdfName || "Document"}</span>
                      </div>
                    )}

                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-md prose prose-invert max-w-none ${msg.role === "user" ? "bg-zinc-800 border border-white/5" : "bg-white/5 border border-white/10 backdrop-blur-md"}`}>
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
               </div>
             ))
           )}
           {isLoading && <div className="pl-14 text-sm text-zinc-500 animate-pulse">Thinking...</div>}
           <div ref={messagesEndRef} />
        </div>

        <div className="p-6">
           {activeFile && (
             <div className="mb-2 flex items-center gap-2 bg-zinc-800/80 px-3 py-2 rounded-lg text-xs text-pink-200 w-fit backdrop-blur-md border border-white/10">
               <FileText size={14}/><span>{activeFile.file.name}</span><button onClick={() => setActiveFile(null)}><X size={12}/></button>
             </div>
           )}
           <div className="flex items-center bg-zinc-900/80 border border-white/10 rounded-2xl px-2 py-2 shadow-2xl backdrop-blur-xl">
             <button onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-pink-400"><Paperclip size={20}/></button>
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileSelect}/>
             <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask Mika..." className="flex-1 bg-transparent outline-none px-4 text-sm text-zinc-200"/>
             <button onClick={handleSend} disabled={isLoading} className="p-3 rounded-xl text-white bg-gradient-to-br from-pink-600 to-purple-600 shadow-lg"><Send size={18}/></button>
           </div>
        </div>
      </main>

      {/* NOTEBOOK */}
      <AnimatePresence>
        {isNotesOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 400, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex-shrink-0 border-l border-white/5 bg-zinc-950/90 backdrop-blur-2xl flex flex-col z-20 shadow-2xl">
             <div className="h-16 border-b border-white/5 flex items-center justify-between px-5 bg-zinc-900/50 min-w-[400px]">
               {activeNoteId ? <button onClick={() => setActiveNoteId(null)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ChevronLeft size={16}/> Back</button> : <span className="text-sm font-semibold flex items-center gap-2 text-zinc-200"><Edit3 size={14} className="text-pink-500"/> Notebook</span>}
               <div className="flex items-center gap-2">
                 {!activeNoteId && <button onClick={handleNewNote}><Plus size={18} className="text-zinc-400 hover:text-white"/></button>}
                 <button onClick={() => setNotesOpen(false)}><X size={18} className="text-zinc-500 hover:text-white"/></button>
               </div>
             </div>
             <div className="flex-1 overflow-y-auto p-0 min-w-[400px]">
               {activeNoteId && activeNote ? (
                 <div className="flex flex-col h-full">
                   <input value={activeNote.title} onChange={(e) => updateNote(activeNoteId, { title: e.target.value })} className="bg-transparent text-lg font-bold p-6 pb-2 outline-none text-zinc-100 placeholder-zinc-600 border-b border-white/5 mx-6" placeholder="Title..." />
                   <textarea value={activeNote.content} onChange={e => updateNote(activeNoteId, { content: e.target.value })} className="flex-1 bg-transparent p-6 text-zinc-300 text-sm resize-none focus:outline-none" placeholder="Type notes here..." />
                 </div>
               ) : (
                 <div className="p-3 space-y-1">
                   {notes.map(n => (
                     <div key={n.id} onClick={() => setActiveNoteId(n.id)} className="p-4 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/5 group">
                       <h4 className="text-sm font-medium text-zinc-200 mb-1 truncate">{n.title}</h4>
                       <span className="text-[10px] text-zinc-500">Note</span>
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