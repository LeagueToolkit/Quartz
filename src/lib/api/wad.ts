import { invokeCommand } from './core';

export interface WadOpenResult {
    id: number;
    name: string;
    path: string;
    version: string;
    chunkCount: number;
}

export interface WadMountInfo {
    id: number;
    path: string;
    name: string;
    version: string;
    chunkCount: number;
}

export interface WadEntry {
    /** 16-char hex form of the xxh64 path hash. */
    pathHash: string;
    /** Resolved WAD path, or the hex form when the hash is unknown. */
    path: string;
    /** Decompressed size in bytes. */
    size: number;
    compressedSize: number;
    /** "None" | "Gzip" | "Satellite" | "Zstd" | "ZstdMulti". */
    type: string;
    /** True when the path didn't resolve. */
    unknown: boolean;
}

export interface WadExtractResult {
    written: number;
    skipped: number;
    errors: number;
    outputDir: string;
}

/** One WAD found by a game-folder scan. */
export interface ScannedWad {
    name: string;
    path: string;
    /** Path relative to FINAL, POSIX-separated. */
    relPath: string;
    size: number;
    isVoiceover: boolean;
}

/** Result of {@link wadScan}: WADs grouped by their top-level FINAL folder. */
export interface WadScanResult {
    groups: Record<string, ScannedWad[]>;
    finalDir: string;
    total: number;
}

/** Progress payload emitted on the `wad-extract-progress` event. */
export interface WadExtractProgress {
    current: number;
    total: number;
}

/** Open + parse a WAD and register it. Returns the mount id + header. */
export function wadMount(path: string): Promise<WadOpenResult> {
    return invokeCommand<WadOpenResult>('wad_mount', { path });
}

/** Drop a mount. Returns false if the id was unknown. */
export function wadUnmount(mountId: number): Promise<boolean> {
    return invokeCommand<boolean>('wad_unmount', { mountId });
}

/** Snapshot of every currently-mounted WAD. */
export function wadListMounted(): Promise<WadMountInfo[]> {
    return invokeCommand<WadMountInfo[]>('wad_list_mounted');
}

/** Flat list of a mounted WAD's entries. */
export function wadList(mountId: number): Promise<WadEntry[]> {
    return invokeCommand<WadEntry[]>('wad_list', { mountId });
}

/** Scan a League install's DATA/FINAL for all WADs, grouped by folder. */
export function wadScan(gamePath: string): Promise<WadScanResult> {
    return invokeCommand<WadScanResult>('wad_scan', { gamePath });
}

/** Read + decompress a single chunk, returned as base64. */
export function wadReadChunk(path: string, pathHash: string): Promise<string> {
    return invokeCommand<string>('wad_read_chunk', { path, pathHash });
}

/** Decode a DDS/TEX chunk to a PNG, returned as base64. */
export function wadDecodeTexture(path: string, pathHash: string): Promise<string> {
    return invokeCommand<string>('wad_decode_texture', { path, pathHash });
}

/**
 * Extract selected chunks (or all, when `hashes` is empty) into `outDir`.
 * Subscribe to the `wad-extract-progress` event for progress updates.
 */
export function wadExtractSelected(
    path: string,
    hashes: string[],
    outDir: string,
): Promise<WadExtractResult> {
    return invokeCommand<WadExtractResult>('wad_extract_selected', { path, hashes, outDir });
}
