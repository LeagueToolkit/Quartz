/* Adapts the animation clip graph into the shapes Port's list already renders.
 *
 * WHY AN ADAPTER RATHER THAN A SECOND LIST
 * A clip contains ordered events exactly as a VFX system contains ordered
 * emitters, so `ParticleSystemList` / `ParticleSystemItem` can render both
 * without change if clips arrive wearing the `VfxSystem` shape. Forking the list
 * would mean maintaining two copies of the collapse, filter, keying, drag and
 * memoisation logic - and the perf work that just landed on those components
 * would have to be done twice.
 *
 * The tradeoff is honest: `VfxSystem` becomes a slight misnomer for a clip row.
 * That is mitigated by the `anm` payload below - components branch on the DATA
 * (`system.anm !== undefined`) instead of on a `mode` prop threaded down through
 * every level, so the reuse is self-documenting at the point of use.
 *
 * Nothing here mutates. These are view models; every underlying node keeps its
 * `BinAddr`, which is what a future write path addresses.
 */

import type { AnimEvent, AnmModel, ClipInfo, ClipKind } from '@/lib/api/vfxSession';
import type { VfxEmitter, VfxSystem } from '../model';

/** Extra payload carried on an adapted row. Its presence is what marks a row as
 *  a clip/event rather than a VFX system/emitter. */
export interface AnmSystemMeta {
    kind: ClipKind;
    /** `Atomic`, `Sequencer`, ... for the type badge. */
    kindLabel: string;
    anmPath: string | null;
    trackDataName: string | null;
    maskDataName: string | null;
    eventCount: number;
    /** Clips a composite sequences. 0 for a leaf clip. */
    memberCount: number;
    loops: boolean;
    /** The clip's own window. Forwarded so the editor can READ BACK what it
     *  writes: without these the frame rows commit fine but always render
     *  empty. */
    startFrame: number | null;
    endFrame: number | null;
    /** True when the map key was an unresolved hash, so `name` is a fallback
     *  derived from the `.anm` filename and is NOT unique. */
    nameIsFallback: boolean;
    /** The raw map key, shown when the name is a fallback so two clips sharing
     *  a `.anm` are still tellable apart. */
    rawKey: string | null;
    /** Problems naming this clip, lifted from AnmModel.warnings. */
    warnings: string[];
}

export interface AnmEmitterMeta {
    event: AnimEvent;
    /** `particle`, `sound`, ... — drives the glyph and tint. */
    eventType: AnimEventType;
    /** Human label for the type, e.g. `Particle`. */
    typeLabel: string;
    startFrame: number | null;
    endFrame: number | null;
    /** Bone from the first ParticleEventDataPair, when the event has one. */
    boneName: string | null;
    isLoop: boolean;
    /** The event's own map key. Often an unresolved hash; shown as secondary
     *  detail rather than as the row's title. */
    eventKey: string;
    /** Field rows for this event's class, label + value, in bin order. This is
     *  what makes an event legible: the previous single-line row showed only a
     *  name that was frequently just a hash. */
    fields: Array<{ label: string; value: string }>;
}

export type AnimEventType = AnimEvent['kind']['type'];

/** A `VfxSystem` that is really a clip. */
export type AnmSystem = VfxSystem & { anm: AnmSystemMeta };
/** A `VfxEmitter` that is really an event. */
export type AnmEmitter = VfxEmitter & { anm: AnmEmitterMeta };

export function isAnmSystem(s: VfxSystem): s is AnmSystem {
    return (s as AnmSystem).anm !== undefined;
}
export function isAnmEmitter(e: VfxEmitter): e is AnmEmitter {
    return (e as AnmEmitter).anm !== undefined;
}

const KIND_LABELS: Record<ClipKind['type'], string> = {
    atomic: 'Atomic',
    sequencer: 'Sequencer',
    parallel: 'Parallel',
    selector: 'Selector',
    parametric: 'Parametric',
    conditionFloat: 'CondFloat',
    conditionBool: 'CondBool',
    unknown: 'Unknown',
};

/** Human label for an event, preferring the most identifying field it has. */
function eventLabel(event: AnimEvent): string {
    const k = event.kind;
    switch (k.type) {
        case 'particle':
            return k.effectKey || event.name;
        case 'sound':
            return k.soundName || event.name;
        case 'stopAnimation':
            return k.stopAnimationName || event.name;
        case 'lockRootOrientation':
            return k.jointName ? `Lock ${k.jointName}` : event.name;
        case 'conformToPath':
            return k.maskDataName ? `Conform ${k.maskDataName}` : event.name;
        case 'unknown':
            // Keep the hash visible: an unmodelled class is still real data the
            // user may need to reason about, and hiding it is how the legacy
            // page lost JointSnap / IdleParticlesVisibility events silently.
            return event.name || `0x${k.classHash.toString(16).padStart(8, '0')}`;
        default:
            return event.name;
    }
}

