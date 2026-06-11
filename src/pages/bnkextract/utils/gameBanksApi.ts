/* Champion/skin data for the "Load Banks From Game" modal.

   The Electron build pulled this from FrogChanger's communityDragonApi service,
   which does not exist in this port yet. We fetch the same CommunityDragon
   endpoints directly so the modal's champion list, skin list and icons work
   today. TODO(backend): route through a shared cdragon service once ported. */

import { log } from '@/lib/util/logger';
import type { GameChampion, GameSkin } from '../types';

const CDRAGON = 'https://raw.communitydragon.org/latest';

interface RawChampionSummary {
    id: number;
    name: string;
    alias: string;
}

let championCache: GameChampion[] | null = null;
const skinCache = new Map<string, GameSkin[]>();

export function getChampionIconUrl(championId: number): string {
    return `${CDRAGON}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

export function toCdragonRaw(pathValue?: string | null): string {
    if (!pathValue || typeof pathValue !== 'string') return '';
    if (/^https?:\/\//i.test(pathValue)) return pathValue;
    const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
    return `${CDRAGON}${normalized}`;
}

export async function getChampions(): Promise<GameChampion[]> {
    if (championCache) return championCache;
    try {
        const res = await fetch(`${CDRAGON}/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as RawChampionSummary[];
        championCache = raw
            .filter((c) => c.id > 0)
            .map((c) => ({ id: c.id, name: c.name, alias: c.alias }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return championCache;
    } catch (e) {
        log.error('[BnkExtract] getChampions failed', e);
        return [];
    }
}

interface RawChampionDetail {
    skins?: { id: number; name: string; tilePath?: string }[];
}

export async function getChampionSkins(championId: number): Promise<GameSkin[]> {
    const key = String(championId);
    const cached = skinCache.get(key);
    if (cached) return cached;
    try {
        const res = await fetch(`${CDRAGON}/plugins/rcp-be-lol-game-data/global/default/v1/champions/${championId}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RawChampionDetail;
        const skins: GameSkin[] = (data.skins || []).map((s) => ({
            id: s.id - championId * 1000,
            name: s.name,
            tilePath: s.tilePath ?? null,
        }));
        skinCache.set(key, skins);
        return skins;
    } catch (e) {
        log.error('[BnkExtract] getChampionSkins failed', e);
        return [];
    }
}

export function openYouTubeSearch(query: string): void {
    const q = String(query || '').trim();
    if (!q) return;
    try {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank', 'noopener,noreferrer');
    } catch (e) {
        log.error('[BnkExtract] openYouTubeSearch failed', e);
    }
}
