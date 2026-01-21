"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import SpotlightBackground from "./components/SpotlightBackground";
import Link from "next/link";

// Non-cliche, stoic/academic quotes
const quotes = [
  "The roots of education are bitter, but the fruit is sweet.",
  "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
  "It does not matter how slowly you go as long as you do not stop.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "Discipline is choosing between what you want now and what you want most.",
];

export default function Home() {
  const [quote, setQuote] = useState("");

  useEffect(() => {
    // Pick a random quote on load
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setQuote(randomQuote);
  }, []);

  return (
    <SpotlightBackground>
      <div className="text-center px-4 max-w-4xl mx-auto">
        {/* Animated Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 text-sm mb-6">
            <Sparkles className="w-4 h-4 text-pink-500" />
            <span>Mika 2.0 // Neural Link Established</span>
          </span>
          
         <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tight">
             Hello, <span className="text-pink-500">Doctor.</span>
          </h1>
        </motion.div>

        {/* The Quote */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="text-xl text-zinc-400 italic font-light mb-12 h-16"
        >
          "{quote}"
        </motion.p>

        {/* The Start Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
        >
          <Link href="/dashboard">
            <button className="group relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50">
              <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
              <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-8 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-all group-hover:bg-zinc-900 gap-2">
                Enter Workspace <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </Link>
        </motion.div>
      </div>
    </SpotlightBackground>
  );
}