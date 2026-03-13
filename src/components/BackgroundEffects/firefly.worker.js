const DEFAULT_PRIMARY = { r: 236, g: 185, b: 106 };
const DEFAULT_SECONDARY = { r: 192, g: 132, b: 252 };

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let count = 0;
let running = false;
let timerId = null;
let lastRender = 0;
let frameTimeMs = 1000 / 30;

let primary = { ...DEFAULT_PRIMARY };
let secondary = { ...DEFAULT_SECONDARY };

let x = null;
let y = null;
let size = null;
let speedX = null;
let speedY = null;
let opacity = null;
let pulseSpeed = null;
let colorType = null;

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

const setColors = (payload) => {
  primary = payload?.primary || DEFAULT_PRIMARY;
  secondary = payload?.secondary || DEFAULT_SECONDARY;
};

const initFirefly = (i) => {
  x[i] = Math.random() * width;
  y[i] = Math.random() * height;
  size[i] = randomRange(1, 3);
  speedX[i] = randomRange(-0.25, 0.25);
  speedY[i] = randomRange(-0.25, 0.25);
  opacity[i] = Math.random();
  pulseSpeed[i] = randomRange(0.01, 0.03);
  colorType[i] = Math.random() > 0.5 ? 1 : 0;
};

const rebuild = (nextCount = 50) => {
  count = nextCount;
  x = new Float32Array(count);
  y = new Float32Array(count);
  size = new Float32Array(count);
  speedX = new Float32Array(count);
  speedY = new Float32Array(count);
  opacity = new Float32Array(count);
  pulseSpeed = new Float32Array(count);
  colorType = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) initFirefly(i);
};

const frame = (timestamp) => {
  if (!running || !ctx) return;
  if (hasWorkerRaf && timestamp - lastRender < frameTimeMs) {
    scheduleNextFrame();
    return;
  }
  lastRender = timestamp;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < count; i += 1) {
    x[i] += speedX[i];
    y[i] += speedY[i];

    if (x[i] < 0) x[i] = width;
    if (x[i] > width) x[i] = 0;
    if (y[i] < 0) y[i] = height;
    if (y[i] > height) y[i] = 0;

    opacity[i] += pulseSpeed[i];
    if (opacity[i] > 1 || opacity[i] < 0.2) pulseSpeed[i] = -pulseSpeed[i];

    const tint = colorType[i] === 1 ? primary : secondary;
    const a = Math.abs(opacity[i]) * 0.8;

    ctx.beginPath();
    ctx.arc(x[i], y[i], size[i], 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${a})`;
    ctx.shadowBlur = 15;
    ctx.shadowColor = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.8)`;
    ctx.fill();
  }

  scheduleNextFrame();
};

const start = () => {
  if (running) return;
  running = true;
  lastRender = 0;
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
    setColors(payload.colors);
    rebuild(payload.count || 50);
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
    return;
  }

  if (type === 'colors') {
    setColors(payload);
    return;
  }

  if (type === 'destroy') {
    stop();
    canvas = null;
    ctx = null;
  }
};
