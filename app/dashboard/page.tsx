"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Menu, Plus, MessageSquare, BookOpen, Settings, 
  Edit3, Sparkles, Send, Trash2, Paperclip, X, 
  FileText, ChevronLeft, Flame, Timer, UploadCloud
} from "lucide-react";
import "../globals.css";

// --- TYPES ---
type Message = { role: "user" | "model"; text: string; image?: string };
type Session = { id: string; title: string; messages: Message[] };
type Note = { id: string; title: string; content: string; images: string[]; date: number };

// --- SAKURA COMPONENT ---
const SakuraRain = () => {
  const [petals, setPetals] = useState<any[]>([]);
  useEffect(() => {
    setPetals(Array.from({ length: 12 }).map((_, i) => ({
      id: i, left: `${Math.random() * 100}%`, 
      delay: Math.random() * 5, duration: 15 + Math.random() * 10
    })));
  }, []);
  if (petals.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      {petals.map((p) => (
        <motion.div key={p.id}
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: "110vh", opacity: [0, 0.5, 0], rotate: 360, x: [0, 20, -20, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "linear" }}
          className="absolute text-pink-400/20 text-xl"
          style={{ left: p.left }}
        >🌸</motion.div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  // --- STATE ---
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<{ name: string; data: string; type: string } | null>(null);
  
  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  
  // UI State
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isNotesOpen, setNotesOpen] = useState(false); 
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [streak, setStreak] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  
  // Timer State
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- LOAD/SAVE ---
  useEffect(() => {
    const savedChats = localStorage.getItem("mika-chats-v7");
    if (savedChats) setSessions(JSON.parse(savedChats));
    const savedNotes = localStorage.getItem("mika-notes-v7");
    if (savedNotes) setNotes(JSON.parse(savedNotes));
    const storedStreak = parseInt(localStorage.getItem("mika-streak") || "0");
    setStreak(storedStreak);
  }, []);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem("mika-chats-v7", JSON.stringify(sessions));
    localStorage.setItem("mika-notes-v7", JSON.stringify(notes));
  }, [sessions, notes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeSessionId, isLoading]);

  // --- TIMER ---
  useEffect(() => {
    let interval: any;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
      alert("Pomodoro Complete! Take a break. 🌸");
      setTimeLeft(25 * 60);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // --- DRAG AND DROP HANDLERS (FIXED) ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file: File, isForNote = false) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      const fullDataUrl = reader.result as string;

      if (isForNote && activeNoteId) {
        setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, images: [...(n.images || []), fullDataUrl] } : n));
      } else {
        setActiveFile({ name: file.name, data: base64String, type: file.type });
      }
    };
    reader.readAsDataURL(file);
  };

  // --- CHAT LOGIC ---
  const handleNewChat = () => {
    const newSession = { id: Date.now().toString(), title: "New Session", messages: [] };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setActiveFile(null);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm("Delete this chat?")) {
      const updated = sessions.filter(s => s.id !== id);
      setSessions(updated);
      if (activeSessionId === id) setActiveSessionId(null);
    }
  };

  const handlePasteInNote = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) processFile(blob, true);
      }
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !activeFile) || isLoading) return;
    
    let currentId = activeSessionId;
    if (!currentId) {
       const newSess = { id: Date.now().toString(), title: "New Session", messages: [] };
       setSessions(prev => [newSess, ...prev]);
       currentId = newSess.id;
       setActiveSessionId(currentId);
    }

    const userText = input;
    const displayImage = activeFile ? `data:${activeFile.type};base64,${activeFile.data}` : undefined;
    
    setInput(""); 
    setActiveFile(null);
    setIsLoading(true);

    setSessions(prev => prev.map(s => {
      if (s.id === currentId) {
        return { 
          ...s, 
          title: s.messages.length === 0 ? userText.slice(0, 20) || "File Analysis" : s.title,
          messages: [...s.messages, { role: "user", text: userText, image: displayImage }] 
        };
      }
      return s;
    }));

    try {
      const currentSession = sessions.find(s => s.id === currentId) || { messages: [] };
      const recentHistory = currentSession.messages.slice(-6).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText, 
          history: recentHistory, 
          fileData: displayImage ? displayImage.split(',')[1] : undefined,
          mimeType: displayImage ? displayImage.split(';')[0].split(':')[1] : undefined
        }),
      });

      const data = await res.json();
      if(data.error) throw new Error(data.error);
      
      setSessions(prev => prev.map(s => {
        if (s.id === currentId) {
          return { ...s, messages: [...s.messages, { role: "model", text: data.response }] };
        }
        return s;
      }));

    } catch (error: any) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentId) {
          return { ...s, messages: [...s.messages, { role: "model", text: `⚠️ Error: ${error.message}` }] };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const activeMessages = sessions.find(s => s.id === activeSessionId)?.messages || [];

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-100 font-sans overflow-hidden selection:bg-pink-500/30"
         onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
         onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
    >
      
      <div className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300"
           style={{ background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(236, 72, 153, 0.08), transparent 40%)` }}/>
      
      <SakuraRain />

      {/* DRAG DROP OVERLAY */}
      <AnimatePresence>
        {dragActive && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-pink-500 m-8 rounded-3xl pointer-events-none"
          >
             <div className="text-3xl font-bold text-pink-400 flex flex-col items-center gap-4">
               <UploadCloud size={64} className="animate-bounce" />
               Drop to Analyze
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT SIDEBAR */}
      <motion.aside 
        animate={{ width: isSidebarOpen ? 280 : 70 }} 
        className="h-full flex-shrink-0 border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col z-20 shadow-2xl transition-all duration-300"
      >
        <div className="p-5 flex items-center justify-between">
           {isSidebarOpen ? <span className="font-bold text-lg text-pink-400">Mika 2.0</span> : <span className="font-bold mx-auto text-pink-500">M</span>}
           <button onClick={() => setSidebarOpen(!isSidebarOpen)}><Menu size={20} className="text-zinc-500 hover:text-white"/></button>
        </div>
        <div className="px-3 mb-4">
           <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all">
             <Plus size={18} className="text-pink-500" />
             {isSidebarOpen && <span className="text-sm font-medium">New Session</span>}
           </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
           {sessions.map(s => (
             <div key={s.id} onClick={() => setActiveSessionId(s.id)} className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${activeSessionId === s.id ? 'bg-pink-500/10 border border-pink-500/20' : 'hover:bg-white/5 border border-transparent'}`}>
               <MessageSquare size={16} className={activeSessionId === s.id ? "text-pink-400" : "text-zinc-600"} />
               {isSidebarOpen && (
                 <>
                   <span className={`text-sm truncate flex-1 ${activeSessionId === s.id ? "text-pink-100" : "text-zinc-400"}`}>{s.title}</span>
                   <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={12}/></button>
                 </>
               )}
             </div>
           ))}
        </div>
      </motion.aside>

      {/* MAIN CHAT */}
      <main className="flex-1 flex flex-col relative z-10 bg-transparent min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
           <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/20 bg-pink-500/5">
               <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-pink-500"></span>
               <span className="text-xs font-medium text-pink-400">Online</span>
             </div>
             <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
               <Flame size={14} className="fill-orange-400" />
               <span className="text-xs font-bold">{streak} Days</span>
             </div>
             <button onClick={() => setTimerActive(!timerActive)} className={`flex items-center gap-2 px-3 py-1 rounded-full border ${timerActive ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>
                <Timer size={14} />
                <span className="text-xs font-mono">{formatTime(timeLeft)}</span>
             </button>
           </div>
           <button onClick={() => setNotesOpen(!isNotesOpen)} className={`p-2 rounded-lg transition-colors ${isNotesOpen ? 'text-pink-400 bg-pink-500/10' : 'text-zinc-500 hover:text-white'}`}>
             <BookOpen size={20} />
           </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
           {activeMessages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center opacity-80">
               <Sparkles size={50} className="text-pink-400 mb-4" />
               <h2 className="text-xl font-bold text-white">Ready to Study.</h2>
               <p className="text-zinc-500 text-sm mt-2">Upload NCERT PDFs or ask about Physics.</p>
             </div>
           ) : (
             activeMessages.map((msg, i) => (
               <div key={i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${msg.role === "user" ? "bg-zinc-800 border border-zinc-700" : "bg-gradient-to-br from-pink-600 to-purple-600"}`}>
                    {msg.role === "user" ? <span className="text-xs text-zinc-400">YOU</span> : <Sparkles size={16} className="text-white"/>}
                  </div>
                  <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.image && <img src={msg.image} alt="Uploaded" className="max-w-[300px] rounded-xl border border-white/10 shadow-lg mb-1" />}
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-md prose prose-invert max-w-none ${msg.role === "user" ? "bg-zinc-800 text-zinc-100 border border-white/5" : "bg-white/5 border border-white/10 text-zinc-200 backdrop-blur-md"}`}>
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
               <FileText size={14}/><span>{activeFile.name}</span><button onClick={() => setActiveFile(null)}><X size={12}/></button>
             </div>
           )}
           <div className="flex items-center bg-zinc-900/80 border border-white/10 rounded-2xl px-2 py-2 shadow-2xl backdrop-blur-xl">
             <button onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-pink-400"><Paperclip size={20}/></button>
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={(e) => e.target.files && processFile(e.target.files[0])}/>
             <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask Mika..." className="flex-1 bg-transparent outline-none px-4 text-sm text-zinc-200"/>
             <button onClick={handleSend} disabled={isLoading} className="p-3 rounded-xl text-white bg-gradient-to-br from-pink-600 to-purple-600 shadow-lg hover:shadow-pink-500/20 transition-all active:scale-95 disabled:opacity-50"><Send size={18}/></button>
           </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR (Notebook) */}
      <AnimatePresence>
        {isNotesOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }} 
            animate={{ width: 400, opacity: 1 }} 
            exit={{ width: 0, opacity: 0 }} 
            className="flex-shrink-0 border-l border-white/5 bg-zinc-950/90 backdrop-blur-2xl flex flex-col z-20 shadow-2xl overflow-hidden"
          >
             <div className="h-16 border-b border-white/5 flex items-center justify-between px-5 bg-zinc-900/50 min-w-[400px]">
               {activeNoteId ? (
                 <button onClick={() => setActiveNoteId(null)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ChevronLeft size={16}/> Back</button>
               ) : (
                 <span className="text-sm font-semibold flex items-center gap-2 text-zinc-200"><Edit3 size={14} className="text-pink-500"/> Notebook</span>
               )}
               <div className="flex items-center gap-2">
                 {!activeNoteId && <button onClick={() => { const n = { id: Date.now().toString(), title: "Untitled", content: "", images: [], date: Date.now() }; setNotes([n, ...notes]); setActiveNoteId(n.id); }}><Plus size={18} className="text-zinc-400 hover:text-white"/></button>}
                 <button onClick={() => setNotesOpen(false)}><X size={18} className="text-zinc-500 hover:text-white"/></button>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-0 min-w-[400px]">
               {activeNoteId ? (
                 <div className="flex flex-col h-full">
                   <input 
                      value={notes.find(n => n.id === activeNoteId)?.title || ""}
                      onChange={(e) => setNotes(notes.map(n => n.id === activeNoteId ? { ...n, title: e.target.value } : n))}
                      className="bg-transparent text-lg font-bold p-6 pb-2 outline-none text-zinc-100 placeholder-zinc-600 border-b border-white/5 mx-6"
                      placeholder="Note Title..."
                   />
                   <div className="flex-1 relative">
                     <textarea 
                       value={notes.find(n => n.id === activeNoteId)?.content || ""} 
                       onChange={e => setNotes(notes.map(n => n.id === activeNoteId ? { ...n, content: e.target.value } : n))} 
                       onPaste={handlePasteInNote}
                       className="w-full h-full bg-transparent p-6 text-zinc-300 text-sm resize-none focus:outline-none leading-relaxed" 
                       placeholder="Type notes here... (Paste images to attach them)" 
                       autoFocus 
                     />
                   </div>
                   {/* Note Images Gallery */}
                   <div className="p-4 border-t border-white/5 bg-zinc-900/30">
                     <div className="text-xs text-zinc-500 mb-2 flex justify-between">
                       <span>Attachments</span>
                       <span className="text-[10px]">(Paste image to add)</span>
                     </div>
                     <div className="flex gap-2 overflow-x-auto pb-2">
                       {notes.find(n => n.id === activeNoteId)?.images?.map((img, i) => (
                         <div key={i} className="relative group flex-shrink-0">
                           <img src={img} className="h-20 w-20 object-cover rounded-lg border border-white/10" />
                           <button 
                             onClick={() => setNotes(prev => prev.map(n => n.id === activeNoteId ? {...n, images: n.images.filter((_, idx) => idx !== i)} : n))}
                             className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                             <Trash2 size={10}/>
                           </button>
                         </div>
                       ))}
                     </div>
                   </div>
                 </div>
               ) : (
                 <div className="p-3 space-y-1">
                   {notes.map(n => (
                     <div key={n.id} onClick={() => setActiveNoteId(n.id)} className="p-4 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/5 group">
                       <h4 className="text-sm font-medium text-zinc-200 mb-1 truncate">{n.title}</h4>
                       <div className="flex justify-between items-center mt-2">
                         <span className="text-[10px] text-zinc-500">{new Date(n.date).toLocaleDateString()} • {n.images?.length || 0} imgs</span>
                         <button onClick={(e) => { e.stopPropagation(); if(confirm("Delete note?")) setNotes(notes.filter(x => x.id !== n.id)); }} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"><Trash2 size={12}/></button>
                       </div>
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