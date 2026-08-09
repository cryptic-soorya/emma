'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/app/lib/firebase';
import { CATQuestion, CATSection } from '@/app/lib/catTypes';
import { Target, Upload, FileText, Loader2, BrainCircuit } from 'lucide-react';
import SpotlightBackground from '@/app/components/SpotlightBackground';

interface MockGroup {
  year: number;
  slot: 1 | 2 | 3;
  questions: CATQuestion[];
  counts: Record<CATSection, number>;
}

export default function CATPickerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mocks, setMocks] = useState<MockGroup[]>([]);
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'catQuestions'));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as CATQuestion));
        const groups = new Map<string, MockGroup>();
        for (const q of all) {
          const key = `${q.year}-${q.slot}`;
          if (!groups.has(key)) {
            groups.set(key, { year: q.year, slot: q.slot, questions: [], counts: { VARC: 0, DILR: 0, QA: 0 } });
          }
          const g = groups.get(key)!;
          g.questions.push(q);
          g.counts[q.section]++;
        }
        setMocks([...groups.values()].sort((a, b) => b.year - a.year || a.slot - b.slot));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startMock = (group: MockGroup, name: string) => {
    const order: CATSection[] = ['VARC', 'DILR', 'QA'];
    const sorted = [...group.questions].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
    sessionStorage.setItem('catQuestions', JSON.stringify(sorted));
    sessionStorage.setItem('catMockName', name);
    router.push('/cat/session');
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleCustomParse = async () => {
    if (!questionPdf) return;
    setParsing(true);
    setError(null);
    try {
      const questionPdfBase64 = await toBase64(questionPdf);
      const answerKeyPdfBase64 = answerKeyPdf ? await toBase64(answerKeyPdf) : undefined;
      const res = await fetch('/api/parse-cat-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionPdfBase64, answerKeyPdfBase64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('No questions returned from parser');
      }
      sessionStorage.setItem('catQuestions', JSON.stringify(data.questions));
      sessionStorage.setItem('catMockName', 'Custom Mock');
      router.push('/cat/session');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
            <Target className="w-3.5 h-3.5" /> CAT Mock Simulator
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Pick a mock</h1>
          <p className="text-gray-400">Sectional timers, section locking, and a skip strategy after every attempt.</p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading available mocks...
          </div>
        ) : mocks.length === 0 ? (
          <p className="text-center text-gray-500 text-sm">No PYQ mocks in the question bank yet — use Custom Mock below.</p>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mocks.map(g => (
              <button
                key={`${g.year}-${g.slot}`}
                onClick={() => startMock(g, `CAT ${g.year} Slot ${g.slot}`)}
                className="text-left rounded-xl border border-gray-800 bg-gray-900/50 p-5 hover:border-amber-500/50 hover:bg-gray-900 transition-all space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">CAT {g.year} Slot {g.slot}</h3>
                  <span className="text-xs text-gray-500 font-mono">{g.questions.length}Q</span>
                </div>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">VARC {g.counts.VARC}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">DILR {g.counts.DILR}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">QA {g.counts.QA}</span>
                </div>
              </button>
            ))}
          </section>
        )}

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-amber-400" /> Custom Mock</h2>
          <p className="text-sm text-gray-400">Upload a question paper (and optionally an answer key) — Mika will parse it into a mock.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${questionPdf ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
              <input type="file" accept="application/pdf" className="sr-only" onChange={e => setQuestionPdf(e.target.files?.[0] || null)} />
              <FileText className={`w-7 h-7 ${questionPdf ? 'text-emerald-400' : 'text-gray-500'}`} />
              <div className="text-center">
                <p className="font-semibold text-sm">Question Paper</p>
                <p className="text-xs text-gray-500 mt-1">{questionPdf ? questionPdf.name : 'Click to upload PDF'}</p>
              </div>
            </label>
            <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${answerKeyPdf ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
              <input type="file" accept="application/pdf" className="sr-only" onChange={e => setAnswerKeyPdf(e.target.files?.[0] || null)} />
              <Upload className={`w-7 h-7 ${answerKeyPdf ? 'text-emerald-400' : 'text-gray-500'}`} />
              <div className="text-center">
                <p className="font-semibold text-sm">Answer Key (optional)</p>
                <p className="text-xs text-gray-500 mt-1">{answerKeyPdf ? answerKeyPdf.name : 'Click to upload PDF'}</p>
              </div>
            </label>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>}
          <button
            onClick={handleCustomParse}
            disabled={!questionPdf || parsing}
            className="w-full py-3 px-6 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {parsing ? <><Loader2 className="w-4 h-4 animate-spin" />Parsing with Mika...</> : 'Parse & Start Mock'}
          </button>
        </section>
      </div>
    </div>
  );
}
