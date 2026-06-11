/* Shared view-model types for the Asset Extractor page. These merge the Rust
   backend Champion (file id + skin list) with CommunityDragon metadata
   (numeric id, alias, display name, splash art, rarity, chromas). */

import type { Chroma, CDragonSkin } from './communityDragonApi';

export type { Chroma };

/* A champion row in the sidebar: backend identity plus CDragon display data. */
export interface ExtractorChampion {
    /* Backend/file id used by extractChampionAssets (e.g. "ahri"). */
    id: string;
    /* CDragon numeric id used for icons / chroma images (string), or null. */
    cdragonId: string | null;
    name: string;
    alias: string;
    wadPath: string;
    /* Skin ids actually present in the WAD (always includes 0). */
    availableSkinIds: number[];
    skinCount: number;
    championIconUrl?: string;
}

/* A skin card: CDragon metadata if available, otherwise a WAD-derived fallback.
   `id` is the skin number within the champion (0 = base). */
export interface ExtractorSkin {
    id: number;
    name: string;
    full_id: string;
    rarity?: string;
    tilePath: string | null;
    centeredSplashPath: string | null;
    uncenteredSplashPath: string | null;
    skinLines: number[];
    hideRarityIcon?: boolean;
}

export type CDragonSkinAlias = CDragonSkin;

/* An entry in the bottom selection summary bar. */
export interface SelectedSkin {
    id: number;
    name: string;
    champion: { name: string; id?: string; alias?: string };
}

export type LogType = 'info' | 'success' | 'warning' | 'error';

export interface ConsoleLog {
    id: number;
    timestamp: string;
    message: string;
    type: LogType;
}
