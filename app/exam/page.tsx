'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import SpotlightBackground from '@/app/components/SpotlightBackground';
import { auth } from '@/app/lib/firebase';

export default function ExamUploadPage() {
  const router = useRouter();
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!questionPdf || !answerKeyPdf) return;
    setLoading(true);
    setError(null);

    const storage = getStorage();
    const userId = auth.currentUser?.uid || 'anonymous';
    const sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const qRef = storageRef(storage, `exam-uploads/${userId}/${sessionId}/qp.pdf`);
    const aRef = storageRef(storage, `exam-uploads/${userId}/${sessionId}/ak.pdf`);

    try {
      setProgress('Uploading PDFs to Firebase Storage...');
      await Promise.all([uploadBytes(qRef, questionPdf), uploadBytes(aRef, answerKeyPdf)]);
      const [qUrl, aUrl] = await Promise.all([getDownloadURL(qRef), getDownloadURL(aRef)]);

      setProgress('Gemini is parsing 4 sections in parallel (~1 minute)...');
      const res = await fetch('/api/parse-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionPdfUrl: qUrl, answerKeyPdfUrl: aUrl }),
      });
      const raw = await res.text();
      let data: { questions?: unknown; error?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
      }
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('No questions returned from parser');
      }
      sessionStorage.setItem('examQuestions', JSON.stringify(data.questions));
      router.push('/exam/session');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    } finally {
      // Always clean up Storage objects, even on error, to avoid filling the bucket.
      void Promise.allSettled([deleteObject(qRef), deleteObject(aRef)]).catch(() => {});
    }
  };

  return (
    <SpotlightBackground>
      <div className="w-full max-w-2xl space-y-8 px-4 text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">NEET Exam Simulator</h1>
          <p className="text-gray-400 mt-2">Upload your question paper and answer key</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${questionPdf ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-400'}`}>
            <input type="file" accept="application/pdf" className="sr-only" onChange={e => setQuestionPdf(e.target.files?.[0] || null)} />
            <FileText className={`w-8 h-8 ${questionPdf ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="text-center">
              <p className="font-medium text-sm">Question Paper</p>
              <p className="text-xs text-gray-400 mt-1">{questionPdf ? questionPdf.name : 'Click to upload PDF'}</p>
            </div>
          </label>
          <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${answerKeyPdf ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-400'}`}>
            <input type="file" accept="application/pdf" className="sr-only" onChange={e => setAnswerKeyPdf(e.target.files?.[0] || null)} />
            <Upload className={`w-8 h-8 ${answerKeyPdf ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="text-center">
              <p className="font-medium text-sm">Answer Key</p>
              <p className="text-xs text-gray-400 mt-1">{answerKeyPdf ? answerKeyPdf.name : 'Click to upload PDF'}</p>
            </div>
          </label>
        </div>
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}
        <button onClick={handleParse} disabled={!questionPdf || !answerKeyPdf || loading} className="w-full py-3 px-6 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" />{progress}</> : 'Parse & Start Exam'}
        </button>
      </div>
    </SpotlightBackground>
  );
}
