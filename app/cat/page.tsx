'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Target, Upload, FileText, Loader2, ChevronRight, BookOpen, Lock, Flame, BrainCircuit, ClipboardList } from 'lucide-react';
import { auth, db } from '@/app/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { CATQuestion, RevisionQueue, StudentBehaviorProfile, StudyStreak } from '@/app/lib/catTypes';
import { dueItems, isStreakAlive } from '@/app/lib/catStudy';
import Link from 'next/link';

const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
const SLOTS: (1 | 2 | 3)[] = [1, 2, 3];

const SECTION_COUNTS = { VARC: 24, DILR: 20, QA: 22 };

type ViewMode = 'picker' | 'upload';

export default function CATPickerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('picker');

  // Streak + revision-due strip (value-add features, 2026-07-13)
  const [streak, setStreak] = useState<StudyStreak | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [hasWeakChapters, setHasWeakChapters] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) return;
      try {
        const [profileSnap, queueSnap] = await Promise.all([
          getDoc(doc(db, 'studentProfiles', u.uid)),
          getDoc(doc(db, 'revisionQueues', u.uid)),
        ]);
        if (profileSnap.exists()) {
          const p = profileSnap.data() as StudentBehaviorProfile;
          if (p.streak) setStreak(p.streak);
          setHasWeakChapters((p.chapterStats ?? []).some(s => s.totalAttempts >= 3 && s.accuracy < 0.6));
        }
        if (queueSnap.exists()) {
          const q = queueSnap.data() as RevisionQueue;
          setDueCount(dueItems(q.items ?? [], Date.now()).length);
        }
      } catch { /* strip is best-effort — never block the picker */ }
    });
    return unsub;
  }, []);

  // PDF upload state
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleYearSlotSelect = async (year: number, slot: 1 | 2 | 3) => {
    const key = `${year}-${slot}`;
    setLoading(key);
    setError(null);

    try {
      const q = query(
        collection(db, 'catQuestions'),
        where('year', '==', year),
        where('slot', '==', slot)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(`No questions found for CAT ${year} Slot ${slot} in the question bank. Try uploading a PDF instead.`);
        setLoading(null);
        return;
      }

      const questions: CATQuestion[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CATQuestion));
      sessionStorage.setItem('catQuestions', JSON.stringify(questions));
      sessionStorage.setItem('catMockName', `CAT ${year} Slot ${slot}`);
      router.push('/cat/session');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load questions');
      setLoading(null);
    }
  };

  const handlePdfUpload = async () => {
    if (!questionPdf) return;
    setIsUploading(true);
    setError(null);

    try {
      setUploadProgress('Converting PDF...');
      const qBase64 = await toBase64(questionPdf);
      let aBase64: string | undefined;
      if (answerKeyPdf) aBase64 = await toBase64(answerKeyPdf);

      setUploadProgress('Parsing with Gemini... (this takes ~30 seconds)');
      const res = await fetch('/api/parse-cat-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPdfBase64: qBase64,
          answerKeyPdfBase64: aBase64 ?? null,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      sessionStorage.setItem('catQuestions', JSON.stringify(data.questions));
      sessionStorage.setItem('catMockName', 'Custom Mock');
      router.push('/cat/session');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
          ← Dashboard
        </Link>
        <div className="h-4 w-px bg-gray-800" />
        <div className="flex items-center gap-2">
          <Target size={18} className="text-amber-400" />
          <span className="font-semibold text-white">CAT Mock Simulator</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Select a Mock
          </h1>
          <p className="text-gray-400">
            66 questions · 2 hours · Sectional timers · Real CAT rules enforced
          </p>
          <div className="flex gap-3 mt-2">
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">VARC 24 Qs</span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">DILR 20 Qs</span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">QA 22 Qs</span>
          </div>
        </motion.div>

        {/* Study tools strip: streak, revision queue, weak-chapter drill */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10"
        >
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Flame className={`w-5 h-5 ${isStreakAlive(streak ?? undefined, Date.now()) ? 'text-amber-400' : 'text-gray-600'}`} />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">
                <span className="font-mono">{isStreakAlive(streak ?? undefined, Date.now()) ? streak!.currentStreak : 0}</span> day streak
              </p>
              <p className="text-xs text-gray-500">
                {streak ? `Best: ${streak.longestStreak} · ${streak.totalStudyDays} study days` : 'Finish a mock to start one'}
              </p>
            </div>
          </div>

          <Link href="/cat/revision" className="group flex items-center gap-3 p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:border-amber-500/50 hover:bg-gray-900 transition-all">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ClipboardList className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Revision Queue</p>
              <p className={`text-xs ${dueCount > 0 ? 'text-amber-400 font-semibold' : 'text-gray-500'}`}>
                {dueCount > 0 ? `${dueCount} due for re-test` : 'Nothing due today'}
              </p>
            </div>
            <ChevronRight size={14} className="ml-auto text-gray-600 group-hover:text-amber-400 transition-colors" />
          </Link>

          <Link href="/cat/drill" className="group flex items-center gap-3 p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:border-amber-500/50 hover:bg-gray-900 transition-all">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <BrainCircuit className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Weak Chapter Drill</p>
              <p className={`text-xs ${hasWeakChapters ? 'text-amber-400 font-semibold' : 'text-gray-500'}`}>
                {hasWeakChapters ? 'Weak chapters found — drill them' : 'Unlocks after your mocks'}
              </p>
            </div>
            <ChevronRight size={14} className="ml-auto text-gray-600 group-hover:text-amber-400 transition-colors" />
          </Link>
        </motion.div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setViewMode('picker')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'picker'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <BookOpen size={14} className="inline mr-2" />
            PYQ Bank
          </button>
          <button
            onClick={() => setViewMode('upload')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'upload'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <Upload size={14} className="inline mr-2" />
            Custom Mock (PDF)
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {viewMode === 'picker' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {YEARS.map((year, yi) => (
              SLOTS.map(slot => {
                const key = `${year}-${slot}`;
                const isLoading = loading === key;
                const isOlderSlot3 = slot === 3 && year < 2020;
                return (
                  <motion.button
                    key={key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: yi * 0.03 }}
                    onClick={() => !isOlderSlot3 && handleYearSlotSelect(year, slot)}
                    disabled={isOlderSlot3 || !!loading}
                    className={`relative group flex flex-col gap-3 p-5 rounded-xl border text-left transition-all ${
                      isOlderSlot3
                        ? 'border-gray-800 bg-gray-900/20 opacity-40 cursor-not-allowed'
                        : 'border-gray-800 bg-gray-900/50 hover:border-amber-500/50 hover:bg-gray-900 cursor-pointer'
                    }`}
                  >
                    {isOlderSlot3 && (
                      <div className="absolute top-3 right-3">
                        <Lock size={12} className="text-gray-600" />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-white tracking-tight">CAT {year}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-semibold border border-gray-700">
                        Slot {slot}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs text-blue-400">VARC</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-purple-400">DILR</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-amber-400">QA</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">66 questions · 2 hrs</span>
                      {isLoading ? (
                        <Loader2 size={14} className="text-amber-400 animate-spin" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
                      )}
                    </div>
                  </motion.button>
                );
              })
            )).flat()}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg space-y-6"
          >
            <p className="text-gray-400 text-sm">
              Upload a CAT question paper PDF and optionally an answer key. Gemini will parse it into a full mock session.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
                questionPdf ? 'border-amber-500/60 bg-amber-500/5' : 'border-gray-700 hover:border-gray-500'
              }`}>
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={e => setQuestionPdf(e.target.files?.[0] || null)}
                />
                <FileText className={`w-8 h-8 ${questionPdf ? 'text-amber-400' : 'text-gray-500'}`} />
                <div className="text-center">
                  <p className="font-semibold text-sm text-white">Question Paper</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {questionPdf ? questionPdf.name : 'Click to upload PDF'}
                  </p>
                </div>
              </label>

              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
                answerKeyPdf ? 'border-amber-500/60 bg-amber-500/5' : 'border-gray-700 hover:border-gray-500'
              }`}>
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={e => setAnswerKeyPdf(e.target.files?.[0] || null)}
                />
                <Upload className={`w-8 h-8 ${answerKeyPdf ? 'text-amber-400' : 'text-gray-500'}`} />
                <div className="text-center">
                  <p className="font-semibold text-sm text-white">Answer Key</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {answerKeyPdf ? answerKeyPdf.name : 'Optional — upload if separate'}
                  </p>
                </div>
              </label>
            </div>

            <button
              onClick={handlePdfUpload}
              disabled={!questionPdf || isUploading}
              className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgress}
                </>
              ) : (
                <>
                  <Target size={16} />
                  Parse & Start Mock
                </>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
