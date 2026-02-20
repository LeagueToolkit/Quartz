/**
 * Flint - Data Dragon / CommunityDragon API
 * 
 * Fetches champion and skin data from Riot's official APIs
 */

const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";
const CDRAGON_BASE_URL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";

// Types
export interface DDragonChampion {
    id: number;
    name: string;
    alias: string;
}

export interface DDragonSkin {
    id: number;
    name: string;
    num: number;
    isBase: boolean;
    splashPath?: string;
    tilePath?: string;
}

// Cache for API responses
let cachedPatch: string | null = null;
let cachedChampions: DDragonChampion[] | null = null;

/**
 * Fetch with retry logic
 */
async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return fetchWithRetry(url, retries - 1);
        }
        throw error;
    }
}

/**
 * Get latest patch version
 */
export async function getLatestPatch(): Promise<string> {
    if (cachedPatch) return cachedPatch;

    try {
        const versions = await fetchWithRetry<string[]>(`${DDRAGON_BASE_URL}/api/versions.json`);
        cachedPatch = versions[0];  // First is latest
        return cachedPatch;
    } catch (error) {
        console.error("Failed to fetch patch versions:", error);
        return "14.23.1";  // Fallback
    }
}

/**
 * Fetch all champions from CommunityDragon
 */
export async function fetchChampions(): Promise<DDragonChampion[]> {
    if (cachedChampions) return cachedChampions;

    try {
        // Use CommunityDragon champion summary (simpler format)
        const url = `${CDRAGON_BASE_URL}/champion-summary.json`;
        interface ChampionSummary {
            id: number;
            name: string;
            alias: string;
        }
        const champions = await fetchWithRetry<ChampionSummary[]>(url);

        // Filter out special entries (id < 0 or Doom Bots) and map to our type
        cachedChampions = champions
            .filter(c => c.id > 0 && c.id < 10000)
            .map(c => ({
                id: c.id,
                name: c.name,
                alias: c.alias
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return cachedChampions;
    } catch (error) {
        console.error("Failed to fetch champions:", error);
        throw error;
    }
}

/**
 * Fetch skins for a specific champion
 */
export async function fetchChampionSkins(championId: number): Promise<DDragonSkin[]> {
    try {
        // Get individual champion data which includes skins
        const url = `${CDRAGON_BASE_URL}/champions/${championId}.json`;
        interface ChampionData {
            skins?: Array<{
                id: number;
                name?: string;
                isBase?: boolean;
                splashPath?: string;
                tilePath?: string;
            }>;
        }
        const champion = await fetchWithRetry<ChampionData>(url);

        if (!champion.skins) {
            return [{ id: 0, name: 'Base', num: 0, isBase: true }];
        }

        return champion.skins.map(skin => ({
            id: skin.id,
            name: skin.name || `Skin ${skin.id}`,
            num: skin.id % 1000,  // Skin number is last 3 digits
            isBase: skin.isBase || skin.id % 1000 === 0,
            splashPath: skin.splashPath,
            tilePath: skin.tilePath
        }));
    } catch (error) {
        console.error(`Failed to fetch skins for champion ${championId}:`, error);
        // Return at least base skin
        return [{ id: 0, name: 'Base', num: 0, isBase: true }];
    }
}

/**
 * Get champion icon URL from CommunityDragon
 */
export function getChampionIconUrl(championId: number): string {
    return `${CDRAGON_BASE_URL}/champion-icons/${championId}.png`;
}

/**
 * Get skin splash URL from DataDragon
 */
export function getSkinSplashUrl(alias: string, skinNum: number): string {
    return `${DDRAGON_BASE_URL}/cdn/img/champion/splash/${alias}_${skinNum}.jpg`;
}

/**
 * Get skin splash URL from CommunityDragon (fallback)
 */
export function getSkinSplashCDragonUrl(championId: number, skinId: number): string {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/${championId}/${skinId}.jpg`;
}

/**
 * Clear cached data (useful if user wants to refresh)
 */
export function clearCache(): void {
    cachedPatch = null;
    cachedChampions = null;
}
