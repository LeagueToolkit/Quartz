/* CommunityDragon + DDragon metadata for the Asset Extractor.

   Ported from the Electron Quartz FrogChanger communityDragonApi.js. Same
   endpoints, same shapes — champion summary, per-champion skin details, the
   global skins.json (rarity + chromas), and quest-skin tier expansion. The
   Electron filesystem cache layer is dropped (no node fs in the browser); the
   network calls go straight through Tauri's CSP-allowed https fetch. */

const DDRAGON_BASE_URL = 'https://ddragon.leagueoflegends.com';
export const CDRAGON_BASE_URL =
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

export interface CDragonChampion {
    id: string;
    name: string;
    alias: string;
}

export interface Chroma {
    id: number;
    name: string;
    color: string;
    image_url: string;
}

export interface CDragonSkin {
    id: number;
    name: string;
    full_id: string;
    rarity?: string;
    tilePath: string | null;
    centeredSplashPath: string | null;
    uncenteredSplashPath: string | null;
    skinLines: number[];
}

interface RawSkinData {
    id: number;
    name: string;
    rarity?: string;
    isLegacy?: boolean;
    chromas?: Array<{ id: number; name?: string; colors?: string[] }>;
}

let globalChromaData: Record<string, RawSkinData> | null = null;

export function getDefaultChromaColor(index: number): string {
    const colors = [
        '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
    ];
    return colors[index % colors.length];
}

async function fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return (await response.json()) as T;
        } catch (error) {
            lastError = error;
            if (i === maxRetries - 1) break;
            await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    throw lastError;
}

export async function fetchLatestPatch(): Promise<string> {
    try {
        const response = await fetch(`${DDRAGON_BASE_URL}/api/versions.json`);
        const versions = (await response.json()) as string[];
        return versions[0];
    } catch {
        return '13.24.1';
    }
}

/* Warm + return the global skins.json map (keyed by full skin id). Holds
   rarity and chroma data for every skin in the game. */
export async function fetchAllChromaData(): Promise<Record<string, RawSkinData>> {
    if (globalChromaData) return globalChromaData;
    try {
        const url = `${CDRAGON_BASE_URL}/v1/skins.json`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) return {};
        const skinsJson = (await response.json()) as Record<string, RawSkinData>;
        globalChromaData = skinsJson;
        return skinsJson;
    } catch {
        return {};
    }
}

/* Chroma list for one champion + skin number (skin number, not full id). */
export async function getChromaDataForSkin(
    championId: string | number,
    skinId: number,
): Promise<Chroma[]> {
    const skinsData = await fetchAllChromaData();
    const fullSkinId = `${championId}${skinId.toString().padStart(3, '0')}`;
    const skinData = skinsData[fullSkinId];
    if (!skinData?.chromas?.length) return [];

    return skinData.chromas.map((chroma, index) => ({
        id: chroma.id,
        name: chroma.name || `Chroma ${index + 1}`,
        color: chroma.colors && chroma.colors.length > 0 ? chroma.colors[0] : getDefaultChromaColor(index),
        image_url: `${CDRAGON_BASE_URL}/v1/champion-chroma-images/${championId}/${chroma.id}.png`,
    }));
}

function isDoomBotEntry(champ: { name?: string; alias?: string }): boolean {
    const name = String(champ?.name || '').toLowerCase();
    const alias = String(champ?.alias || '').toLowerCase();
    return name.includes('doom bot') || name.includes('doombot')
        || alias.includes('doom bot') || alias.includes('doombot');
}

/* Champion summary list (id / name / alias), filtered + sorted exactly like
   the Electron implementation. The leading "None" entry is dropped. */
