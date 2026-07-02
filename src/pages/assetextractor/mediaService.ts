/* Icon / splash-art URL helpers, ported from FrogChanger mediaService.js.

   The Electron build wrote splash bytes to disk via node fs. The Tauri port
   does NOT depend on a filesystem plugin — art is displayed straight from the
   CommunityDragon / DDragon URLs in the webview. The disk-save helper is kept
   as a stub; wiring it to a real backend command is left as a TODO. */

const RARITY_ICON_BASE =
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/rarity-gem-icons';
const CHAMPION_ICON_BASE =
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons';

export function getChampionIconUrl(championId: string | number): string {
    return `${CHAMPION_ICON_BASE}/${championId}.png`;
}

export function getRarityIconUrl(skin: { rarity?: string }): string {
    const rarity = skin?.rarity;
    if (!rarity || rarity === 'kNoRarity') {
        return `${RARITY_ICON_BASE}/cn-gem-1.png`;
    }
    const rarityIconMap: Record<string, string> = {
        kEpic: 'epic.png',
        kLegendary: 'legendary.png',
        kMythic: 'mythic.png',
        kUltimate: 'ultimate.png',
        kExalted: 'exalted.png',
        kTranscendent: 'transcendent.png',
    };
    const iconFile = rarityIconMap[rarity] || 'cn-gem-1.png';
    return `${RARITY_ICON_BASE}/${iconFile}`;
}

/* Resolve a skin's splash-art URL. Used to render art directly in the webview
   (no disk write). For real champions DDragon centered splash is preferred;
   CDragon centered-splash paths are used as the override when present. */
export function getSplashArtUrl(params: {
    championAlias: string;
    skinId: number;
    splashUrlOverride?: string | null;
}): string {
    const { championAlias, skinId, splashUrlOverride } = params;
    return (
        splashUrlOverride ||
        `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinId}.jpg`
    );
}

/* Save a skin's splash art to disk. The Electron build did this with node fs;
   the Tauri port has no fs plugin, so this is a no-op placeholder. */
export async function downloadSplashArtToFile(_params: {
    championName: string;
    championAlias: string;
    skinId: number;
    skinName: string;
    outputPath: string;
    splashUrlOverride?: string | null;
}): Promise<string> {
    // TODO(backend): add a Tauri command that fetches the splash URL and writes
    // the bytes to outputPath. For now art is only displayed, never saved.
    throw new Error('Saving splash art to disk is not supported yet.');
}
