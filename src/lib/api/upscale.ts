import { invokeCommand } from './core';

export interface UpscaleStatus {
    binary: { installed: boolean; path: string };
    models: { installed: string[]; total: number };
}

export interface UpscaleStreamResult {
    code: number;
    stdout: string;
    stderr: string;
}

export interface UpscaleBatchResults {
    total: number;
    successful: number;
    failed: number;
    errors: string[];
}

// Small key/value prefs persisted under the Quartz app home (upscale-prefs.json).
export function prefsGet(key: string): Promise<string | null> {
    return invokeCommand<string | null>('prefs_get', { key });
}
export function prefsSet(key: string, value: string): Promise<void> {
    return invokeCommand<void>('prefs_set', { key, value });
}

export function upscaleCheckStatus(): Promise<UpscaleStatus> {
    return invokeCommand<UpscaleStatus>('upscale_check_status');
}

// Downloads the binary + models; streams 'upscale:progress' events.
export function upscaleDownloadAll(): Promise<string> {
    return invokeCommand<string>('upscale_download_all');
}

// Resolves the upscayl-bin.exe path, or null if not installed.
export function realesrganEnsure(): Promise<string | null> {
    return invokeCommand<string | null>('realesrgan_ensure');
}

// Single-file upscale; streams 'upscayl:log' / 'upscayl:progress' events.
export function upscaylStream(
    exePath: string,
    args: string[],
    cwd?: string,
): Promise<UpscaleStreamResult> {
    return invokeCommand<UpscaleStreamResult>('upscayl_stream', { exePath, args, cwd });
}

// Folder upscale; streams 'upscayl:batch-*' events.
export function upscaylBatchProcess(opts: {
    inputFolder: string;
    outputFolder: string;
    model: string;
    scale: number;
    extraArgs: string;
    exePath: string;
}): Promise<UpscaleBatchResults> {
    return invokeCommand<UpscaleBatchResults>('upscayl_batch_process', opts);
}

export function upscaylCancel(): Promise<void> {
    return invokeCommand<void>('upscayl_cancel');
}
