import { invokeCommand } from './core';

export interface Champion {
    id: string;
    name: string;
    skinCount: number;
}

export interface ExtractResult {
    ok: boolean;
    outputDir: string;
    files: number;
}

export function discoverChampions(): Promise<Champion[]> {
    return invokeCommand<Champion[]>('discover_champions');
}

export function extractChampionAssets(
    champion: string,
    skinId: number,
    outputDir: string,
): Promise<ExtractResult> {
    return invokeCommand<ExtractResult>('extract_champion_assets', { champion, skinId, outputDir });
}