export async function getCDragonChampions(): Promise<CDragonChampion[]> {
    const champResponse = await fetch(`${CDRAGON_BASE_URL}/v1/champion-summary.json`);
    const champJson = (await champResponse.json()) as Array<{ id: number; name: string; alias: string }>;

    if (champJson && champJson.length > 0) {
        champJson.shift();
    }

    return champJson
        .map((champ) => ({
            id: champ.id.toString(),
            name: champ.name,
            alias: champ.alias,
        }))
        .filter((champ) => !isDoomBotEntry(champ))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/* Turn a raw game-data asset path (as found in CDragon JSON, e.g.
   "/lol-game-data/assets/...") into a fetchable CDragon URL. */
export function cdragonAssetUrl(assetPath: string | null | undefined): string | null {
    if (!assetPath) return null;
    return `${CDRAGON_BASE_URL}${assetPath.toLowerCase().replace('/lol-game-data/assets', '')}`;
}

const mapCdragonAssetPath = cdragonAssetUrl;

interface ChampionDetails {
    skins?: Array<{
        id?: number;
        name?: string;
        tilePath?: string;
        splashPath?: string;
        uncenteredSplashPath?: string;
        skinLines?: Array<{ id?: number }>;
        questSkinInfo?: { tiers?: Array<{ id?: number; name?: string; tilePath?: string; splashPath?: string; uncenteredSplashPath?: string }> };
    }>;
}

/* Build the rich per-champion skin list (splash art, rarity, chromas, quest
   tiers) using the global skins map plus the per-champion details document. */
export async function getCDragonChampionSkins(
    championId: string,
): Promise<CDragonSkin[]> {
    const skinsData = await fetchAllChromaData();

    let championSkinDetails: ChampionDetails | null = null;
    try {
        championSkinDetails = await fetchWithRetry<ChampionDetails>(
            `${CDRAGON_BASE_URL}/v1/champions/${championId}.json`,
        );
    } catch {
        championSkinDetails = null;
    }

    const tilePathBySkinNum = new Map<number, string | null>();
    const splashPathBySkinNum = new Map<number, string | null>();
    const uncenteredSplashPathBySkinNum = new Map<number, string | null>();
    const skinLineIdsBySkinNum = new Map<number, number[]>();

    if (Array.isArray(championSkinDetails?.skins)) {
        for (const skin of championSkinDetails.skins) {
            const rawSkinId = Number(skin?.id);
            if (!Number.isFinite(rawSkinId)) continue;
            const skinNum = rawSkinId >= 1000 ? rawSkinId % 1000 : rawSkinId;

            if (typeof skin?.tilePath === 'string' && skin.tilePath) {
                tilePathBySkinNum.set(skinNum, mapCdragonAssetPath(skin.tilePath));
            }
            if (typeof skin?.splashPath === 'string' && skin.splashPath) {
                splashPathBySkinNum.set(skinNum, mapCdragonAssetPath(skin.splashPath));
            }
            if (typeof skin?.uncenteredSplashPath === 'string' && skin.uncenteredSplashPath) {
                uncenteredSplashPathBySkinNum.set(skinNum, mapCdragonAssetPath(skin.uncenteredSplashPath));
            }
            const skinLineIds = Array.isArray(skin?.skinLines)
                ? skin.skinLines.map((line) => Number(line?.id)).filter((id) => Number.isFinite(id))
                : [];
            skinLineIdsBySkinNum.set(skinNum, skinLineIds);
        }
    }

    const championSkins: CDragonSkin[] = [];
    for (const [skinId, skinData] of Object.entries(skinsData)) {
        const champId = skinId.slice(0, -3);
        const skinNum = parseInt(skinId.slice(-3), 10);
        if (champId === championId) {
            championSkins.push({
                id: skinNum,
                name: skinData.name,
                full_id: skinId,
                rarity: skinData.rarity,
                tilePath: tilePathBySkinNum.get(skinNum) || null,
                centeredSplashPath: splashPathBySkinNum.get(skinNum) || null,
                uncenteredSplashPath: uncenteredSplashPathBySkinNum.get(skinNum) || null,
                skinLines: skinLineIdsBySkinNum.get(skinNum) || [],
            });
        }
    }

    // Expand quest-skin tiers into separate cards (e.g. K/DA ALL OUT Seraphine).
    if (Array.isArray(championSkinDetails?.skins)) {
        for (const skin of championSkinDetails.skins) {
            const tiers = skin?.questSkinInfo?.tiers;
            if (!Array.isArray(tiers) || tiers.length === 0) continue;

            const parentRawId = Number(skin?.id);
            if (!Number.isFinite(parentRawId)) continue;
            const parentSkinNum = parentRawId >= 1000 ? parentRawId % 1000 : parentRawId;
            const parentSkinData = skinsData[String(parentRawId)] || null;

            for (const tier of tiers) {
                const tierRawId = Number(tier?.id);
                if (!Number.isFinite(tierRawId)) continue;
                const tierSkinNum = tierRawId >= 1000 ? tierRawId % 1000 : tierRawId;
                const tierSkinData = skinsData[String(tierRawId)] || parentSkinData;

                const tierEntry: CDragonSkin = {
                    id: tierSkinNum,
                    name: tier.name || parentSkinData?.name || `Skin ${tierSkinNum}`,
                    full_id: String(tierRawId),
                    rarity: tierSkinData?.rarity,
                    tilePath: mapCdragonAssetPath(tier.tilePath),
                    centeredSplashPath: mapCdragonAssetPath(tier.splashPath),
                    uncenteredSplashPath: mapCdragonAssetPath(tier.uncenteredSplashPath),
                    skinLines: skinLineIdsBySkinNum.get(parentSkinNum) || [],
                };

                const existingIdx = championSkins.findIndex((s) => s.id === tierSkinNum);
                if (existingIdx >= 0) championSkins[existingIdx] = tierEntry;
                else championSkins.push(tierEntry);
            }
        }
    }

    championSkins.sort((a, b) => a.id - b.id);
    return championSkins;
}

export interface SkinlineGroup {
    champion: CDragonChampion;
    skins: Array<{
        id: number;
        name: string;
        skinNumber: number;
        championAlias: string;
        rarity?: string;
    }>;
}

/* Skinline / rarity search across the global skins map, grouped by champion —
   ported verbatim from FrogChanger.searchSkinlines (false-positive guards and
   rarity-name map included). */
export function searchSkinlines(
    term: string,
    allSkinsData: Record<string, RawSkinData>,
    champions: CDragonChampion[],
): SkinlineGroup[] {
    const searchTermLower = term.toLowerCase();
    const matchingSkins: Array<{ id: number; name: string; skinData: RawSkinData }> = [];

    for (const [skinId, skinData] of Object.entries(allSkinsData)) {
        let isMatch = false;

        if (skinData.name) {
            const skinNameLower = skinData.name.toLowerCase();
            const normalizedSkinName = skinNameLower.replace(/[^a-z0-9]/g, '');
            const normalizedSearch = searchTermLower.replace(/[^a-z0-9]/g, '');
            const hasDirectMatch = skinNameLower.includes(searchTermLower);
            const hasNormalizedMatch = normalizedSearch && normalizedSkinName.includes(normalizedSearch);

            const isFalsePositive =
                (searchTermLower === 'coven' && skinNameLower.includes('covenant')) ||
                (searchTermLower === 'star' && skinNameLower.includes('starguardian') && !skinNameLower.includes('star guardian')) ||
                (searchTermLower === 'project' && skinNameLower.includes('projection'));

            if (!isFalsePositive && (hasDirectMatch || hasNormalizedMatch)) isMatch = true;
        }

        if (!isMatch && skinData.rarity) {
            const rarityLower = skinData.rarity.toLowerCase();
            const rarityNameMap: Record<string, string> = {
                kepic: 'epic', klegendary: 'legendary', kmythic: 'mythic',
                kultimate: 'ultimate', kexalted: 'exalted', ktranscendent: 'transcendent',
                knorarity: 'base',
            };
            const rarityName = rarityNameMap[rarityLower];
            if (rarityName && rarityName.includes(searchTermLower)) isMatch = true;
            if (rarityLower.includes(searchTermLower)) isMatch = true;
        }

        if (isMatch) {
            matchingSkins.push({ id: parseInt(skinId, 10), name: skinData.name, skinData });
        }
    }

    const results: SkinlineGroup[] = [];
    const championMap = new Map<string, CDragonChampion>();
    champions.forEach((champion) => championMap.set(String(champion.id), champion));

    for (const skin of matchingSkins) {
        const championId = String(skin.id).slice(0, -3);
        const champion = championMap.get(championId);
        if (!champion) continue;

        let championGroup = results.find((r) => r.champion.id === champion.id);
        if (!championGroup) {
            championGroup = { champion, skins: [] };
            results.push(championGroup);
        }
        championGroup.skins.push({
            id: skin.id,
            name: skin.name,
            skinNumber: skin.id % 1000,
            championAlias: champion.alias,
            rarity: skin.skinData.rarity,
        });
    }

    results.forEach((group) => group.skins.sort((a, b) => a.id - b.id));
    return results;
}

/* ── TFT / Ward / Emote category rows ─────────────────────────────────────── */

/* The category fetchers build sidebar rows (ExtractorChampion-shaped groups)
   with their skin cards pre-attached. They mirror the champion fetch+cache
   pattern above; the raw JSON is cached per session so switching categories is
   instant after the first load. Import the row/card types locally to avoid a
   cycle with types.ts. */
import type { ExtractorChampion, ExtractorSkin } from './types';

interface RawCompanion {
    contentId: string;
    itemId: number;
    name: string;
    loadoutsIcon?: string;
    speciesId?: number;
    speciesName?: string;
}

interface RawWardSkin {
    id: number;
    name: string;
    wardImagePath?: string;
}

interface RawEmote {
    id: number;
    name: string;
    inventoryIcon?: string;
    taggedChampionsIds?: number[];
}

let tftRowsCache: ExtractorChampion[] | null = null;
let wardRowsCache: ExtractorChampion[] | null = null;
let emoteRowsCache: ExtractorChampion[] | null = null;

/* Derive petAlias from a companion loadoutsIcon path. */
function derivePetAlias(loadoutsIcon: string): string {
    if (/Tooltip_TFT_Avatar_/i.test(loadoutsIcon)) return 'pettftavatar';
    const m = /Tooltip_([^_]+)_/.exec(loadoutsIcon);
    return m ? `pet${m[1].toLowerCase()}` : 'pet';
}

/* Derive [theme, tier] from a companion loadoutsIcon path. */
function derivePetThemeTier(loadoutsIcon: string): { theme: string; tier: number } {
    const m = /Tooltip_[^_]+_([^_]+)_.*Tier(\d+)/.exec(loadoutsIcon);
    if (m) return { theme: m[1].toLowerCase(), tier: Number(m[2]) };
    return { theme: '', tier: 1 };
}

/* TFT companions grouped by species. Each species = a sidebar row; each
   companion in that species = a skin card carrying petAlias + tier. */
export async function getCDragonTftCompanions(): Promise<ExtractorChampion[]> {
    if (tftRowsCache) return tftRowsCache;

    const raw = await fetchWithRetry<RawCompanion[]>(`${CDRAGON_BASE_URL}/v1/companions.json`).catch(
        () => [] as RawCompanion[],
    );

    const bySpecies = new Map<string, { name: string; skins: ExtractorSkin[] }>();

    for (const c of raw) {
        const icon = String(c.loadoutsIcon || '');
        if (!icon) continue;
        const petAlias = derivePetAlias(icon);
        const { tier } = derivePetThemeTier(icon);
        const skinNum = c.itemId >= 1000 ? c.itemId % 1000 : c.itemId;
        const speciesKey = String(c.speciesId ?? petAlias);
        const speciesName = c.speciesName || petAlias;

        const card: ExtractorSkin = {
            id: skinNum,
            name: c.name || `Companion ${skinNum}`,
            full_id: String(c.itemId),
            tilePath: null,
            centeredSplashPath: null,
            uncenteredSplashPath: null,
            skinLines: [],
            hideRarityIcon: true,
            petAlias,
            tier,
            iconUrl: cdragonAssetUrl(icon) || undefined,
        };

        const group = bySpecies.get(speciesKey);
        if (group) group.skins.push(card);
        else bySpecies.set(speciesKey, { name: speciesName, skins: [card] });
    }

    const rows: ExtractorChampion[] = [];
    for (const [speciesKey, group] of bySpecies) {
        group.skins.sort((a, b) => a.id - b.id);
        rows.push({
            id: `tft-${speciesKey}`,
            cdragonId: null,
            name: group.name,
            alias: group.skins[0]?.petAlias || 'pet',
            wadPath: '',
            availableSkinIds: [],
            skinCount: group.skins.length,
            championIconUrl: group.skins[0]?.iconUrl,
            presetSkins: group.skins,
        });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));
    tftRowsCache = rows;
    return rows;
}

