import { invokeCommand } from './core';

export interface SkinEntry {
    id: number;
    name: string;
}

export interface Champion {
    id: string;
    name: string;
    wadPath: string;
    skins: SkinEntry[];
    skinCount: number;
}

export interface ExtractResult {
    ok: boolean;
    outputDir: string;
    files: number;
    skipped: number;
    errors: number;
    elapsedMs: number;
}

/* Live progress payload emitted on the `extract-progress` Tauri event while
   extract_champion_assets runs. Subscribe with listen('extract-progress', ...). */
export interface ExtractProgress {
    phase: 'preparing' | 'extracting' | 'voiceover' | 'complete';
    current: number;
    total: number;
    message: string;
}

/* Detect the League of Legends install root (stored setting → registry →
   common paths). Returns null when nothing valid is found. */
export function getLeaguePath(): Promise<string | null> {
    return invokeCommand<string | null>('get_league_path');
}

/* Scan the detected install for champions and their skins. */
export function discoverChampions(): Promise<Champion[]> {
    return invokeCommand<Champion[]>('discover_champions');
}

/* Extract a champion skin's asset bundle into outputDir. Emits
   `extract-progress` events as it runs. */
export function extractChampionAssets(
    champion: string,
    skinId: number,
    outputDir: string,
    includeVo = false,
): Promise<ExtractResult> {
    return invokeCommand<ExtractResult>('extract_champion_assets', {
        champion,
        skinId,
        outputDir,
        includeVo,
    });
}
