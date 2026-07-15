/* UI-facing adapter over the native VfxPortModel session projection.
   Re-homes the pure UI types the Port components render from (VfxSystem,
   VfxEmitter, idle/persistent/child helper shapes) as thin mappings over the
   backend model, replacing the old ritobin-text parsers. */

import type {
    ChildView,
    PersistentPayload,
    PersistentView,
    PortEmitter,
    PortSystem,
    VfxPath,
    VfxPortModel,
} from '@/lib/api/vfxSession';

export { getShortSystemName } from './utils/nameUtils';
export type { VfxPath, VfxPortModel, ChildView };

// ── Systems / emitters ──

export interface VfxEmitter {
    key: string;
    name: string;
    path: VfxPath;
    complex: boolean;
    isChildParticle: boolean;
    childSystemKey?: string;
    childData: ChildView | null;
    textures: string[];
    meshes: string[];
    colors: [number, number, number, number][];
    color: { constantValue: string } | null;
}

export interface VfxSystem {
    key: string;
    name: string;
    particleName: string | null;
    particlePath: string | null;
    binIndex: number;
    path: VfxPath;
    transform: number[] | null;
    emitters: VfxEmitter[];
}

export type VfxSystemMap = Record<string, VfxSystem>;

export function isDivineLabChildParticle(emitterName: string | undefined | null): boolean {
    return !!emitterName && emitterName.endsWith('_cbdl');
}

