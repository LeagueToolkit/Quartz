import React, { useEffect, useRef, useCallback } from 'react';

const GalaxyEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const starSystemsRef = useRef([]);
    const requestRef = useRef(null);

    const createGalaxy = useCallback((x, y) => {
        const armCount = 3 + Math.floor(Math.random() * 3); // 3 to 5 arms
        const starsPerArm = 15;

        // Add a galaxy system
        const galaxy = {
            x,
            y,
            age: 0,
            life: 1.0,
            rotation: Math.random() * Math.PI * 2,
            colorHue: Math.random() * 360,
            stars: []
        };

        for (let i = 0; i < armCount; i++) {
            for (let j = 0; j < starsPerArm; j++) {
                const angleOffset = (i / armCount) * Math.PI * 2;
                const distObj = (j / starsPerArm); // 0 to 1

                galaxy.stars.push({
                    angle: angleOffset + (distObj * 2), // Spiral factor
                    radius: distObj * 60, // Max radius 60
                    speed: 0.05 + ((1 - distObj) * 0.1), // Center moves faster
                    size: 1 + Math.random() * 2,
                    brightness: Math.random(),
                    offset: Math.random() * 20 // Random spread width
                });
            }
        }

        starSystemsRef.current.push(galaxy);
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Filter out dead galaxies
        starSystemsRef.current = starSystemsRef.current.filter(g => g.life > 0);

        starSystemsRef.current.forEach(g => {
            g.life -= 0.015;
            g.age += 1;
            g.rotation += 0.02; // Rotate entire galaxy

            if (g.life <= 0) return;

            const cx = g.x;
            const cy = g.y;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(g.rotation);

            // Draw core
            const coreAlpha = Math.max(0, g.life);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
            gradient.addColorStop(0, `hsla(${g.colorHue}, 100%, 90%, ${coreAlpha})`);
            gradient.addColorStop(1, `hsla(${g.colorHue}, 100%, 50%, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, 20 * (1 + Math.sin(g.age * 0.1) * 0.1), 0, Math.PI * 2);
            ctx.fill();

            // Draw stars
            g.stars.forEach(s => {
                // Determine position based on Spiral Math
                // Expand radius slightly over time
                const currentRadius = s.radius * (1 + g.age * 0.01);
                const currentAngle = s.angle - (g.age * s.speed);

                const px = Math.cos(currentAngle) * currentRadius;
                const py = Math.sin(currentAngle) * currentRadius;

                const alpha = g.life * s.brightness;
                ctx.fillStyle = `hsla(${g.colorHue + (s.radius)}, 80%, 80%, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, s.size, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.restore();
        });

        if (starSystemsRef.current.length > 0) {
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
            createGalaxy(e.clientX, e.clientY);
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
    }, [enabled, createGalaxy, animate]);

    if (!enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999999 }}
        />
    );
};

export default GalaxyEffect;
