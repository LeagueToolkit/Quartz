// starfield.worker.js
// Runs entirely off the main thread — simulation + draw calls happen here

let canvas = null;
let ctx = null;
let running = false;
let rafId = null;
let lastTime = 0;
let idleTimer = null;

// Flat typed arrays — cache-friendly, no object overhead
let starX        = null; // base left % positions
let starY        = null; // base top % positions
let starSize     = null;
let starDepth    = null;
let starPhase    = null; // twinkle phase
let starSpeed    = null; // twinkle speed
let count        = 0;

// Shared mouse state
let mouseLerpX = 0;
let mouseLerpY = 0;
let mouseTargetX = 0;
let mouseTargetY = 0;

// Pre-rendered star sprite (drawn once, reused every frame)
let starSprite = null;
const SPRITE_SIZE = 8; // px — covers max star diameter with glow

function buildSprite() {
    const offscreen = new OffscreenCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const sctx = offscreen.getContext('2d');
    const cx = SPRITE_SIZE / 2;
    const cy = SPRITE_SIZE / 2;
    const gradient = sctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    starSprite = offscreen;
}

function initStars(n) {
    count = n;
    starX     = new Float32Array(n);
    starY     = new Float32Array(n);
    starSize  = new Float32Array(n);
    starDepth = new Float32Array(n);
    starPhase = new Float32Array(n);
    starSpeed = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        starX[i]     = Math.random();
        starY[i]     = Math.random();
        starSize[i]  = Math.random() * 1.5 + 1;
        starDepth[i] = Math.random() * 0.5 + 0.3;
        starPhase[i] = Math.random() * Math.PI * 2;
        starSpeed[i] = 0.3 + Math.random() * 0.7;
    }
}

function loop(timestamp) {
    if (!running) return;

    const dt = lastTime === 0 ? 0.016 : Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    // Lerp mouse
    const dx = mouseTargetX - mouseLerpX;
    const dy = mouseTargetY - mouseLerpY;
    if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
        mouseLerpX += dx * 0.1;
        mouseLerpY += dy * 0.1;
    }

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < count; i++) {
        starPhase[i] += starSpeed[i] * dt;

        const opacity = 0.2 + 0.15 * Math.sin(starPhase[i]);
        const moveX   = mouseLerpX * starDepth[i] * 20;
        const moveY   = mouseLerpY * starDepth[i] * 20;

        const x = starX[i] * w + moveX;
        const y = starY[i] * h + moveY;
        const s = starSize[i];

        // drawImage is GPU-blitted — much cheaper than arc() per star
        ctx.globalAlpha = opacity;
        ctx.drawImage(starSprite, x - s, y - s, s * 2, s * 2);
    }

    ctx.globalAlpha = 1;

    rafId = requestAnimationFrame(loop);
}

function startLoop() {
    if (running) return;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
}

function stopLoop() {
    running = false;
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    lastTime = 0;
}

function resetIdleTimer() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stopLoop(), 2000);
}

// Message handler — main thread sends commands here
self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init': {
            canvas = payload.canvas; // transferred OffscreenCanvas
            ctx = canvas.getContext('2d');
            canvas.width = payload.width;
            canvas.height = payload.height;
            buildSprite();
            initStars(payload.count || 150);
            startLoop();
            resetIdleTimer();
            break;
        }
        case 'resize': {
            if (canvas) {
                canvas.width = payload.width;
                canvas.height = payload.height;
            }
            break;
        }
        case 'mousemove': {
            mouseTargetX = payload.x;
            mouseTargetY = payload.y;
            startLoop();
            resetIdleTimer();
            break;
        }
        case 'destroy': {
            stopLoop();
            if (idleTimer !== null) clearTimeout(idleTimer);
            break;
        }
    }
};
