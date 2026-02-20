const DDRAGON_BASE_URL = 'https://ddragon.leagueoflegends.com';
export const CDRAGON_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

let globalChromaData = null;

const fetchWithRetry = async (url, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

export const getDefaultChromaColor = (index) => {
  const colors = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
  ];
  return colors[index % colors.length];
};

export const fetchLatestPatch = async () => {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await response.json();
    return versions[0];
  } catch (error) {
    console.error('Failed to fetch patch version:', error);
    return '13.24.1';
  }
};

export const fetchAllChampionDetails = async (patch) => {
  try {
    const url = `${DDRAGON_BASE_URL}/cdn/${patch}/data/en_US/championFull.json`;
    const response = await fetchWithRetry(url);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch champion details:', error);
    throw error;
  }
};

export const fetchAllDetailedSkinsData = async () => {
  try {
    const url = `${CDRAGON_BASE_URL}/v1/skins.json`;
    const response = await fetchWithRetry(url);

    const skinMap = new Map();
    let skinsToProcess;
    if (typeof response === 'object' && response !== null) {
      skinsToProcess = Array.isArray(response) ? response : Object.values(response);
    } else {
      console.error('Unexpected response format:', typeof response);
      return new Map();
    }

    skinsToProcess.forEach((skin) => {
      if (skin && typeof skin.id === 'number') {
        skinMap.set(skin.id.toString(), {
          id: skin.id,
          name: skin.name,
          rarity: skin.rarity,
          isLegacy: skin.isLegacy || false,
          skinLines: skin.skinLines || [],
          chromas: skin.chromas || [],
        });
      }
    });

    return skinMap;
  } catch (error) {
    console.error('Failed to fetch detailed skin data:', error);
    return new Map();
  }
};

export const fetchAllChromaData = async () => {
  if (globalChromaData) {
    return globalChromaData;
  }

  try {
    console.log('Fetching all chroma data from Community Dragon...');
    const url = `${CDRAGON_BASE_URL}/v1/skins.json`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Failed to fetch skins.json: ${response.status}`);
      return {};
    }

    const skinsJson = await response.json();
    globalChromaData = skinsJson;
    console.log(`Loaded chroma data for ${Object.keys(skinsJson).length} skins`);
    return skinsJson;
  } catch (error) {
    console.error('Failed to fetch chroma data:', error);
    return {};
  }
};

export const getChromaDataForSkin = async (championId, skinId) => {
  const skinsData = await fetchAllChromaData();
  const fullSkinId = `${championId}${skinId.toString().padStart(3, '0')}`;

  console.log(`Looking for chroma data with fullSkinId: ${fullSkinId}`);
  console.log('Available skin IDs (first 10):', Object.keys(skinsData).slice(0, 10));

  const skinData = skinsData[fullSkinId];
  if (!skinData?.chromas?.length) {
    console.log(`No chromas found for ${fullSkinId}`);
    return [];
  }

  console.log(`Found chromas for ${fullSkinId}:`, skinData.chromas);
  return skinData.chromas.map((chroma, index) => ({
    id: chroma.id,
    name: chroma.name || `Chroma ${index + 1}`,
    color: chroma.colors?.length > 0 ? chroma.colors[0] : getDefaultChromaColor(index),
    image_url: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-chroma-images/${championId}/${chroma.id}.png`,
  }));
};

export const api = {
  getChampions: async () => {
    try {
      console.log('Fetching champions from Community Dragon...');
      const champResponse = await fetch(`${CDRAGON_BASE_URL}/v1/champion-summary.json`);
      const champJson = await champResponse.json();

      if (champJson && champJson.length > 0) {
        champJson.shift();
      }

      const champions = champJson
        .map(champ => ({
          id: champ.id.toString(),
          name: champ.name,
          alias: champ.alias,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log('Champions loaded from Community Dragon:', champions.slice(0, 3));
      return champions;
    } catch (error) {
      console.error('Error fetching champions:', error);
      throw error;
    }
  },

  getChampionSkins: async (championName, championsList) => {
    try {
      const skinsData = await fetchAllChromaData();
      const champion = championsList.find(c => c.name === championName);

      if (!champion) {
        console.log(`Champion ${championName} not found in champions list`);
        return [];
      }

      const championSkins = [];
      for (const [skinId, skinData] of Object.entries(skinsData)) {
        const championId = skinId.slice(0, -3);
        const skinNum = parseInt(skinId.slice(-3));

        if (championId === champion.id) {
          championSkins.push({
            id: skinNum,
            name: skinData.name,
            full_id: skinId,
            rarity: skinData.rarity,
          });
        }
      }

      championSkins.sort((a, b) => a.id - b.id);
      console.log(`Found ${championSkins.length} skins for ${championName}:`, championSkins);
      return championSkins;
    } catch (error) {
      console.error('Error fetching champion skins:', error);
      return [];
    }
  },

  getChampionIcon: async (championId) =>
    `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`,

  getSkinSplash: (championAlias, skinId) =>
    `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinId}.jpg`,
};
