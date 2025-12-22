import React, { useEffect, useRef } from 'react';

/**
 * Water Ripple Effect (Optimized)
 */
const ClickRippleEffect = ({ enabled = true }) => {
    const canvasRef = useRef(null);
    const requestRef = useRef(null);
    const widthRef = useRef(0);
    const heightRef = useRef(0);
    const buffer1Ref = useRef([]);
    const buffer2Ref = useRef([]);
    const damping = 0.92;
    const pointerDown = useRef(false);
    const isActiveRef = useRef(false);
    const idleFramesRef = useRef(0);
    const imageDataRef = useRef(null);

    const initBuffers = (width, height) => {
        widthRef.current = width >> 1;
        heightRef.current = height >> 1;
        const size = widthRef.current * heightRef.current;
        buffer1Ref.current = new Float32Array(size);
        buffer2Ref.current = new Float32Array(size);

        if (canvasRef.current) {
            canvasRef.current.width = widthRef.current;
            canvasRef.current.height = heightRef.current;
            const ctx = canvasRef.current.getContext('2d');
            imageDataRef.current = ctx.createImageData(widthRef.current, heightRef.current);
        }
    };

    const addDrop = (x, y, strength, radius) => {
        isActiveRef.current = true;
        idleFramesRef.current = 0;

        if (!requestRef.current) {
            requestRef.current = requestAnimationFrame(animationLoop);
        }

        const w = widthRef.current;
        const h = heightRef.current;
        const bx = Math.floor(x / 2);
        const by = Math.floor(y / 2);

        for (let j = by - radius; j < by + radius; j++) {
            for (let i = bx - radius; i < bx + radius; i++) {
                if (i > 0 && i < w - 1 && j > 0 && j < h - 1) {
                    const dx = i - bx;
                    const dy = j - by;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < radius) {
                        const val = Math.cos((dist / radius) * Math.PI / 2) * strength;
                        buffer1Ref.current[j * w + i] -= val;
                    }
                }
            }
        }
    };

    const animationLoop = () => {
        if (!canvasRef.current) return;

        if (!isActiveRef.current) {
            requestRef.current = null;
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, widthRef.current, heightRef.current);
            return;
        }

        const w = widthRef.current;
        const h = heightRef.current;
        const b1 = buffer1Ref.current;
        const b2 = buffer2Ref.current;
        const imageData = imageDataRef.current;

        if (!imageData) return;

        const data = imageData.data;
        data.fill(0);

        let energy = 0;

        for (let y = 1; y < h - 1; y++) {
            const row = y * w;
            for (let x = 1; x < w - 1; x++) {
                const idx = row + x;
                const val = (
                    (b1[idx - 1] +
                        b1[idx + 1] +
                        b1[idx - w] +
                        b1[idx + w]) / 2
                ) - b2[idx];

                const damped = val * damping;
                b2[idx] = damped;
                energy += Math.abs(damped);
            }
        }

        const temp = buffer1Ref.current;
        buffer1Ref.current = buffer2Ref.current;
        buffer2Ref.current = temp;

        if (energy < 1) {
            idleFramesRef.current++;
            if (idleFramesRef.current > 60) {
                isActiveRef.current = false;
            }
        } else {
            idleFramesRef.current = 0;
        }

        const buffer = buffer1Ref.current;
        const ctx = canvasRef.current.getContext('2d');

        for (let i = 0; i < w * h; i++) {
            const val = buffer[i];
            if (val > -0.1 && val < 0.1) continue;

            const x = i % w;
            const y = Math.floor(i / w);

            if (x === 0 || x === w - 1 || y === 0 || y === h - 1) continue;

            const xOffset = buffer[i + 1] - val;
            const yOffset = buffer[i + w] - val;
            let shading = xOffset - yOffset;
            let a = 0;

            if (shading > 0) {
                a = shading * 8;
                if (a > 255) a = 255;
                const idx = i * 4;
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = a;
            } else {
                a = -shading * 8;
                if (a > 255) a = 255;
                const idx = i * 4;
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = a;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        requestRef.current = requestAnimationFrame(animationLoop);
    };

    useEffect(() => {
        if (!enabled) return;

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.width = '100vw';
            canvas.style.height = '100vh';
            canvas.style.imageRendering = 'auto';
        }

        const handleResize = () => {
            initBuffers(window.innerWidth, window.innerHeight);
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        const handleMouseDown = (e) => {
            pointerDown.current = true;
            addDrop(e.clientX, e.clientY, 200, 2);
        };

        const handleMouseMove = (e) => {
            if (pointerDown.current) {
                addDrop(e.clientX, e.clientY, 80, 1);
            }
        };

        const handleMouseUp = () => { pointerDown.current = false; };

        const handleTouchStart = (e) => {
            pointerDown.current = true;
            addDrop(e.touches[0].clientX, e.touches[0].clientY, 200, 2);
        };
        const handleTouchMove = (e) => {
            if (pointerDown.current) addDrop(e.touches[0].clientX, e.touches[0].clientY, 80, 1);
        };

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchend', handleMouseUp);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleMouseUp);
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
                pointerEvents: 'none',
                zIndex: 999999,
            }}
        />
    );
};

export default ClickRippleEffect;
