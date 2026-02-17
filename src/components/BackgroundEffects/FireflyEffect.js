import React, { useEffect, useRef } from 'react';

const FireflyEffect = ({ enabled }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!enabled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let fireflies = [];

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Helper to convert hex to rgb
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 150 }; // Fallback to yellow
        };

        const createFirefly = () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 1,
            speedX: Math.random() * 0.5 - 0.25,
            speedY: Math.random() * 0.5 - 0.25,
            opacity: Math.random(),
            pulseSpeed: Math.random() * 0.02 + 0.01,
            colorType: Math.random() > 0.5 ? 'primary' : 'secondary'
        });

        for (let i = 0; i < 50; i++) {
            fireflies.push(createFirefly());
        }

        const animate = () => {
            if (!canvas) return; // Safety check
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Get current theme colors
            const style = getComputedStyle(document.documentElement);
            const primaryHex = style.getPropertyValue('--accent').trim() || '#ecb96a';
            const secondaryHex = style.getPropertyValue('--accent2').trim() || '#c084fc';

            const primaryRgb = hexToRgb(primaryHex);
            const secondaryRgb = hexToRgb(secondaryHex);

            fireflies.forEach(fly => {
                // Update position
                fly.x += fly.speedX;
                fly.y += fly.speedY;

                // Wrap around screen
                if (fly.x < 0) fly.x = canvas.width;
                if (fly.x > canvas.width) fly.x = 0;
                if (fly.y < 0) fly.y = canvas.height;
                if (fly.y > canvas.height) fly.y = 0;

                // Update opacity (pulse)
                fly.opacity += fly.pulseSpeed;
                if (fly.opacity > 1 || fly.opacity < 0.2) {
                    fly.pulseSpeed = -fly.pulseSpeed;
                }

                // Determine color based on type
                const color = fly.colorType === 'primary' ? primaryRgb : secondaryRgb;
                const { r, g, b } = color;

                // Draw
                ctx.beginPath();
                ctx.arc(fly.x, fly.y, fly.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.abs(fly.opacity) * 0.8})`;
                ctx.shadowBlur = 15;
                ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
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
                zIndex: 9999 // Overlay on top of everything
            }}
        />
    );
};

export default FireflyEffect;
