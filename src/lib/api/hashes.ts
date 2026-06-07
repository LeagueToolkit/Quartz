import { invokeCommand } from './core';

export interface HashFileStatus {
    name: string;
    present: boolean;
    size: number;
}

export interface HashStatus {
    dir: string;
    files: HashFileStatus[];
    complete: boolean;
}

export interface DownloadResult {
    downloaded: number;
    skipped: number;
    errors: string[];
}

export function getHashStatus(): Promise<HashStatus> {
    return invokeCommand<HashStatus>('get_hash_status');
}

export function downloadHashes(force: boolean): Promise<DownloadResult> {
    return invokeCommand<DownloadResult>('download_hashes', { force });
}
