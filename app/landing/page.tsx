"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import SpotlightBackground from "../components/SpotlightBackground"; // Adjust path if needed
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";

const quotes = [
  "The roots of education are bitter, but the fruit is sweet.",
  "We are what we repeatedly do. Excellence is not an act, but a habit.",
  "It does not matter how slowly you go as long as you do not stop.",
  "Discipline is choosing between what you want now and what you want most.",
];

export default function Landing() {
  const router = useRouter();
  const [quote, setQuote] = useState("");
  const [userName, setUserName] = useState("Doctor");

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    if (auth.currentUser?.displayName) {
      setUserName(auth.currentUser.displayName.split(" ")[0]); // Get first name
    }
  }, []);

  return (
    <SpotlightBackground>
      <div className="text-center px-4 max-w-4xl mx-auto z-10 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 text-sm mb-6">
            <Sparkles className="w-4 h-4 text-pink-500" />
            <span>System Online // Ready</span>
          </span>
          
          <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tight mb-4">
            Hello, <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">{userName}.</span>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 1 }} className="text-xl text-zinc-400 italic font-light mb-12 h-16">
          "{quote}"
        </motion.p>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.5, duration: 0.5 }}>
          <button onClick={() => router.push("/dashboard")} className="group relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none">
            <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
            <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-8 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-all group-hover:bg-zinc-900 gap-2">
              Enter Workspace <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </motion.div>
      </div>
    </SpotlightBackground>
  );
}