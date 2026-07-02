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

/* Scan the detected install for champions and their skins. */
export function discoverChampions(): Promise<Champion[]> {
    return invokeCommand<Champion[]>('discover_champions');
}

/* Options controlling how a champion skin is extracted. `clean` (skin-files-only)
   and `preserveHudIcons2D` default to true in the backend; `chromaId` selects a
   chroma of the same skin. */
export interface ExtractChampionOptions {
    clean?: boolean;
    chromaId?: number;
    preserveHudIcons2D?: boolean;
}

/* Extract a champion skin's asset bundle into outputDir. Emits
   `extract-progress` events as it runs. `opts` tunes clean-mode/chroma. */
export function extractChampionAssets(
    champion: string,
    skinId: number,
    outputDir: string,
    includeVo = false,
    opts: ExtractChampionOptions = {},
): Promise<ExtractResult> {
    return invokeCommand<ExtractResult>('extract_champion_assets', {
        champion,
        skinId,
        outputDir,
        includeVo,
        clean: opts.clean,
        chromaId: opts.chromaId,
        preserveHudIcons2D: opts.preserveHudIcons2D,
    });
}

/* Extract a TFT companion (little legend) asset bundle into outputDir. Emits
   `extract-progress` events as it runs. */
export function extractTftCompanion(
    petAlias: string,
    tier: number,
    outputDir: string,
): Promise<ExtractResult> {
    return invokeCommand<ExtractResult>('extract_tft_companion', {
        petAlias,
        tier,
        outputDir,
    });
}

export interface RepathSummary {
    ok: boolean;
    outputDir: string;
    binsCombined: number;
    pathsModified: number;
    filesRelocated: number;
    filesRemoved: number;
    missing: number;
    /** Independent character roots concatenated (main champ + subcharacters like Tibbers). */
    charactersCombined: number;
    elapsedMs: number;
}

export interface RepathParams {
    contentDir: string;
    champion: string;
    skinId: number;
    /** Single flat prefix — paths become ASSETS/<prefix>/... */
    prefix: string;
    combineLinked?: boolean;
    cleanupUnused?: boolean;
    /** Leave SFX audio banks in place (don't prefix/relocate). Default true. */
    skipSfx?: boolean;
    /** Repath voiceover banks too (default false = VO left in place). */
    extractVoiceover?: boolean;
    /** WAD folder name override, e.g. "Companions.wad.client" for TFT. */
    wadFolderOverride?: string;
}

/* Repath an already-extracted skin folder in place (combine linked BINs, then
   rewrite paths under ASSETS/<prefix> and relocate). Turns a raw extraction
   into an installable mod. Uses the Flint-ported engine. */
export function extractorRepath(params: RepathParams): Promise<RepathSummary> {
    return invokeCommand<RepathSummary>('extractor_repath', {
        contentDir: params.contentDir,
        champion: params.champion,
        skinId: params.skinId,
        prefix: params.prefix,
        combineLinked: params.combineLinked,
        cleanupUnused: params.cleanupUnused,
        skipSfx: params.skipSfx,
        extractVoiceover: params.extractVoiceover,
        wadFolderOverride: params.wadFolderOverride,
    });
}
