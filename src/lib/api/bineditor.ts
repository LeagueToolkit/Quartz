import { invokeCommand } from './core';

export interface ScaleParamsResult {
    modified: number;
    systemsTouched: number;
    shapesFixed: number;
    outPath: string;
}

export interface SplitFile {
    kind: string;
    file: string;
    count: number;
    link: string;
}

export interface ConsolidateResult {
    moved: number;
    referenced: number;
    skippedShared: number;
    binRewritten: boolean;
}

/**
 * Scale birthScale0 / scale0 of every VFX emitter in a BIN.
 * A multiplier of 1.0 leaves that property untouched. Optionally runs the
 * legacy VFX shape (matrix) fix. Writes back to `targetPath` when given,
 * otherwise overwrites `path`.
 */
export function binScaleParams(
    path: string,
    birthScale: number,
    scale: number,
    applyMatrixFix: boolean,
    targetPath?: string,
): Promise<ScaleParamsResult> {
    return invokeCommand<ScaleParamsResult>('bin_scale_params', {
        path,
        birthScale,
        scale,
        applyMatrixFix,
        targetPath: targetPath ?? null,
    });
}

/**
 * Split a skin BIN into per-class sibling files (VFX / ANM). Pass an empty
 * `outDir` to use the derived `<project-root>/data/` folder.
 */
export function binSplitSkin(path: string, outDir = ''): Promise<SplitFile[]> {
    return invokeCommand<SplitFile[]>('bin_split_skin', { path, outDir });
}

/**
 * Consolidate VFX-referenced assets of a BIN into a shared folder under the
 * project directory, rewriting the BIN's asset strings.
 */
export function binConsolidateAssets(
    binPath: string,
    projectDir: string,
): Promise<ConsolidateResult> {
    return invokeCommand<ConsolidateResult>('bin_consolidate_assets', {
        binPath,
        projectDir,
    });
}

/* Bin Editor V2 — resident in-memory bin editing sessions. A file is opened
   once into a Rust session (the parsed ritoshark tree); the frontend holds a
   structured projection (EditorModel) and edits via commands that mutate the
   tree in place, addressing nodes by NodePath. */

/** One step into the bin tree: a struct field (FNV1a-32 hash) or a list index. */
export type Step = { field: number } | { index: number };

/** Opaque address of a node inside the resident bins; pass back verbatim.
 *  `bin` selects which resident bin (main at 0, linked bins follow). */
export interface NodePath {
    bin: number;
    entry: number;
    steps: Step[];
}

/** Numeric primitive tags whose JSON value is a plain number. */
export type BinNumType = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32' | 'f32';

/**
 * Tagged JSON encoding of a ritoshark BinValue. Field keys / class names may
 * be readable names or "0x<hex8>". i64/u64 travel as strings to avoid JS
 * precision loss. Map/Mtx44/Link project read-only as `unsupported`.
 */
export type JsonBinValue =
    | { t: 'none' }
    | { t: 'bool'; v: boolean }
    | { t: BinNumType; v: number }
    | { t: 'i64' | 'u64'; v: string }
    | { t: 'vec2'; v: [number, number] }
    | { t: 'vec3'; v: [number, number, number] }
    | { t: 'vec4' | 'rgba'; v: [number, number, number, number] }
    | { t: 'string' | 'hash' | 'file'; v: string }
    | { t: 'list'; item: string; items: JsonBinValue[] }
    | { t: 'pointer' | 'embed'; class: string; fields: Record<string, JsonBinValue> }
    | { t: 'option'; inner: string; value: JsonBinValue | null }
    | { t: 'flag'; v: boolean }
    | { t: 'unsupported'; desc: string };

/** One leaf set: the value's tag must match the existing node's variant. */
export interface EditOp {
    path: NodePath;
    value: JsonBinValue;
}

export interface EditorNode {
    /** Field name / "0x..."; null for list elements. */
    key: string | null;
    kind: 'primitive' | 'vector' | 'struct' | 'list' | 'option' | 'unsupported';
    // primitive:
    valueType?: 'number' | 'string' | 'bool' | 'hash';
    value?: number | string | boolean;
    /** 'f32' | 'u8' | ... so edits are sent back with the right tag. */
    numType?: string;
    // vector: children are primitive numbers (x,y,z[,w]).
    vecType?: string;
    // struct (pointer/embed):
    className?: string;
    // list:
    itemType?: string;
    /** Always present, addresses THIS node. */
    path: NodePath;
    children?: EditorNode[];
}

