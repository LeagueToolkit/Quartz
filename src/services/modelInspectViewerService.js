import * as THREE from 'three';
import { SKN } from '../jsritofile/skn.js';
import { SKL } from '../jsritofile/skl.js';

const getNodePath = () => {
  if (typeof window !== 'undefined' && window.require) {
    return window.require('path');
  }
  return null;
};

const resolveInRoot = (root, relative) => {
  const path = getNodePath();
  if (!path) {
    throw new Error('Node path module unavailable in renderer');
  }
  return path.join(root, String(relative || ''));
};

const toArray3 = (v, fallback = [0, 0, 0]) => [v?.x ?? fallback[0], v?.y ?? fallback[1], v?.z ?? fallback[2]];
const toArray2 = (v, fallback = [0, 0]) => [v?.x ?? fallback[0], v?.y ?? fallback[1]];

const toQuat = (v, fallback = [0, 0, 0, 1]) => [v?.x ?? fallback[0], v?.y ?? fallback[1], v?.z ?? fallback[2], v?.w ?? fallback[3]];
const normalizeMaterialName = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const elfHash = (name) => {
  let hash = 0;
  const lower = String(name || '').toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    hash = ((hash << 4) + lower.charCodeAt(i)) >>> 0;
    const high = hash & 0xF0000000;
    if (high !== 0) hash ^= high >>> 24;
    hash &= ~high;
  }
  return hash >>> 0;
};

const buildSkeletonWorldPositions = (joints) => {
  const worldById = new Map();
  const byId = new Map(joints.map((j) => [j.id, j]));
  const sorted = [...joints].sort((a, b) => a.id - b.id);

  for (const joint of sorted) {
    const t = joint.localTranslate || { x: 0, y: 0, z: 0 };
    const r = joint.localRotate || { x: 0, y: 0, z: 0, w: 1 };
    const s = joint.localScale || { x: 1, y: 1, z: 1 };

    const local = new THREE.Matrix4();
    local.compose(
      new THREE.Vector3(t.x, t.y, t.z),
      new THREE.Quaternion(r.x, r.y, r.z, r.w),
      new THREE.Vector3(s.x, s.y, s.z)
    );

    let world = local;
    if (joint.parent >= 0 && worldById.has(joint.parent)) {
      world = new THREE.Matrix4().multiplyMatrices(worldById.get(joint.parent), local);
    }
    worldById.set(joint.id, world);
  }

  return {
    byId,
    worldById,
  };
};

const buildSkeletonSegmentsFromWorld = (joints, worldById) => {
  const pointsById = new Map();
  for (const joint of joints) {
    const world = worldById.get(joint.id);
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(world || new THREE.Matrix4());
    pointsById.set(joint.id, [pos.x, pos.y, pos.z]);
  }

  const segments = [];
  for (const joint of joints) {
    if (joint.parent < 0) continue;
    const a = pointsById.get(joint.id);
    const b = pointsById.get(joint.parent);
    if (!a || !b) continue;
    segments.push([...a, ...b]);
  }
  return segments;
};

const getAnmCtor = () => {
  if (typeof window === 'undefined' || !window.require) return null;
  try {
    // Narrow import to ANM format runtime only.
    const mod = window.require('ts-ritofile/dist/formats/anm.js');
    return mod?.ANM || null;
  } catch {
    return null;
  }
};

