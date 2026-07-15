import { invokeCommand } from './core';

export interface WadTocEntry {
    pathHash: string;
    compressedSize: number;
    uncompressedSize: number;
    compression: string;
    dataOffset: number;
    resolvedPath: string | null;
}

export interface ExtractResult {
    extracted: number;
    failed: number;
    written: string[];
}

/** Locate a champion's main WAD inside a League install. */
export function wadFindChampion(leaguePath: string, champion: string): Promise<string | null> {
    return invokeCommand<string | null>('wad_find_champion', { leaguePath, champion });
}

/** Read a WAD's table of contents, resolving chunk path hashes. */
export function wadReadToc(wadPath: string): Promise<WadTocEntry[]> {
    return invokeCommand<WadTocEntry[]>('wad_read_toc', { wadPath });
}

/** Extract the named chunks (16-char hex hashes) to a directory. */
export function wadExtractChunks(
    wadPath: string,
    hashes: string[],
    outDir: string,
    preservePaths: boolean,
): Promise<ExtractResult> {
    return invokeCommand<ExtractResult>('wad_extract_chunks', { wadPath, hashes, outDir, preservePaths });
}

// ── Port "load donor from game" ──

export interface DonorResult {
    donorPyContent: string;
    tempRoot: string;
    combinedBinPath: string;
    modelPath: string | null;
    modelTexturePath: string | null;
    championFileName: string;
    skinId: number;
    selectedBinCount: number;
    extractedAssetCount: number;
    cacheHit: boolean;
}

/** Prepare a donor from a live skin WAD; returns donor ritobin py text. */
export function portPrepareDonorFromSkin(args: {
    championName: string;
    skinId: number;
    leaguePath: string;
    portingPrefix?: string;
}): Promise<DonorResult> {
    return invokeCommand<DonorResult>('port_prepare_donor_from_skin', {
        championName: args.championName,
        skinId: args.skinId,
        leaguePath: args.leaguePath,
        portingPrefix: args.portingPrefix ?? null,
    });
}

/** Delete a donor temp cache root. */
export function portCleanupDonorTemp(tempRoot: string): Promise<void> {
    return invokeCommand<void>('port_cleanup_donor_temp', { tempRoot });
}

export interface AssetCopyResult {
    copied: number;
    missing: number;
    missingPaths: string[];
}

/** Copy emitter-referenced assets into the target bin's mod tree. */
export function portCopyAssetsToTarget(args: {
    assetPaths: string[];
    sourceDirs: string[];
    targetBinPath: string;
}): Promise<AssetCopyResult> {
    return invokeCommand<AssetCopyResult>('port_copy_assets_to_target', args);
}

/** Resolve an asset rel path to a disk file under a bin's mod tree. */
export function portResolveAssetPath(assetPath: string, binPath: string): Promise<string | null> {
    return invokeCommand<string | null>('port_resolve_asset_path', { assetPath, binPath });
}

// ── Backups ──

export interface BackupInfo {
    name: string;
    path: string;
    size: number;
    modified: number;
    component: string;
}

/** Create a backup of `content` for a file, tagged with `component`. */
export function backupCreate(filePath: string, content: string, component: string): Promise<void> {
    return invokeCommand<void>('backup_create', { filePath, content, component });
}

/** List backups for a file, newest first. */
export function backupList(filePath: string): Promise<BackupInfo[]> {
    return invokeCommand<BackupInfo[]>('backup_list', { filePath });
}

/** Restore a backup, writing it back to the original path; returns its content. */
export function backupRestore(backupPath: string, originalPath: string): Promise<string> {
    return invokeCommand<string>('backup_restore', { backupPath, originalPath });
}