/* Ward skins as a single flat sidebar row. Each ward = a browse-only card. */
export async function getCDragonWards(): Promise<ExtractorChampion[]> {
    if (wardRowsCache) return wardRowsCache;

    const raw = await fetchWithRetry<RawWardSkin[]>(`${CDRAGON_BASE_URL}/v1/ward-skins.json`).catch(
        () => [] as RawWardSkin[],
    );

    const cards: ExtractorSkin[] = raw
        .filter((w) => w && Number.isFinite(Number(w.id)))
        .map((w) => ({
            id: Number(w.id),
            name: w.name || `Ward ${w.id}`,
            full_id: String(w.id),
            tilePath: null,
            centeredSplashPath: null,
            uncenteredSplashPath: null,
            skinLines: [],
            hideRarityIcon: true,
            wadAlias: 'ward' as const,
            iconUrl: cdragonAssetUrl(w.wardImagePath) || undefined,
        }));

    cards.sort((a, b) => a.id - b.id);
    const rows: ExtractorChampion[] = [
        {
            id: 'ward-all',
            cdragonId: null,
            name: 'Ward Skins',
            alias: 'ward',
            wadPath: '',
            availableSkinIds: [],
            skinCount: cards.length,
            wadAlias: 'ward',
            presetSkins: cards,
        },
    ];
    wardRowsCache = rows;
    return rows;
}

