import { invokeCommand } from './core';

export interface BumpathOptions {
    /** Prefix segment inserted after the first data/ or assets/ component. */
    prefix: string;
    /** Destination directory for the repathed output. */
    outputPath: string;
    /** Skin ids to repath (e.g. [1, 14] -> skins/skin1.bin). Empty = all BINs. */
    selectedSkinIds?: number[];
    /** Skip missing referenced files instead of failing. Defaults to true. */
    ignoreMissing?: boolean;
    /** Merge linked BINs into their main BIN. Defaults to true. */
    combineLinked?: boolean;
    /** Accepted for parity; hashes are resolved via the shared LMDB. */
    hashesPath?: string;
}

export interface BumpathResult {
    outputDir: string;
    binsProcessed: number;
    assetsCopied: number;
    missing: number;
    combined: number;
}

/** Repath a mod folder, integrating asset references under a prefix. */
export function bumpathRepath(
    folder: string,
    options: BumpathOptions,
): Promise<BumpathResult> {
    return invokeCommand<BumpathResult>('bumpath_repath', { folder, options });
}
