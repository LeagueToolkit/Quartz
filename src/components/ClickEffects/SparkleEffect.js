import React, { useEffect, useRef, useCallback } from 'react';

const SparkleEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const sparklesRef = useRef([]);
    const requestRef = useRef(null);

    const createSparkles = useCallback((x, y) => {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            sparklesRef.current.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: `255, 255, ${200 + Math.random() * 55}` // Yellow/White
            });
        }
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        sparklesRef.current = sparklesRef.current.filter(p => p.life > 0);

        sparklesRef.current.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.rotation += p.rotSpeed;
            p.vy += 0.05; // Light gravity

            if (p.life <= 0) return;

            const alpha = p.life;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.globalAlpha = Math.max(0, alpha);

            // Draw Star Shape
            ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
            ctx.beginPath();
            const spikes = 4;
            const outerRadius = p.size;
            const innerRadius = p.size / 2;

            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outerRadius : innerRadius;
                const a = (Math.PI * i) / spikes;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();

            // Glow
            ctx.shadowColor = `rgba(${p.color}, ${alpha})`;
            ctx.shadowBlur = 10;
            ctx.stroke();

            ctx.restore();
        });

        if (sparklesRef.current.length > 0) {
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
            createSparkles(e.clientX, e.clientY);
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
    }, [enabled, createSparkles, animate]);

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

export default SparkleEffect;
