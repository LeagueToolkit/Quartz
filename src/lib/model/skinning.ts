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

function sampleVecKeys(keys: VecKey[], time: number): [number, number, number] | null {
    if (!keys.length) return null;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
    for (let i = 0; i < keys.length - 1; i++) {
        const left = keys[i];
        const right = keys[i + 1];
        if (time < left.time || time > right.time) continue;
        const dt = right.time - left.time;
        if (dt <= 1e-6) return left.value;
        return lerp3(left.value, right.value, (time - left.time) / dt);
    }
    return keys[keys.length - 1].value;
}

function sampleQuatKeys(keys: QuatKey[], time: number): [number, number, number, number] | null {
    if (!keys.length) return null;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
    for (let i = 0; i < keys.length - 1; i++) {
        const left = keys[i];
        const right = keys[i + 1];
        if (time < left.time || time > right.time) continue;
        const dt = right.time - left.time;
        if (dt <= 1e-6) return left.value;
        const t = (time - left.time) / dt;
        const q0 = new THREE.Quaternion(left.value[0], left.value[1], left.value[2], left.value[3]);
        const q1 = new THREE.Quaternion(right.value[0], right.value[1], right.value[2], right.value[3]);
        const q = new THREE.Quaternion().slerpQuaternions(q0, q1, t).normalize();
        return [q.x, q.y, q.z, q.w];
    }
    return keys[keys.length - 1].value;
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

/** World transform per joint id at `timeSeconds` (identity clip → bind pose). */
export function evaluateWorldMatrices(skeleton: SkeletonRuntime, clip: AnimClip | null, timeSeconds: number): Map<number, THREE.Matrix4> {
    // Loop the clip.
    const time = clip && clip.durationSeconds > 0
        ? ((timeSeconds % clip.durationSeconds) + clip.durationSeconds) % clip.durationSeconds
        : 0;

    const worldById = new Map<number, THREE.Matrix4>();
    for (const id of skeleton.sortedIds) {
        const joint = skeleton.jointById.get(id)!;
        const track = clip?.tracks.get(joint.hash >>> 0);

        const t = (track && sampleVecKeys(track.translate, time)) || joint.localTranslation;
        const r = (track && sampleQuatKeys(track.rotate, time)) || joint.localRotation;
        const s = (track && sampleVecKeys(track.scale, time)) || joint.localScale;

        const local = new THREE.Matrix4().compose(
            _t.set(t[0], t[1], t[2]),
            _q.set(r[0], r[1], r[2], r[3]),
            _s.set(s[0], s[1], s[2]),
        );

        let world = local;
        if (joint.parentId >= 0 && worldById.has(joint.parentId)) {
            world = new THREE.Matrix4().multiplyMatrices(worldById.get(joint.parentId)!, local);
        }
        worldById.set(id, world);
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

/** Bone line segments (parent→child) for the skeleton overlay, at `timeSeconds`. */
export function evaluateSkeletonSegments(skeleton: SkeletonRuntime, clip: AnimClip | null, timeSeconds: number): number[] {
    const worldById = evaluateWorldMatrices(skeleton, clip, timeSeconds);
    const posById = new Map<number, THREE.Vector3>();
    for (const joint of skeleton.joints) {
        const world = worldById.get(joint.id);
        posById.set(joint.id, new THREE.Vector3().setFromMatrixPosition(world ?? new THREE.Matrix4()));
    }
    const flat: number[] = [];
    for (const joint of skeleton.joints) {
        if (joint.parentId < 0) continue;
        const a = posById.get(joint.id);
        const b = posById.get(joint.parentId);
        if (!a || !b) continue;
        flat.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return flat;
}
