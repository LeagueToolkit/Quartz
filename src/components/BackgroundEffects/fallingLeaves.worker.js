const DEFAULT_ACCENT = { r: 210, g: 139, b: 42 };
const SPAWN_MARGIN = 36;

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
let accent = { ...DEFAULT_ACCENT };

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

const symbolCountForSize = (w, h) => Math.max(14, Math.floor((w * h) / 110000));

const createSpawnX = () => {
  const segments = 8;
  const totalWidth = width + SPAWN_MARGIN * 2;
  const segmentWidth = totalWidth / segments;
  const segmentIndex = spawnCursor % segments;
  spawnCursor += 1;
  return -SPAWN_MARGIN + segmentIndex * segmentWidth + Math.random() * segmentWidth;
};

const initLeaf = (i, startAbove) => {
  const s = randomRange(7, 16);
  x[i] = createSpawnX();
  y[i] = startAbove ? -(Math.random() * height * 0.35) - s : Math.random() * height;
  size[i] = s;
  speedY[i] = randomRange(0.8, 1.8);
  driftX[i] = randomRange(-0.6, 0.6);
  swayAmp[i] = randomRange(4, 14);
  swayFreq[i] = randomRange(0.0008, 0.0024);
  swayPhase[i] = Math.random() * Math.PI * 2;
  rotation[i] = Math.random() * Math.PI * 2;
  rotationSpeed[i] = randomRange(0.0006, 0.0024) * (Math.random() > 0.5 ? 1 : -1);
  alpha[i] = randomRange(0.24, 0.57);
};

const rebuild = () => {
  count = symbolCountForSize(width, height);
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

  for (let i = 0; i < count; i += 1) initLeaf(i, false);
};

const drawLeaf = (i) => {
  const px = x[i];
  const py = y[i];
  const s = size[i];
  const a = alpha[i];

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rotation[i]);
  ctx.scale(1, 0.78);

  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.95, -s * 0.35, s * 0.85, s * 0.45);
  ctx.quadraticCurveTo(s * 0.2, s * 0.95, 0, s);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.95, -s * 0.85, s * 0.45);
  ctx.quadraticCurveTo(-s * 0.95, -s * 0.35, 0, -s);
  ctx.closePath();
  ctx.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a})`;
  ctx.shadowBlur = 0;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -s * 0.7);
  ctx.lineTo(0, s * 0.75);
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.34})`;
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

    if (y[i] - size[i] > height + 12 || x[i] < -SPAWN_MARGIN || x[i] > width + SPAWN_MARGIN) {
      initLeaf(i, true);
      continue;
    }

    drawLeaf(i);
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
    accent = payload.accent || DEFAULT_ACCENT;
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

  if (type === 'accent') {
    accent = payload || DEFAULT_ACCENT;
    return;
  }

  if (type === 'destroy') {
    stop();
    canvas = null;
    ctx = null;
  }
};
