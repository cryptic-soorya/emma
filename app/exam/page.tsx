'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Loader2 } from 'lucide-react';
import SpotlightBackground from '@/app/components/SpotlightBackground';

interface GeminiFile {
  name: string;
  uri: string;
  mimeType?: string;
  state?: string;
}

// Upload a File directly to Gemini File API from the browser.
// Uses NEXT_PUBLIC_GEMINI_UPLOAD_KEY which should be a referrer-restricted API key.
async function uploadToGemini(file: File, key: string, displayName: string): Promise<GeminiFile> {
  const uploadResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'raw',
        'Content-Type': file.type || 'application/pdf',
        'X-Goog-Upload-File-Name': displayName,
      },
      body: file,
    }
  );
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`Gemini upload failed for ${displayName} (HTTP ${uploadResp.status}): ${text.slice(0, 200)}`);
  }
  const json = await uploadResp.json();
  let info: GeminiFile = json.file;
  if (!info?.name) throw new Error(`Gemini upload returned no file name for ${displayName}`);

  // Poll until ACTIVE — PDFs go through PROCESSING first
  const startedAt = Date.now();
  while (info.state === 'PROCESSING') {
    if (Date.now() - startedAt > 60_000) {
      throw new Error(`${displayName} stuck in PROCESSING for >60s`);
    }
    await new Promise(r => setTimeout(r, 2000));
    const pollResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${info.name}?key=${encodeURIComponent(key)}`
    );
    if (!pollResp.ok) throw new Error(`Poll failed for ${displayName}: HTTP ${pollResp.status}`);
    info = await pollResp.json();
  }
  if (info.state !== 'ACTIVE') {
    throw new Error(`${displayName} upload failed: state=${info.state}`);
  }
  return info;
}

export default function ExamUploadPage() {
  const router = useRouter();
  const [questionPdf, setQuestionPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!questionPdf || !answerKeyPdf) return;
    const uploadKey = process.env.NEXT_PUBLIC_GEMINI_UPLOAD_KEY;
    if (!uploadKey) {
      setError('NEXT_PUBLIC_GEMINI_UPLOAD_KEY is not configured. Set it in .env.local and Vercel env.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      setProgress('Uploading PDFs directly to Gemini (skipping Vercel)...');
      const [qFile, aFile] = await Promise.all([
        uploadToGemini(questionPdf, uploadKey, 'qp.pdf'),
        uploadToGemini(answerKeyPdf, uploadKey, 'ak.pdf'),
      ]);

      setProgress('Gemini is parsing 4 sections in parallel (~1 minute)...');
      const res = await fetch('/api/parse-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPdfUri: qFile.uri,
          questionPdfName: qFile.name,
          answerKeyPdfUri: aFile.uri,
          answerKeyPdfName: aFile.name,
        }),
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
    }
  };

  return (
    <SpotlightBackground>
      <div className="w-full max-w-2xl space-y-8 px-4 text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Exam Simulator</h1>
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
