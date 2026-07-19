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

// ── WAD Explorer ───────────────────────────────────────────────────────────

export interface ScannedWad {
    name: string;
    path: string;
    relPath: string;
    size: number;
    isVoiceover: boolean;
}

export interface WadExplorerScanResult {
    groups: Record<string, ScannedWad[]>;
    finalDir: string;
    total: number;
}

export interface WadExplorerIndex {
    mountId: number;
    path: string;
    name: string;
    version: string;
    chunkCount: number;
    paths: string[];
}

export interface WadExplorerBatchIndex {
    mountId: number | null;
    path: string;
    name: string;
    version: string;
    chunkCount: number;
    paths: string[];
    error: string | null;
}

export interface WadExplorerSearchGroup {
    mountId: number;
    wadPath: string;
    entries: WadExplorerEntry[];
}

export interface WadExplorerSearchResult {
    groups: WadExplorerSearchGroup[];
    returnedMatches: number;
    truncated: boolean;
}

export interface WadExplorerEntry {
    pathHash: string;
    path: string;
    size: number;
    compressedSize: number;
    type: 'None' | 'Gzip' | 'Satellite' | 'Zstd' | 'ZstdMulti' | string;
    unknown: boolean;
}

export interface WadExplorerExtractResult {
    written: number;
    skipped: number;
    errors: number;
    outputDir: string;
}

export interface WadHashExtractResult {
    gameHashes: number;
    binHashes: number;
}

export interface WadPreviewItem {
    pathHash: string;
    path: string;
}

export interface WadPreparedPreview {
    root: string;
    primaryPath: string;
    texturePath: string | null;
    texturePaths: Record<string, string>;
    hiddenSubmeshes: string[];
    modelScale: number;
    /** Prepared companion .anm paths on disk (for the animation viewer). */
    anmPaths: string[];
    /** Resolved clips (submesh-visibility events + sequencer queues). */
    anmClips: import('./modelInspect').PreparedClip[];
}

export function wadExplorerScan(gamePath: string): Promise<WadExplorerScanResult> {
    return invokeCommand<WadExplorerScanResult>('wad_explorer_scan', { gamePath });
}

export function wadExplorerIndex(wadPath: string): Promise<WadExplorerIndex> {
    return invokeCommand<WadExplorerIndex>('wad_explorer_index', { wadPath });
}

export function wadExplorerIndexMany(wadPaths: string[]): Promise<WadExplorerBatchIndex[]> {
    return invokeCommand<WadExplorerBatchIndex[]>('wad_explorer_index_many', { wadPaths });
}

export function wadExplorerSearch(query: string, limit = 10_000): Promise<WadExplorerSearchResult> {
    return invokeCommand<WadExplorerSearchResult>('wad_explorer_search', { query, limit });
}

export function wadExplorerEntries(mountId: number): Promise<WadExplorerEntry[]> {
    return invokeCommand<WadExplorerEntry[]>('wad_explorer_entries', { mountId });
}

export function wadExplorerUnmount(mountId: number): Promise<boolean> {
    return invokeCommand<boolean>('wad_explorer_unmount', { mountId });
}

export function wadExplorerUnmountAll(): Promise<number> {
    return invokeCommand<number>('wad_explorer_unmount_all');
}

export function wadExplorerTexture(wadPath: string, pathHash: string, maxDimension?: number): Promise<ArrayBuffer> {
    return invokeCommand<ArrayBuffer>('wad_explorer_texture', { wadPath, pathHash, maxDimension: maxDimension ?? null });
}

export function wadExplorerText(wadPath: string, pathHash: string, extension: string): Promise<string> {
    return invokeCommand<string>('wad_explorer_text', { wadPath, pathHash, extension });
}

export function wadExplorerExtract(args: {
    wadPath: string;
    hashes: string[];
    outputDir: string;
    replaceExisting: boolean;
    preservePaths: boolean;
}): Promise<WadExplorerExtractResult> {
    return invokeCommand<WadExplorerExtractResult>('wad_explorer_extract', args);
}

export function wadExplorerExtractHashes(wadPath: string): Promise<WadHashExtractResult> {
    return invokeCommand<WadHashExtractResult>('wad_explorer_extract_hashes', { wadPath });
}

export function wadExplorerPrepareModel(args: {
    wadPath: string;
    files: WadPreviewItem[];
    primaryPath: string;
    texturePath?: string | null;
}): Promise<WadPreparedPreview> {
    return invokeCommand<WadPreparedPreview>('wad_explorer_prepare_model', {
        ...args,
        texturePath: args.texturePath ?? null,
    });
}

// ── Port "load donor from game" ──

export interface DonorResult {
    donorPyContent: string;
    tempRoot: string;
    combinedBinPath: string;
    modelPath: string | null;
    modelTexturePath: string | null;
    modelTexturePaths: Record<string, string>;
    modelHiddenSubmeshes: string[];
    modelScale: number;
    /** Extracted .anm clip paths for the animation viewer. */
    anmPaths: string[];
    /** Resolved clips (submesh-visibility events + sequencer queues). */
    anmClips: import('./modelInspect').PreparedClip[];
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
    chromaId?: number | null;
    leaguePath: string;
    portingPrefix?: string;
}): Promise<DonorResult> {
    return invokeCommand<DonorResult>('port_prepare_donor_from_skin', {
        championName: args.championName,
        skinId: args.skinId,
        chromaId: args.chromaId ?? null,
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
