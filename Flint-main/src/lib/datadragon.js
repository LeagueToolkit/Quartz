/**
 * Flint - Data Dragon / CommunityDragon API
 * 
 * Fetches champion and skin data from Riot's official APIs
 */

const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";
const CDRAGON_BASE_URL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";

// Cache for API responses
let cachedPatch = null;
let cachedChampions = null;
let cachedSkins = null;

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = 3) {
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
export async function getLatestPatch() {
    if (cachedPatch) return cachedPatch;

    try {
        const versions = await fetchWithRetry(`${DDRAGON_BASE_URL}/api/versions.json`);
        cachedPatch = versions[0];  // First is latest
        return cachedPatch;
    } catch (error) {
        console.error("Failed to fetch patch versions:", error);
        return "14.23.1";  // Fallback
    }
}

/**
 * Fetch all champions from Data Dragon
 * @returns {Promise<Array<{id: number, name: string, alias: string}>>}
 */
export async function fetchChampions() {
    if (cachedChampions) return cachedChampions;

    try {
        // Use CommunityDragon champion summary (simpler format)
        const url = `${CDRAGON_BASE_URL}/champion-summary.json`;
        const champions = await fetchWithRetry(url);

        // Filter out special entries (id < 0 or Doom Bots)
        cachedChampions = champions
            .filter(c => c.id > 0 && c.id < 10000)
            .sort((a, b) => a.name.localeCompare(b.name));

        return cachedChampions;
    } catch (error) {
        console.error("Failed to fetch champions:", error);
        throw error;
    }
}

/**
 * Fetch skins for a specific champion
 * @param {number} championId - Champion ID
 * @returns {Promise<Array<{id: number, name: string, num: number}>>}
 */
export async function fetchChampionSkins(championId) {
    try {
        // Get individual champion data which includes skins
        const url = `${CDRAGON_BASE_URL}/champions/${championId}.json`;
        const champion = await fetchWithRetry(url);

        if (!champion.skins) {
            return [{ id: 0, name: 'Base', num: 0 }];
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
 * Get champion icon URL
 */
export function getChampionIconUrl(championId) {
    return `${CDRAGON_BASE_URL}/champion-icons/${championId}.png`;
}

/**
 * Get skin splash URL
 */
export function getSkinSplashUrl(championId, skinNum) {
    return `${DDRAGON_BASE_URL}/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;
}

/**
 * Get skin splash URL from CommunityDragon (fallback)
 */
export function getSkinSplashCDragonUrl(championId, skinId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/${championId}/${skinId}.jpg`;
}
