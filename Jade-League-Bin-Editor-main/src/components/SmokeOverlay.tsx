import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    decay: number;
    growth: number;
    wobbleOffset: number;
    blobOffsets: number[];
    rotation: number;
    rotSpeed: number;
}

interface SmokeOverlayProps {
    active: boolean;
}

function drawBlobParticle(
    ctx: CanvasRenderingContext2D,
    p: Particle
) {
    const verts = p.blobOffsets.length;
    const points: [number, number][] = p.blobOffsets.map((offset, i) => {
        const angle = p.rotation + (i / verts) * Math.PI * 2;
        const r = p.size * offset;
        return [p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r];
    });

    ctx.beginPath();
    const last = points[verts - 1];
    const first = points[0];
    ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    for (let i = 0; i < verts; i++) {
        const curr = points[i];
        const next = points[(i + 1) % verts];
        ctx.quadraticCurveTo(
            curr[0], curr[1],
            (curr[0] + next[0]) / 2,
            (curr[1] + next[1]) / 2
        );
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.3);
    grad.addColorStop(0,   `rgba(110, 105, 100, ${p.opacity})`);
    grad.addColorStop(0.5, `rgba(90,  88,  85,  ${p.opacity * 0.55})`);
    grad.addColorStop(1,   `rgba(70,  68,  65,  0)`);
    ctx.fillStyle = grad;
    ctx.fill();
}

export default function SmokeOverlay({ active }: SmokeOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number | null>(null);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        if (!active) {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            particlesRef.current = [];
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const spawnParticle = (): Particle => {
            const numVerts = 7 + Math.floor(Math.random() * 5);
            const blobOffsets = Array.from({ length: numVerts }, () => 0.45 + Math.random() * 1.0);
            return {
                x: Math.random() * canvas.width,
                y: canvas.height + 25,
                vx: (Math.random() - 0.5) * 0.7,
                vy: -(Math.random() * 1.1 + 0.55),
                size: Math.random() * 45 + 25,
                opacity: Math.random() * 0.28 + 0.14,
                decay: Math.random() * 0.0005 + 0.0007,
                growth: Math.random() * 0.55 + 0.2,
                wobbleOffset: Math.random() * Math.PI * 2,
                blobOffsets,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.006,
            };
        };

        const MAX_PARTICLES = 80;
        let frameCount = 0;

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Spawn one particle every 3 frames
            if (frameCount % 3 === 0 && particlesRef.current.length < MAX_PARTICLES) {
                particlesRef.current.push(spawnParticle());
            }
            frameCount++;

            particlesRef.current = particlesRef.current.filter(p => p.opacity > 0);

            const now = Date.now() * 0.001;
            ctx.filter = 'blur(6px)';

            for (const p of particlesRef.current) {
                p.x += p.vx + Math.sin(now * 0.7 + p.wobbleOffset + p.y * 0.006) * 0.5;
                p.y += p.vy;
                p.size += p.growth;
                p.opacity -= p.decay;
                p.rotation += p.rotSpeed;

                drawBlobParticle(ctx, p);
            }

            ctx.filter = 'none';
            animFrameRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            particlesRef.current = [];
        };
    }, [active]);

    if (!active) return null;

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
                zIndex: 9999,
            }}
        />
    );
}
