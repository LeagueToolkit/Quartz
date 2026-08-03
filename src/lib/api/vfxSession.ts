import { invokeCommand } from './core';
import type { Step } from './bineditor';

/* VFX porting sessions — a skin bin plus every bin its `linked:` list resolves
   to is opened once into a resident multi-bin Rust session. The frontend holds
   only the structured VfxPortModel projection and edits via commands that
   mutate the owning tree in place; save writes back only the dirty bins. */

export type { Step };

/** Opaque address of a node inside a session's bin trees; pass back verbatim. */
export interface VfxPath {
    bin: number;
    entry: number;
    steps: Step[];
}

export interface BinInfo {
    path: string;
    fileName: string;
    role: 'main' | 'linked';
    dirty: boolean;
}

export interface ChildView {
    effectKey: string;
    rate: number;
    lifetime: number;
    bindWeight: number;
    translation: [number, number, number];
    isSingleParticle: boolean;
    timeBeforeFirstEmission: number;
}

export interface PortEmitter {
    /** `${systemKey}__emitter_${idx}` across both emitter lists. */
    key: string;
    /** emitterName or "Unnamed". */
    name: string;
    complex: boolean;
    isChild: boolean;
    textures: string[];
    meshes: string[];
    /** Display swatches: constants plus up to 6 keyframe colors. */
    colors: [number, number, number, number][];
    path: VfxPath;
    childData: ChildView | null;
}

export interface PortSystem {
    /** Hex path_hash, suffixed "@{bin}" on cross-bin collision. */
    key: string;
    name: string;
    particleName: string | null;
    particlePath: string | null;
    binIndex: number;
    path: VfxPath;
    /** 16 floats when the system has a `transform` field. */
    transform: number[] | null;
    emitters: PortEmitter[];
}

export interface ResolverEntryView {
    key: string;
    value: string;
}

export interface ResolverView {
    binIndex: number;
    entryIndex: number;
    entries: ResolverEntryView[];
}

export interface IdleView {
    effectKey: string;
    bones: string[];
}

export interface PersistentPresetView {
    type: string;
    animationName: string | null;
    scriptName: string | null;
    spellHash: string | null;
    slot: number | null;
    operator: number | null;
    value: number | null;
    delayOn: number;
    delayOff: number;
    /** Unknown driver preserved verbatim. */
    raw: boolean;
}

export interface PersistentVfxView {
    key: string;
    boneName: string | null;
    scale: number | null;
    ownerOnly: boolean | null;
    attachToCamera: boolean | null;
    forceRender: boolean | null;
}

export interface PersistentView {
    index: number;
    label: string;
    preset: PersistentPresetView;
    vfx: PersistentVfxView[];
    submeshesShow: string[];
    submeshesHide: string[];
}

export interface EffectKeyOption {
    key: string;
    label: string;
    particleName: string | null;
}

export interface VfxPortModel {
    /** Identity of the session tree these paths index into. Echo it back on a
     *  cross-session port so paths from a reloaded donor are rejected. */
    generation: number;
    bins: BinInfo[];
    systems: PortSystem[];
    resolver: ResolverView | null;
    idle: IdleView[];
    persistent: PersistentView[];
    effectKeys: EffectKeyOption[];
    submeshes: string[];
    /** True when the main bin has SkinCharacterDataProperties (idle/persistent ops need it). */
    hasSkinCharacterData: boolean;
}

/* ── Animation read layer ────────────────────────────────────────────────────
   The clip graph, its blend masks and tracks, and the skeleton those masks
   index into. Read-only: these shapes mirror `quartz_lib::anim_graph` and
   `vfx_session::anm`, which model the fields the viewer needs and NOT every
   field a clip can carry — every node keeps a `BinAddr` so a write path can
   reach the unmodelled ones without reconstructing the node. */

/** Same wire shape as {@link VfxPath}: where a parsed node lives in the bins.
 *  A map hop (clip / event maps) is recorded as the entry's POSITION. */
export interface BinAddr {
    bin: number;
    entry: number;
    steps: Step[];
}

/** While `[startFrame, endFrame]` is live, hide `hide` and show `show`.
 *  Tokens are submesh names, or `0x`-hashes the hash DB could not resolve. */
