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
