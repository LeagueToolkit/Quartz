/**
 * wardEmoteApi.js — CDragon ward-skins + summoner-emotes loaders
 *
 * Returns data in the same { id, name, alias, skins } shape the existing
 * champion sidebar + skins panel already understand, so the UI works
 * unchanged (sidebar row → click → right pane shows the skins as cards).
 *
 * Note: WAD routing (Ward.wad.client / Emote.wad.client) is intentionally
 * NOT wired here yet — this is data + display only. The `wadAlias` /
 * `wadAssetPath` fields are populated so a later extraction wiring has
 * everything it needs.
 */

import { CDRAGON_BASE_URL } from './communityDragonApi.js';

let cachedWardsData = null;
let cachedEmotesData = null;
let cachedWards = null;        // [{ id, name, alias, skins:[...] }]
let cachedEmotes = null;       // grouped by champion
let cachedChampionLookup = null; // championId -> {id,name,alias} for emote tagging

const fetchRetry = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
};

const cdragonAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  return `${CDRAGON_BASE_URL}${assetPath.toLowerCase().replace('/lol-game-data/assets', '')}`;
};

// ── Wards ───────────────────────────────────────────────────────────────────

const getWardsData = async () => {
  if (cachedWardsData) return cachedWardsData;
  cachedWardsData = await fetchRetry(`${CDRAGON_BASE_URL}/v1/ward-skins.json`);
  return cachedWardsData;
};

/**
 * Returns a SINGLE sidebar row "Wards" whose `skins` is every ward skin.
 * Keeps the existing ChampionSidebar UI usable without per-champion grouping
 * (wards are flat — no logical champion split).
 */
export const getWards = async () => {
  if (cachedWards) return cachedWards;
  try {
    const data = await getWardsData();
    if (!Array.isArray(data)) return [];

    const skins = data
      .filter((w) => w && w.id != null && w.name)
      .map((w) => {
        const tilePath = cdragonAssetUrl(w.wardImagePath);
        return {
          id: w.id,
          full_id: String(w.id),
          name: w.name,
          tilePath,
          centeredSplashPath: tilePath,
          skinLines: [],
          hideRarityIcon: true,
          // Future WAD routing — derived from id, NOT yet used for extraction.
          wadAlias: 'ward',
          wadAssetPath: w.wardImagePath || null,
          wadShadowAssetPath: w.wardShadowImagePath || null,
          isLegacy: Boolean(w.isLegacy),
        };
      })
      .sort((a, b) => a.id - b.id);

    cachedWards = [{
      id: '__wards__',
      name: 'Wards',
      alias: 'ward',
      skins,
    }];
    return cachedWards;
  } catch (err) {
    console.error('[wardEmoteApi] getWards failed:', err);
    return [];
  }
};

/** Pass-through skin loader so the existing loadChampionSkins path works. */
export const getWardSkins = async (championName) => {
  const wards = await getWards();
  const row = wards.find((w) => w.name === championName);
  return row?.skins || [];
};

export const getWardChampionIconUrl = () => {
  // Default ward icon for the sidebar row. Uses the same CDragon asset
  // rewrite path as cdragonAssetUrl: strip "/lol-game-data/assets" first.
  return cdragonAssetUrl('/lol-game-data/assets/content/src/LeagueClient/WardSkinImages/wardHero_0.png');
};

// ── Emotes ──────────────────────────────────────────────────────────────────

const getEmotesData = async () => {
  if (cachedEmotesData) return cachedEmotesData;
  cachedEmotesData = await fetchRetry(`${CDRAGON_BASE_URL}/v1/summoner-emotes.json`);
  return cachedEmotesData;
};

/**
 * Group emotes by `taggedChampionsIds`. Each tagged champion becomes one
 * sidebar row; untagged emotes go under "Generic". A single emote tagged
 * for multiple champions appears under each of them (cheap duplication
 * keeps the UI honest about who can use it).
 *
 * Requires `champions` (the regular champion list from communityDragonApi)
 * so we can name + alias the sidebar rows correctly.
 */
export const getEmotes = async (champions = []) => {
  if (cachedEmotes && cachedChampionLookup) return cachedEmotes;
  try {
    const data = await getEmotesData();
    if (!Array.isArray(data)) return [];

    // championId → { id, name, alias }
    const champLookup = new Map();
    for (const c of champions) {
      if (c?.id != null) champLookup.set(String(c.id), c);
    }
    cachedChampionLookup = champLookup;

    const buckets = new Map(); // key: champion.id or '__generic__' → group
    const pushTo = (key, group, skin) => {
      let g = buckets.get(key);
      if (!g) { g = group; buckets.set(key, g); }
      g.skins.push(skin);
    };

    for (const e of data) {
      if (!e || e.id == null) continue;
      // Skip entries with empty names (CDragon ships placeholder rows).
      if (!e.name) continue;
      const iconUrl = cdragonAssetUrl(e.inventoryIcon);
      const skin = {
        id: e.id,
        full_id: String(e.id),
        name: e.name,
        tilePath: iconUrl,
        centeredSplashPath: iconUrl,
        skinLines: [],
        hideRarityIcon: true,
        wadAlias: 'emote',
        wadAssetPath: e.inventoryIcon || null,
        description: e.description || '',
      };

      const tagged = Array.isArray(e.taggedChampionsIds) ? e.taggedChampionsIds : [];
      if (tagged.length === 0) {
        pushTo('__generic__', {
          id: '__generic__',
          name: 'Generic (No Champion)',
          alias: 'emote',
          skins: [],
        }, skin);
      } else {
        for (const champId of tagged) {
          const champ = champLookup.get(String(champId));
          if (!champ) continue;
          pushTo(String(champ.id), {
            id: String(champ.id),
            name: champ.name,
            alias: champ.alias,
            championIconUrl: null, // sidebar uses default getChampionIconUrl
            skins: [],
          }, skin);
        }
      }
    }

    const list = Array.from(buckets.values())
      .sort((a, b) => {
        // Pin Generic (untagged emotes) to the top of the sidebar so the
        // ~1097 non-champion emotes are easy to find.
        if (a.id === '__generic__') return -1;
        if (b.id === '__generic__') return 1;
        return a.name.localeCompare(b.name);
      });
    // Sort skins within each bucket by id for stability.
    list.forEach((g) => g.skins.sort((a, b) => a.id - b.id));
    // Tag the Generic bucket so the sidebar skips the avatar entirely — a
    // representative emote icon kept loading weirdly per skin so just hide it.
    const generic = list.find((g) => g.id === '__generic__');
    if (generic) {
      generic.hideAvatar = true;
    }
    cachedEmotes = list;
    return list;
  } catch (err) {
    console.error('[wardEmoteApi] getEmotes failed:', err);
    return [];
  }
};

export const getEmoteSkins = async (championName, champions = []) => {
  const groups = await getEmotes(champions);
  const row = groups.find((g) => g.name === championName);
  return row?.skins || [];
};

/** Clear caches (used by the data refresh button). */
export const clearWardEmoteCache = () => {
  cachedWardsData = null;
  cachedEmotesData = null;
  cachedWards = null;
  cachedEmotes = null;
  cachedChampionLookup = null;
};
