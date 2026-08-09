'use client';
import { useEffect, useRef, useState } from 'react';
import { CATSection } from '@/app/lib/catTypes';

interface SectionTimerProps {
  section: CATSection;
  totalSeconds: number;
  onTick: (remainingSeconds: number) => void;
  onSectionEnd: () => void;
}

const SECTION_COLORS: Record<CATSection, string> = {
  VARC: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DILR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  QA: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function SectionTimer({ section, totalSeconds, onTick, onSectionEnd }: SectionTimerProps) {
  const startTimeRef = useRef<number>(Date.now());
  const onTickRef = useRef(onTick);
  const onSectionEndRef = useRef(onSectionEnd);
  const firedRef = useRef(false);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);

  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onSectionEndRef.current = onSectionEnd; }, [onSectionEnd]);

  useEffect(() => {
    const compute = () => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setRemainingSeconds(remaining);
      onTickRef.current(remaining);
      if (remaining === 0 && !firedRef.current) {
        firedRef.current = true;
        onSectionEndRef.current();
      }
      return remaining;
    };

    compute();
    const id = setInterval(() => {
      const r = compute();
      if (r === 0) clearInterval(id);
    }, 500);

    return () => clearInterval(id);
  }, [totalSeconds]);

  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  const timerColor =
    remainingSeconds < 120 ? 'text-red-400' :
    remainingSeconds < 300 ? 'text-amber-400' :
    'text-white';

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`px-3 py-1 rounded text-xs font-semibold border ${SECTION_COLORS[section]}`}>
        {section}
      </span>
      <div className={`font-mono text-3xl font-bold tracking-widest ${timerColor}`}>
        {pad(m)}:{pad(s)}
      </div>
      {remainingSeconds < 300 && (
        <div className={`text-xs font-semibold ${remainingSeconds < 120 ? 'text-red-400' : 'text-amber-400'}`}>
          {remainingSeconds < 120 ? 'Less than 2 min!' : 'Final 5 minutes'}
        </div>
      )}
    </div>
  );
}