export const loadSknModelBundle = async ({ filesDir, sknRelativePath }) => {
  if (!filesDir || !sknRelativePath) {
    throw new Error('Missing filesDir or sknRelativePath');
  }

  const sknPath = resolveInRoot(filesDir, sknRelativePath);
  const skn = new SKN();
  skn.read(sknPath);

  const vertexCount = skn.vertices.length;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const boneIndices = new Uint16Array(vertexCount * 4);
  const boneWeights = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const v = skn.vertices[i];
    const p = toArray3(v.position);
    const n = toArray3(v.normal, [0, 1, 0]);
    const uv = toArray2(v.uv);

    positions[i * 3 + 0] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];

    normals[i * 3 + 0] = n[0];
    normals[i * 3 + 1] = n[1];
    normals[i * 3 + 2] = n[2];

    uvs[i * 2 + 0] = uv[0];
    uvs[i * 2 + 1] = uv[1];

    const inf = Array.isArray(v.influences) ? v.influences : [0, 0, 0, 0];
    const w = Array.isArray(v.weights) ? v.weights : [1, 0, 0, 0];
    boneIndices[i * 4 + 0] = Number(inf[0] || 0);
    boneIndices[i * 4 + 1] = Number(inf[1] || 0);
    boneIndices[i * 4 + 2] = Number(inf[2] || 0);
    boneIndices[i * 4 + 3] = Number(inf[3] || 0);
    boneWeights[i * 4 + 0] = Number(w[0] || 0);
    boneWeights[i * 4 + 1] = Number(w[1] || 0);
    boneWeights[i * 4 + 2] = Number(w[2] || 0);
    boneWeights[i * 4 + 3] = Number(w[3] || 0);
  }

  const indices = Uint32Array.from(skn.indices || []);

  const submeshes = (skn.submeshes || []).map((s, idx) => ({
    id: `${s.name || 'Submesh'}_${idx}`,
    name: s.name || `Submesh ${idx + 1}`,
    vertexStart: s.vertexStart || 0,
    vertexCount: s.vertexCount || 0,
    indexStart: s.indexStart || 0,
    indexCount: s.indexCount || 0,
  }));

  let skeleton = null;
  try {
    const sklRelativePath = sknRelativePath.replace(/\.skn$/i, '.skl');
    const sklPath = resolveInRoot(filesDir, sklRelativePath);
    const skl = new SKL();
    skl.read(sklPath);

    const joints = (skl.joints || []).map((j) => ({
      id: j.id,
      name: j.name,
      parent: j.parent,
      localTranslate: j.localTranslate,
      localRotate: j.localRotate,
      localScale: j.localScale,
      ibindTranslate: j.ibindTranslate,
      ibindRotate: j.ibindRotate,
      ibindScale: j.ibindScale,
    }));

    const { worldById } = buildSkeletonWorldPositions(joints);
    const segments = buildSkeletonSegmentsFromWorld(joints, worldById);
    const hashToJointId = {};
    for (const joint of joints) {
      hashToJointId[elfHash(joint.name)] = joint.id;
    }

    skeleton = {
      jointCount: joints.length,
      joints,
      segments,
      hashToJointId,
      influences: Array.isArray(skl.influences) ? skl.influences.map((v) => Number(v)) : [],
    };
  } catch (_) {
    // SKL may be missing; that's valid for some assets.
  }

  return {
    sknRelativePath,
    positions,
    normals,
    uvs,
    boneIndices,
    boneWeights,
    indices,
    submeshes,
    skeleton,
    vertexCount,
    triangleCount: Math.floor(indices.length / 3),
  };
};

