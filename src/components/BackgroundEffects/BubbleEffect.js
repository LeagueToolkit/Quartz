import React, { useEffect, useRef, useState } from 'react';

const TARGET_FPS = 30;
const DEFAULT_PRIMARY = { r: 120, g: 200, b: 255 };
const DEFAULT_SECONDARY = { r: 143, g: 212, b: 255 };

const createWorker = () => new Worker(new URL('./bubble.worker.js', import.meta.url), { type: 'module' });

const hexToRgb = (hex, fallback) => {
  const safe = String(hex || '').trim();
  const match = /^#?([0-9a-f\d]{2})([0-9a-f\d]{2})([0-9a-f\d]{2})$/i.exec(safe);
  if (!match) return fallback;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
};

const readColors = () => {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: hexToRgb(style.getPropertyValue('--accent').trim(), DEFAULT_PRIMARY),
    secondary: hexToRgb(style.getPropertyValue('--accent2').trim(), DEFAULT_SECONDARY)
  };
};

const BubbleEffect = ({ enabled }) => {
  const canvasRef = useRef(null);
  const retryRef = useRef(false);
  const [canvasVersion, setCanvasVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const canvas = canvasRef.current;
    if (!canvas || typeof Worker === 'undefined' || typeof canvas.transferControlToOffscreen !== 'function') {
      return undefined;
    }

    let worker;
    let colorInterval;

    try {
      worker = createWorker();
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage(
        {
          type: 'init',
          payload: {
            canvas: offscreen,
            width: window.innerWidth,
            height: window.innerHeight,
            colors: readColors(),
            targetFps: TARGET_FPS
          }
        },
        [offscreen]
      );
    } catch (error) {
      if (worker) worker.terminate();
      if (!retryRef.current) {
        retryRef.current = true;
        setCanvasVersion((v) => v + 1);
      }
      return undefined;
    }
    retryRef.current = false;

    const onResize = () => {
      worker.postMessage({
        type: 'resize',
        payload: { width: window.innerWidth, height: window.innerHeight }
      });
    };

    const syncColors = () => {
      worker.postMessage({
        type: 'colors',
        payload: readColors()
      });
    };

    window.addEventListener('resize', onResize);
    colorInterval = window.setInterval(syncColors, 1200);

    return () => {
      window.removeEventListener('resize', onResize);
      if (colorInterval) window.clearInterval(colorInterval);
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
    };
  }, [enabled, canvasVersion]);

  if (!enabled) return null;

  return (
    <canvas
      key={canvasVersion}
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2147483000
      }}
    />
  );
};

export default BubbleEffect;
