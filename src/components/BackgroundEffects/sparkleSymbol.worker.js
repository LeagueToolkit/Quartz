const DEFAULT_COLOR = { r: 210, g: 235, b: 255 };

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let count = 0;
let running = false;
let timerId = null;
let lastRender = 0;
let frameTimeMs = 1000 / 20;

let colorR = DEFAULT_COLOR.r;
let colorG = DEFAULT_COLOR.g;
let colorB = DEFAULT_COLOR.b;

let x = null;
let y = null;
let size = null;
let speedX = null;
let speedY = null;
let pulse = null;
let pulseSpeed = null;
let alpha = null;
let outline = null;

const symbolCountForSize = (w, h) => Math.max(24, Math.floor((w * h) / 52000));

const setColor = (next) => {
  colorR = Number.isFinite(next?.r) ? next.r : DEFAULT_COLOR.r;
  colorG = Number.isFinite(next?.g) ? next.g : DEFAULT_COLOR.g;
  colorB = Number.isFinite(next?.b) ? next.b : DEFAULT_COLOR.b;
};

const randomRange = (min, max) => min + Math.random() * (max - min);

const initSymbol = (index, spawnAbove) => {
  const s = randomRange(7, 21);
  x[index] = Math.random() * width;
  y[index] = spawnAbove ? -s - Math.random() * 120 : Math.random() * height;
  size[index] = s;
  speedY[index] = randomRange(0.08, 0.4);
  speedX[index] = randomRange(-0.11, 0.11);
  pulse[index] = Math.random() * Math.PI * 2;
  pulseSpeed[index] = randomRange(0.006, 0.026);
  alpha[index] = randomRange(0.2, 0.56);
  outline[index] = Math.random() > 0.55 ? 1 : 0;
};

const rebuildSymbols = () => {
  count = symbolCountForSize(width, height);

  x = new Float32Array(count);
  y = new Float32Array(count);
  size = new Float32Array(count);
  speedX = new Float32Array(count);
  speedY = new Float32Array(count);
  pulse = new Float32Array(count);
  pulseSpeed = new Float32Array(count);
  alpha = new Float32Array(count);
  outline = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) {
    initSymbol(i, false);
  }
};

const drawSparkle = (px, py, s, a, isOutline) => {
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(px, py - s);
  ctx.quadraticCurveTo(px + s * 0.1, py - s * 0.1, px + s, py);
  ctx.quadraticCurveTo(px + s * 0.1, py + s * 0.1, px, py + s);
  ctx.quadraticCurveTo(px - s * 0.1, py + s * 0.1, px - s, py);
  ctx.quadraticCurveTo(px - s * 0.1, py - s * 0.1, px, py - s);
  ctx.closePath();

  if (isOutline) {
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.stroke();
  } else {
    ctx.fill();
  }
};

const frame = (timestamp) => {
  if (!running || !ctx) return;

  if (timestamp - lastRender < frameTimeMs) {
    scheduleNextFrame();
    return;
  }
  lastRender = timestamp;

  ctx.clearRect(0, 0, width, height);
  const rgb = `rgb(${colorR}, ${colorG}, ${colorB})`;
  ctx.fillStyle = rgb;
  ctx.strokeStyle = rgb;

  for (let i = 0; i < count; i += 1) {
    y[i] += speedY[i];
    x[i] += speedX[i];
    pulse[i] += pulseSpeed[i];

    if (y[i] - size[i] > height + 20 || x[i] < -30 || x[i] > width + 30) {
      initSymbol(i, true);
      continue;
    }

    const pulseScale = 0.78 + (Math.sin(pulse[i]) * 0.22 + 0.22);
    const s = size[i] * pulseScale;
    const a = alpha[i] * (0.65 + pulseScale * 0.35);
    drawSparkle(x[i], y[i], s, a, outline[i] === 1);
  }

  ctx.globalAlpha = 1;
  scheduleNextFrame();
};

const hasWorkerRaf =
  typeof self.requestAnimationFrame === 'function' && typeof self.cancelAnimationFrame === 'function';

const scheduleNextFrame = () => {
  if (!running) return;
  if (hasWorkerRaf) {
    timerId = self.requestAnimationFrame(frame);
    return;
  }
  timerId = self.setTimeout(() => frame(performance.now()), 16);
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
    if (hasWorkerRaf) {
      self.cancelAnimationFrame(timerId);
    } else {
      self.clearTimeout(timerId);
    }
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
    frameTimeMs = 1000 / (payload.targetFps || 20);
    setColor(payload.color || DEFAULT_COLOR);
    rebuildSymbols();
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
    rebuildSymbols();
    return;
  }

  if (type === 'color') {
    setColor(payload || DEFAULT_COLOR);
    return;
  }

  if (type === 'destroy') {
    stop();
    canvas = null;
    ctx = null;
  }
};
