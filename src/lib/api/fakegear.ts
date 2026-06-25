import { invokeCommand } from './core';

export interface CopyAssetsResult {
    copied: string[];
    skipped: string[];
    targetFolder: string;
    texturePath: string;
    meshPath: string;
}

export interface MinimalMeshResult {
    /** "success", "skip", or "error". */
    status: string;
    message: string;
    /** Bone count from the SKL, used to size the toggle mask. 0 if unknown. */
    boneCount: number;
}

export interface WriteVariantBinsResult {
    variant1Path: string;
    variant2Path: string;
    variant1SystemCount: number;
    variant2SystemCount: number;
}

/** Copy bundled screen.dds / screen.scb into <project>/assets/togglescreen. */
export function fakegearCopyToggleScreenAssets(binPath: string): Promise<CopyAssetsResult> {
    return invokeCommand<CopyAssetsResult>('fakegear_copy_togglescreen_assets', { binPath });
}

/** Add a MinimalMesh submesh to the mod .skn and read the true SKL bone count. */
export function fakegearProcessMinimalMesh(pyContent: string, binPath: string): Promise<MinimalMeshResult> {
    return invokeCommand<MinimalMeshResult>('fakegear_process_minimal_mesh', { pyContent, binPath });
}

/** Resolve a valid .anm reference on disk (or the first one if none resolve). */
export function fakegearValidateAnm(pyContent: string, binPath: string): Promise<string | null> {
    return invokeCommand<string | null>('fakegear_validate_anm', { pyContent, binPath });
}

/** Write variant1.bin / variant2.bin into the mod data folder, merging existing systems. */
export function fakegearWriteVariantBins(
    mainBinPath: string,
    variant1Systems: string[],
    variant2Systems: string[],
): Promise<WriteVariantBinsResult> {
    return invokeCommand<WriteVariantBinsResult>('fakegear_write_variant_bins', {
        mainBinPath,
        variant1Systems,
        variant2Systems,
    });
}