export interface SubmeshVisEvent {
    startFrame: number | null;
    endFrame: number | null;
    show: string[];
    hide: string[];
}

/** A `mBoneName` / `mTargetBoneName` pair on a particle event. It has no name
 *  and no hash of its own, so `addr` is the only way to address one. */
export interface ParticlePair {
    boneName: string | null;
    targetBoneName: string | null;
    addr: BinAddr;
}

/** Typed payload of one clip event; switch on `type`. `unknown` preserves an
 *  unmodelled event class with its hash rather than dropping it. */
export type AnimEventKind =
    | {
          type: 'particle';
          effectKey: string | null;
          startFrame: number | null;
          isLoop: boolean | null;
          pairs: ParticlePair[];
      }
    | { type: 'sound'; soundName: string | null; isLoop: boolean | null }
    | {
          type: 'submeshVisibility';
          startFrame: number | null;
          endFrame: number | null;
          show: string[];
          hide: string[];
      }
    | { type: 'faceTarget'; endFrame: number | null; yRotationDegrees: number | null }
    | {
          type: 'conformToPath';
          maskDataName: string | null;
          blendInTime: number | null;
          blendOutTime: number | null;
      }
    | {
          type: 'lockRootOrientation';
          startFrame: number | null;
          endFrame: number | null;
          jointName: string | null;
          blendOutTime: number | null;
      }
    | { type: 'stopAnimation'; stopAnimationName: string | null }
    | { type: 'unknown'; classHash: number };

export interface AnimEvent {
    /** Resolved map key, or `0x{hash}` when the hash DB could not name it. */
    name: string;
    classHash: number;
    kind: AnimEventKind;
    addr: BinAddr;
}

/** One entry of a selector / parametric / condition-float pair list. */
export interface ClipPair {
    clipName: string | null;
    probability: number | null;
    value: number | null;
    addr: BinAddr;
}

/** Which class a clip is, with its class-specific payload; switch on `type`. */
export type ClipKind =
    | { type: 'atomic' }
    | { type: 'sequencer' }
    | { type: 'parallel' }
    | { type: 'selector' }
    | { type: 'parametric' }
    | { type: 'conditionFloat' }
    | { type: 'conditionBool'; trueClip: string | null; falseClip: string | null }
    | { type: 'unknown' };

/** One member of a composite clip's queue: a leaf clip naming a `.anm`. */
export interface ClipMember {
    name: string;
    anmPath: string;
    /** Legacy submesh-only view; a strict subset of `allEvents`. */
    events: SubmeshVisEvent[];
    loops: boolean;
    kind: ClipKind;
    classHash: number;
    /** Raw `mFlags`, unmasked. `loops` is bit 2 of this. */
    flags: number;
    trackDataName: string | null;
    maskDataName: string | null;
    startFrame: number | null;
    endFrame: number | null;
    allEvents: AnimEvent[];
    addr: BinAddr;
}

export interface ClipInfo {
    name: string;
    /** The clip map's key exactly as the bin holds it: a resolved name, or
     *  `0x…` when the hashtable could not resolve it.
     *
     *  `name` substitutes the `.anm` filename stem for an unresolved key, which
     *  makes it a LABEL, not an identity — editing the animation path changed
     *  it. Rename and identity must read this instead. */
    mapKey: string;
    /** `.anm` asset path; for a composite clip, its first member's. */
    anmPath: string | null;
    /** A composite clip's ordered queue; empty for a plain atomic clip. */
    members: ClipMember[];
    /** Legacy submesh-only view; a strict subset of `allEvents`. */
    events: SubmeshVisEvent[];
    loops: boolean;
    kind: ClipKind;
    classHash: number;
    /** Raw `mFlags`, unmasked. `loops` is bit 2 of this. */
    flags: number;
    trackDataName: string | null;
    maskDataName: string | null;
    startFrame: number | null;
    endFrame: number | null;
    /** Pair list for a selector / parametric / condition-float clip. */
    pairs: ClipPair[];
    allEvents: AnimEvent[];
    addr: BinAddr;
}

/** One blend mask. `weights[i]` is the weight of skeleton joint `i` — the index
 *  IS the joint link, so never sort, filter or reorder this array. */
export interface MaskData {
    name: string;
    weights: number[];
}

