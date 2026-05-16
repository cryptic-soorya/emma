"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import {
  Menu, Plus, MessageSquare, BookOpen, Edit3, Sparkles, Send, Trash2,
  Paperclip, X, FileText, ChevronLeft, Flame, Timer, LogOut,
  BrainCircuit, Mic, Volume2, VolumeX, AlertTriangle, StopCircle,
  CalendarDays, Check, RotateCcw, Heart, Zap, Filter,
  Smile, Users, GraduationCap, HeartHandshake,
  BarChart2, Target, BookMarked, TrendingDown, ChevronRight
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

const NEET_TOPICS: Record<string, string[]> = {
  Biology: [
    'The Living World','Biological Classification','Plant Kingdom','Animal Kingdom',
    'Morphology of Flowering Plants','Anatomy of Flowering Plants','Structural Organisation in Animals',
    'Cell: The Unit of Life','Biomolecules','Cell Cycle and Cell Division',
    'Transport in Plants','Mineral Nutrition','Photosynthesis in Higher Plants',
    'Respiration in Plants','Plant Growth and Development',
    'Digestion and Absorption','Breathing and Exchange of Gases',
    'Body Fluids and Circulation','Excretory Products and Elimination',
    'Locomotion and Movement','Neural Control and Coordination','Chemical Coordination',
    'Reproduction in Organisms','Sexual Reproduction in Flowering Plants',
    'Human Reproduction','Reproductive Health',
    'Principles of Inheritance and Variation','Molecular Basis of Inheritance','Evolution',
    'Human Health and Disease','Microbes in Human Welfare',
    'Biotechnology: Principles and Processes','Biotechnology and its Applications',
    'Organisms and Populations','Ecosystem','Biodiversity and Conservation','Environmental Issues',
  ],
  Physics: [
    'Units and Measurement','Motion in a Straight Line','Motion in a Plane',
    'Laws of Motion','Work, Energy and Power','System of Particles and Rotational Motion',
    'Gravitation','Mechanical Properties of Solids','Mechanical Properties of Fluids',
    'Thermal Properties of Matter','Thermodynamics','Kinetic Theory',
    'Oscillations','Waves','Electric Charges and Fields',
    'Electrostatic Potential and Capacitance','Current Electricity',
    'Moving Charges and Magnetism','Magnetism and Matter',
    'Electromagnetic Induction','Alternating Current','Electromagnetic Waves',
    'Ray Optics and Optical Instruments','Wave Optics',
    'Dual Nature of Radiation and Matter','Atoms','Nuclei','Semiconductor Electronics',
  ],
  Chemistry: [
    'Some Basic Concepts of Chemistry','Structure of Atom',
    'Classification of Elements and Periodicity','Chemical Bonding and Molecular Structure',
    'States of Matter','Chemical Thermodynamics','Equilibrium','Redox Reactions',
    'Hydrogen','s-Block Elements','p-Block Elements (13 & 14)',
    'Organic Chemistry: Basic Principles','Hydrocarbons','Environmental Chemistry',
    'Solid State','Solutions','Electrochemistry','Chemical Kinetics','Surface Chemistry',
    'General Principles of Isolation of Elements','d and f Block Elements',
    'Coordination Compounds','Haloalkanes and Haloarenes',
    'Alcohols, Phenols and Ethers','Aldehydes, Ketones and Carboxylic Acids',
    'Amines','Biomolecules','Polymers','Chemistry in Everyday Life',
  ],
};

