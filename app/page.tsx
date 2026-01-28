"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase";
import { useRouter } from "next/navigation";
import SpotlightBackground from "./components/SpotlightBackground"; // Ensure you still have this component file!

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, skip to landing
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) router.push("/landing");
    });
    return () => unsub();
  }, [router]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/landing");
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <SpotlightBackground>
      <div className="flex flex-col items-center justify-center h-screen z-10 relative">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-pink-500/20 mb-8">
            <Sparkles size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Mika 2.0</h1>
          <p className="text-zinc-400 mb-8">Personal Study Companion</p>
          
          <button 
            onClick={handleLogin} disabled={loading}
            className="group relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none"
          >
            <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
            <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-8 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-all group-hover:bg-zinc-900 gap-2">
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G"/>
              {loading ? "Connecting..." : "Continue with Google"}
            </span>
          </button>
        </motion.div>
      </div>
    </SpotlightBackground>
  );
}