/** One track. Both fields are optional in the file format; `null` means the
 *  field was absent, which is NOT the same as 0. */
export interface TrackData {
    name: string;
    priority: number | null;
    blendMode: number | null;
}

/** The `.skl` a set of masks applies to, found via the owning skin entry. */
export interface SkeletonLink {
    /** The raw `ASSETS/...` string exactly as authored in the bin. */
    sklRef: string;
    /** Resolved on-disk path, null when the project doesn't ship the file. */
    sklPath: string | null;
    sknRef: string | null;
}

export interface AnmModel {
    clips: ClipInfo[];
    masks: MaskData[];
    tracks: TrackData[];
    skeleton: SkeletonLink | null;
    /** Non-fatal problems worth showing: dangling mask / track references and
     *  mask weight counts that disagree with the skeleton's joint count. */
    warnings: string[];
}

export interface ChildParams {
    effectKey: string;
    rate: number;
    lifetime: number;
    bindWeight: number;
    translation: [number, number, number];
    isSingleParticle: boolean;
    emitterName?: string | null;
    timeBeforeFirstEmission?: number;
}

export interface PersistentPresetPayload {
    type: string;
    animationName?: string | null;
    scriptName?: string | null;
    spellHash?: string | null;
    slot?: number | null;
    operator?: number | null;
    value?: number | null;
    delayOn: number;
    delayOff: number;
}

export interface PersistentVfxPayload {
    key: string;
    boneName?: string | null;
    scale?: number | null;
    ownerOnly?: boolean | null;
    attachToCamera?: boolean | null;
    forceRender?: boolean | null;
}

export interface PersistentPayload {
    preset: PersistentPresetPayload;
    vfx: PersistentVfxPayload[];
    submeshesShow: string[];
    submeshesHide: string[];
}

export interface VfxOpenResult {
    sessionId: number;
    model: VfxPortModel;
}

export interface PortEmittersResult {
    model: VfxPortModel;
    /** Names of the emitters that were ported. */
    ported: string[];
    /** Donor asset strings to copy via portCopyAssetsToTarget. */
    assetPaths: string[];
}

export interface PortSystemResult {
    model: VfxPortModel;
    systemKey: string;
    finalName: string;
    assetPaths: string[];
}

/** Open a skin bin (and its resolvable linked bins) into a resident session. */
export function vfxOpen(path: string): Promise<VfxOpenResult> {
    return invokeCommand<VfxOpenResult>('vfx_open', { path });
}

/** Reproject the model from the live trees. */
export function vfxModel(sessionId: number): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_model', { sessionId });
}

/** Project the animation read layer: clips, blend masks, tracks, the skeleton
 *  those masks index into, and the non-fatal warnings worth surfacing. */
export function vfxAnmModel(sessionId: number): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_model', { sessionId });
}

/** Reparse the session when any loaded BIN changed outside Quartz. */
export function vfxReloadIfChanged(sessionId: number): Promise<VfxPortModel | null> {
    return invokeCommand<VfxPortModel | null>('vfx_reload_if_changed', { sessionId });
}

/** Write every dirty bin back to its own file. Returns the paths written.
 *  Rejects with a `STALE_FILE:` error if a file changed on disk since opening,
 *  unless `force` is true (see {@link isStaleFileError}). */
export function vfxSave(sessionId: number, force = false): Promise<string[]> {
    return invokeCommand<string[]>('vfx_save', { sessionId, force });
}

/** Close a session and free its trees. */
export function vfxClose(sessionId: number): Promise<boolean> {
    return invokeCommand<boolean>('vfx_close', { sessionId });
}

/** Undo the last edit. Returns the refreshed model, or null if nothing to undo. */
export function vfxUndo(sessionId: number): Promise<VfxPortModel | null> {
    return invokeCommand<VfxPortModel | null>('vfx_undo', { sessionId });
}

/** Redo the last undone edit; returns the refreshed model or null. */
export function vfxRedo(sessionId: number): Promise<VfxPortModel | null> {
    return invokeCommand<VfxPortModel | null>('vfx_redo', { sessionId });
}

/** Create a new empty VFX system and register it in the resolver. */
export function vfxCreateSystem(sessionId: number, name: string): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_create_system', { sessionId, name });
}