const FORMULAS: Record<string, { category: string; items: string[] }[]> = {
  Physics: [
    { category: "Kinematics", items: ["v = u + at", "s = ut + ½at²", "v² = u² + 2as", "s = (u+v)t/2"] },
    { category: "Force & Momentum", items: ["F = ma", "p = mv", "Impulse = FΔt = Δp", "Work = Fs cosθ"] },
    { category: "Energy", items: ["KE = ½mv²", "PE = mgh", "Power = W/t = Fv", "η = W_out/W_in"] },
    { category: "Circular & Gravity", items: ["a = v²/r = ω²r", "F = mv²/r", "g = GM/R²", "T² ∝ r³ (Kepler)"] },
    { category: "SHM & Waves", items: ["T = 2π√(l/g)", "T = 2π√(m/k)", "v = fλ", "I ∝ A² ∝ 1/r²"] },
    { category: "Electricity", items: ["V = IR", "P = VI = I²R = V²/R", "C = Q/V", "Series: R = R₁+R₂"] },
    { category: "Optics", items: ["1/f = 1/v − 1/u", "m = −v/u", "n = sin i / sin r", "n = c/v"] },
    { category: "Modern Physics", items: ["E = hf = hc/λ", "KE_max = hf − φ", "E = mc²", "λ = h/mv (de Broglie)"] },
  ],
  Chemistry: [
    { category: "Mole Concept", items: ["n = m/M", "N = n × 6.022×10²³", "PV = nRT (R = 8.314)", "% = (mass/total)×100"] },
    { category: "Solutions", items: ["M = n/V(L)", "m = n/w(kg)", "χ = n₁/(n₁+n₂)", "ppm = (m_solute/m_solution)×10⁶"] },
    { category: "Colligative", items: ["ΔTb = Kb·m", "ΔTf = Kf·m", "π = MRT", "Relative lowering = χ_solute"] },
    { category: "Kinetics", items: ["r = k[A]ⁿ", "t½ = 0.693/k (1st order)", "k = Ae^(−Ea/RT) (Arrhenius)", "t½ = 1/(k[A]₀) (2nd order)"] },
    { category: "Equilibrium", items: ["Kc = [P]^p/[R]^r", "Kp = Kc(RT)^Δn", "Q < Kc: forward", "Le Chatelier's principle"] },
    { category: "Electrochemistry", items: ["E°cell = E°cathode − E°anode", "ΔG° = −nFE°", "E = E° − (0.0592/n)log Q", "W = nFE"] },
    { category: "Acids & Bases", items: ["pH = −log[H⁺]", "pOH = −log[OH⁻]", "pH + pOH = 14", "pH = pKa + log([A⁻]/[HA])"] },
  ],
  Biology: [
    { category: "Cell Division", items: ["Mitosis: PMAT (2n→2n)", "Meiosis: crossing over in Prophase I", "S phase: DNA replication", "G1+S+G2+M = cell cycle"] },
    { category: "DNA & Gene", items: ["A=T (2H bonds), G≡C (3H bonds)", "Chargaff: %A=%T, %G=%C", "Transcription: DNA→mRNA", "Translation: mRNA→protein (codons=3 bases)"] },
    { category: "Photosynthesis", items: ["6CO₂+6H₂O → C₆H₁₂O₆+6O₂", "Light rxn: H₂O→O₂+ATP+NADPH (thylakoid)", "Calvin: CO₂+ATP+NADPH→G3P (stroma)", "C4: CO₂ fixed by PEP carboxylase"] },
    { category: "Respiration", items: ["Glycolysis: Glucose→2 Pyruvate (2 ATP, cytoplasm)", "Krebs: 2 Acetyl-CoA→CO₂+8 NADH+2 FADH₂", "ETC: 34 ATP (inner mitochondrial membrane)", "Total aerobic: ~38 ATP per glucose"] },
    { category: "Circulation", items: ["RA→RV→Pulmonary→Lungs→LA→LV→Aorta", "SA node: pacemaker of heart", "ABO: A(IAIA/IAi), B(IBIB/IBi), O(ii), AB(IAIB)", "Rh+: dominant, Erythroblastosis if Rh− mother"] },
    { category: "Hormones", items: ["ADH: water reabsorption (DCT/CD)", "Insulin↓glucose | Glucagon↑glucose", "TSH→T3/T4 | ACTH→Cortisol | LH surge→Ovulation", "GH from anterior pituitary | Oxytocin from posterior"] },
    { category: "Genetics", items: ["Mendel: Law of Segregation + Independent Assortment", "Test cross: unknown × recessive homozygous", "Incomplete dominance: 1:2:1 phenotype ratio", "Codominance: both alleles expressed (e.g. AB blood)"] },
  ],
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
  const [rightSidebarMode, setRightSidebarMode] = useState<'notebook' | 'mistakes' | 'plan' | 'analytics' | 'goals' | 'formulas'>('notebook');
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

  // Exam / Topics / Spaced Repetition
  const [examDate, setExamDate] = useState('');
  const [topicsDone, setTopicsDone] = useState<Record<string, boolean>>({});
  const [activeSubject, setActiveSubject] = useState('Biology');
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showOnlyUnchecked, setShowOnlyUnchecked] = useState(false);
  type Personality = 'bestfriend' | 'studybuddy' | 'strictteacher' | 'therapist';
  const [personality, setPersonality] = useState<Personality>('bestfriend');

  // Daily Goals
  const [goals, setGoals] = useState<{id: string, text: string, done: boolean}[]>([]);
  const [goalInput, setGoalInput] = useState('');
  // Formula sheet subject tab
  const [formulaSubject, setFormulaSubject] = useState('Physics');
  // Plan sidebar sub-tab
  const [planTab, setPlanTab] = useState<'revisionplan' | 'checklist'>('revisionplan');

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
      const todayStr = new Date().toISOString().split('T')[0];

      if (!statsSnap.exists()) {
        await setDoc(statsRef, { streak: 1, lastLoginDate: todayStr, examDate: '' });
        setStreak(1);
      } else {
        const data = statsSnap.data();
        const lastDate = data.lastLoginDate || '';
        const currentStreak = data.streak || 1;

        // Load personality
        if (data.personality) setPersonality(data.personality as Personality);

        // Load exam date — if missing or already passed, clear it so Kate can set the new one
        const storedExam = data.examDate || '';
        const examIsValid = storedExam && new Date(storedExam + 'T00:00:00') >= new Date(todayStr + 'T00:00:00');
        if (examIsValid) {
          setExamDate(storedExam);
        } else {
          setExamDate('');
          if (storedExam) await updateDoc(statsRef, { examDate: '' });
        }

        if (lastDate === todayStr) {
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
    const topicsRef = doc(db, "users", user.uid, "stats", "topics");
    const unsubTopics = onSnapshot(topicsRef, (snap) => { if (snap.exists()) setTopicsDone(snap.data().done || {}); });
    const todayStr2 = new Date().toISOString().split('T')[0];
    const goalsRef = doc(db, "users", user.uid, "stats", "dailyGoals");
    const unsubGoals = onSnapshot(goalsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.date === todayStr2) {
          setGoals(data.goals || []);
        } else {
          setGoals([]);
          setDoc(goalsRef, { goals: [], date: todayStr2 });
        }
      }
    });
    return () => { unsubChats(); unsubNotes(); unsubMistakes(); unsubTopics(); unsubGoals(); };
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

  // Exam & topics computed
  const daysLeft = examDate ? (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exam = new Date(examDate + 'T00:00:00');
    return Math.ceil((exam.getTime() - today.getTime()) / 86400000);
  })() : null;
  const totalTopics = Object.values(NEET_TOPICS).flat().length;
  const doneCount = Object.values(topicsDone).filter(Boolean).length;
  const dueForReview = mistakes.filter(m => !m.nextReviewDate || m.nextReviewDate <= new Date().toISOString().split('T')[0]);

  const saveExamDate = async (date: string) => {
    setExamDate(date);
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "stats", "general"), { examDate: date }, { merge: true });
  };

  const savePersonality = async (p: Personality) => {
    setPersonality(p);
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "stats", "general"), { personality: p }, { merge: true });
  };

  const buildPanicMessage = () => {
    const hour = new Date().getHours();
    const timeContext =
      hour < 5  ? "It's the middle of the night and I can't stop worrying" :
      hour < 10 ? "It's morning and I'm already anxious before I've even started" :
      hour < 14 ? "I've been staring at my books and I just cannot focus" :
      hour < 18 ? "I've been studying for hours and nothing feels like it's sticking" :
      hour < 22 ? "It's evening and I still don't feel ready at all" :
                  "It's really late and I'm just spiraling";

    const examContext = daysLeft !== null && daysLeft >= 0
      ? `I only have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
      : "my exam is coming up really soon";

    const progressContext =
      doneCount === 0                        ? "and I feel like I haven't properly covered anything yet" :
      doneCount < totalTopics / 3            ? "and I feel like I've barely scratched the surface" :
      doneCount < (totalTopics * 2) / 3     ? "and there's still so much left to cover" :
                                               "and even though I've covered most of it, I still feel like I'm going to blank out";

    return `${timeContext}. ${examContext} ${progressContext}. I'm really overwhelmed and I don't know what to do. Please help me.`;
  };

  const toggleTopic = async (key: string) => {
    if (!user) return;
    const newDone = { ...topicsDone, [key]: !topicsDone[key] };
    setTopicsDone(newDone);
    await setDoc(doc(db, "users", user.uid, "stats", "topics"), { done: newDone }, { merge: true });
  };

  const startReview = () => {
    if (!dueForReview.length) { setToast("Nothing due for review right now 🌸"); return; }
    setReviewQueue([...dueForReview]);
    setReviewIndex(0);
    setCardFlipped(false);
    setReviewMode(true);
  };

  const rateCard = async (knew: boolean) => {
    const item = reviewQueue[reviewIndex];
    const currentInterval = item.interval || 1;
    const newInterval = knew ? Math.min(currentInterval * 2, 16) : 1;
    const next = new Date();
    next.setDate(next.getDate() + newInterval);
    await updateDoc(doc(db, "users", user.uid, "mistakes", item.id), {
      interval: newInterval,
      nextReviewDate: next.toISOString().split('T')[0],
      repetitions: (item.repetitions || 0) + (knew ? 1 : 0),
    });
    if (reviewIndex + 1 >= reviewQueue.length) {
      setReviewMode(false);
      setToast(`Review done! ${reviewQueue.length} card${reviewQueue.length !== 1 ? 's' : ''} reviewed 🌸`);
    } else {
      setReviewIndex(i => i + 1);
      setCardFlipped(false);
    }
  };

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
  const performSend = async (textToSend: string, isSystemCommand = false, isPanic = false) => {
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
          mimeType: currentContext?.file.type,
          daysLeft: daysLeft ?? undefined,
          isPanic,
          personality,
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
    setToast("Saved to mistake log 📝");
  } catch (error) {
    console.error("Error saving mistake:", error);
    setToast("Failed to save mistake.");
  }
};
const QUIZ_FORMAT_INSTRUCTION = `
Format each question EXACTLY like this — each option on its own line, blank line between questions:

**1. Question text here?**

A. Option A
B. Option B
C. Option C
D. Option D

Do NOT write all options on one line. Do NOT use LaTeX ($...$) — write formulas in plain text.`;

const handleGenerateQuiz = () => {
  if (!activeSessionId) return alert("Start a chat or upload a PDF first!");
  performSend(`Generate 3 NEET-style Multiple Choice Questions based on our current topic or the attached document.${QUIZ_FORMAT_INSTRUCTION}

Put all answers at the very bottom inside a <details> block.`, true);
};

const handleBlitzQuiz = () => {
  if (!activeSessionId) return alert("Start a chat first!");
  performSend(`Generate 10 rapid-fire NEET-style MCQs on our current topic. Exam-level difficulty.${QUIZ_FORMAT_INSTRUCTION}

Put all answers at the very bottom inside a <details> block.`, true);
};

const handlePanic = () => {
  const msg = buildPanicMessage();
  if (!activeSessionId) {
    addDoc(collection(db, "users", user.uid, "chats"), { title: "SOS", createdAt: serverTimestamp() }).then(ref => {
      setActiveSessionId(ref.id);
      setTimeout(() => performSend(msg, false, true), 100);
    });
    return;
  }
  performSend(msg, false, true);
};
  const deleteMistake = async (id: string) => { if(confirm("Remove?")) await deleteDoc(doc(db, "users", user.uid, "mistakes", id)); };

  // --- GOALS ---
  const saveGoals = async (newGoals: typeof goals) => {
    if (!user) return;
    const todayStr = new Date().toISOString().split('T')[0];
    await setDoc(doc(db, "users", user.uid, "stats", "dailyGoals"), { goals: newGoals, date: todayStr });
  };
  const addGoal = async () => {
    if (!goalInput.trim()) return;
    const newGoals = [...goals, { id: Date.now().toString(), text: goalInput.trim(), done: false }];
    setGoals(newGoals); setGoalInput(''); saveGoals(newGoals);
  };
  const toggleGoal = async (id: string) => {
    const newGoals = goals.map(g => g.id === id ? { ...g, done: !g.done } : g);
    setGoals(newGoals); saveGoals(newGoals);
  };
  const deleteGoal = async (id: string) => {
    const newGoals = goals.filter(g => g.id !== id);
    setGoals(newGoals); saveGoals(newGoals);
  };

  // --- ANALYTICS & WEAK TOPIC RADAR ---
  const subjectStats = Object.entries(NEET_TOPICS).map(([subject, topics]) => {
    const done = topics.filter((_, i) => topicsDone[`${subject}_${i}`]).length;
    return { subject, done, total: topics.length, pct: Math.round((done / topics.length) * 100) };
  }).sort((a, b) => a.pct - b.pct);
  const masteredMistakes = mistakes.filter(m => (m.repetitions || 0) >= 2).length;
  const weakSubject = subjectStats[0];

  // --- REVISION PLAN ---
  const generateRevisionPlan = () => {
    if (!daysLeft || daysLeft <= 0) return [];
    const remaining: { subject: string; topic: string }[] = [];
    Object.entries(NEET_TOPICS).forEach(([subject, topics]) => {
      topics.forEach((topic, i) => {
        if (!topicsDone[`${subject}_${i}`]) remaining.push({ subject, topic });
      });
    });
    const perDay = Math.ceil(remaining.length / daysLeft);
    const plan: { day: number; date: string; topics: typeof remaining }[] = [];
    const today = new Date();
    for (let d = 0; d < Math.min(daysLeft, 30); d++) {
      const dayTopics = remaining.slice(d * perDay, (d + 1) * perDay);
      if (!dayTopics.length) break;
      const date = new Date(today); date.setDate(today.getDate() + d);
      plan.push({ day: d + 1, date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), topics: dayTopics });
    }
    return plan;
  };

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
        <div className="px-3 mb-3">
           <button onClick={() => { setActiveSessionId(null); setActiveFile(null); }} className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5"><Plus size={18} className="text-pink-500" />{isSidebarOpen && <span className="text-sm font-medium">New Session</span>}</button>
        </div>

        {/* PERSONALITY SELECTOR */}
        {isSidebarOpen && (() => {
          const options: { id: Personality; label: string; icon: React.ReactNode; active: string; inactive: string }[] = [
            { id: 'bestfriend',    label: 'Best Friend',    icon: <Smile size={11}/>,        active: 'bg-pink-500/20 text-pink-300 border-pink-500/30',    inactive: 'text-zinc-500 border-transparent hover:border-white/10 hover:text-zinc-300' },
            { id: 'studybuddy',   label: 'Study Buddy',    icon: <Users size={11}/>,         active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',     inactive: 'text-zinc-500 border-transparent hover:border-white/10 hover:text-zinc-300' },
            { id: 'strictteacher',label: 'Strict Teacher', icon: <GraduationCap size={11}/>, active: 'bg-purple-500/20 text-purple-300 border-purple-500/30',inactive: 'text-zinc-500 border-transparent hover:border-white/10 hover:text-zinc-300' },
            { id: 'therapist',    label: 'Calm Support',   icon: <HeartHandshake size={11}/>,active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',inactive: 'text-zinc-500 border-transparent hover:border-white/10 hover:text-zinc-300' },
          ];
          return (
            <div className="px-3 mb-3">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5 px-1">Mika's Mode</div>
              <div className="grid grid-cols-2 gap-1">
                {options.map(o => (
                  <button key={o.id} onClick={() => savePersonality(o.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${personality === o.id ? o.active : o.inactive}`}>
                    {o.icon}{o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
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
        <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 bg-zinc-900/20 backdrop-blur-md overflow-x-auto gap-2">
           <div className="flex items-center gap-2 flex-shrink-0">
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
             <button onClick={handleBlitzQuiz} title="10-question blitz quiz" className="flex items-center gap-2 px-3 py-1 rounded-full border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors">
               <Zap size={14} />
               <span className="text-xs font-bold">Blitz</span>
             </button>
             {/* VOICE TOGGLE */}
             <button onClick={() => { setIsSpeaking(!isSpeaking); stopSpeaking(); }} className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${isSpeaking ? 'bg-pink-500/10 border-pink-500/30 text-pink-400' : 'border-white/10 text-zinc-500'}`}>
               {isSpeaking ? <Volume2 size={14}/> : <VolumeX size={14}/>}
               <span className="text-xs font-bold">{isSpeaking ? "Voice ON" : "Voice OFF"}</span>
             </button>
             <button onClick={handlePanic} title="I'm overwhelmed — talk to Mika" className="flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
               <Heart size={14} />
               <span className="text-xs font-bold">SOS</span>
             </button>
           </div>
           
        </header>

        {/* CRASH MODE BANNER */}
        {daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && (
          <div className="px-6 py-2.5 flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-red-500/5 border-b border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-400">
              <Zap size={13} className="fill-orange-400/30" />
              <span className="text-xs font-bold tracking-wide">CRUNCH MODE — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left · Mika is in drill-sergeant mode</span>
            </div>
            <span className="text-xs text-orange-500 font-mono font-bold">
              {daysLeft > 0 ? `${Math.ceil((totalTopics - doneCount) / daysLeft)} chapters/day` : 'Exam day!'}
            </span>
          </div>
        )}

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
                         <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{msg.text}</ReactMarkdown>
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

      {/* RIGHT ACTIVITY BAR — always visible */}
      <div className="flex-shrink-0 w-12 h-full border-l border-white/5 bg-zinc-900/40 backdrop-blur-xl flex flex-col items-center py-4 gap-2 z-20">
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'notebook') setRightSidebarOpen(false); else { setRightSidebarMode('notebook'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'notebook' ? 'text-pink-400 bg-pink-500/15' : 'text-zinc-500 hover:text-white'}`} title="Notebook"><BookOpen size={18} /></button>
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'plan') setRightSidebarOpen(false); else { setRightSidebarMode('plan'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'plan' ? 'text-pink-300 bg-pink-500/15' : 'text-zinc-500 hover:text-white'}`} title="Revision Plan"><CalendarDays size={18} /></button>
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'formulas') setRightSidebarOpen(false); else { setRightSidebarMode('formulas'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'formulas' ? 'text-teal-400 bg-teal-500/15' : 'text-zinc-500 hover:text-white'}`} title="Formula Sheet"><BookMarked size={18} /></button>
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'goals') setRightSidebarOpen(false); else { setRightSidebarMode('goals'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'goals' ? 'text-emerald-400 bg-emerald-500/15' : 'text-zinc-500 hover:text-white'}`} title="Daily Goals"><Target size={18} /></button>
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'analytics') setRightSidebarOpen(false); else { setRightSidebarMode('analytics'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'analytics' ? 'text-blue-400 bg-blue-500/15' : 'text-zinc-500 hover:text-white'}`} title="Progress Analytics"><BarChart2 size={18} /></button>
        <button onClick={() => { if (isRightSidebarOpen && rightSidebarMode === 'mistakes') setRightSidebarOpen(false); else { setRightSidebarMode('mistakes'); setRightSidebarOpen(true); } }} className={`p-2.5 rounded-lg transition-colors ${isRightSidebarOpen && rightSidebarMode === 'mistakes' ? 'text-yellow-400 bg-yellow-500/15' : 'text-zinc-500 hover:text-white'}`} title="Mistake Log"><AlertTriangle size={18} /></button>
      </div>

      {/* RIGHT SIDEBAR (NOTEBOOK / MISTAKES) */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 400, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex-shrink-0 border-l border-white/5 bg-zinc-950/90 backdrop-blur-2xl flex flex-col z-20 shadow-2xl">
             <div className="h-16 border-b border-white/5 flex items-center justify-between px-5 bg-zinc-900/50 min-w-[400px]">
               <span className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                 {rightSidebarMode === 'notebook' ? <><Edit3 size={14} className="text-pink-500"/> Notebook</>
                   : rightSidebarMode === 'mistakes' ? <><AlertTriangle size={14} className="text-yellow-500"/> Mistake Log</>
                   : rightSidebarMode === 'analytics' ? <><BarChart2 size={14} className="text-blue-400"/> Progress Analytics</>
                   : rightSidebarMode === 'goals' ? <><Target size={14} className="text-emerald-400"/> Daily Goals</>
                   : rightSidebarMode === 'formulas' ? <><BookMarked size={14} className="text-teal-400"/> Formula Sheet</>
                   : <><CalendarDays size={14} className="text-pink-400"/> Revision Plan</>}
               </span>
               <div className="flex items-center gap-2">
                 {rightSidebarMode === 'notebook' && !activeNoteId && <button onClick={handleNewNote}><Plus size={18} className="text-zinc-400 hover:text-white"/></button>}
                 <button onClick={() => setRightSidebarOpen(false)}><X size={18} className="text-zinc-500 hover:text-white"/></button>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-0 min-w-[400px] flex flex-col">
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
               ) : rightSidebarMode === 'mistakes' ? (
                 // MISTAKES VIEW — with spaced repetition review mode
                 reviewMode ? (
                   <div className="flex flex-col h-full p-5">
                     {/* Review header */}
                     <div className="flex items-center justify-between mb-3">
                       <span className="text-xs text-zinc-500 font-medium">{reviewIndex + 1} / {reviewQueue.length} cards</span>
                       <button onClick={() => setReviewMode(false)} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14}/></button>
                     </div>
                     {/* Progress bar */}
                     <div className="h-1 bg-white/5 rounded-full mb-5">
                       <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${(reviewIndex / reviewQueue.length) * 100}%` }}/>
                     </div>
                     {/* Question card */}
                     <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-4">
                       <div className="text-xs text-yellow-500 font-bold mb-2">Context</div>
                       <div className="text-sm text-zinc-300 leading-relaxed">{reviewQueue[reviewIndex]?.question}</div>
                     </div>
                     {/* Answer / Buttons */}
                     {!cardFlipped ? (
                       <button onClick={() => setCardFlipped(true)} className="w-full py-3 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 text-sm transition-colors">
                         Show Answer ↓
                       </button>
                     ) : (
                       <>
                         <div className="p-4 rounded-xl bg-black/30 border border-white/10 flex-1 overflow-y-auto mb-4 custom-scrollbar">
                           <div className="text-xs text-pink-400 font-bold mb-2">Answer</div>
                           <div className="text-sm text-zinc-300 markdown-content">
                             <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{reviewQueue[reviewIndex]?.answer}</ReactMarkdown>
                           </div>
                         </div>
                         <div className="flex gap-2">
                           <button onClick={() => rateCard(false)} className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                             <RotateCcw size={13}/> Again
                           </button>
                           <button onClick={() => rateCard(true)} className="flex-1 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                             <Check size={13}/> Got it
                           </button>
                         </div>
                       </>
                     )}
                   </div>
                 ) : (
                   <div className="p-4 space-y-3">
                     {/* Review CTA */}
                     <button onClick={startReview} className={`w-full py-3 rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${dueForReview.length > 0 ? 'bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20' : 'bg-white/5 border-white/10 text-zinc-500 cursor-default'}`}>
                       <BrainCircuit size={14}/>
                       {dueForReview.length > 0 ? `Review ${dueForReview.length} due card${dueForReview.length !== 1 ? 's' : ''}` : 'All caught up! 🌸'}
                     </button>
                     {mistakes.length === 0 && <div className="text-center text-zinc-500 mt-6 text-sm">No mistakes logged yet.</div>}
                     {mistakes.map(m => (
                       <div key={m.id} className="p-4 rounded-xl bg-yellow-900/10 border border-yellow-500/20 group relative">
                         <div className="flex items-center gap-2 mb-2">
                           <div className="text-xs text-yellow-500 font-bold flex-1 pr-6 truncate">
                             {m.question.length > 60 ? m.question.substring(0, 60) + '…' : m.question}
                           </div>
                           {m.nextReviewDate && <span className="text-xs text-zinc-600 flex-shrink-0">{m.repetitions || 0}✓</span>}
                         </div>
                         <div className="text-sm text-zinc-300 markdown-content">
                           <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>{m.answer}</ReactMarkdown>
                         </div>
                         <button onClick={() => deleteMistake(m.id)} className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
                       </div>
                     ))}
                   </div>
                 )
               ) : rightSidebarMode === 'analytics' ? (
                 // ANALYTICS + WEAK TOPIC RADAR
                 <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar h-full">
                   {/* Streak + overview */}
                   <div className="grid grid-cols-3 gap-3">
                     <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 text-center">
                       <div className="text-2xl font-black text-orange-400 tabular-nums">{streak}</div>
                       <div className="text-xs text-zinc-500 mt-0.5">Day Streak</div>
                     </div>
                     <div className="rounded-xl bg-pink-500/10 border border-pink-500/20 p-3 text-center">
                       <div className="text-2xl font-black text-pink-400 tabular-nums">{doneCount}</div>
                       <div className="text-xs text-zinc-500 mt-0.5">Topics Done</div>
                     </div>
                     <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-center">
                       <div className="text-2xl font-black text-yellow-400 tabular-nums">{mistakes.length}</div>
                       <div className="text-xs text-zinc-500 mt-0.5">Mistakes</div>
                     </div>
                   </div>

                   {/* Subject completion bars */}
                   <div>
                     <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-semibold">Subject Progress</div>
                     <div className="space-y-3">
                       {Object.entries(NEET_TOPICS).map(([subject, topics]) => {
                         const done = topics.filter((_, i) => topicsDone[`${subject}_${i}`]).length;
                         const pct = Math.round((done / topics.length) * 100);
                         const color = subject === 'Biology' ? 'from-emerald-500 to-teal-500' : subject === 'Physics' ? 'from-blue-500 to-indigo-500' : 'from-purple-500 to-pink-500';
                         const bg = subject === 'Biology' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : subject === 'Physics' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400';
                         return (
                           <div key={subject}>
                             <div className="flex justify-between items-center mb-1.5">
                               <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${bg}`}>{subject}</span>
                               <span className="text-xs text-zinc-400 tabular-nums">{done}/{topics.length} · {pct}%</span>
                             </div>
                             <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                               <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}/>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>

                   {/* Mistake mastery */}
                   <div>
                     <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-semibold">Mistake Mastery</div>
                     <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-4">
                       <div className="flex-1">
                         <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                           <span>Mastered (≥2 correct)</span>
                           <span className="text-emerald-400 font-bold">{masteredMistakes}/{mistakes.length}</span>
                         </div>
                         <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                           <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{ width: mistakes.length ? `${Math.round((masteredMistakes/mistakes.length)*100)}%` : '0%' }}/>
                         </div>
                         <div className="flex justify-between text-xs text-zinc-600 mt-1.5">
                           <span>{dueForReview.length} due for review</span>
                           <span>{mistakes.length - masteredMistakes} still learning</span>
                         </div>
                       </div>
                     </div>
                   </div>

                   {/* Weak topic radar */}
                   <div>
                     <div className="flex items-center gap-2 mb-3">
                       <TrendingDown size={13} className="text-red-400"/>
                       <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Weak Topic Radar</div>
                     </div>
                     {weakSubject && (
                       <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 mb-3">
                         <div className="flex items-start gap-3">
                           <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                             <TrendingDown size={14} className="text-red-400"/>
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="text-sm font-semibold text-red-300 mb-0.5">Focus on {weakSubject.subject}</div>
                             <div className="text-xs text-zinc-500">Only {weakSubject.pct}% complete — {weakSubject.total - weakSubject.done} chapters left</div>
                           </div>
                         </div>
                       </div>
                     )}
                     <div className="space-y-2">
                       {subjectStats.map(({ subject, pct }) => (
                         <div key={subject} className="flex items-center gap-3 text-xs">
                           <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pct < 33 ? 'bg-red-400' : pct < 66 ? 'bg-yellow-400' : 'bg-emerald-400'}`}/>
                           <span className="text-zinc-400 flex-1">{subject}</span>
                           <span className={`font-mono font-bold ${pct < 33 ? 'text-red-400' : pct < 66 ? 'text-yellow-400' : 'text-emerald-400'}`}>{pct}%</span>
                           <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pct < 33 ? 'bg-red-500/10 text-red-400' : pct < 66 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                             {pct < 33 ? 'Weak' : pct < 66 ? 'Mid' : 'Strong'}
                           </span>
                         </div>
                       ))}
                     </div>
                   </div>

                   {/* Days left stat */}
                   {daysLeft !== null && (
                     <div className="rounded-xl bg-pink-500/5 border border-pink-500/20 p-4 flex items-center justify-between">
                       <div>
                         <div className="text-xs text-zinc-500 mb-0.5">Days until exam</div>
                         <div className="text-2xl font-black text-pink-300 tabular-nums">{daysLeft}</div>
                       </div>
                       {daysLeft > 0 && (
                         <div className="text-right">
                           <div className="text-xs text-zinc-500 mb-0.5">Need per day</div>
                           <div className="text-lg font-black text-orange-300 tabular-nums">{Math.ceil((totalTopics - doneCount) / daysLeft)}</div>
                           <div className="text-xs text-zinc-600">chapters</div>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               ) : rightSidebarMode === 'goals' ? (
                 // DAILY GOALS
                 <div className="flex flex-col h-full">
                   <div className="p-5 border-b border-white/5">
                     <div className="text-xs text-zinc-500 mb-3">
                       {goals.filter(g => g.done).length}/{goals.length} completed today
                     </div>
                     {goals.length > 0 && (
                       <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
                         <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{ width: `${goals.length ? (goals.filter(g=>g.done).length/goals.length)*100 : 0}%` }}/>
                       </div>
                     )}
                     <div className="flex gap-2">
                       <input
                         value={goalInput}
                         onChange={e => setGoalInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && addGoal()}
                         placeholder="Add a goal for today..."
                         className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 placeholder-zinc-600 transition-colors"
                       />
                       <button onClick={addGoal} className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                         <Plus size={16}/>
                       </button>
                     </div>
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                     {goals.length === 0 && (
                       <div className="text-center text-zinc-600 mt-8 text-sm">No goals yet. Add one above!</div>
                     )}
                     {goals.map(goal => (
                       <div key={goal.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${goal.done ? 'bg-emerald-500/5 border-emerald-500/15 opacity-60' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                         <button onClick={() => toggleGoal(goal.id)} className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all mt-0.5 ${goal.done ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600 hover:border-emerald-500'}`}>
                           {goal.done && <Check size={10} className="text-white" strokeWidth={3}/>}
                         </button>
                         <span className={`text-sm flex-1 leading-relaxed ${goal.done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>{goal.text}</span>
                         <button onClick={() => deleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 flex-shrink-0 transition-all">
                           <X size={13}/>
                         </button>
                       </div>
                     ))}
                   </div>
                   {goals.length > 0 && goals.every(g => g.done) && (
                     <div className="p-4 border-t border-white/5 text-center text-sm text-emerald-400 font-semibold">
                       All done for today! 🌸
                     </div>
                   )}
                 </div>
               ) : rightSidebarMode === 'formulas' ? (
                 // FORMULA QUICK REFERENCE
                 <div className="flex flex-col h-full">
                   <div className="flex border-b border-white/5 flex-shrink-0">
                     {Object.keys(FORMULAS).map(subject => (
                       <button key={subject} onClick={() => setFormulaSubject(subject)}
                         className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${formulaSubject === subject ? 'border-teal-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                         {subject}
                       </button>
                     ))}
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                     {FORMULAS[formulaSubject]?.map(section => (
                       <div key={section.category}>
                         <div className="text-xs text-teal-400 font-bold uppercase tracking-wider mb-2">{section.category}</div>
                         <div className="space-y-1.5">
                           {section.items.map((item, i) => (
                             <div key={i} className="font-mono text-xs bg-zinc-900/80 border border-white/5 rounded-lg px-3 py-2 text-zinc-300 hover:border-teal-500/30 hover:text-white transition-colors cursor-default">
                               {item}
                             </div>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               ) : (
                 // PLAN — revision plan + topic checklist (tabbed)
                 <div className="flex flex-col h-full">
                   {/* Sub-tabs */}
                   <div className="flex border-b border-white/5 flex-shrink-0">
                     <button onClick={() => setPlanTab('revisionplan')} className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${planTab === 'revisionplan' ? 'border-pink-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Revision Plan</button>
                     <button onClick={() => setPlanTab('checklist')} className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${planTab === 'checklist' ? 'border-pink-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Topic Checklist</button>
                   </div>

                   {planTab === 'revisionplan' ? (() => {
                     const plan = generateRevisionPlan();
                     return (
                       <>
                         <div className="p-4 border-b border-white/5 bg-gradient-to-b from-pink-500/5 to-transparent text-center">
                           {daysLeft !== null && daysLeft > 0 ? (
                             <>
                               <div className="text-4xl font-black text-white tabular-nums mb-1">{daysLeft}</div>
                               <div className="text-xs text-zinc-500">days · {totalTopics - doneCount} chapters left</div>
                               <div className="text-xs text-zinc-600 mt-0.5">~{Math.ceil((totalTopics - doneCount) / daysLeft)} chapters/day</div>
                             </>
                           ) : (
                             <div className="text-base font-bold text-pink-400">Set exam date to generate plan</div>
                           )}
                           <input type="date" value={examDate} onChange={e => saveExamDate(e.target.value)}
                             className="mt-3 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-500 focus:outline-none focus:border-pink-500/50 transition-colors" />
                         </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                           {plan.length === 0 ? (
                             <div className="text-center text-zinc-600 text-sm mt-8">
                               {daysLeft && daysLeft > 0 ? 'All topics covered! 🌸' : 'Set your exam date above to see your plan.'}
                             </div>
                           ) : plan.map(({ day, date, topics }) => (
                             <div key={day} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                               <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/5">
                                 <span className="text-xs font-bold text-pink-300">Day {day}</span>
                                 <span className="text-xs text-zinc-500">{date} · {topics.length} chapters</span>
                               </div>
                               <div className="p-3 space-y-1.5">
                                 {topics.map(({ subject, topic }, i) => {
                                   const subjectColor = subject === 'Biology' ? 'text-emerald-400 bg-emerald-500/10' : subject === 'Physics' ? 'text-blue-400 bg-blue-500/10' : 'text-purple-400 bg-purple-500/10';
                                   return (
                                     <div key={i} className="flex items-center gap-2">
                                       <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${subjectColor}`}>{subject[0]}</span>
                                       <span className="text-xs text-zinc-400">{topic}</span>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           ))}
                         </div>
                       </>
                     );
                   })() : (
                     // CHECKLIST TAB
                     <>
                       <div className="p-4 text-center border-b border-white/5 bg-gradient-to-b from-pink-500/5 to-transparent">
                         {daysLeft !== null && daysLeft >= 0 ? (
                           <>
                             <div className="text-5xl font-black text-white mb-1 tabular-nums">{daysLeft}</div>
                             <div className="text-xs text-zinc-500 mb-1">days until exam</div>
                             {examDate && <div className="text-xs text-zinc-600">{new Date(examDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>}
                           </>
                         ) : (
                           <div className="text-xl font-bold text-pink-400 mb-1">Exam Day! 🌸</div>
                         )}
                         <div className="mt-3 mb-1">
                           <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                             <span>{doneCount} revised</span>
                             <span>{Math.round((doneCount / totalTopics) * 100)}%</span>
                           </div>
                           <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500 rounded-full" style={{ width: `${(doneCount / totalTopics) * 100}%` }}/>
                           </div>
                         </div>
                         <input type="date" value={examDate} onChange={e => saveExamDate(e.target.value)}
                           className="mt-2 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-500 focus:outline-none focus:border-pink-500/50 transition-colors" />
                       </div>
                       <div className="flex border-b border-white/5 flex-shrink-0 items-center">
                         <div className="flex flex-1">
                           {Object.keys(NEET_TOPICS).map(subject => {
                             const subjectDone = NEET_TOPICS[subject].filter((_, i) => topicsDone[`${subject}_${i}`]).length;
                             const color = subject === 'Biology' ? 'emerald' : subject === 'Physics' ? 'blue' : 'purple';
                             return (
                               <button key={subject} onClick={() => setActiveSubject(subject)}
                                 className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${activeSubject === subject ? `border-${color}-500 text-white` : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                                 {subject}
                                 <span className="ml-1 opacity-50">{subjectDone}/{NEET_TOPICS[subject].length}</span>
                               </button>
                             );
                           })}
                         </div>
                         <button onClick={() => setShowOnlyUnchecked(v => !v)} title={showOnlyUnchecked ? "Show all" : "Show unchecked only"} className={`px-2 py-2 border-l border-white/5 transition-colors flex-shrink-0 ${showOnlyUnchecked ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-600 hover:text-zinc-400'}`}>
                           <Filter size={13}/>
                         </button>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar">
                         {NEET_TOPICS[activeSubject].map((chapter, i) => {
                           const key = `${activeSubject}_${i}`;
                           const done = !!topicsDone[key];
                           if (showOnlyUnchecked && done) return null;
                           return (
                             <button key={key} onClick={() => toggleTopic(key)}
                               className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-white/[0.03] hover:bg-white/5 ${done ? 'opacity-50' : ''}`}>
                               <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${done ? 'bg-pink-500 border-pink-500' : 'border-zinc-700'}`}>
                                 {done && <Check size={9} className="text-white" strokeWidth={3}/>}
                               </div>
                               <span className={`text-xs ${done ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>{chapter}</span>
                             </button>
                           );
                         })}
                       </div>
                     </>
                   )}
                 </div>
               )}
             </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}