/** Frame span, where the event type has one at all. Several genuinely do not —
 *  ConformToPath has no frame fields, FaceTarget has only an end frame. */
function frameRange(event: AnimEvent): [number | null, number | null] {
    const k = event.kind;
    switch (k.type) {
        case 'particle':
            return [k.startFrame, null];
        case 'submeshVisibility':
            return [k.startFrame, k.endFrame];
        case 'faceTarget':
            return [null, k.endFrame];
        case 'lockRootOrientation':
            return [k.startFrame, k.endFrame];
        default:
            return [null, null];
    }
}

function eventBone(event: AnimEvent): string | null {
    const k = event.kind;
    if (k.type !== 'particle') return null;
    // The bone lives on the nested pair, never on the event itself.
    return k.pairs.find((p) => p.boneName)?.boneName ?? null;
}

function eventLoops(event: AnimEvent): boolean {
    const k = event.kind;
    return (k.type === 'particle' || k.type === 'sound') && k.isLoop === true;
}

const TYPE_LABELS: Record<AnimEventType, string> = {
    particle: 'Particle',
    sound: 'Sound',
    submeshVisibility: 'Submesh',
    faceTarget: 'Face Target',
    conformToPath: 'Conform To Path',
    lockRootOrientation: 'Lock Root',
    stopAnimation: 'Stop Animation',
    unknown: 'Unknown',
};

const num = (v: number | null) => (v === null ? '—' : String(v));
const str = (v: string | null) => (v && v.length ? v : '—');

/* Every field the class actually carries, in the order the bin writes them.
   Only fields that EXIST on that class are listed — several classes carry far
   less than their names suggest (FaceTargetEventData is usually empty, and
   ConformToPathEventData has no frame fields at all). */
function eventFields(event: AnimEvent): Array<{ label: string; value: string }> {
    const k = event.kind;
    switch (k.type) {
        case 'particle': {
            const rows = [
                { label: 'Effect Key', value: str(k.effectKey) },
                { label: 'Start Frame', value: num(k.startFrame) },
                { label: 'Is Loop', value: k.isLoop === null ? '—' : String(k.isLoop) },
            ];
            // The bone lives on the nested pair, never on the event itself.
            k.pairs.forEach((p, i) => {
                const suffix = k.pairs.length > 1 ? ` ${i + 1}` : '';
                rows.push({ label: `Bone${suffix}`, value: str(p.boneName) });
                if (p.targetBoneName) {
                    rows.push({ label: `Target Bone${suffix}`, value: p.targetBoneName });
                }
            });
            return rows;
        }
        case 'sound':
            return [
                { label: 'Sound Name', value: str(k.soundName) },
                { label: 'Is Loop', value: k.isLoop === null ? '—' : String(k.isLoop) },
            ];
        case 'submeshVisibility':
            return [
                { label: 'Start Frame', value: num(k.startFrame) },
                { label: 'End Frame', value: num(k.endFrame) },
                { label: 'Show', value: k.show.length ? k.show.join(', ') : '—' },
                { label: 'Hide', value: k.hide.length ? k.hide.join(', ') : '—' },
            ];
        case 'faceTarget':
            return [
                { label: 'End Frame', value: num(k.endFrame) },
                { label: 'Y Rotation', value: num(k.yRotationDegrees) },
            ];
        case 'conformToPath':
            return [
                { label: 'Mask Data Name', value: str(k.maskDataName) },
                { label: 'Blend In Time', value: num(k.blendInTime) },
                { label: 'Blend Out Time', value: num(k.blendOutTime) },
            ];
        case 'lockRootOrientation':
            return [
                { label: 'Start Frame', value: num(k.startFrame) },
                { label: 'End Frame', value: num(k.endFrame) },
                { label: 'Joint Name', value: str(k.jointName) },
                { label: 'Blend Out Time', value: num(k.blendOutTime) },
            ];
        case 'stopAnimation':
            return [{ label: 'Animation', value: str(k.stopAnimationName) }];
        case 'unknown':
            return [
                { label: 'Class Hash', value: `0x${k.classHash.toString(16).padStart(8, '0')}` },
            ];
        default:
            return [];
    }
}