/** Clone emitters from a donor session into a target system. */
export function vfxPortEmitters(
    targetSessionId: number,
    donorSessionId: number,
    donorEmitters: VfxPath[],
    targetSystem: VfxPath,
    donorGeneration?: number,
): Promise<PortEmittersResult> {
    return invokeCommand<PortEmittersResult>('vfx_port_emitters', {
        targetSessionId, donorSessionId, donorEmitters, targetSystem,
        donorGeneration: donorGeneration ?? null,
    });
}

/** Clone a whole system from a donor session into the target. */
export function vfxPortSystem(
    targetSessionId: number,
    donorSessionId: number,
    donorSystem: VfxPath,
    desiredName: string | null,
    preserveName: boolean,
    donorGeneration?: number,
): Promise<PortSystemResult> {
    return invokeCommand<PortSystemResult>('vfx_port_system', {
        targetSessionId, donorSessionId, donorSystem, desiredName, preserveName,
        donorGeneration: donorGeneration ?? null,
    });
}

/** Remove one emitter from its owning system. */
export function vfxDeleteEmitter(sessionId: number, emitter: VfxPath): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_delete_emitter', { sessionId, emitter });
}

/** Delete several emitters as ONE edit: a single undo step and a single model
 *  rebuild. Looping `vfxDeleteEmitter` instead costs one IPC round-trip plus a
 *  full reprojection per emitter, and makes undo restore them one by one. */
export function vfxDeleteEmitters(sessionId: number, emitters: VfxPath[]): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_delete_emitters', { sessionId, emitters });
}

/** Remove a system entry and any resolver entries pointing at it. */
export function vfxDeleteSystem(sessionId: number, system: VfxPath): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_delete_system', { sessionId, system });
}

/** Upsert (16 floats) or remove (null) a system's transform matrix. */
export function vfxSetMatrix(
    sessionId: number,
    system: VfxPath,
    values: number[] | null,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_set_matrix', { sessionId, system, values });
}

/** Add one idle-particle effect per bone for the effect key. */
export function vfxIdleAdd(
    sessionId: number,
    effectKey: string,
    bones: string[],
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_idle_add', { sessionId, effectKey, bones });
}

/** Remove every idle-particle effect matching the effect key. */
export function vfxIdleRemove(sessionId: number, effectKey: string): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_idle_remove', { sessionId, effectKey });
}

/** Append a new child (_cbdl) emitter to the host system. */
export function vfxChildAdd(
    sessionId: number,
    hostSystem: VfxPath,
    params: ChildParams,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_child_add', { sessionId, hostSystem, params });
}

/** Overwrite an existing child emitter's parameters. */
export function vfxChildUpdate(
    sessionId: number,
    emitter: VfxPath,
    params: ChildParams,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_child_update', { sessionId, emitter, params });
}

/** Append (index = null) or replace (index = i) a persistent-effect condition. */
export function vfxPersistentUpsert(
    sessionId: number,
    index: number | null,
    payload: PersistentPayload,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_persistent_upsert', { sessionId, index, payload });
}

/** Remove one persistent-effect condition by index. */
export function vfxPersistentRemove(sessionId: number, index: number): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_persistent_remove', { sessionId, index });
}

/** Upsert a resolver map entry (key hash -> system link). */
export function vfxResolverUpsert(
    sessionId: number,
    key: string,
    value: string,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_resolver_upsert', { sessionId, key, value });
}

/** Set an emitter's emitterName. */
export function vfxRenameEmitter(
    sessionId: number,
    emitter: VfxPath,
    newName: string,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_rename_emitter', { sessionId, emitter, newName });
}

/** Rewrite an emitter's texture path. `oldPath` identifies the node (its
 *  current value); `newPath` replaces it. */
export function vfxSetTexture(
    sessionId: number,
    emitter: VfxPath,
    oldPath: string,
    newPath: string,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_set_texture', { sessionId, emitter, oldPath, newPath });
}

/** Rename a system: particleName/particlePath, path hash, and resolver relink. */
export function vfxRenameSystem(
    sessionId: number,
    system: VfxPath,
    newName: string,
): Promise<VfxPortModel> {
    return invokeCommand<VfxPortModel>('vfx_rename_system', { sessionId, system, newName });
}
