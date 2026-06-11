import React, { useEffect, useRef } from 'react';
import styles from './Home.module.css';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

const PARTICLE_COUNT = 60;
const MAX_DISTANCE = 200;

const HeroMesh: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    const particles: Particle[] = [];
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersReducedMotion = motionMedia.matches;

    // Particle/link color from the SOVEREIGN accent token so the mesh tracks the theme.
    const readAccentRgb = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim();
      const hex = raw.replace('#', '');
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
      return { r: 77, g: 159, b: 255 };
    };
    const accent = readAccentRgb();
    const accentRgb = `${accent.r}, ${accent.g}, ${accent.b}`;

    const setCanvasSize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth || window.innerWidth;
      const height = parent?.clientHeight || window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      particles.length = 0;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: 3 + Math.random() * 2.5,
          opacity: 0.35 + Math.random() * 0.35,
        });
      }
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p, index) => {
        if (!prefersReducedMotion) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x <= 0 || p.x >= width) p.vx *= -1;
          if (p.y <= 0 || p.y >= height) p.vy *= -1;
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(${accentRgb}, ${p.opacity})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = index + 1; j < particles.length; j += 1) {
          const other = particles[j];
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const distance = Math.hypot(dx, dy);
          if (distance < MAX_DISTANCE) {
            const intensity = 0.2 - distance / (MAX_DISTANCE * 6);
            ctx.strokeStyle = `rgba(${accentRgb}, ${Math.max(intensity, 0)})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }
      });

      animationFrame = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      setCanvasSize();
      initParticles();
    };

    setCanvasSize();
    initParticles();
    draw();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.heroCanvas} aria-hidden="true" />;
};

export default HeroMesh;
