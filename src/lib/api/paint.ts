import { invokeCommand } from './core';

/* Paint — resident in-memory bin editing. A file is opened once into a Rust
   session (the parsed ritoshark tree); the frontend holds only this structured
   view and edits via commands that mutate the tree in place. */

export interface ColorKeyframe {
    rgba: [number, number, number, number];
    time: number;
}

export interface ColorData {
    keyframes: ColorKeyframe[];
    isConstant: boolean;
}

export interface EmitterTexture {
    label: string;
    path: string;
}

export interface EmitterColors {
    color: ColorData | null;
    birthColor: ColorData | null;
    fresnelColor: ColorData | null;
    lingerColor: ColorData | null;
}

export interface VfxEmitter {
    key: string;
    name: string;
    systemKey: string;
    blendMode: number;
    textures: EmitterTexture[];
    colors: EmitterColors;
}

export interface VfxSystem {
    key: string;
    name: string;
    particleName: string | null;
    emitterKeys: string[];
}

export interface MaterialParam {
    name: string;
    values: [number, number, number, number];
    isColor: boolean;
}

export interface VfxMaterial {
    key: string;
    name: string;
    colorParams: MaterialParam[];
}

export interface VfxStats {
    systemCount: number;
    emitterCount: number;
    materialCount: number;
    colorParamCount: number;
}

export interface VfxModel {
    systems: VfxSystem[];
    systemOrder: string[];
    emitters: VfxEmitter[];
    materials: VfxMaterial[];
    materialOrder: string[];
    stats: VfxStats;
}

export interface PaintOpenResult {
    sessionId: number;
    model: VfxModel;
}

export type RecolorModeId = 'random' | 'random-keyframe' | 'linear' | 'shift' | 'shift-hue' | 'materials';

/** A color target the recolor applies to. */
export type ColorTargetId = 'all' | 'color' | 'birthColor' | 'fresnelColor' | 'lingerColor';

export interface PaletteStopInput {
    vec4: [number, number, number, number];
    time: number;
}

export interface RecolorOptionsInput {
    mode: RecolorModeId;
    ignoreBlackWhite?: boolean;
    preserveAlpha?: boolean;
    hslShift?: [number, number, number];
    hueTarget?: number | null;
    seed?: number;
}

export interface RecolorResult {
    changed: number;
    /** Refreshed colors for the touched emitters only — patch these into the
     *  resident model instead of replacing it wholesale. */
    colors: Record<string, EmitterColors>;
}

/** Open a bin/py/ritobin file into a resident session. */
export function paintOpen(path: string): Promise<PaintOpenResult> {
    return invokeCommand<PaintOpenResult>('paint_open', { path });
}

/** Close a session and free its tree. */
export function paintClose(sessionId: number): Promise<boolean> {
    return invokeCommand<boolean>('paint_close', { sessionId });
}

/** Reparse the session when any loaded BIN changed outside Quartz. */
export function paintReloadIfChanged(sessionId: number): Promise<VfxModel | null> {
    return invokeCommand<VfxModel | null>('paint_reload_if_changed', { sessionId });
}

/** Recolor selected emitters' selected color slots. Returns the count changed
 *  plus refreshed colors for just the touched emitters. */
export function paintRecolor(
    sessionId: number,
    emitterKeys: string[],
    colorTargets: ColorTargetId[],
    palette: PaletteStopInput[],
    options: RecolorOptionsInput,
): Promise<RecolorResult> {
    return invokeCommand<RecolorResult>('paint_recolor', { sessionId, emitterKeys, colorTargets, palette, options });
}

/** Set a single emitter's blend mode. */
export function paintSetBlendMode(sessionId: number, emitterKey: string, mode: number): Promise<boolean> {
    return invokeCommand<boolean>('paint_set_blend_mode', { sessionId, emitterKey, mode });
}

/** Set a single static-material color param (selectionKey = `mat::<key>::<name>`). */
export function paintSetMaterialParam(
    sessionId: number,
    selectionKey: string,
    values: [number, number, number, number],
    preserveAlpha = false,
): Promise<boolean> {
    return invokeCommand<boolean>('paint_set_material_param', { sessionId, selectionKey, values, preserveAlpha });
}

/** Rewrite an emitter's texture path. `oldPath` identifies the node (its current
 *  value); `newPath` replaces it. Returns the refreshed model, or null if the
 *  node wasn't found / value unchanged. */
export function paintSetTexture(
    sessionId: number,
    emitterKey: string,
    oldPath: string,
    newPath: string,
): Promise<VfxModel | null> {
    return invokeCommand<VfxModel | null>('paint_set_texture', { sessionId, emitterKey, oldPath, newPath });
}

/** Set the per-keyframe alpha of an emitter color slot (color / birthColor /
 *  fresnelColor / lingerColor), preserving RGB. `alphas` are in model keyframe
 *  order (constant first, then the values list). Returns the refreshed model. */
export function paintSetColorAlpha(
    sessionId: number,
    emitterKey: string,
    slot: 'color' | 'birthColor' | 'fresnelColor' | 'lingerColor',
    alphas: number[],
): Promise<VfxModel | null> {
    return invokeCommand<VfxModel | null>('paint_set_color_alpha', { sessionId, emitterKey, slot, alphas });
}

/** Undo the last edit. Returns the refreshed model, or null if nothing to undo. */
export function paintUndo(sessionId: number): Promise<VfxModel | null> {
    return invokeCommand<VfxModel | null>('paint_undo', { sessionId });
}

/** Redo the last undone edit; returns the refreshed model or null. */
export function paintRedo(sessionId: number): Promise<VfxModel | null> {
    return invokeCommand<VfxModel | null>('paint_redo', { sessionId });
}

/** Save the session: with no outPath, writes every dirty bin to its own file;
 *  with outPath, saves the main bin there (Save As). Returns the files written.
 *  Rejects with a `STALE_FILE:` error if a file changed on disk since opening,
 *  unless `force` is true (see {@link isStaleFileError}). */
export function paintSave(sessionId: number, outPath?: string, force = false): Promise<string[]> {
    return invokeCommand<string[]>('paint_save', { sessionId, outPath: outPath ?? null, force });
}
