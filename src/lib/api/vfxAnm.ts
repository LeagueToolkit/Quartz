import { invokeCommand } from './core';
import type { AnmModel, VfxPath } from './vfxSession';
import type { JsonBinValue } from './bineditor';

/* Animation write layer — the mutating half of `vfx_anm_model`'s read layer.
 *
 * Every command here returns the FULL reprojected `AnmModel` rather than a
 * delta. That is deliberate on the Rust side: an edit to one clip can change
 * another clip's warnings (a rename dangles the references pointing at it), and
 * the map hop in a `VfxPath` is recorded as a POSITION, so deleting an entry
 * renumbers the addresses of everything after it. A caller that patched one row
 * in place would be holding stale paths for the rest of the list. Replace the
 * model wholesale.
 */

/** Which field of a clip to write. Mirrors `ClipField` in the Rust command. */
export type ClipField =
    | 'trackDataName'
    | 'maskDataName'
    | 'anmPath'
    | 'startFrame'
    | 'endFrame'
    | 'loops'
    | 'trueClip'
    | 'falseClip';

/** Which field of an event to write. Mirrors `EventField` in the Rust command.
 *  Not every field exists on every event class; see `eventEditFields`. */
export type EventField =
    | 'effectKey'
    | 'startFrame'
    | 'endFrame'
    | 'isLoop'
    | 'soundName'
    | 'show'
    | 'hide'
    | 'yRotationDegrees'
    | 'maskDataName'
    | 'blendInTime'
    | 'blendOutTime'
    | 'jointName'
    | 'stopAnimationName';

/** An untagged field value. `null` CLEARS the field, which is not the same as
 *  writing an empty string or a zero: several of these fields are genuinely
 *  optional in the bin and absent means absent. */
export type AnmValue = boolean | number | string | null;

/** What a new clip or event is created as. The `kind` string names the bin
 *  class; `anmPath` seeds an atomic clip's `.anm` reference. */
export interface AnmClipSpec {
    name: string;
    kind: string;
    anmPath?: string;
}

export interface AnmEventSpec {
    name: string;
    kind: string;
}

/** Write one field of a clip. Pass `null` to remove the field. */
export function vfxAnmSetClipField(
    sessionId: number,
    clip: VfxPath,
    field: ClipField,
    value: AnmValue,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_set_clip_field', { sessionId, clip, field, value });
}

/** Write one field of an event. Pass `null` to remove the field.
 *  `show` / `hide` are lists in the bin but take a comma-separated string here;
 *  the backend splits and trims. */
export function vfxAnmSetEventField(
    sessionId: number,
    event: VfxPath,
    field: EventField,
    value: AnmValue,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_set_event_field', { sessionId, event, field, value });
}

/** Rekey a clip in its map. References to the OLD name are not rewritten, so
 *  this can dangle another clip's `mClipNameList` entry or condition branch;
 *  the reprojected model reports that in `warnings`. */
export function vfxAnmRenameClip(
    sessionId: number,
    clip: VfxPath,
    newName: string,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_rename_clip', { sessionId, clip, newName });
}

/** Rekey an event in its clip's event map. */
export function vfxAnmRenameEvent(
    sessionId: number,
    event: VfxPath,
    newName: string,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_rename_event', { sessionId, event, newName });
}

/** Delete several events as ONE edit. Batching matters more here than on the
 *  VFX side: a map hop is addressed by position, so deleting one at a time
 *  invalidates the paths of every later event between calls. */
export function vfxAnmDeleteEvents(sessionId: number, events: VfxPath[]): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_delete_events', { sessionId, events });
}

/** Delete several clips as ONE edit. */
export function vfxAnmDeleteClips(sessionId: number, clips: VfxPath[]): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_delete_clips', { sessionId, clips });
}

/** Append an event to a clip's event map. The map is keyed by hash, so the
 *  created entry comes back named `0x{fnv1a(name)}`, not the name typed. */
export function vfxAnmCreateEvent(
    sessionId: number,
    clip: VfxPath,
    spec: AnmEventSpec,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_create_event', { sessionId, clip, spec });
}

/** Append a clip to the graph's clip map. Same hash-keying caveat as
 *  {@link vfxAnmCreateEvent}: the new clip presents as its `.anm` stem. */
export function vfxAnmCreateClip(sessionId: number, spec: AnmClipSpec): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_create_clip', { sessionId, spec });
}