/* Summoner emotes grouped by tagged champion. Untagged emotes go to a
   "Generic" bucket pinned to the top of the sidebar. */
export async function getCDragonEmotes(): Promise<ExtractorChampion[]> {
    if (emoteRowsCache) return emoteRowsCache;

    const raw = await fetchWithRetry<RawEmote[]>(`${CDRAGON_BASE_URL}/v1/summoner-emotes.json`).catch(
        () => [] as RawEmote[],
    );

    const genericKey = '__generic__';
    const byChampion = new Map<string, ExtractorSkin[]>();

    for (const e of raw) {
        if (!e || !Number.isFinite(Number(e.id))) continue;
        const card: ExtractorSkin = {
            id: Number(e.id),
            name: e.name || `Emote ${e.id}`,
            full_id: String(e.id),
            tilePath: null,
            centeredSplashPath: null,
            uncenteredSplashPath: null,
            skinLines: [],
            hideRarityIcon: true,
            wadAlias: 'emote' as const,
            iconUrl: cdragonAssetUrl(e.inventoryIcon) || undefined,
        };
        const tags = Array.isArray(e.taggedChampionsIds) ? e.taggedChampionsIds.filter((n) => Number.isFinite(Number(n))) : [];
        if (tags.length === 0) {
            const bucket = byChampion.get(genericKey) || [];
            bucket.push(card);
            byChampion.set(genericKey, bucket);
        } else {
            for (const champId of tags) {
                const key = String(champId);
                const bucket = byChampion.get(key) || [];
                bucket.push(card);
                byChampion.set(key, bucket);
            }
        }
    }

    // Resolve champion display names for tagged buckets.
    const champById = new Map<string, CDragonChampion>();
    try {
        const champs = await getCDragonChampions();
        champs.forEach((c) => champById.set(String(c.id), c));
    } catch { /* names fall back to the raw id */ }

    const rows: ExtractorChampion[] = [];
    for (const [key, cards] of byChampion) {
        if (key === genericKey) continue;
        cards.sort((a, b) => a.id - b.id);
        const champ = champById.get(key);
        rows.push({
            id: `emote-${key}`,
            cdragonId: champ?.id ?? null,
            name: champ?.name || `Champion ${key}`,
            alias: champ?.alias || key,
            wadPath: '',
            availableSkinIds: [],
            skinCount: cards.length,
            wadAlias: 'emote',
            presetSkins: cards,
        });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const generic = byChampion.get(genericKey);
    if (generic && generic.length > 0) {
        generic.sort((a, b) => a.id - b.id);
        rows.unshift({
            id: 'emote-generic',
            cdragonId: null,
            name: 'Generic',
            alias: 'generic',
            wadPath: '',
            availableSkinIds: [],
            skinCount: generic.length,
            wadAlias: 'emote',
            presetSkins: generic,
        });
    }

    emoteRowsCache = rows;
    return rows;
}
