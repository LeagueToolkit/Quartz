import { invokeCommand } from './core';

export interface FixFileResult {
    filePath: string;
    modified: boolean;
    shapesRewrittenRadius: number;
    shapesRewrittenVec3: number;
    shapesRewrittenEmpty: number;
    birthTranslationsLifted: number;
    error?: string | null;
}

export interface FixVfxShapeResult {
    filesProcessed: number;
    filesModified: number;
    filesFailed: number;
    shapesRewrittenRadius: number;
    shapesRewrittenVec3: number;
    shapesRewrittenEmpty: number;
    birthTranslationsLifted: number;
    results: FixFileResult[];
}

export interface CopyColorsResult {
    outputPath: string;
    entriesMatched: number;
    entriesSkipped: number;
    fieldsCopied: number;
    mismatches: number;
}

/**
 * Fix legacy VFX shapes. Pass either a single `filePath` or a `folderPath`
 * (scanned recursively for .bin). Modified files are backed up to a sibling
 * .bak when `createBackup` is set.
 */
export function toolsFixVfxShape(
    target: { filePath?: string; folderPath?: string },
    createBackup: boolean,
): Promise<FixVfxShapeResult> {
    return invokeCommand<FixVfxShapeResult>('tools_fix_vfx_shape', {
        filePath: target.filePath ?? null,
        folderPath: target.folderPath ?? null,
        createBackup,
    });
}

/**
 * Copy VFX colors from a donor `sourcePath` bin into a structurally identical
 * `targetPath` bin. Writes to `outputPath` when given, otherwise overwrites the
 * target (backing it up to .bak first when `createBackup` is set).
 */
export function toolsBinCopyColors(
    sourcePath: string,
    targetPath: string,
    outputPath: string | null,
    createBackup: boolean,
): Promise<CopyColorsResult> {
    return invokeCommand<CopyColorsResult>('tools_bin_copy_colors', {
        sourcePath,
        targetPath,
        outputPath: outputPath ?? null,
        createBackup,
    });
}

