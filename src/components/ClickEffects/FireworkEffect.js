import React, { useEffect, useRef, useCallback } from 'react';

const FireworkEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const fireworksRef = useRef([]);
    const requestRef = useRef(null);

    const createFirework = useCallback((x, y) => {
        const particleCount = 20;
        const colorHue = Math.random() * 360;

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;

            fireworksRef.current.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                colorHue: colorHue + (Math.random() * 40 - 20), // Slight color variation
                gravity: 0.1,
                trail: [] // Store previous positions
            });
        }

        // Add a few "flash" particles
        fireworksRef.current.push({
            x, y, vx: 0, vy: 0, life: 0.5, isFlash: true, size: 30, colorHue
        });
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Trail effect: clear with opacity instead of full clear
        // This leaves trails behind
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = 'lighter'; // Additive blending for glow

        fireworksRef.current = fireworksRef.current.filter(p => p.life > 0);

        fireworksRef.current.forEach(p => {
            if (p.isFlash) {
                p.life -= 0.1;
                const alpha = Math.max(0, p.life);
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                gradient.addColorStop(0, `hsla(${p.colorHue}, 100%, 90%, ${alpha})`);
                gradient.addColorStop(1, `hsla(${p.colorHue}, 100%, 50%, 0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                return;
            }

            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity; // Gravity
            p.vx *= 0.95; // Air resistance
            p.vy *= 0.95;
            p.life -= 0.02;

            if (p.life <= 0) return;

            const alpha = Math.max(0, p.life);
            ctx.fillStyle = `hsla(${p.colorHue}, 80%, 60%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalCompositeOperation = 'source-over'; // Reset

        if (fireworksRef.current.length > 0) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            // Full clear if empty to ensure canvas is clean
            ctx.clearRect(0, 0, canvas.width, canvas.height);
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
            createFirework(e.clientX, e.clientY);
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
    }, [enabled, createFirework, animate]);

    if (!enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999999 }}
        />
    );
};

export default FireworkEffect;
