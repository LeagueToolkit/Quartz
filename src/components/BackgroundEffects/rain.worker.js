const RAIN_TINT = { r: 106, g: 190, b: 255 };

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let count = 0;
let running = false;
let timerId = null;
let lastRender = 0;
let lastTime = 0;
let frameTimeMs = 1000 / 30;

let x = null;
let y = null;
let len = null;
let speed = null;
let wind = null;
let alpha = null;

const hasWorkerRaf =
  typeof self.requestAnimationFrame === 'function' && typeof self.cancelAnimationFrame === 'function';

const scheduleNextFrame = () => {
  if (!running) return;
  if (hasWorkerRaf) {
    timerId = self.requestAnimationFrame(frame);
    return;
  }
  timerId = self.setTimeout(() => frame(performance.now()), Math.max(4, Math.floor(frameTimeMs)));
};

const randomRange = (min, max) => min + Math.random() * (max - min);
const dropCountForSize = (w, h) => Math.max(80, Math.floor((w * h) / 12000));

const initDrop = (i, fromTop) => {
  x[i] = Math.random() * (width + 120) - 60;
  y[i] = fromTop ? -(Math.random() * height * 0.15) : Math.random() * height;
  len[i] = randomRange(10, 24);
  speed[i] = randomRange(16, 30);
  wind[i] = randomRange(0.25, 0.75);
  alpha[i] = randomRange(0.16, 0.44);
};

const rebuild = () => {
  count = dropCountForSize(width, height);
  x = new Float32Array(count);
  y = new Float32Array(count);
  len = new Float32Array(count);
  speed = new Float32Array(count);
  wind = new Float32Array(count);
  alpha = new Float32Array(count);
  for (let i = 0; i < count; i += 1) initDrop(i, false);
};

const frame = (now) => {
  if (!running || !ctx) return;
  if (hasWorkerRaf && now - lastRender < frameTimeMs) {
    scheduleNextFrame();
    return;
  }

  const dt = Math.min(40, now - lastTime) / 16.67;
  lastTime = now;
  lastRender = now;

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';

  for (let i = 0; i < count; i += 1) {
    y[i] += speed[i] * dt;
    x[i] += wind[i] * dt;

    if (y[i] > height + 16 || x[i] > width + 70) {
      initDrop(i, true);
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(x[i], y[i]);
    ctx.lineTo(x[i] - wind[i] * 2.5, y[i] - len[i]);
    ctx.strokeStyle = `rgba(${RAIN_TINT.r}, ${RAIN_TINT.g}, ${RAIN_TINT.b}, ${alpha[i]})`;
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  scheduleNextFrame();
};

const start = () => {
  if (running) return;
  running = true;
  lastRender = 0;
  lastTime = performance.now();
  scheduleNextFrame();
};

const stop = () => {
  running = false;
  if (timerId !== null) {
    if (hasWorkerRaf) self.cancelAnimationFrame(timerId);
    else self.clearTimeout(timerId);
    timerId = null;
  }
};

self.onmessage = (event) => {
  const { type, payload } = event.data || {};

  if (type === 'init') {
    canvas = payload.canvas;
    ctx = canvas.getContext('2d');
    width = payload.width;
    height = payload.height;
    canvas.width = width;
    canvas.height = height;
    frameTimeMs = 1000 / (payload.targetFps || 30);
    rebuild();
    start();
    return;
  }

  if (type === 'resize') {
    width = payload.width;
    height = payload.height;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    rebuild();
    return;
  }

  if (type === 'destroy') {
    stop();
    canvas = null;
    ctx = null;
  }
};
