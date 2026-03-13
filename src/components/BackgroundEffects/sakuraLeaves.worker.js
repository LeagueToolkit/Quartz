const SPAWN_MARGIN = 40;
const BASE_COLORS = [
  { r: 255, g: 198, b: 213 }, // pink
  { r: 255, g: 221, b: 238 }, // soft pink
  { r: 255, g: 244, b: 248 }, // light petal
];

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let count = 0;
let running = false;
let timerId = null;
let lastRender = 0;
let frameTimeMs = 1000 / 60;
let lastTime = 0;
let spawnCursor = 0;

let x = null;
let y = null;
let size = null;
let speedY = null;
let driftX = null;
let swayAmp = null;
let swayFreq = null;
let swayPhase = null;
let rotation = null;
let rotationSpeed = null;
let alpha = null;
let colorIndex = null;

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
const particleCountForSize = (w, h) => Math.max(16, Math.floor((w * h) / 120000));

const createSpawnX = () => {
  const segments = 10;
  const totalWidth = width + SPAWN_MARGIN * 2;
  const segmentWidth = totalWidth / segments;
  const segmentIndex = spawnCursor % segments;
  spawnCursor += 1;
  return -SPAWN_MARGIN + segmentIndex * segmentWidth + Math.random() * segmentWidth;
};

const initPetal = (i, startAbove) => {
  const s = randomRange(7, 15);
  x[i] = createSpawnX();
  y[i] = startAbove ? -(Math.random() * height * 0.35) - s : Math.random() * height;
  size[i] = s;
  speedY[i] = randomRange(0.6, 1.45);
  driftX[i] = randomRange(-0.55, 0.55);
  swayAmp[i] = randomRange(4, 13);
  swayFreq[i] = randomRange(0.0007, 0.0022);
  swayPhase[i] = Math.random() * Math.PI * 2;
  rotation[i] = Math.random() * Math.PI * 2;
  rotationSpeed[i] = randomRange(0.00045, 0.0022) * (Math.random() > 0.5 ? 1 : -1);
  alpha[i] = randomRange(0.26, 0.62);
  colorIndex[i] = Math.floor(Math.random() * BASE_COLORS.length);
};

const rebuild = () => {
  count = particleCountForSize(width, height);
  spawnCursor = 0;

  x = new Float32Array(count);
  y = new Float32Array(count);
  size = new Float32Array(count);
  speedY = new Float32Array(count);
  driftX = new Float32Array(count);
  swayAmp = new Float32Array(count);
  swayFreq = new Float32Array(count);
  swayPhase = new Float32Array(count);
  rotation = new Float32Array(count);
  rotationSpeed = new Float32Array(count);
  alpha = new Float32Array(count);
  colorIndex = new Uint8Array(count);

  for (let i = 0; i < count; i += 1) initPetal(i, false);
};

const drawPetal = (i) => {
  const px = x[i];
  const py = y[i];
  const s = size[i];
  const a = alpha[i];
  const tint = BASE_COLORS[colorIndex[i] % BASE_COLORS.length];

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rotation[i]);

  // Sakura-like petal silhouette
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.85, -s * 0.65, s * 0.9, s * 0.12, 0, s);
  ctx.bezierCurveTo(-s * 0.9, s * 0.12, -s * 0.85, -s * 0.65, 0, -s);
  ctx.closePath();
  ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${a})`;
  ctx.fill();

  // Inner crease
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.62);
  ctx.lineTo(0, s * 0.68);
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.28})`;
  ctx.lineWidth = 0.85;
  ctx.stroke();

  ctx.restore();
};

const frame = (timestamp) => {
  if (!running || !ctx) return;
  if (hasWorkerRaf && timestamp - lastRender < frameTimeMs) {
    scheduleNextFrame();
    return;
  }

  const dt = Math.min(33, timestamp - lastTime);
  lastTime = timestamp;
  lastRender = timestamp;
  const driftScale = dt / 16.67;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < count; i += 1) {
    y[i] += speedY[i] * driftScale;
    x[i] += driftX[i] * driftScale;
    x[i] += Math.sin(timestamp * swayFreq[i] + swayPhase[i]) * (swayAmp[i] * 0.03);
    rotation[i] += rotationSpeed[i] * dt;

    if (y[i] - size[i] > height + 14 || x[i] < -SPAWN_MARGIN || x[i] > width + SPAWN_MARGIN) {
      initPetal(i, true);
      continue;
    }

    drawPetal(i);
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
    frameTimeMs = 1000 / (payload.targetFps || 60);
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
