/*
 * CPU skinning math for the animated model viewer.
 *
 * Ported from the Electron Quartz `modelInspectViewerService.js`
 * (evaluateSkinningMatrices / evaluateSkeletonSegments / key sampling), adapted
 * to the Tauri data shapes:
 *   - Parsing now happens in Rust (`model_inspect_skeleton` / `_animation`), so
 *     joint hashes come straight from the skeleton (no JS elf-hash needed).
 *   - ritoshark reports each keyframe's `time` in SECONDS, so we sample by
 *     seconds directly instead of the old frame-index sampling.
 */

import * as THREE from 'three';
import type { SkeletonPreview, JointPreview, AnimPreview } from '@/lib/api/modelInspect';

/* ── key sampling (ported: sampleVecKeys / sampleQuatKeys) ─────────────────── */

interface VecKey { time: number; value: [number, number, number] }
interface QuatKey { time: number; value: [number, number, number, number] }

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Index of the last key at or before `time`, via binary search. Dense League
 *  tracks carry one key per animation frame (hundreds per joint), so the old
 *  linear scan cost O(keys) per joint per component per frame. */
function seekKey(keys: { time: number }[], time: number): number {
    let low = 0;
    let high = keys.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (keys[mid].time <= time) low = mid;
        else high = mid - 1;
    }
    return low;
}

function sampleVecKeys(keys: VecKey[], time: number): [number, number, number] | null {
    if (!keys.length) return null;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
    const i = seekKey(keys, time);
    const left = keys[i];
    const right = keys[i + 1] ?? left;
    const dt = right.time - left.time;
    if (dt <= 1e-6) return left.value;
    return lerp3(left.value, right.value, (time - left.time) / dt);
}

// Scratch quaternions for slerp, reused across every sample (this runs per joint
// per frame; allocating here was a major source of GC churn during playback).
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _qOut = new THREE.Quaternion();
const _quatResult: [number, number, number, number] = [0, 0, 0, 1];

function sampleQuatKeys(keys: QuatKey[], time: number): [number, number, number, number] | null {
    if (!keys.length) return null;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
    const i = seekKey(keys, time);
    const left = keys[i];
    const right = keys[i + 1] ?? left;
    const dt = right.time - left.time;
    if (dt <= 1e-6) return left.value;
    const t = (time - left.time) / dt;
    _q0.set(left.value[0], left.value[1], left.value[2], left.value[3]);
    _q1.set(right.value[0], right.value[1], right.value[2], right.value[3]);
    _qOut.slerpQuaternions(_q0, _q1, t).normalize();
    // Reused tuple: the caller consumes it immediately (composes it into a
    // matrix) and never retains it.
    _quatResult[0] = _qOut.x;
    _quatResult[1] = _qOut.y;
    _quatResult[2] = _qOut.z;
    _quatResult[3] = _qOut.w;
    return _quatResult;
}

/* ── runtime skeleton ─────────────────────────────────────────────────────── */

export interface SkeletonRuntime {
    joints: JointPreview[];
    /** joint id → array index in `joints`, and hash → joint id lookups. */
    jointById: Map<number, JointPreview>;
    hashToJointId: Map<number, number>;
    /** joint ids in ascending order (parents evaluate before children). */
    sortedIds: number[];
    /** Mesh local-influence index → joint id (from the SKL influences table). */
    influences: number[];
}

export function buildSkeleton(skel: SkeletonPreview): SkeletonRuntime {
    const jointById = new Map<number, JointPreview>();
    const hashToJointId = new Map<number, number>();
    for (const j of skel.joints) {
        jointById.set(j.id, j);
        hashToJointId.set(j.hash >>> 0, j.id);
    }
    const sortedIds = [...skel.joints].sort((a, b) => a.id - b.id).map((j) => j.id);
    return { joints: skel.joints, jointById, hashToJointId, sortedIds, influences: skel.influences };
}

/* ── runtime clip (dense per-joint keys, keyed by joint hash) ──────────────── */

interface JointTrack { translate: VecKey[]; rotate: QuatKey[]; scale: VecKey[] }

export interface AnimClip {
    fps: number;
    durationSeconds: number;
    /** joint hash → sorted TRS key arrays. */
    tracks: Map<number, JointTrack>;
}

export function buildClip(anm: AnimPreview): AnimClip {
    const tracks = new Map<number, JointTrack>();
    for (const track of anm.tracks) {
        const translate: VecKey[] = [];
        const rotate: QuatKey[] = [];
        const scale: VecKey[] = [];
        for (const f of track.frames) {
            translate.push({ time: f.time, value: f.translation });
            rotate.push({ time: f.time, value: f.rotation });
            scale.push({ time: f.time, value: f.scale });
        }
        translate.sort((a, b) => a.time - b.time);
        rotate.sort((a, b) => a.time - b.time);
        scale.sort((a, b) => a.time - b.time);
        tracks.set(track.jointHash >>> 0, { translate, rotate, scale });
    }
    const durationSeconds = anm.durationSeconds > 0 ? anm.durationSeconds : anm.frameCount / Math.max(1, anm.fps);
    return { fps: anm.fps, durationSeconds, tracks };
}

/* ── pose evaluation ──────────────────────────────────────────────────────── */

const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/* Per-skeleton scratch: the world-matrix pool and its Map are allocated once and
 * rewritten in place every frame. Previously this allocated a Map plus ~2
 * Matrix4 per joint per frame (~500 objects/frame on a champion skeleton), which
 * was the dominant source of GC pressure during playback. */