function colorCss(c: [number, number, number, number]): string {
    const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgba(${to255(c[0])}, ${to255(c[1])}, ${to255(c[2])}, ${Math.max(0, Math.min(1, c[3]))})`;
}

function toUiEmitter(e: PortEmitter): VfxEmitter {
    return {
        key: e.key,
        name: e.name,
        path: e.path,
        complex: e.complex,
        isChildParticle: e.isChild,
        childSystemKey: e.childData?.effectKey,
        childData: e.childData,
        textures: e.textures,
        meshes: e.meshes,
        colors: e.colors,
        color: e.colors.length > 0 ? { constantValue: colorCss(e.colors[0]) } : null,
    };
}

function toUiSystem(s: PortSystem): VfxSystem {
    return {
        key: s.key,
        name: s.name,
        particleName: s.particleName,
        particlePath: s.particlePath,
        binIndex: s.binIndex,
        path: s.path,
        transform: s.transform,
        emitters: s.emitters.map(toUiEmitter),
    };
}

/* Build the key -> system map the columns use for O(1) lookups by key. Order is
   irrelevant here (see buildSystemList for rendering order). */
export function buildSystemMap(model: VfxPortModel | null): VfxSystemMap {
    const map: VfxSystemMap = {};
    if (!model) return map;
    for (const raw of model.systems) {
        const sys = toUiSystem(raw);
        map[sys.key] = sys;
    }
    return map;
}

/* Order-preserving system list used for rendering. Keeps the bin's exact entry
   order (Object.values on the map reorders integer-like keys). New/ported
   systems are inserted at the top natively, so bin order = list order. */
export function buildSystemList(model: VfxPortModel | null): VfxSystem[] {
    if (!model) return [];
    return model.systems.map(toUiSystem);
}

// ── Resolver / effect keys ──

export interface EffectKeyOption {
    id: string;
    key: string;
    type: string;
    label: string;
    particleName: string | null;
    value?: string | null;
}

export function effectKeyOptionsFromModel(model: VfxPortModel | null): EffectKeyOption[] {
    if (!model) return [];
    return model.effectKeys.map((o) => ({
        id: `ek:${o.key}`,
        key: o.key,
        type: o.key.startsWith('0x') ? 'hash' : 'resolver',
        label: o.label,
        particleName: o.particleName,
        value: o.key,
    }));
}

export function resolverMapFromModel(model: VfxPortModel | null): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of model?.resolver?.entries ?? []) {
        if (!map.has(entry.key)) map.set(entry.key, entry.value);
    }
    return map;
}

/* Find the effect key (resolver key) that resolves to a system; falls back to
   the system's particle name when no resolver entry points at it. */
export function effectKeyForSystem(model: VfxPortModel | null, system: VfxSystem): string | null {
    if (!model) return null;
    const keyHex = `0x${system.key.split('@')[0]}`.toLowerCase();
    const candidates = [system.particlePath, system.particleName, system.name]
        .filter((v): v is string => !!v)
        .map((v) => v.toLowerCase());
    for (const entry of model.resolver?.entries ?? []) {
        const value = entry.value.toLowerCase();
        if (value === keyHex || candidates.includes(value)) return entry.key;
    }
    return system.particleName ?? system.name ?? null;
}

// ── Child particles ──

export interface AvailableVfxSystem {
    key: string;
    name: string;
    fullPath: string;
    particleName?: string | null;
}

export function availableSystemsFromModel(model: VfxPortModel | null): AvailableVfxSystem[] {
    if (!model) return [];
    return model.effectKeys.map((o) => ({
        key: o.key,
        name: o.particleName || o.label,
        fullPath: o.particleName || o.key,
        particleName: o.particleName,
    }));
}

// ── Idle particles ──

export const BONE_NAMES = [
    'head',
    'spine1',
    'spine2',
    'pelvis',
    'C_Buffbone_Glb_Layout_Loc',
    'C_Buffbone_Glb_Center_Loc',
    'C_Buffbone_Glb_Overhead_Loc',
    'R_Foot',
    'L_Foot',
    'R_KneeLower',
    'L_KneeLower',
    'neck',
    'r_hand',
    'l_hand',
    'root',
];

export interface BoneConfig {
    boneName: string;
}

export interface ExistingIdleEntry {
    effectKey: string;
    bones: string[];
}

export function idleEntriesFromModel(model: VfxPortModel | null): ExistingIdleEntry[] {
    return (model?.idle ?? []).map((e) => ({ effectKey: e.effectKey, bones: e.bones }));
}

// ── Persistent effects ──

export interface PersistentDelay {
    on: number;
    off: number;
}

export interface PersistentPreset {
    type: string;
    animationName?: string;
    scriptName?: string;
    spellHash?: string;
    slot?: number;
    index?: number;
    operator?: number;
    value?: number;
    delay: PersistentDelay;
    preserveRawOwnerCondition?: boolean;
}

export interface PersistentVfxItem {
    id?: string;
    key?: string;
    value?: string | null;
    type?: string;
    boneName?: string;
    scale?: number | null;
    ownerOnly?: boolean;
    attachToCamera?: boolean;
    forceRenderVfx?: boolean;
}

export interface PersistentCondition {
    index: number;
    label: string;
    preset: PersistentPreset;
    vfx: PersistentVfxItem[];
    submeshesShow: string[];
    submeshesHide: string[];
}

export function persistentConditionsFromModel(model: VfxPortModel | null): PersistentCondition[] {
    return (model?.persistent ?? []).map(toUiCondition);
}

function toUiCondition(view: PersistentView): PersistentCondition {
    const p = view.preset;
    return {
        index: view.index,
        label: view.label,
        preset: {
            type: p.type,
            animationName: p.animationName ?? undefined,
            scriptName: p.scriptName ?? undefined,
            spellHash: p.spellHash ?? undefined,
            slot: p.slot ?? undefined,
            index: p.type === 'HasGear' ? (p.slot ?? undefined) : undefined,
            operator: p.operator ?? undefined,
            value: p.value ?? undefined,
            delay: { on: p.delayOn, off: p.delayOff },
            preserveRawOwnerCondition: p.raw,
        },
        vfx: view.vfx.map((v) => ({
            key: v.key,
            boneName: v.boneName ?? undefined,
            scale: v.scale,
            ownerOnly: v.ownerOnly ?? undefined,
            attachToCamera: v.attachToCamera ?? undefined,
            forceRenderVfx: v.forceRender ?? undefined,
        })),
        submeshesShow: view.submeshesShow,
        submeshesHide: view.submeshesHide,
    };
}

/* Map the modal's UI state to the backend upsert payload. HasGear stores its
   gear index in the payload's slot field. */
export function buildPersistentPayload(
    preset: PersistentPreset,
    vfx: PersistentVfxItem[],
    submeshesShow: string[],
    submeshesHide: string[],
): PersistentPayload {
    return {
        preset: {
            type: preset.type,
            animationName: preset.animationName ?? null,
            scriptName: preset.scriptName ?? null,
            spellHash: preset.spellHash ?? null,
            slot: preset.type === 'HasGear' ? (preset.index ?? preset.slot ?? null) : (preset.slot ?? null),
            operator: preset.operator ?? null,
            value: preset.value ?? null,
            delayOn: preset.delay?.on ?? 0,
            delayOff: preset.delay?.off ?? 0,
        },
        vfx: vfx
            .filter((v): v is PersistentVfxItem & { key: string } => !!v.key)
            .map((v) => ({
                key: v.key,
                boneName: v.boneName || null,
                scale: v.scale ?? null,
                ownerOnly: v.ownerOnly ?? null,
                attachToCamera: v.attachToCamera ?? null,
                forceRender: v.forceRenderVfx ?? null,
            })),
        submeshesShow,
        submeshesHide,
    };
}
