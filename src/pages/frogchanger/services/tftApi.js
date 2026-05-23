/**
 * tftApi.js — TFT Tactician data service
 *
 * Fetches TFT companion (tactician) data from CommunityDragon.
 * Uses the companions.json endpoint to parse species and variants.
 */

import { CDRAGON_BASE_URL } from './communityDragonApi.js';

let cachedCompanionsData = null;
let cachedTacticians = null;
let tacticianIconMap = {};

const fetchRetry = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
};

const getCompanionsData = async () => {
  if (cachedCompanionsData) return cachedCompanionsData;
  const url = `${CDRAGON_BASE_URL}/v1/companions.json`;
  cachedCompanionsData = await fetchRetry(url);
  return cachedCompanionsData;
};

/**
 * Each companion's loadoutsIcon contains a Tooltip_<InternalName>_... segment
 * matching the WAD folder under data/characters/pet<internalName>/. Sibling
 * skins under the SAME CommunityDragon speciesId can live in DIFFERENT WAD
 * folders (e.g. "Ahri" species contains both Chibi Ahri variants — which live
 * in data/characters/petchibiahri/ — and K/DA Ahri Unbound — which lives in
 * data/characters/petstyletwoahri/). So the alias has to be derived per-skin,
 * not per-species, or extraction will hit the wrong folder.
 */
const deriveWadAlias = (companion) => {
  const icon = companion?.loadoutsIcon || '';
  // Legacy River Sprite icons use Tooltip_TFT_Avatar_<Variant>.png — the
  // generic [^_]+ regex would grab just "TFT" and produce alias "pettft",
  // missing the actual pettftavatar folder. Match those explicitly first.
  if (/Tooltip_TFT_Avatar_/i.test(icon)) {
    return 'pettftavatar';
  }
  const match = icon.match(/Tooltip_([^_]+)_/i);
  const internalName = match
    ? match[1]
    : String(companion?.speciesName || '').replace(/[^a-zA-Z0-9]/g, '');
  return `pet${internalName}`.toLowerCase();
};

/**
 * Companion loadoutsIcons follow `Tooltip_<Alias>_<Theme>_<Variant>_Tier<N>.png`.
 * The actual mesh + textures live at
 *   assets/characters/pet<alias>/themes/<theme>/tier<N>/pet<alias>_<theme>_tier<N>.skn
 * — NOT under skins/skin<N>/. Returns lowercase folder names matching the WAD
 * layout, or {} when the regex can't match (some legacy companions ship icons
 * with a different pattern; downstream code falls back to broad scanning).
 */
const deriveWadThemeTier = (companion) => {
  const icon = companion?.loadoutsIcon || '';
  const match = icon.match(/Tooltip_[^_]+_([^_]+)_.*Tier(\d+)/i);
  if (!match) return {};
  return {
    theme: match[1].toLowerCase(),
    tier: Number(match[2]),
  };
};

/**
 * Returns all TFT tacticians by grouping companions by speciesId.
 */
