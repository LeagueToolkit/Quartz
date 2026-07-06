import { invokeCommand } from './core';

/* Mirrors the Flint-style hash backend: prebuilt LMDB pulled from the
   lmdb-hashes GitHub releases into %APPDATA%/RitoShark/Requirements/Hashes. */
export interface HashStatus {
    dir: string;
    present: boolean;
    loadedCount: number;
    lastUpdated: string | null;
}

export interface DownloadResult {
    downloaded: number;
    skipped: number;
    errors: number;
}

export function getHashStatus(): Promise<HashStatus> {
    return invokeCommand<HashStatus>('get_hash_status');
}

export function downloadHashes(force: boolean): Promise<DownloadResult> {
    return invokeCommand<DownloadResult>('download_hashes', { force });
}

export function reloadHashes(): Promise<DownloadResult> {
    return invokeCommand<DownloadResult>('reload_hashes');
}

export function forceRebuildHashes(): Promise<DownloadResult> {
    return invokeCommand<DownloadResult>('force_rebuild_hashes');
}

// BIN parsing via the ritoshark bridge.
export function readBin(path: string): Promise<string> {
    return invokeCommand<string>('read_bin', { path });
}

export function writeBin(text: string, outPath: string): Promise<void> {
    return invokeCommand<void>('write_bin', { text, outPath });
}

/** Convert ritobin text to BIN bytes in memory (no file write). */
export function textToBinBytes(text: string): Promise<number[]> {
    return invokeCommand<number[]>('text_to_bin_bytes', { text });
}
