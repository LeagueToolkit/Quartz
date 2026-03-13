import React, { useEffect, useRef } from 'react';

const TARGET_FPS = 20;
const FRAME_TIME_MS = 1000 / TARGET_FPS;
const DEFAULT_COLOR = { r: 210, g: 235, b: 255 };

const createWorker = () => new Worker(new URL('./sparkleSymbol.worker.js', import.meta.url), { type: 'module' });

const hexToRgb = (hex) => {
  const safe = String(hex || '').trim();
  const match = /^#?([0-9a-f\d]{2})([0-9a-f\d]{2})([0-9a-f\d]{2})$/i.exec(safe);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
};

const readAccent2Color = () => {
  const style = getComputedStyle(document.documentElement);
  const parsed = hexToRgb(style.getPropertyValue('--accent2').trim());
  return parsed || DEFAULT_COLOR;
};

const runMainThreadFallback = (canvas) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let animationFrameId;
  let symbols = [];
  let lastRender = performance.now();
  let color = readAccent2Color();
  let colorTick = 0;
  let symbolCapacity = 0;

  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const symbolCount = () => Math.max(24, Math.floor((canvas.width * canvas.height) / 52000));

  const initSymbol = (symbol, spawnAbove = false) => {
    const size = Math.random() * 14 + 7;
    symbol.x = Math.random() * canvas.width;
    symbol.y = spawnAbove ? -size - Math.random() * 120 : Math.random() * canvas.height;
    symbol.size = size;
    symbol.speedY = Math.random() * 0.32 + 0.08;
    symbol.speedX = Math.random() * 0.22 - 0.11;
    symbol.pulse = Math.random() * Math.PI * 2;
    symbol.pulseSpeed = Math.random() * 0.02 + 0.006;
    symbol.alpha = Math.random() * 0.36 + 0.2;
    symbol.outline = Math.random() > 0.55;
  };

  const rebuildSymbols = () => {
    const count = symbolCount();
    if (count > symbolCapacity) {
      for (let i = symbolCapacity; i < count; i += 1) {
        symbols[i] = {
          x: 0,
          y: 0,
          size: 0,
          speedY: 0,
          speedX: 0,
          pulse: 0,
          pulseSpeed: 0,
          alpha: 0,
          outline: false
        };
      }
      symbolCapacity = count;
    }
    symbols.length = count;
    for (let i = 0; i < count; i += 1) {
      initSymbol(symbols[i], false);
    }
  };

  const animate = (now = 0) => {
    if (now - lastRender < FRAME_TIME_MS) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }
    lastRender = now;
    colorTick += 1;
    if (colorTick % 30 === 0) {
      color = readAccent2Color();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < symbols.length; i += 1) {
      const s = symbols[i];
      s.y += s.speedY;
      s.x += s.speedX;
      s.pulse += s.pulseSpeed;

      if (s.y - s.size > canvas.height + 20 || s.x < -30 || s.x > canvas.width + 30) {
        initSymbol(s, true);
        continue;
      }

      const pulseScale = 0.78 + (Math.sin(s.pulse) * 0.22 + 0.22);
      const size = s.size * pulseScale;
      const alpha = s.alpha * (0.65 + pulseScale * 0.35);

      ctx.beginPath();
      ctx.moveTo(s.x, s.y - size);
      ctx.quadraticCurveTo(s.x + size * 0.1, s.y - size * 0.1, s.x + size, s.y);
      ctx.quadraticCurveTo(s.x + size * 0.1, s.y + size * 0.1, s.x, s.y + size);
      ctx.quadraticCurveTo(s.x - size * 0.1, s.y + size * 0.1, s.x - size, s.y);
      ctx.quadraticCurveTo(s.x - size * 0.1, s.y - size * 0.1, s.x, s.y - size);
      ctx.closePath();
      if (s.outline) {
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.fill();
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  rebuildSymbols();
  animationFrameId = requestAnimationFrame(animate);

  return () => {
    window.removeEventListener('resize', resizeCanvas);
    cancelAnimationFrame(animationFrameId);
  };
};

const SparkleSymbolEffect = ({ enabled }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const canUseWorker =
      process.env.NODE_ENV === 'production' &&
      typeof Worker !== 'undefined' &&
      typeof canvas.transferControlToOffscreen === 'function';

    if (!canUseWorker) {
      return runMainThreadFallback(canvas);
    }

    let worker;
    let colorInterval;

    try {
      worker = createWorker();
    } catch (error) {
      return runMainThreadFallback(canvas);
    }

    try {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage(
        {
          type: 'init',
          payload: {
            canvas: offscreen,
            width: window.innerWidth,
            height: window.innerHeight,
            color: readAccent2Color(),
            targetFps: TARGET_FPS
          }
        },
        [offscreen]
      );
    } catch (error) {
      worker.terminate();
      return undefined;
    }

    const onResize = () => {
      worker.postMessage({
        type: 'resize',
        payload: { width: window.innerWidth, height: window.innerHeight }
      });
    };

    const syncColor = () => {
      worker.postMessage({
        type: 'color',
        payload: readAccent2Color()
      });
    };

    window.addEventListener('resize', onResize);
    colorInterval = window.setInterval(syncColor, 1200);

    return () => {
      window.removeEventListener('resize', onResize);
      if (colorInterval) window.clearInterval(colorInterval);
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10000
      }}
    />
  );
};

export default SparkleSymbolEffect;
