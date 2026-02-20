const RARITY_ICON_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/rarity-gem-icons';
const CHAMPION_ICON_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons';

export const getChampionIconUrl = (championId) => (
  `${CHAMPION_ICON_BASE}/${championId}.png`
);

export const getRarityIconUrl = (skin) => {
  const rarity = skin?.rarity;
  if (!rarity || rarity === 'kNoRarity') {
    return `${RARITY_ICON_BASE}/cn-gem-1.png`;
  }

  const rarityIconMap = {
    kEpic: 'epic.png',
    kLegendary: 'legendary.png',
    kMythic: 'mythic.png',
    kUltimate: 'ultimate.png',
    kExalted: 'exalted.png',
    kTranscendent: 'transcendent.png',
  };

  const iconFile = rarityIconMap[rarity] || 'cn-gem-1.png';
  return `${RARITY_ICON_BASE}/${iconFile}`;
};

export const downloadSplashArtToFile = async ({
  championName,
  championAlias,
  skinId,
  skinName,
  outputPath,
}) => {
  const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinId}.jpg`;
  const response = await fetch(splashUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch splash art: ${response.status}`);
  }

  if (!window.require) {
    throw new Error('Node.js fs module not available');
  }

  const blob = await response.blob();
  const fileName = `${championName}_${skinName.replace(/[^a-zA-Z0-9]/g, '_')}_splash.jpg`;
  const filePath = `${outputPath}\\${fileName}`;
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fs = window.require('fs');
  fs.writeFileSync(filePath, buffer);

  return filePath;
};