export const evaluateSkinningMatrices = ({ skeleton, animation, timeSeconds }) => {
  if (!skeleton?.joints?.length) return null;

  const poseByJointId = new Map();
  if (animation?.tracks?.length) {
    const durationFrames = Math.max(1, animation.durationFrames || 1);
    const fps = Math.max(1, animation.fps || 30);
    const frame = ((Math.floor(timeSeconds * fps) % durationFrames) + durationFrames) % durationFrames;
    for (const track of animation.tracks) {
      const jointId = skeleton.hashToJointId?.[track.jointHash];
      if (jointId == null) continue;
      const pose = track.frames[frame];
      if (!pose) continue;
      poseByJointId.set(jointId, pose);
    }
  }

  const worldById = new Map();
  const sorted = [...skeleton.joints].sort((a, b) => a.id - b.id);
  for (const joint of sorted) {
    const baseT = toArray3(joint.localTranslate);
    const baseR = toQuat(joint.localRotate);
    const baseS = toArray3(joint.localScale, [1, 1, 1]);
    const pose = poseByJointId.get(joint.id);

    const t = pose?.translate || baseT;
    const r = pose?.rotate || baseR;
    const s = pose?.scale || baseS;

    const local = new THREE.Matrix4();
    local.compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion(r[0], r[1], r[2], r[3]),
      new THREE.Vector3(s[0], s[1], s[2])
    );

    let world = local;
    if (joint.parent >= 0 && worldById.has(joint.parent)) {
      world = new THREE.Matrix4().multiplyMatrices(worldById.get(joint.parent), local);
    }
    worldById.set(joint.id, world);
  }

  const skinByJointId = new Map();
  for (const joint of skeleton.joints) {
    const world = worldById.get(joint.id);
    if (!world) continue;

    const ibt = toArray3(joint.ibindTranslate, [0, 0, 0]);
    const ibr = toQuat(joint.ibindRotate, [0, 0, 0, 1]);
    const ibs = toArray3(joint.ibindScale, [1, 1, 1]);
    const invBind = new THREE.Matrix4();
    invBind.compose(
      new THREE.Vector3(ibt[0], ibt[1], ibt[2]),
      new THREE.Quaternion(ibr[0], ibr[1], ibr[2], ibr[3]),
      new THREE.Vector3(ibs[0], ibs[1], ibs[2])
    );

    skinByJointId.set(joint.id, new THREE.Matrix4().multiplyMatrices(world, invBind));
  }

  return skinByJointId;
};

const toLocalFileUrl = (absolutePath) => `local-file://${String(absolutePath || '').replace(/\\/g, '/')}`;

const resolveTextureByHint = ({ filesDir, textureFiles = [], hintPath }) => {
  if (!hintPath) return null;
  const path = getNodePath();
  const fs = (typeof window !== 'undefined' && window.require) ? window.require('fs') : null;
  if (!path || !fs) return null;

  const normalizedHint = String(hintPath).replace(/\\/g, '/').toLowerCase();
  const hintBase = path.basename(normalizedHint);

  // 1) Exact relative match from extracted file list
  const exactRel = textureFiles.find((rel) => String(rel).replace(/\\/g, '/').toLowerCase() === normalizedHint);
  if (exactRel) {
    const abs = resolveInRoot(filesDir, exactRel);
    if (fs.existsSync(abs)) return abs;
  }

  // 2) Ends-with path match
  const endsWithRel = textureFiles.find((rel) => normalizedHint.endsWith(String(rel).replace(/\\/g, '/').toLowerCase()));
  if (endsWithRel) {
    const abs = resolveInRoot(filesDir, endsWithRel);
    if (fs.existsSync(abs)) return abs;
  }

  // 3) Basename match fallback
  const baseMatchRel = textureFiles.find((rel) => path.basename(String(rel).toLowerCase()) === hintBase);
  if (baseMatchRel) {
    const abs = resolveInRoot(filesDir, baseMatchRel);
    if (fs.existsSync(abs)) return abs;
  }

  return null;
};

export const buildSubmeshTextureMap = ({
  filesDir,
  submeshes = [],
  textureFiles = [],
  materialTextureHints = {},
  defaultTextureBySkn = {},
  selectedSkn = '',
}) => {
  const textureMap = {};
  const debugRows = [];
  const normalizedHints = {};
  const selectedSknKey = String(selectedSkn || '').replace(/\\/g, '/').toLowerCase();
  const defaultHintFromSkn = defaultTextureBySkn?.[selectedSknKey] || '';
  const defaultHint =
    defaultHintFromSkn ||
    materialTextureHints?.__default__ ||
    materialTextureHints?.default ||
    '';

  for (const [k, v] of Object.entries(materialTextureHints || {})) {
    normalizedHints[normalizeMaterialName(k)] = v;
  }

  for (const submesh of submeshes) {
    const key = normalizeMaterialName(submesh.name);
    const hint = normalizedHints[key] || defaultHint;
    const abs = resolveTextureByHint({
      filesDir,
      textureFiles,
      hintPath: hint,
    });
    let reason = 'NO_HINT_FOR_MATERIAL';
    if (hint && !abs) reason = 'HINT_FOUND_BUT_TEXTURE_NOT_RESOLVED';
    if (hint && abs) reason = 'TEXTURE_RESOLVED';
    if (abs) {
      textureMap[submesh.id] = toLocalFileUrl(abs);
    }
    debugRows.push({
      submeshId: submesh.id,
      submeshName: submesh.name,
      normalizedSubmeshKey: key,
      hintPath: hint || '',
      resolvedTexturePath: abs || '',
      reason,
    });
  }

  console.groupCollapsed('[ModelInspect] Material/Texture mapping debug');
  console.table(debugRows);
  console.groupEnd();

  return { textureMap, debugRows };
};

