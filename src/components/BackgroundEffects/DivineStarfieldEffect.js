import React, { useEffect, useRef, useState } from 'react';

const createWorker = () => {
    return new Worker(new URL('./starfield.worker.js', import.meta.url), { type: 'module' });
};

const DivineStarfieldEffect = ({ enabled }) => {
    const [mounted, setMounted] = useState(false);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);

    useEffect(() => {
        if (!enabled) return;
        setMounted(true);
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !mounted) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Graceful fallback for browsers without OffscreenCanvas (Safari < 16.4)
        if (!canvas.transferControlToOffscreen) {
            console.warn('OffscreenCanvas not supported — upgrade to the canvas version.');
            return;
        }

        const offscreen = canvas.transferControlToOffscreen();
        const worker = createWorker();
        workerRef.current = worker;

        // Transfer canvas ownership to the worker — zero memory copy
        worker.postMessage(
            {
                type: 'init',
                payload: {
                    canvas: offscreen,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    count: 150,
                },
            },
            [offscreen]
        );

        const handleResize = () => {
            worker.postMessage({
                type: 'resize',
                payload: { width: window.innerWidth, height: window.innerHeight },
            });
        };

        // Main thread only normalizes the value and fires — no simulation here
        const handleMouseMove = (e) => {
            worker.postMessage({
                type: 'mousemove',
                payload: {
                    x: (e.clientX / window.innerWidth - 0.5) * 2,
                    y: (e.clientY / window.innerHeight - 0.5) * 2,
                },
            });
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            worker.postMessage({ type: 'destroy' });
            worker.terminate();
            workerRef.current = null;
        };
    }, [enabled, mounted]);

    if (!enabled || !mounted) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999,
                overflow: 'hidden',
            }}
        >
            {/* Central Radial Glow — unchanged from original */}
            <div
                style={{
                    position: 'absolute',
                    top: '20%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '800px',
                    height: '600px',
                    opacity: 0.2,
                    filter: 'blur(120px)',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, var(--accent2) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }}
            />

            {/* Canvas ownership is transferred to worker on mount — main thread never touches it again */}
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
};

export default DivineStarfieldEffect;