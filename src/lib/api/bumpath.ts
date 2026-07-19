import { invokeCommand } from './core';

export interface BumpathOptions {
    /** Prefix segment inserted after the first data/ or assets/ component. */
    prefix: string;
    /** Destination directory for the repathed output. */
    outputPath: string;
    /** Skin ids to repath (e.g. [1, 14] -> skins/skin1.bin). Empty = all BINs. */
    selectedSkinIds?: number[];
    /** Exact BIN files selected in the Bumpath source list. */
    selectedBinPaths?: string[];
    /** Per-entry prefixes keyed by the entry's 8-character path hash. */
    entryPrefixes?: Record<string, string>;
    /** Skip missing referenced files instead of failing. Defaults to true. */
    ignoreMissing?: boolean;
    /** Merge linked BINs into their main BIN. Defaults to true. */
    combineLinked?: boolean;
    /** Split VFX entries from output skin BINs into linked sibling BINs. Defaults to true. */
    splitVfx?: boolean;
    /** Consolidate VFX textures/strings into per-skin particle folders. Defaults to true. */
    consolidateAssets?: boolean;
    /** Accepted for parity; hashes are resolved via the shared LMDB. */
    hashesPath?: string;
}

export interface BumpathResult {
    outputDir: string;
    binsProcessed: number;
    assetsCopied: number;
    missing: number;
    combined: number;
    vfxSplit: number;
    assetsConsolidated: number;
}

/** Repath a mod folder, integrating asset references under a prefix. */
export function bumpathRepath(
    folders: string[],
    options: BumpathOptions,
): Promise<BumpathResult> {
    return invokeCommand<BumpathResult>('bumpath_repath', { folders, options });
}
