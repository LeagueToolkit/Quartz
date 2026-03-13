import React, { useEffect, useRef, useState } from 'react';

const TARGET_FPS = 30;

const createWorker = () => new Worker(new URL('./rain.worker.js', import.meta.url), { type: 'module' });

const RainEffect = ({ enabled }) => {
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

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
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

export default RainEffect;
