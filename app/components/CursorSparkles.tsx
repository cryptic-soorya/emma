"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  scale: number;
  spriteIdx: number;
}

const COLORS = ["#ec4899", "#f9a8d4", "#f0abfc", "#c084fc", "#e879f9", "#fda4af"];
const SPRITE_SIZE = 32;
const MAX_PARTICLES = 80;

// Pre-render one glow blob per color — called once on mount
function buildSprites(): HTMLCanvasElement[] {
  return COLORS.map((color) => {
    const c = document.createElement("canvas");
    c.width = SPRITE_SIZE;
    c.height = SPRITE_SIZE;
    const ctx = c.getContext("2d")!;
    const r = SPRITE_SIZE / 2;

    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.2, color);
    grad.addColorStop(0.6, color + "66");
    grad.addColorStop(1, color + "00");
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // tiny cross / plus to hint at sparkle shape
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r, r - 6); ctx.lineTo(r, r + 6);
    ctx.moveTo(r - 6, r); ctx.lineTo(r + 6, r);
    ctx.stroke();

    return c;
  });
}

export default function CursorSparkles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: -300, y: -300 });
  const rafId = useRef<number>(0);
  const lastSpawn = useRef(0);
  const sprites = useRef<HTMLCanvasElement[]>([]);

  useEffect(() => {
    sprites.current = buildSprites();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };

      const now = Date.now();
      if (now - lastSpawn.current < 25) return;
      lastSpawn.current = now;

      if (particles.current.length >= MAX_PARTICLES) return;

      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        particles.current.push({
          x: e.clientX + (Math.random() - 0.5) * 10,
          y: e.clientY + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed * 0.6,
          vy: Math.sin(angle) * speed - 1.5,
          alpha: 1,
          scale: 0.4 + Math.random() * 0.6,
          spriteIdx: Math.floor(Math.random() * COLORS.length),
        });
      }
    };

    window.addEventListener("mousemove", onMove);

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Additive blending: overlapping particles bloom into glow naturally
      ctx.globalCompositeOperation = "lighter";

      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.alpha *= 0.92;
        if (p.alpha < 0.02) continue;
        alive.push(p);

        const sz = SPRITE_SIZE * p.scale;
        ctx.globalAlpha = p.alpha * 0.85;
        ctx.drawImage(sprites.current[p.spriteIdx], p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      particles.current = alive;

      // Cursor dot — drawn in normal mode so it's crisp
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      const { x, y } = mouse.current;
      const dotGrad = ctx.createRadialGradient(x, y, 0, x, y, 8);
      dotGrad.addColorStop(0, "rgba(255,255,255,0.95)");
      dotGrad.addColorStop(0.4, "rgba(249,168,212,0.8)");
      dotGrad.addColorStop(1, "rgba(236,72,153,0)");
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = dotGrad;
      ctx.fill();

      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}
    />
  );
}
