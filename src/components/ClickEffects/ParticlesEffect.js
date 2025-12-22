import React, { useEffect, useRef, useCallback } from 'react';

const ParticlesEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const particlesRef = useRef([]);
    const requestRef = useRef(null);

    const createParticles = useCallback((x, y) => {
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 2 + Math.random() * 2;
            particlesRef.current.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color: `hsl(${Math.random() * 60 + 200}, 100%, 70%)` // Blue-ish hues
            });
        }
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        particlesRef.current.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.vy += 0.1; // Gravity

            if (p.life <= 0) return;

            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0, 3 * p.life), 0, Math.PI * 2);
            ctx.fill();
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

        window.addEventListener('resize', handleResize);

        const handleMouseDown = (e) => {
            createParticles(e.clientX, e.clientY);
            if (!requestRef.current) {
                requestRef.current = requestAnimationFrame(animate);
            }
        };

        window.addEventListener('mousedown', handleMouseDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousedown', handleMouseDown);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [enabled, createParticles, animate]);

    if (!enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 999999
            }}
        />
    );
};

export default ParticlesEffect;