export const loadAnmClip = async ({ filesDir, anmRelativePath }) => {
  if (!filesDir || !anmRelativePath) {
    throw new Error('Missing filesDir or anmRelativePath');
  }

  const ANM = getAnmCtor();
  if (!ANM) {
    throw new Error('ANM runtime is unavailable');
  }

  const anmPath = resolveInRoot(filesDir, anmRelativePath);
  const anm = new ANM();
  anm.read(anmPath);

  const durationFrames = Math.max(1, Math.floor(Number(anm.duration || 1)));
  const fps = Number(anm.fps || 30);

  // Convert map-based pose tracks to plain arrays for fast lookup.
  const tracks = (anm.tracks || []).map((track) => {
    const frames = {};
    for (const [frameKey, pose] of track.poses.entries()) {
      const frame = Math.max(0, Math.floor(Number(frameKey)));
      frames[frame] = {
        translate: toArray3(pose?.translate),
        rotate: toQuat(pose?.rotate),
        scale: toArray3(pose?.scale, [1, 1, 1]),
      };
    }
    return {
      jointHash: Number(track.jointHash || 0) >>> 0,
      frames,
    };
  });

  return {
    anmRelativePath,
    durationFrames,
    fps,
    durationSeconds: durationFrames / Math.max(1, fps),
    tracks,
  };
};

export const evaluateSkeletonSegments = ({ skeleton, animation, timeSeconds }) => {
  if (!skeleton?.joints?.length || !animation?.tracks?.length) {
    return skeleton?.segments || [];
  }

  const durationFrames = Math.max(1, animation.durationFrames || 1);
  const fps = Math.max(1, animation.fps || 30);
  const frame = ((Math.floor(timeSeconds * fps) % durationFrames) + durationFrames) % durationFrames;

  const poseByJointId = new Map();
  for (const track of animation.tracks) {
    const jointId = skeleton.hashToJointId?.[track.jointHash];
    if (jointId == null) continue;
    const pose = track.frames[frame];
    if (!pose) continue;
    poseByJointId.set(jointId, pose);
  }

  const worldById = new Map();
  const sorted = [...skeleton.joints].sort((a, b) => a.id - b.id);

  for (const joint of sorted) {
    const baseT = toArray3(joint.localTranslate);
    const baseR = toQuat(joint.localRotate);
    const baseS = toArray3(joint.localScale, [1, 1, 1]);
    const pose = poseByJointId.get(joint.id);

    const t = pose?.translate || baseT;
    const r = pose?.rotate || baseR;
    const s = pose?.scale || baseS;

    const local = new THREE.Matrix4();
    local.compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion(r[0], r[1], r[2], r[3]),
      new THREE.Vector3(s[0], s[1], s[2])
    );

    let world = local;
    if (joint.parent >= 0 && worldById.has(joint.parent)) {
      world = new THREE.Matrix4().multiplyMatrices(worldById.get(joint.parent), local);
    }
    worldById.set(joint.id, world);
  }

  return buildSkeletonSegmentsFromWorld(skeleton.joints, worldById);
};