export interface EditorEmitter {
    /** `${systemKey}__emitter_${idx}` (paint convention). */
    key: string;
    /** emitterName or "Unnamed". */
    name: string;
    /** Path to the emitter's embed/pointer node itself. */
    path: NodePath;
    fields: EditorNode[];
}

export interface EditorSystem {
    /** Hex path_hash, e.g. "1a2b3c4d". */
    key: string;
    /** particleName or derived short name (same logic as paint). */
    name: string;
    /** Which resident bin this system lives in (main at 0, linked bins follow). */
    bin: number;
    emitters: EditorEmitter[];
}

export interface EditorModel {
    systems: EditorSystem[];
}

export interface BinEditorOpenResult {
    sessionId: number;
    model: EditorModel;
}

export interface BinEditorApplyResult {
    changed: number;
}

/** Open a bin/py/ritobin file into a resident editor session. */
export function binEditorOpen(path: string): Promise<BinEditorOpenResult> {
    return invokeCommand<BinEditorOpenResult>('bin_editor_open', { path });
}

/** Reproject the model from the live tree. */
export function binEditorModel(sessionId: number): Promise<EditorModel> {
    return invokeCommand<EditorModel>('bin_editor_model', { sessionId });
}

/** Batch leaf sets; one undo snapshot per batch. The caller mutates its local model copy itself. */
export function binEditorApply(sessionId: number, edits: EditOp[]): Promise<BinEditorApplyResult> {
    return invokeCommand<BinEditorApplyResult>('bin_editor_apply', { sessionId, edits });
}

/** Add a struct/pointer/embed field (key) or a list item (index; null = append). Returns the refreshed model. */
export function binEditorInsert(
    sessionId: number,
    parentPath: NodePath,
    key: string | null,
    index: number | null,
    value: JsonBinValue,
): Promise<EditorModel> {
    return invokeCommand<EditorModel>('bin_editor_insert', { sessionId, parentPath, key, index, value });
}

/** Remove a field or list element. Returns the refreshed model. */
export function binEditorRemove(sessionId: number, path: NodePath): Promise<EditorModel> {
    return invokeCommand<EditorModel>('bin_editor_remove', { sessionId, path });
}

/** Move a field/list element up (delta < 0) or down (delta > 0) within its
 *  parent by |delta| positions (clamped to bounds). Returns the refreshed model. */
export function binEditorMove(sessionId: number, path: NodePath, delta: number): Promise<EditorModel> {
    return invokeCommand<EditorModel>('bin_editor_move', { sessionId, path, delta });
}

/** Undo/redo response: entry-granular edits return only the re-projected
 *  systems they touched; whole-tree frames (restore) return a full model. */
export type BinEditorUndoResult =
    | { kind: 'full'; model: EditorModel }
    | { kind: 'partial'; entries: { bin: number; entry: number }[]; systems: EditorSystem[] };

/** Undo the last edit. Returns the refreshed view, or null if nothing to undo. */
export function binEditorUndo(sessionId: number): Promise<BinEditorUndoResult | null> {
    return invokeCommand<BinEditorUndoResult | null>('bin_editor_undo', { sessionId });
}

/** Redo the last undone edit; returns the refreshed view or null. */
export function binEditorRedo(sessionId: number): Promise<BinEditorUndoResult | null> {
    return invokeCommand<BinEditorUndoResult | null>('bin_editor_redo', { sessionId });
}

/** Reset the tree to its state at open (snapshots current state for undo). */
export function binEditorRestore(sessionId: number): Promise<EditorModel> {
    return invokeCommand<EditorModel>('bin_editor_restore', { sessionId });
}

/** Save the session: with no outPath, writes every dirty bin to its own file;
 *  with outPath, saves the main bin there (Save As). Returns the files written.
 *  Rejects with a `STALE_FILE:` error if a file changed on disk since opening,
 *  unless `force` is true (see {@link isStaleFileError}). */
export function binEditorSave(sessionId: number, outPath?: string, force = false): Promise<string[]> {
    return invokeCommand<string[]>('bin_editor_save', { sessionId, outPath: outPath ?? null, force });
}

/** Close a session and free its tree. */
export function binEditorClose(sessionId: number): Promise<boolean> {
    return invokeCommand<boolean>('bin_editor_close', { sessionId });
}
