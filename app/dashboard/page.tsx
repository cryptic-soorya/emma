"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Menu, Plus, MessageSquare, BookOpen, Settings, 
  ChevronRight, MoreVertical, Edit3, Sparkles, Send
} from "lucide-react";
import "../globals.css"; // Force import the styles

export default function Dashboard() {
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-100 overflow-hidden font-sans selection:bg-pink-500/30">
      
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-pink-900/20 rounded-full blur-[120px]" />
      </div>

      {/* --- LEFT SIDEBAR (Glassmorphic) --- */}
      <motion.aside 
        initial={{ width: 280 }}
        animate={{ width: isLeftSidebarOpen ? 280 : 80 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="z-20 h-full border-r border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col shadow-2xl"
      >
        <div className="p-6 flex items-center justify-between">
           {isLeftSidebarOpen ? (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="flex items-center gap-2"
             >
               <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
                 <Sparkles size={16} className="text-white" />
               </div>
               <span className="font-bold text-lg tracking-tight text-white">Mika</span>
             </motion.div>
           ) : (
             <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center">
               <span className="font-bold text-white">M</span>
             </div>
           )}
           
           {isLeftSidebarOpen && (
             <button onClick={() => setIsLeftSidebarOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
               <Menu size={18} />
             </button>
           )}
        </div>
        
        {!isLeftSidebarOpen && (
           <button onClick={() => setIsLeftSidebarOpen(true)} className="mx-auto mt-4 text-zinc-500 hover:text-white">
             <Menu size={20} />
           </button>
        )}

        {/* New Chat Button */}
        <div className="px-4 mt-2">
          <button className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 ${isLeftSidebarOpen ? 'bg-white/5 hover:bg-white/10 border border-white/5' : 'bg-transparent'}`}>
            <Plus size={18} className="text-pink-400" />
            {isLeftSidebarOpen && <span className="text-sm font-medium text-zinc-300">New Session</span>}
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 mt-2 custom-scrollbar">
          {isLeftSidebarOpen && <p className="text-xs font-semibold text-zinc-500 mb-3 px-2">RECENT MEMORIES</p>}
          
          <div className="group flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/5">
            <MessageSquare size={18} className="text-zinc-600 group-hover:text-pink-400 transition-colors" />
            {isLeftSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">Biology: Plant Kingdom</p>
                <p className="text-[10px] text-zinc-600 truncate">2 hours ago</p>
              </div>
            )}
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 border border-white/10" />
            {isLeftSidebarOpen && (
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Dr. User</span>
                <span className="text-xs text-zinc-500">Systems Operational</span>
              </div>
            )}
            {isLeftSidebarOpen && <Settings size={16} className="ml-auto text-zinc-600 hover:text-white cursor-pointer" />}
          </div>
        </div>
      </motion.aside>


      {/* --- CENTER (Chat Interface) --- */}
      <main className="flex-1 flex flex-col relative min-w-0 z-10 bg-transparent">
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-xs font-medium text-emerald-400">Online</span>
             </div>
          </div>
          <button 
             onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
             className={`p-2 rounded-lg transition-all ${isRightSidebarOpen ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}
          >
             <BookOpen size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6 max-w-lg"
          >
            <div className="relative w-20 h-20 mx-auto">
               <div className="absolute inset-0 bg-pink-500/20 blur-xl rounded-full"></div>
               <div className="relative w-full h-full rounded-2xl bg-gradient-to-tr from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center shadow-2xl">
                 <span className="text-3xl">🌸</span>
               </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white tracking-tight">Focus Mode Engaged.</h2>
              <p className="text-zinc-500 text-sm leading-relaxed">I am ready to analyze NCERT diagrams, solve physics problems, or just listen. What is on your mind?</p>
            </div>
          </motion.div>
        </div>

        <div className="p-6">
          <div className="max-w-3xl mx-auto relative group">
             <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500/20 to-purple-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
             <div className="relative flex items-center bg-zinc-900/80 backdrop-blur-xl rounded-2xl border border-white/10 px-4 py-3 shadow-2xl">
               <input 
                 type="text" 
                 placeholder="Type a message..." 
                 className="flex-1 bg-transparent border-none outline-none text-zinc-200 placeholder-zinc-600 text-sm"
               />
               <div className="flex items-center gap-2 pl-4 border-l border-white/5">
                 <button className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 transition-colors">
                   <Plus size={18} />
                 </button>
                 <button className="p-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-all shadow-lg shadow-pink-600/20">
                   <Send size={16} />
                 </button>
               </div>
             </div>
          </div>
          <p className="text-center text-[10px] text-zinc-600 mt-4 uppercase tracking-widest opacity-50">Mika AI // Version 2.0</p>
        </div>
      </main>

      {/* --- RIGHT SIDEBAR (Notes) --- */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="z-20 h-full border-l border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]"
          >
             <div className="h-16 border-b border-white/5 flex items-center justify-between px-5">
                <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Edit3 size={14} className="text-pink-400" /> Study Notes
                </span>
                <MoreVertical size={16} className="text-zinc-600 cursor-pointer hover:text-white" />
             </div>
             <div className="flex-1 p-5">
                <div className="h-full w-full rounded-xl border border-dashed border-zinc-800 bg-black/20 p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center">
                    <Edit3 size={20} className="text-zinc-700" />
                  </div>
                  <p className="text-zinc-500 text-sm">Your canvas is empty.</p>
                  <button className="text-xs text-pink-400 hover:text-pink-300 font-medium">Create new note</button>
                </div>
             </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}