function toEmitter(event: AnimEvent, clipKey: string, index: number): AnmEmitter {
    const [startFrame, endFrame] = frameRange(event);
    return {
        key: `${clipKey}__event_${index}`,
        name: eventLabel(event),
        path: event.addr,
        complex: false,
        isChildParticle: false,
        childData: null,
        // Events carry no textures, meshes or colours; the event card shows its
        // field rows instead of the emitter card's swatches.
        textures: [],
        meshes: [],
        colors: [],
        color: null,
        anm: {
            event,
            eventType: event.kind.type,
            typeLabel: TYPE_LABELS[event.kind.type] ?? 'Unknown',
            startFrame,
            endFrame,
            boneName: eventBone(event),
            isLoop: eventLoops(event),
            eventKey: event.name,
            fields: eventFields(event),
        },
    };
}

/* A clip's OWN events only.
 *
 * Deliberately NOT folding in member events. `resolve_clip_graph` returns every
 * clip as a top-level entry AND repeats the members inside their composite
 * parent, so folding member events upward showed the same event twice: once on
 * the member's own row, once on the parent's. A composite row reports how many
 * clips it sequences (see `memberCount`), not a borrowed event tally. */
function collectEvents(clip: ClipInfo): AnimEvent[] {
    return clip.allEvents ?? [];
}

/** Warnings that name this clip, so the row can show its own problems. */
function warningsFor(clipName: string, all: string[]): string[] {
    const needle = `"${clipName}"`;
    return all.filter((w) => w.includes(needle));
}

/* `clip.name` falls back to the `.anm` filename stem when the map key is an
   unresolved hash, so several distinct clips can present the SAME name (in
   Yasuo skin36, most keys are hashes). Detect that so the row can show the key
   alongside the name instead of looking like a duplicate. */
function isFallbackName(clip: ClipInfo): boolean {
    if (!clip.anmPath) return false;
    const stem = clip.anmPath.split(/[\\/]/).pop()?.replace(/\.anm$/i, '');
    return !!stem && stem.toLowerCase() === clip.name.toLowerCase();
}

/** A path's steps flattened into a stable string, for React keys. */
function addrSteps(addr: { steps: Array<Record<string, number>> }): string {
    return addr.steps
        .map((s) => Object.values(s)[0])
        .join('.');
}

function toSystem(clip: ClipInfo, warnings: string[]): AnmSystem {
    /* Key on the FULL address, never the name: two clips routinely share a
       fallback name, and a duplicate React key silently drops rows.

       `steps.length` was in here instead of the steps themselves, which made
       the key effectively name-based (every clip has the same step DEPTH). A
       rename then changed the key, remounting the card and dropping its
       expanded state. Serialising the steps gives each clip a key that is
       unique AND stable across a rename. */
    const key = clip.addr
        ? `${clip.addr.bin}:${clip.addr.entry}:${addrSteps(clip.addr)}`
        : clip.name;
    const events = collectEvents(clip);
    const members = clip.members ?? [];
    return {
        key,
        name: clip.name,
        particleName: clip.name,
        particlePath: clip.anmPath,
        binIndex: clip.addr?.bin ?? 0,
        path: clip.addr,
        transform: null,
        emitters: events.map((e, i) => toEmitter(e, key, i)),
        childParents: [],
        anm: {
            kind: clip.kind,
            kindLabel: KIND_LABELS[clip.kind.type] ?? 'Unknown',
            anmPath: clip.anmPath,
            trackDataName: clip.trackDataName,
            maskDataName: clip.maskDataName,
            eventCount: events.length,
            memberCount: members.length,
            loops: clip.loops,
            startFrame: clip.startFrame ?? null,
            endFrame: clip.endFrame ?? null,
            nameIsFallback: isFallbackName(clip),
            rawKey: null,
            warnings: warningsFor(clip.name, warnings),
        },
    };
}

/** Project an AnmModel into the row shapes Port's list renders. */
export function buildAnmSystems(model: AnmModel | null): AnmSystem[] {
    if (!model) return [];
    return model.clips.map((clip) => toSystem(clip, model.warnings ?? []));
}

/** Keyed lookup, matching `buildSystemMap`'s role on the VFX side. */
export function buildAnmSystemMap(systems: AnmSystem[]): Record<string, AnmSystem> {
    const map: Record<string, AnmSystem> = {};
    for (const s of systems) map[s.key] = s;
    return map;
}