interface PoseScratch {
    worldById: Map<number, THREE.Matrix4>;
    local: THREE.Matrix4;
}
const poseScratch = new WeakMap<SkeletonRuntime, PoseScratch>();

function scratchFor(skeleton: SkeletonRuntime): PoseScratch {
    let scratch = poseScratch.get(skeleton);
    if (!scratch) {
        const worldById = new Map<number, THREE.Matrix4>();
        for (const id of skeleton.sortedIds) worldById.set(id, new THREE.Matrix4());
        scratch = { worldById, local: new THREE.Matrix4() };
        poseScratch.set(skeleton, scratch);
    }
    return scratch;
}

/** World transform per joint id at `timeSeconds` (identity clip → bind pose).
 *
 *  NOTE: the returned Map and its Matrix4 values are scratch storage owned by
 *  `skeleton` and are overwritten by the next call. Consume them before calling
 *  again; copy anything you need to retain. */
export function evaluateWorldMatrices(skeleton: SkeletonRuntime, clip: AnimClip | null, timeSeconds: number): Map<number, THREE.Matrix4> {
    // Loop the clip.
    const time = clip && clip.durationSeconds > 0
        ? ((timeSeconds % clip.durationSeconds) + clip.durationSeconds) % clip.durationSeconds
        : 0;

    const { worldById, local } = scratchFor(skeleton);
    for (const id of skeleton.sortedIds) {
        const joint = skeleton.jointById.get(id)!;
        const track = clip?.tracks.get(joint.hash >>> 0);

        const t = (track && sampleVecKeys(track.translate, time)) || joint.localTranslation;
        const r = (track && sampleQuatKeys(track.rotate, time)) || joint.localRotation;
        const s = (track && sampleVecKeys(track.scale, time)) || joint.localScale;

        local.compose(
            _t.set(t[0], t[1], t[2]),
            _q.set(r[0], r[1], r[2], r[3]),
            _s.set(s[0], s[1], s[2]),
        );

        // Reuse this joint's pooled matrix. sortedIds is ascending and parents
        // always have a lower id than their children, so the parent's world
        // matrix for this frame is already final when we read it here.
        let world = worldById.get(id);
        if (!world) {
            world = new THREE.Matrix4();
            worldById.set(id, world);
        }
        const parent = joint.parentId >= 0 ? worldById.get(joint.parentId) : undefined;
        if (parent) world.multiplyMatrices(parent, local);
        else world.copy(local);
    }
    return worldById;
}

/** Skinning matrix (world × inverse-bind) per joint id. */
export function evaluateSkinningMatrices(skeleton: SkeletonRuntime, clip: AnimClip | null, timeSeconds: number): Map<number, THREE.Matrix4> {
    const worldById = evaluateWorldMatrices(skeleton, clip, timeSeconds);
    const skinById = new Map<number, THREE.Matrix4>();
    for (const joint of skeleton.joints) {
        const world = worldById.get(joint.id);
        if (!world) continue;
        const ibt = joint.inverseBindTranslation;
        const ibr = joint.inverseBindRotation;
        const ibs = joint.inverseBindScale;
        const invBind = new THREE.Matrix4().compose(
            _t.set(ibt[0], ibt[1], ibt[2]),
            _q.set(ibr[0], ibr[1], ibr[2], ibr[3]),
            _s.set(ibs[0], ibs[1], ibs[2]),
        );
        skinById.set(joint.id, new THREE.Matrix4().multiplyMatrices(world, invBind));
    }
    return skinById;
}

/** Inverse-bind Matrix4 for one joint (three.js `boneInverses` entry). */
export function inverseBindMatrix(joint: JointPreview): THREE.Matrix4 {
    const ibt = joint.inverseBindTranslation;
    const ibr = joint.inverseBindRotation;
    const ibs = joint.inverseBindScale;
    return new THREE.Matrix4().compose(
        new THREE.Vector3(ibt[0], ibt[1], ibt[2]),
        new THREE.Quaternion(ibr[0], ibr[1], ibr[2], ibr[3]),
        new THREE.Vector3(ibs[0], ibs[1], ibs[2]),
    );
}

/** Bone line segments (parent→child) for the skeleton overlay.
 *
 *  Takes an already-evaluated `worldById` (from `evaluateWorldMatrices`) rather
 *  than re-evaluating the pose: the caller needs the same matrices for skinning
 *  in the same frame, and computing them twice doubled the per-frame cost.
 *
 *  Writes into `out` and returns the number of floats written, so the caller can
 *  keep one Float32Array and re-upload it instead of reallocating per frame.
 *  A matrix's translation is elements 12/13/14 (column-major). */
export function writeSkeletonSegments(
    skeleton: SkeletonRuntime,
    worldById: Map<number, THREE.Matrix4>,
    out: Float32Array,
): number {
    let n = 0;
    for (const joint of skeleton.joints) {
        if (joint.parentId < 0) continue;
        const a = worldById.get(joint.id);
        const b = worldById.get(joint.parentId);
        if (!a || !b || n + 6 > out.length) continue;
        out[n++] = a.elements[12];
        out[n++] = a.elements[13];
        out[n++] = a.elements[14];
        out[n++] = b.elements[12];
        out[n++] = b.elements[13];
        out[n++] = b.elements[14];
    }
    return n;
}

/** Upper bound on floats `writeSkeletonSegments` can emit (6 per parented joint). */
export function skeletonSegmentCapacity(skeleton: SkeletonRuntime): number {
    return skeleton.joints.reduce((n, j) => (j.parentId >= 0 ? n + 6 : n), 0);
}