/** Move an event out of its clip and into another. */
export function vfxAnmMoveEvent(
    sessionId: number,
    event: VfxPath,
    targetClip: VfxPath,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_move_event', { sessionId, event, targetClip });
}

/** Reposition an event within its own clip's event map. */
export function vfxAnmReorderEvent(
    sessionId: number,
    event: VfxPath,
    newIndex: number,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_reorder_event', { sessionId, event, newIndex });
}

/** Reposition a clip within the graph's clip map. */
export function vfxAnmReorderClip(
    sessionId: number,
    clip: VfxPath,
    newIndex: number,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_reorder_clip', { sessionId, clip, newIndex });
}

/** Result of porting a clip or event across sessions. */
export interface PortClipResult {
    model: AnmModel;
    /** Donor asset strings to copy, same contract as the VFX port. */
    assetPaths: string[];
    /** VFX systems that came along with the clip. */
    portedSystems: string[];
    /** Effect keys whose VFX system could not be resolved in the donor, so the
     *  ported particles will not play until they are fixed. */
    unresolvedEffectKeys: string[];
}

/** Port a clip from the donor into the target with its referenced VFX systems. */
export function vfxAnmPortClip(
    targetSessionId: number,
    donorSessionId: number,
    donorClip: VfxPath,
    desiredName?: string,
    donorGeneration?: number,
): Promise<PortClipResult> {
    return invokeCommand<PortClipResult>('vfx_anm_port_clip', {
        targetSessionId,
        donorSessionId,
        donorClip,
        desiredName: desiredName ?? null,
        donorGeneration: donorGeneration ?? null,
    });
}

/** Port one event into an existing target clip, with its VFX system. */
export function vfxAnmPortEvent(
    targetSessionId: number,
    donorSessionId: number,
    donorEvent: VfxPath,
    targetClip: VfxPath,
    donorGeneration?: number,
): Promise<PortClipResult> {
    return invokeCommand<PortClipResult>('vfx_anm_port_event', {
        targetSessionId,
        donorSessionId,
        donorEvent,
        targetClip,
        donorGeneration: donorGeneration ?? null,
    });
}

/* ── Raw node access ───────────────────────────────────────────────────────
   The typed clip/event commands above cover the classes the read layer models.
   These reach everything else: a particle event's nested bone pairs, and the
   event classes that project as `unknown` because nothing models them. */

/** One editable field of a node. */
export interface RawField {
    /** Resolved field name, or `0x…` when the hash DB cannot name it. */
    name: string;
    /** The field-name hash. 0 for a list index or map position. */
    key: number;
    value: JsonBinValue;
    /** This field's own path, ready to pass back to `vfxAnmSetRawNode`. */
    path: VfxPath;
    /** Containers are descended into, not edited; only leaves are writable. */
    isContainer: boolean;
}

export interface RawNode {
    /** Resolved class name for an embed/pointer, else null. */
    className: string | null;
    fields: RawField[];
}

/** Project any node into its editable fields. */
export function vfxAnmRawNode(sessionId: number, path: VfxPath): Promise<RawNode> {
    return invokeCommand<RawNode>('vfx_anm_raw_node', { sessionId, path });
}

/** Write one primitive at `path`. The backend keeps the field's existing BIN
 *  type and rejects both a container target and a type change. */
export function vfxAnmSetRawNode(
    sessionId: number,
    path: VfxPath,
    value: JsonBinValue,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_set_raw_node', { sessionId, path, value });
}

/** Add a field a structure does not currently carry.
 *
 *  League omits a field holding its default, so a real `ParticleEventData` ships
 *  a handful of its sixteen fields and the rest are ABSENT, not empty — editing
 *  alone can never reach them. `name` is a field name, or a literal `0x…` for
 *  one the hash dictionary cannot resolve. */
export function vfxAnmAddRawField(
    sessionId: number,
    parent: VfxPath,
    name: string,
    value: JsonBinValue,
): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_add_raw_field', { sessionId, parent, name, value });
}

/** Remove a field, restoring the "absent means default" state League reads. */
export function vfxAnmRemoveRawField(sessionId: number, path: VfxPath): Promise<AnmModel> {
    return invokeCommand<AnmModel>('vfx_anm_remove_raw_field', { sessionId, path });
}
