const SPAWN_MARGIN = 36;
const DEFAULT_PRIMARY = { r: 120, g: 200, b: 255 };
const DEFAULT_SECONDARY = { r: 143, g: 212, b: 255 };

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let count = 0;
let running = false;
let timerId = null;
let lastRender = 0;
let frameTimeMs = 1000 / 60;
let spawnCursor = 0;

let primary = { ...DEFAULT_PRIMARY };
let secondary = { ...DEFAULT_SECONDARY };

let x = null;
let y = null;
let radius = null;
let speed = null;
let driftVelocity = null;
let driftTurnRate = null;
let driftMax = null;
let driftFrequency = null;
let driftPhase = null;
let alpha = null;
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
const bubbleCountForSize = (w, h) => Math.max(12, Math.floor((w * h) / 100000));

const setColors = (payload) => {
  primary = payload?.primary || DEFAULT_PRIMARY;
  secondary = payload?.secondary || DEFAULT_SECONDARY;
};

const createSpawnX = () => {
  const segments = 8;
  const totalWidth = width + SPAWN_MARGIN * 2;
  const segmentWidth = totalWidth / segments;
  const segmentIndex = spawnCursor % segments;
  spawnCursor += 1;
  return -SPAWN_MARGIN + segmentIndex * segmentWidth + Math.random() * segmentWidth;
};

const initBubble = (i) => {
  const r = randomRange(4, 10);
  x[i] = createSpawnX();
  y[i] = height + r + Math.random() * height * 0.25;
  radius[i] = r;
  speed[i] = randomRange(0.35, 0.95);
  driftVelocity[i] = 0;
  driftTurnRate[i] = randomRange(0.012, 0.04);
  driftMax[i] = randomRange(0.12, 0.46);
  driftFrequency[i] = randomRange(0.00014, 0.00042);
  driftPhase[i] = Math.random() * Math.PI * 2;
  alpha[i] = randomRange(0.13, 0.29);
  colorType[i] = Math.random() > 0.5 ? 1 : 0;
};

const rebuild = () => {
  count = bubbleCountForSize(width, height);
  spawnCursor = 0;
  x = new Float32Array(count);
  y = new Float32Array(count);
  radius = new Float32Array(count);
  speed = new Float32Array(count);
  driftVelocity = new Float32Array(count);
  driftTurnRate = new Float32Array(count);
  driftMax = new Float32Array(count);
  driftFrequency = new Float32Array(count);
  driftPhase = new Float32Array(count);
  alpha = new Float32Array(count);
  colorType = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) initBubble(i);
};

const drawBubble = (i, tick) => {
  const tint = colorType[i] === 1 ? primary : secondary;
  const px = x[i];
  const py = y[i];
  const r = radius[i];
  const outerAlpha = alpha[i];
  const innerAlpha = Math.min(1, outerAlpha + 0.18);

  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${outerAlpha})`;
  ctx.lineWidth = 1.2;
  ctx.shadowBlur = 4;
  ctx.shadowColor = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${outerAlpha})`;
  ctx.stroke();

  const grad = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, 0, px, py, r);
  grad.addColorStop(0, `rgba(255,255,255,${innerAlpha * 0.55})`);
  grad.addColorStop(0.55, `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${outerAlpha * 0.25})`);
  grad.addColorStop(1, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px - r * 0.32, py - r * 0.3, Math.max(1.2, r * 0.16), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${innerAlpha * 0.65})`;
  ctx.shadowBlur = 0;
  ctx.fill();
};

const frame = (tick) => {
  if (!running || !ctx) return;
  if (hasWorkerRaf && tick - lastRender < frameTimeMs) {
    scheduleNextFrame();
    return;
  }
  lastRender = tick;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < count; i += 1) {
    y[i] -= speed[i];
    const driftTarget = Math.sin(tick * driftFrequency[i] + driftPhase[i]) * driftMax[i];
    driftVelocity[i] += (driftTarget - driftVelocity[i]) * driftTurnRate[i];
    x[i] += driftVelocity[i];

    if (x[i] < -SPAWN_MARGIN) x[i] = width + SPAWN_MARGIN;
    if (x[i] > width + SPAWN_MARGIN) x[i] = -SPAWN_MARGIN;
    if (y[i] + radius[i] < -10) {
      initBubble(i);
      continue;
    }
    drawBubble(i, tick);
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
    frameTimeMs = 1000 / (payload.targetFps || 60);
    setColors(payload.colors);
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
