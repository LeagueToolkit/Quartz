import React, { useEffect, useRef, useCallback } from 'react';

const GlitchEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const particlesRef = useRef([]);
    const requestRef = useRef(null);

    const createBurst = useCallback((x, y) => {
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const dist = Math.random() * 20;
            // Snap to grid-like movement
            const speed = 2 + Math.random() * 4;

            particlesRef.current.push({
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * speed * 2,
                vy: (Math.random() - 0.5) * speed * 2,
                w: 4 + Math.random() * 10,
                h: 2 + Math.random() * 6,
                life: 1.0,
                color: Math.random() > 0.5 ? '#00ffcc' : '#ff00ff' // Cyan/Magenta
            });
        }
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        particlesRef.current.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04; // Fast decay

            if (p.life <= 0) return;

            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);

            // Draw Glitch Rect
            ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h);

            // Randomly offset slice
            if (Math.random() > 0.8) {
                ctx.fillRect(Math.floor(p.x) + 5, Math.floor(p.y), p.w, 1);
            }
        });

        if (particlesRef.current.length > 0) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            requestRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        };

        const handleMouseDown = (e) => {
            createBurst(e.clientX, e.clientY);
            if (!requestRef.current) {
                requestRef.current = requestAnimationFrame(animate);
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousedown', handleMouseDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousedown', handleMouseDown);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [enabled, createBurst, animate]);

    if (!enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999999 }}
        />
    );
};

export default GlitchEffect;
