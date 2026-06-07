'use client';
import { useEffect, useRef, useState } from 'react';

interface TimerProps {
  totalMs: number;
  isPaused: boolean;
  onTick: (remainingMs: number) => void;
}

export default function Timer({ totalMs, isPaused, onTick }: TimerProps) {
  // Wall-clock based timer:
  //   elapsed = (now - startTime) - totalPausedMs
  //   remaining = totalMs - elapsed
  // This is immune to setInterval drift, tab throttling, and browser sleep.
  const startTimeRef = useRef<number>(Date.now());
  const totalPausedMsRef = useRef<number>(0);
  const pauseStartRef = useRef<number | null>(null);
  const isPausedRef = useRef<boolean>(isPaused);
  const onTickRef = useRef(onTick);

  const [remainingMs, setRemainingMs] = useState(totalMs);

  // Keep refs current
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  // Handle pause edges (running → paused, paused → running)
  useEffect(() => {
    const wasPaused = isPausedRef.current;
    if (!wasPaused && isPaused) {
      // Just paused — mark start of this pause window
      pauseStartRef.current = Date.now();
    } else if (wasPaused && !isPaused) {
      // Just resumed — accumulate the pause duration
      if (pauseStartRef.current !== null) {
        totalPausedMsRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
    }
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Single ticking interval that lives the whole component lifetime.
  // Recomputes from wall-clock each tick — no drift.
  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const currentPause = pauseStartRef.current !== null ? now - pauseStartRef.current : 0;
      const elapsed = now - startTimeRef.current - totalPausedMsRef.current - currentPause;
      const remaining = Math.max(0, totalMs - elapsed);
      setRemainingMs(remaining);
      onTickRef.current(remaining);
      return remaining;
    };

    // Compute immediately so the UI doesn't flash totalMs for a second
    compute();
    const id = setInterval(() => {
      const r = compute();
      if (r === 0) clearInterval(id);
    }, 500); // poll twice per second to keep display crisp even if a tick is late

    return () => clearInterval(id);
  }, [totalMs]);

  const h = Math.floor(remainingMs / 3600000);
  const m = Math.floor((remainingMs % 3600000) / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const isLow = remainingMs < 5 * 60 * 1000;

  return (
    <div className={`font-mono text-3xl font-bold tracking-widest ${isLow ? 'text-red-400' : 'text-white'}`}>
      {pad(h)}:{pad(m)}:{pad(s)}
    </div>
  );
}