export const getTacticians = async () => {
  if (cachedTacticians) return cachedTacticians;
  try {
    const data = await getCompanionsData();
    const speciesMap = new Map();

    (Array.isArray(data) ? data : []).forEach(c => {
      // River Sprite uses speciesId=0 — don't drop with a truthy check.
      if (c.speciesId == null || !c.speciesName || !c.loadoutsIcon) return;
      if (speciesMap.has(c.speciesId)) return; // Already added

      const alias = deriveWadAlias(c);
      const iconPath = `${CDRAGON_BASE_URL}${c.loadoutsIcon.toLowerCase().replace('/lol-game-data/assets', '')}`;

      // alias is the species's "primary" WAD folder (first companion seen);
      // per-skin aliases are attached later in getTacticianSkins so cross-folder
      // variants (e.g. K/DA Ahri Unbound under "Ahri") extract correctly.
      const tactician = {
        id: String(c.speciesId),
        name: c.speciesName,
        alias: alias,
      };

      speciesMap.set(c.speciesId, tactician);
      tacticianIconMap[String(c.speciesId)] = iconPath;
    });

    const list = Array.from(speciesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    cachedTacticians = list;
    return list;
  } catch (err) {
    console.error('[tftApi] getTacticians failed:', err);
    return [];
  }
};

/**
 * Returns all skins (variants & tiers) for a given tactician species.
 */
export const getTacticianSkins = async (tacticianId, tacticianAlias) => {
  try {
    const data = await getCompanionsData();
    const skins = [];

    (Array.isArray(data) ? data : []).forEach(c => {
      if (String(c.speciesId) === String(tacticianId)) {
        const rawId = Number(c.itemId);
        // The last digits of itemId dictate the skin number in the WAD (e.g. 69004 -> skin04)
        const skinNum = rawId >= 1000 ? rawId % 1000 : rawId;
        const iconPath = c.loadoutsIcon ? `${CDRAGON_BASE_URL}${c.loadoutsIcon.toLowerCase().replace('/lol-game-data/assets', '')}` : null;
        const wadAlias = deriveWadAlias(c);
        const { theme: wadTheme, tier: wadTier } = deriveWadThemeTier(c);

        skins.push({
          id: skinNum,
          full_id: String(rawId),
          name: `${c.name} (Tier ${c.level})`,
          rarity: c.rarity || 'Default',
          tilePath: iconPath,
          centeredSplashPath: iconPath, // Fallback splash to the tooltip icon
          skinLines: [],
          // TFT-specific WAD routing. wadAlias picks the pet* folder; wadTheme
          // and wadTier identify the actual mesh under themes/<theme>/tier<N>/.
          wadAlias,
          wadSkinNum: skinNum,
          wadTheme,
          wadTier,
        });
      }
    });

    skins.sort((a, b) => a.id - b.id);
    return skins;
  } catch (err) {
    console.error('[tftApi] getTacticianSkins failed:', err);
    return [];
  }
};

/**
 * Cross-tactician "skinline" search. Matches the given term against each
 * companion's display name OR its loadoutsIcon theme segment (the value
 * deriveWadThemeTier extracts). Groups results by speciesId so the existing
 * SkinlineResultsPanel UI shape works unchanged.
 *
 * Returns: [{ champion: {id, name, alias}, skins: [{id, name, skinNumber, championAlias, rarity, wadAlias, wadTheme, wadTier, splashUrl}] }]
 */
export const searchTacticianSkinline = async (term) => {
  const needle = String(term || '').toLowerCase().trim();
  if (!needle) return [];
  const needleCompact = needle.replace(/[^a-z0-9]/g, '');
  try {
    const data = await getCompanionsData();
    if (!Array.isArray(data)) return [];

    const bySpecies = new Map();
    for (const c of data) {
      if (c.speciesId == null || !c.speciesName || !c.loadoutsIcon || !c.itemId) continue;
      const name = String(c.name || '');
      const nameLower = name.toLowerCase();
      const nameCompact = nameLower.replace(/[^a-z0-9]/g, '');
      const { theme, tier } = deriveWadThemeTier(c);
      const themeLower = String(theme || '').toLowerCase();

      const isMatch =
        nameLower.includes(needle) ||
        (needleCompact && nameCompact.includes(needleCompact)) ||
        (themeLower && themeLower.includes(needleCompact || needle));
      if (!isMatch) continue;

      const rawId = Number(c.itemId);
      const skinNum = rawId >= 1000 ? rawId % 1000 : rawId;
      const wadAlias = deriveWadAlias(c);
      const splashUrl = c.loadoutsIcon
        ? `${CDRAGON_BASE_URL}${c.loadoutsIcon.toLowerCase().replace('/lol-game-data/assets', '')}`
        : null;

      let group = bySpecies.get(c.speciesId);
      if (!group) {
        group = {
          champion: {
            id: String(c.speciesId),
            name: c.speciesName,
            alias: wadAlias, // species-default; per-skin wadAlias rides on each skin
          },
          skins: [],
        };
        bySpecies.set(c.speciesId, group);
      }
      group.skins.push({
        id: rawId,
        name: name,
        skinNumber: skinNum,
        championAlias: wadAlias,
        rarity: c.rarity || 'Default',
        wadAlias,
        wadTheme: theme || null,
        wadTier: tier || null,
        splashUrl,
      });
    }

    const results = Array.from(bySpecies.values()).sort((a, b) =>
      a.champion.name.localeCompare(b.champion.name)
    );
    results.forEach((g) => g.skins.sort((a, b) => a.id - b.id));
    return results;
  } catch (err) {
    console.error('[tftApi] searchTacticianSkinline failed:', err);
    return [];
  }
};

/**
 * Returns the mapped CDragon icon URL for a tactician.
 */
export const getTacticianIconUrl = (tacticianId) => {
  return tacticianIconMap[String(tacticianId)] || '';
};

/** Clear the tactician list cache. */
export const clearTacticianCache = () => {
  cachedTacticians = null;
  cachedCompanionsData = null;
  tacticianIconMap = {};
};
