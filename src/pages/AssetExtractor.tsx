import React, { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { save } from '@tauri-apps/plugin-dialog';
import { useFileExplorer } from '@/components/explorer';
import './assetextractor/assetextractor.css';
import {
    getLeaguePath,
    extractChampionAssets,
    extractTftCompanion,
    extractorRepath,
    extractorFinalizeSkinOnly,
    portPrepareDonorFromSkin,
    getSettings,
    type DonorResult,
    type ExtractProgress,
} from '@/lib/api';
import { useConfigStore, useNavigationStore, useNotificationStore } from '@/lib/stores';
import { openBinInJade } from '@/lib/jade/jadeInterop';
import { openModelInspect } from '@/lib/model/modelInspectEvent';
import { log } from '@/lib/util/logger';

import {
    getCDragonChampions,
    getCDragonChampionSkins,
    getCDragonTftCompanions,
    getCDragonWards,
    getCDragonEmotes,
    fetchAllChromaData,
    getChromaDataForSkin,
    searchSkinlines,
    type CDragonChampion,
    type SkinlineGroup,
} from './assetextractor/communityDragonApi';
import { getChampionIconUrl } from './assetextractor/mediaService';
import type {
    ExtractorChampion,
    ExtractorSkin,
    SelectedSkin,
    ConsoleLog,
    LogType,
    Chroma,
    ViewMode,
} from './assetextractor/types';

import { ChampionSidebar } from './assetextractor/components/ChampionSidebar';
import { ChampionSkinsPanel } from './assetextractor/components/ChampionSkinsPanel';
import { SkinlineResultsPanel } from './assetextractor/components/SkinlineResultsPanel';
import { SelectionActionBar } from './assetextractor/components/SelectionActionBar';
import { SearchHelpModal } from './assetextractor/components/SearchHelpModal';
import { ExtractionModeModal, type ExtractionPayload } from './assetextractor/components/ExtractionModeModal';
import { CustomPrefixModal, type RepathSkin, type RepathOptionsPayload } from './assetextractor/components/CustomPrefixModal';
import { LoadingSkeletonView, ErrorStateView, NoChampionSelectedView } from './assetextractor/components/StateViews';

const SIDEBAR_WIDTH_STORAGE_KEY = 'assetextractor-sidebar-width';
const OUTPUT_RECENT_PATHS_STORAGE_KEY = 'assetextractor-recent-output-paths';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 620;
const clampSidebarWidth = (value: number) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Number(value) || 260));

const normalizePathString = (value: string | null | undefined) => String(value || '').trim();

const categoryLabel = (mode: ViewMode): string =>
    mode === 'champion' ? 'champions' : mode === 'tft' ? 'TFT companions' : mode === 'ward' ? 'ward skins' : 'emotes';

function loadRecentOutputPaths(): string[] {
    try {
        const raw = localStorage.getItem(OUTPUT_RECENT_PATHS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.map(normalizePathString).filter(Boolean))];
    } catch {
        return [];
    }
}

interface NormalizedSelection {
    championId: string;
    championName: string;
    skinId: number;
    skinName: string;
    chromaId: number | null;
    wadAlias?: 'ward' | 'emote';
    petAlias?: string;
    tier?: number;
}

export function AssetExtractor() {
    const pick = useFileExplorer();
    const wadOutputPath = useConfigStore((s) => s.settings.wadOutputPath);
    const goToSettings = useNavigationStore((s) => s.setPage);
    const notify = useNotificationStore((s) => s.push);

    const [viewMode, setViewMode] = useState<ViewMode>('champion');
    const [champions, setChampions] = useState<ExtractorChampion[]>([]);
    const [filteredChampions, setFilteredChampions] = useState<ExtractorChampion[]>([]);
    const [selectedChampion, setSelectedChampion] = useState<ExtractorChampion | null>(null);
    const [championSkins, setChampionSkins] = useState<ExtractorSkin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [skinlineSearchTerm, setSkinlineSearchTerm] = useState('');
    const [skinlineSearchResults, setSkinlineSearchResults] = useState<SkinlineGroup[]>([]);
    const [showSkinlineSearch, setShowSkinlineSearch] = useState(false);

    const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
    const [selectedSkins, setSelectedSkins] = useState<SelectedSkin[]>([]);
    const [showSearchInfo, setShowSearchInfo] = useState(false);
    const [loadingSkins, setLoadingSkins] = useState<Record<string, boolean>>({});
    const [extractingSkins, setExtractingSkins] = useState<Record<string, boolean>>({});
    const [extractionProgress, setExtractionProgress] = useState<Record<string, string>>({});

    const [chromaData, setChromaData] = useState<Record<string, Chroma[]>>({});
    const [selectedChromas, setSelectedChromas] = useState<Record<string, Chroma>>({});
    const chromaCacheRef = useRef<Set<string>>(new Set());
    const preparedCardAssetsRef = useRef<Map<string, Promise<DonorResult>>>(new Map());

    /* SUBSCRIBED to the config store, not a snapshot.
       This used to be local state filled once by `loadSettings()` on mount, so
       setting the League folder in Settings while this page stayed mounted left
       `leaguePath` empty here forever, and Extract/Repath stayed disabled with
       no visible reason (`isSetupValid` gates both). `wadOutputPath` beside it
       was already read from the store, which is why only the League folder had
       the problem. `storedLeaguePath` is the authority; the detected fallback
       below only fills it in when nothing is stored yet. */
    const storedLeaguePath = useConfigStore((s) => s.settings.leaguePath);
    const [detectedLeaguePath, setDetectedLeaguePath] = useState('');
    const leaguePath = normalizePathString(storedLeaguePath) || detectedLeaguePath;
    const extractionPath = normalizePathString(wadOutputPath);

    const [isExtracting, setIsExtracting] = useState(false);
    const [isRepathing, setIsRepathing] = useState(false);
    /* Still honoured by the extract and repath loops, which break when it flips.
       Nothing sets it today: the top-right stop button that did was removed for
       overlapping the skin grid. Kept so a future stop control is a one-line
       reconnect rather than re-threading cancellation through both loops. */
    const cancelRef = useRef(false);

    const [showExtractionModeModal, setShowExtractionModeModal] = useState(false);
    const [pendingExtractionSkins, setPendingExtractionSkins] = useState<NormalizedSelection[]>([]);
    const [showPrefixModal, setShowPrefixModal] = useState(false);
    const [pendingRepathSkins, setPendingRepathSkins] = useState<RepathSkin[]>([]);
    const [recentOutputPaths, setRecentOutputPaths] = useState<string[]>(() => loadRecentOutputPaths());


    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [offlineMode, setOfflineMode] = useState(false);

    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        try {
            const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
            return clampSidebarWidth(raw ? Number(raw) : 260);
        } catch {
            return 260;
        }
    });
    const isResizingRef = useRef(false);
    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(260);

    const isSetupValid = Boolean(leaguePath && extractionPath);
    // Only surface status in the bottom bar while an operation is running, so the
    // resting bar isn't cluttered with the startup "League folder: ..." log line.
    const latestStatus = (isExtracting || isRepathing) && consoleLogs.length > 0
        ? consoleLogs[consoleLogs.length - 1].message
        : '';
    const isPreparingAssetPreview = !isExtracting && Object.values(extractingSkins).some(Boolean);

    const addConsoleLog = (message: string, type: LogType = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setConsoleLogs((prev) => [...prev.slice(-9), { id: Date.now() + Math.random(), timestamp, message, type }]);
    };

    const addRecentOutputPath = (value: string) => {
        const normalized = normalizePathString(value);
        if (!normalized) return;
        const existing = loadRecentOutputPaths().filter((p) => p !== normalized);
        const next = [normalized, ...existing].slice(0, 15);
        try {
            localStorage.setItem(OUTPUT_RECENT_PATHS_STORAGE_KEY, JSON.stringify(next));
        } catch { /* ignore */ }
        setRecentOutputPaths(next);
    };

    /* ── Initial load ─────────────────────────────────────────────────────── */
    useEffect(() => {
        loadSettings();
        loadChampions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Cursor-following glow: set --mx/--my on the hovered skin card (relative to
       its media) and champion row, matching the Design Lab button glow. */
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const card = target.closest<HTMLElement>('.ae-card');
            if (card) {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            }
            const row = target.closest<HTMLElement>('.ae-sb__row');
            if (row) {
                const r = row.getBoundingClientRect();
                row.style.setProperty('--mx', `${e.clientX - r.left}px`);
                row.style.setProperty('--my', `${e.clientY - r.top}px`);
            }
        };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, []);

    useEffect(() => {
        const updateOffline = () => setOfflineMode(typeof navigator !== 'undefined' && navigator.onLine === false);
        updateOffline();
        window.addEventListener('online', updateOffline);
        window.addEventListener('offline', updateOffline);
        return () => {
            window.removeEventListener('online', updateOffline);
            window.removeEventListener('offline', updateOffline);
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
        } catch { /* ignore */ }
    }, [sidebarWidth]);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            if (!isResizingRef.current) return;
            const delta = Number(event.clientX) - resizeStartXRef.current;
            setSidebarWidth(clampSidebarWidth(resizeStartWidthRef.current + delta));
        };
        const onMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    /* Live extraction progress events from the Rust backend. */
    useEffect(() => {
        const unlistenPromise = listen<ExtractProgress>('extract-progress', (event) => {
            const p = event.payload;
            const msg = p.total > 0 ? `${p.message} (${p.current}/${p.total})` : p.message;
            setCurrentExtractionMessage(msg);
        });
        return () => { unlistenPromise.then((un) => un()).catch(() => { /* ignore */ }); };
    }, []);

    const currentSkinKeyRef = useRef<string | null>(null);
    const setCurrentExtractionMessage = (msg: string) => {
        const key = currentSkinKeyRef.current;
        if (!key) return;
        setExtractionProgress((prev) => ({ ...prev, [key]: msg }));
    };

    /* Resolve a sidebar row by CDragon alias.

       Display names are NOT unique: League re-shipped 60 pre-rework champions
       under a `Jade_` alias that keeps the modern champion's name, so the list
       holds two "Annie" rows. The alias is the only stable key. */
    const findChampionByAlias = (alias: string | undefined) =>
        alias ? champions.find((c) => c.alias.toLowerCase() === alias.toLowerCase()) : undefined;

    /* Identity for a selected skin's champion. Falls back to the display name
       only when no alias is present (TFT / ward / emote cards). */
    const sameChampion = (a: SelectedSkin, b: SelectedSkin) => {
        const aliasA = a.champion?.alias?.toLowerCase();
        const aliasB = b.champion?.alias?.toLowerCase();
        if (aliasA && aliasB) return aliasA === aliasB;
        return a.champion?.name === b.champion?.name;
    };

    /* Selection key for a skin card. The legacy ("Jade") rows share the modern
       champion's display name, so the alias has to be part of the key or the
       two collide in `selectedChromas`. */
    const skinKeyFor = (championName: string, skinId: number, championAlias?: string) =>
        `${championAlias || championName}_${skinId}`;

    /* Champion sidebar filter. */
    useEffect(() => {
        const term = searchTerm.toLowerCase();
        setFilteredChampions(
            champions.filter((c) => c.name.toLowerCase().includes(term) || c.alias.toLowerCase().includes(term)),
        );
    }, [searchTerm, champions]);

    const loadSettings = async () => {
        try {
            const detected = await getLeaguePath().catch(() => null);
            const stored = await getSettings().catch(() => null);
            /* Only a FALLBACK. A path the user set in Settings lives in the
               config store and is read reactively above, so it must win over
               whatever autodetection turns up here. */
            const lp = normalizePathString(detected || stored?.leaguePath || '');
            setDetectedLeaguePath(lp);
            if (lp) addConsoleLog(`League folder: ${lp}`, 'success');
            else addConsoleLog('League folder not detected. Set it in Settings.', 'warning');
        } catch (e) {
            log.error('loadSettings', e);
        } finally {
            setSettingsLoaded(true);
        }
    };

    /* Build the browsable sidebar list for the active category from
       CommunityDragon. For champions the local WAD scan (discover_champions) is
       deliberately NOT run: visiting the page must not touch any WAD. Which
       skins are actually installed is resolved lazily per champion in
       loadChampionSkins. TFT / ward / emote rows come pre-built with their skin
       cards attached (presetSkins). */
    const loadChampions = async (mode: ViewMode = viewMode) => {
        try {
            setLoading(true);
            setError(null);

            let finalList: ExtractorChampion[];

            if (mode === 'champion') {
                const cdragon = await getCDragonChampions().catch((e) => {
                    log.error('getCDragonChampions', e);
                    return [] as CDragonChampion[];
                });
                finalList = cdragon.map((c) => ({
                    id: c.alias.toLowerCase(),
                    cdragonId: c.id,
                    name: c.name,
                    alias: c.alias,
                    wadPath: '',
                    // Empty = "not yet scanned"; filled lazily when the champion is opened.
                    availableSkinIds: [],
                    skinCount: 0,
                    championIconUrl: getChampionIconUrl(c.id),
                }));
                finalList.sort((a, b) => a.name.localeCompare(b.name));
            } else if (mode === 'tft') {
                finalList = await getCDragonTftCompanions().catch((e) => {
                    log.error('getCDragonTftCompanions', e);
                    return [] as ExtractorChampion[];
                });
            } else if (mode === 'ward') {
                finalList = await getCDragonWards().catch((e) => {
                    log.error('getCDragonWards', e);
                    return [] as ExtractorChampion[];
                });
            } else {
                finalList = await getCDragonEmotes().catch((e) => {
                    log.error('getCDragonEmotes', e);
                    return [] as ExtractorChampion[];
                });
            }

            if (finalList.length === 0) {
                setError('Failed to load list');
            }

            setChampions(finalList);
            setFilteredChampions(finalList);
            addConsoleLog(`Loaded ${finalList.length} ${categoryLabel(mode)}.`, 'success');
        } catch (err) {
            log.error('loadChampions', err);
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            setError(offline ? 'No internet connection detected and no cached files are available.' : 'Failed to load list');
        } finally {
            setLoading(false);
        }
    };

    const handleViewModeChange = (mode: ViewMode) => {
        if (mode === viewMode) return;
        setViewMode(mode);
        setSelectedChampion(null);
        setChampionSkins([]);
        setSelectedSkins([]);
        setSelectedChromas({});
        clearSkinlineSearch();
        setSearchTerm('');
        loadChampions(mode);
    };

    /* Build the per-champion skin grid: prefer CommunityDragon art/rarity, but
       only show skins that actually exist in the WAD (when known). */
    const loadChampionSkins = async (champion: ExtractorChampion) => {
        const key = champion.name;

        // TFT / ward / emote rows ship their cards pre-built — no per-row fetch.
        if (champion.presetSkins) {
            setChampionSkins(champion.presetSkins);
            return;
        }

        try {
            setLoadingSkins((prev) => ({ ...prev, [key]: true }));

            let cdragonSkins: ExtractorSkin[] = [];
            if (champion.cdragonId) {
                cdragonSkins = (await getCDragonChampionSkins(champion.cdragonId).catch(() => [])) as ExtractorSkin[];
            }

            const available = new Set(champion.availableSkinIds);
            let skins: ExtractorSkin[];

            if (cdragonSkins.length > 0) {
                // Keep CDragon order/art; filter to WAD-present ids when we have them.
                skins = available.size > 0 ? cdragonSkins.filter((s) => available.has(s.id)) : cdragonSkins;
                // Any WAD skin id without CDragon metadata gets a plain fallback card.
                if (available.size > 0) {
                    const known = new Set(skins.map((s) => s.id));
                    for (const id of champion.availableSkinIds) {
                        if (!known.has(id)) {
                            skins.push(makeFallbackSkin(id));
                        }
                    }
                    skins.sort((a, b) => a.id - b.id);
                }
            } else {
                // No CDragon metadata (offline or unmatched) — build from WAD ids.
                skins = champion.availableSkinIds.map(makeFallbackSkin);
            }

            setChampionSkins(skins);

            // Load chroma data in the background (real champions only).
            if (champion.cdragonId) {
                setTimeout(() => {
                    loadChromaData(champion, skins).catch((err) => log.error('loadChromaData', err));
                }, 100);
            }
        } catch (err) {
            log.error('loadChampionSkins', err);
            setError('Failed to load champion skins');
        } finally {
            setLoadingSkins((prev) => ({ ...prev, [key]: false }));
        }
    };

    const makeFallbackSkin = (id: number): ExtractorSkin => ({
        id,
        name: id === 0 ? 'Base' : `Skin ${id}`,
        full_id: String(id),
        rarity: undefined,
        tilePath: null,
        centeredSplashPath: null,
        uncenteredSplashPath: null,
        skinLines: [],
        hideRarityIcon: true,
    });

    const loadChromaData = async (champion: ExtractorChampion, skins: ExtractorSkin[]) => {
        if (!champion.cdragonId) return;
        await fetchAllChromaData();
        const pending: Record<string, Chroma[]> = {};
        for (const skin of skins) {
            const skinKey = skinKeyFor(champion.name, skin.id, champion.alias);
            if (chromaCacheRef.current.has(skinKey)) continue;
            try {
                const chromas = await getChromaDataForSkin(champion.cdragonId, skin.id);
                chromaCacheRef.current.add(skinKey);
                if (chromas.length > 0) pending[skinKey] = chromas;
            } catch (e) {
                log.error('getChromaDataForSkin', e);
            }
        }
        if (Object.keys(pending).length > 0) setChromaData((prev) => ({ ...prev, ...pending }));
    };

    /* ── Skinline search ──────────────────────────────────────────────────── */
    const handleSearchSkinlines = async () => {
        if (!skinlineSearchTerm.trim()) {
            setSkinlineSearchResults([]);
            setShowSkinlineSearch(false);
            return;
        }
        setLoading(true);
        addConsoleLog(`Searching for "${skinlineSearchTerm}" skins...`, 'info');
        try {
            const allSkins = await fetchAllChromaData();
            const cdragonChamps: CDragonChampion[] = champions.map((c) => ({
                id: c.cdragonId || '',
                name: c.name,
                alias: c.alias,
            }));
            const results = searchSkinlines(skinlineSearchTerm, allSkins, cdragonChamps);
            setSkinlineSearchResults(results);
            setShowSkinlineSearch(true);
            addConsoleLog(`Found ${results.length} champions with "${skinlineSearchTerm}" skins`, 'success');
            loadChromaDataForSkinlineResults(results);
        } catch (err) {
            log.error('searchSkinlines', err);
            addConsoleLog(`Search failed: ${String((err as Error)?.message || err)}`, 'error');
            setSkinlineSearchResults([]);
        } finally {
            setLoading(false);
        }
    };

    const loadChromaDataForSkinlineResults = async (results: SkinlineGroup[]) => {
        const pending: Record<string, Chroma[]> = {};
        for (const { champion, skins } of results) {
            const cdragonId = (findChampionByAlias(champion.alias) ?? champions.find((c) => c.name === champion.name))?.cdragonId;
            if (!cdragonId) continue;
            for (const skin of skins) {
                const skinKey = skinKeyFor(champion.name, skin.skinNumber, champion.alias);
                if (chromaCacheRef.current.has(skinKey)) continue;
                try {
                    const chromas = await getChromaDataForSkin(cdragonId, skin.skinNumber);
                    chromaCacheRef.current.add(skinKey);
                    if (chromas.length > 0) pending[skinKey] = chromas;
                } catch (e) {
                    log.error('skinline chroma', e);
                }
            }
        }
        if (Object.keys(pending).length > 0) setChromaData((prev) => ({ ...prev, ...pending }));
    };

    const clearSkinlineSearch = () => {
        setShowSkinlineSearch(false);
        setSkinlineSearchResults([]);
        setSkinlineSearchTerm('');
    };

    /* ── Selection ────────────────────────────────────────────────────────── */
    const handleChampionSelect = (champion: ExtractorChampion) => {
        setSelectedChampion(champion);
        setSelectedSkins([]);
        loadChampionSkins(champion);
    };

    const handleSkinClick = (skinName: string) => {
        if (!selectedChampion) return;
        const skin = championSkins.find((s) => s.name === skinName);
        if (!skin) return;
        const entry: SelectedSkin = {
            id: skin.id,
            name: skin.name,
            champion: { name: selectedChampion.name, id: selectedChampion.id, alias: selectedChampion.alias },
            wadAlias: skin.wadAlias,
            petAlias: skin.petAlias,
            tier: skin.tier,
        };
        setSelectedSkins((prev) => {
            const exists = prev.some((s) => s.name === entry.name && sameChampion(s, entry));
            return exists
                ? prev.filter((s) => !(s.name === entry.name && sameChampion(s, entry)))
                : [...prev, entry];
        });
    };

    const handleSkinlineSkinClick = (
        champion: SkinlineGroup['champion'],
        skin: SkinlineGroup['skins'][number],
    ) => {
        // Match on alias, not display name: the legacy ("Jade") champions share
        // their modern counterpart's name, so a name lookup would hand a legacy
        // skin the modern champion's id (and vice versa).
        const backendChamp = findChampionByAlias(champion.alias) ?? champions.find((c) => c.name === champion.name);
        const entry: SelectedSkin = {
            id: skin.skinNumber,
            name: skin.name,
            champion: { name: champion.name, id: backendChamp?.id, alias: champion.alias },
        };
        setSelectedSkins((prev) => {
            const exists = prev.some((s) => s.name === skin.name && sameChampion(s, entry));
            return exists
                ? prev.filter((s) => !(s.name === skin.name && sameChampion(s, entry)))
                : [...prev, entry];
        });
    };

    const handleChromaClick = (
        chroma: Chroma,
        skin: { id?: number; skinNumber?: number; name?: string },
        championName: string,
        championAlias?: string,
    ) => {
        const rawSkinId = Number(skin?.skinNumber != null ? skin.skinNumber : skin?.id ?? 0);
        const normalizedSkinId = rawSkinId >= 1000 ? rawSkinId % 1000 : rawSkinId;
        const skinKey = skinKeyFor(championName, normalizedSkinId, championAlias);
        const wasSelected = selectedChromas[skinKey]?.id === chroma?.id;
        setSelectedChromas((prev) => {
            if (wasSelected) {
                const next = { ...prev };
                delete next[skinKey];
                return next;
            }
            return { ...prev, [skinKey]: chroma };
        });

        const backendChamp = findChampionByAlias(championAlias) ?? champions.find((c) => c.name === championName);
        const skinSelection: SelectedSkin = {
            id: normalizedSkinId,
            name: skin?.name || `Skin ${normalizedSkinId}`,
            champion: { name: championName, id: backendChamp?.id, alias: backendChamp?.alias ?? championAlias },
        };

        if (wasSelected) {
            setSelectedSkins((prev) =>
                prev.filter((s) => !(sameChampion(s, skinSelection) && Number(s.id) === normalizedSkinId)),
            );
            return;
        }

        setSelectedSkins((prev) => {
            const exists = prev.some((s) => sameChampion(s, skinSelection) && Number(s.id) === normalizedSkinId);
            return exists ? prev : [...prev, skinSelection];
        });
    };

    /* ── Output / League folder pickers ───────────────────────────────────── */
    const pickDirectory = async (): Promise<string> => {
        const dir = await pick({ mode: 'directory' });
        return typeof dir === 'string' ? dir : '';
    };

    const handleBrowseOverrideOutputPath = async (): Promise<string> => {
        const result = await pickDirectory();
        if (result) addRecentOutputPath(result);
        return result;
    };

    /* ── YouTube helpers (open external) ──────────────────────────────────── */
    const openYouTubeSearch = (query: string) => {
        const q = String(query || '').trim();
        if (!q) return;
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        openUrl(url).catch(() => { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ } });
    };
    const handleYouTubeChampion = (champion: ExtractorChampion) => {
        if (!champion?.name) return;
        openYouTubeSearch(`ALL ${champion.name} SKINS SPOTLIGHT League of Legends`);
    };
    const handleYouTubeSkin = (championName: string, skinName: string) => {
        openYouTubeSearch(`${championName} ${skinName} skin spotlight League of Legends`);
    };

    const prepareCardAssets = (championName: string, skinId: number, chromaId: number | null = null): Promise<DonorResult> => {
        const cacheKey = `${leaguePath}|${championName.toLowerCase()}|${skinId}|${chromaId ?? 'base'}`;
        const cached = preparedCardAssetsRef.current.get(cacheKey);
        if (cached) return cached;

        const task = portPrepareDonorFromSkin({ championName, skinId, chromaId, leaguePath });
        preparedCardAssetsRef.current.set(cacheKey, task);
        void task.catch(() => preparedCardAssetsRef.current.delete(cacheKey));
        return task;
    };

    const runCardAssetAction = async (
        action: 'jade' | 'model',
        championName: string,
        skinId: number,
        skinName: string,
        chromaId: number | null = null,
        chromaOptions: Chroma[] = [],
    ) => {
        if (!leaguePath) {
            addConsoleLog(`Set your League install path in Settings before opening ${skinName}.`, 'error');
            notify('error', 'Set your League install path before opening skin assets.');
            goToSettings('settings');
            return;
        }

        const skinKey = `${championName}_${skinId}`;
        if (extractingSkins[skinKey]) return;
        setExtractingSkins((current) => ({ ...current, [skinKey]: true }));
        setExtractionProgress((current) => ({
            ...current,
            [skinKey]: action === 'jade' ? 'Preparing BIN for Jade...' : 'Preparing model preview...',
        }));

        try {
            const prepared = await prepareCardAssets(championName, skinId, action === 'model' ? chromaId : null);
            if (action === 'jade') {
                if (!prepared.combinedBinPath) throw new Error('No combined skin BIN was produced');
                setExtractionProgress((current) => ({ ...current, [skinKey]: 'Opening in Jade...' }));
                await openBinInJade(prepared.combinedBinPath);
                addConsoleLog(`Opened ${skinName} skin ${skinId} in Jade.`, 'success');
                notify('success', `Opened ${skinName} in Jade`);
            } else {
                if (!prepared.modelPath) throw new Error('No SKN, SCB, or SCO model was found for this skin');
                openModelInspect(
                    prepared.modelPath,
                    prepared.modelTexturePath,
                    prepared.modelTexturePaths,
                    prepared.modelHiddenSubmeshes,
                    prepared.modelScale,
                    {
                        chromaOptions,
                        selectedChromaId: chromaId,
                        onSelectChroma: (nextChromaId) => runCardAssetAction(
                            'model', championName, skinId, skinName, nextChromaId, chromaOptions,
                        ),
                    },
                    prepared.anmPaths,
                    prepared.anmClips,
                );
                addConsoleLog(`Opened the model viewer for ${skinName}.`, 'success');
            }
        } catch (error) {
            const label = action === 'jade' ? 'Open in Jade' : 'Model preview';
            addConsoleLog(`${label} failed for ${skinName}: ${(error as Error).message}`, 'error');
            notify('error', `${label} failed: ${(error as Error).message}`);
        } finally {
            setExtractingSkins((current) => ({ ...current, [skinKey]: false }));
            setExtractionProgress((current) => {
                const next = { ...current };
                delete next[skinKey];
                return next;
            });
        }
    };

    const handleOpenSkinInJade = (skin: ExtractorSkin) => {
        if (selectedChampion) void runCardAssetAction('jade', selectedChampion.name, skin.id, skin.name);
    };

    const handleInspectSkinModel = (skin: ExtractorSkin) => {
        if (!selectedChampion) return;
        const skinKey = skinKeyFor(selectedChampion.name, skin.id, selectedChampion.alias);
        void runCardAssetAction(
            'model', selectedChampion.name, skin.id, skin.name,
            selectedChromas[skinKey]?.id ?? null,
            chromaData[skinKey] ?? [],
        );
    };

    /* Download splash art: fetch the skin's splash and let the user pick where to
       save it. Writes bytes through the shared audio_write_file backend command
       (there is no fs plugin in this build). splashUrlOverride lets callers that
       already know the CDragon splash path (e.g. skin cards) skip the ddragon
       fallback. */
    const handleDownloadSplashArt = async (
        championName: string,
        championAlias: string,
        skinNumber: number,
        skinName: string,
        splashUrlOverride?: string | null,
    ) => {
        const splashUrl = splashUrlOverride
            || `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinNumber}.jpg`;
        if (!splashUrl) {
            addConsoleLog('No splash art available for this skin.', 'warning');
            return;
        }
        try {
            const extMatch = String(splashUrl).match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
            const safeName = skinName.replace(/[^a-zA-Z0-9]/g, '_');
            const defaultName = `${championName}_${safeName}_splash.${ext}`;

            const target = await save({
                defaultPath: defaultName,
                filters: [{ name: 'Image', extensions: [ext] }],
            });
            if (!target) return; // user cancelled

            addConsoleLog(`Downloading splash art for ${skinName}...`, 'info');
            const response = await fetch(splashUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            await invoke('audio_write_file', { path: target, data: Array.from(bytes) });
            addConsoleLog(`Saved splash art to ${target}`, 'success');
        } catch (err) {
            addConsoleLog(`Failed to save splash art: ${String((err as Error)?.message || err)}`, 'error');
        }
    };

    /* ── Extraction ───────────────────────────────────────────────────────── */
    const ensureSetupReady = async (actionLabel: string): Promise<boolean> => {
        if (leaguePath && extractionPath) return true;
        const missing = !leaguePath ? 'League install path' : 'output path';
        addConsoleLog(`Set your ${missing} in Settings before ${actionLabel}.`, 'error');
        goToSettings('settings');
        return false;
    };

    const getNormalizedSelectedSkins = (): NormalizedSelection[] =>
        selectedSkins
            .map((skin): NormalizedSelection | null => {
                if (!skin.champion?.name || skin.id == null || !skin.name) return null;
                const championId = skin.champion.id
                    || findChampionByAlias(skin.champion.alias)?.id
                    || champions.find((c) => c.name === skin.champion?.name)?.id
                    || '';
                const chromaKey = skinKeyFor(skin.champion.name, skin.id, skin.champion.alias);
                const chroma = selectedChromas[chromaKey] || null;
                return {
                    championId,
                    championName: skin.champion.name,
                    skinId: skin.id,
                    skinName: skin.name,
                    chromaId: chroma?.id ?? null,
                    wadAlias: skin.wadAlias,
                    petAlias: skin.petAlias,
                    tier: skin.tier,
                };
            })
            .filter((s): s is NormalizedSelection => s !== null);

    const handleExtractWad = async () => {
        // Wards + emotes are browse-only (old Electron never wired extraction).
        if (viewMode === 'ward' || viewMode === 'emote') {
            const label = viewMode === 'ward' ? 'Ward' : 'Emote';
            addConsoleLog(`${label} extraction is not available yet.`, 'warning');
            return;
        }

        if (!(await ensureSetupReady('extracting'))) return;
        const normalized = getNormalizedSelectedSkins();
        if (normalized.length === 0) return;

        // TFT companions now go through the SAME extraction-mode modal as
        // champions (skin-files-only + combine/finalize, or whole-pet-folder).
        setPendingExtractionSkins(normalized);
        setShowExtractionModeModal(true);
    };


    const executeExtraction = async (payload: ExtractionPayload) => {
        const useExtractVoiceover = payload?.options?.extractVoiceover === true;
        const outputOverride = payload?.options?.outputOverride;
        const useOutputOverride = outputOverride?.enabled === true;
        const outputOverrideDefault = normalizePathString(outputOverride?.path || '');
        const outputOverridePerSkin = outputOverride?.perSkinPaths || {};

        setShowExtractionModeModal(false);
        const normalized = pendingExtractionSkins;
        // Per-skin clean-mode choice from the modal (default Skin Files Only).
        const cleanBySkinKey = new Map<string, boolean>(
            (payload?.decisions || []).map((d) => [d.skinKey, d.clean !== false]),
        );

        setIsExtracting(true);
        cancelRef.current = false;
        addConsoleLog(`Extracting ${normalized.length} skin(s)...`, 'info');

        try {
            for (let i = 0; i < normalized.length; i++) {
                if (cancelRef.current) {
                    addConsoleLog('Extraction cancelled by user', 'warning');
                    break;
                }
                const { championId, championName, skinId, skinName, chromaId, petAlias, tier } = normalized[i];
                // Must match ExtractionModeModal's skinKey (champion id first).
                const skinKey = `${championId || championName}_${skinId}`;
                const progress = `${i + 1}/${normalized.length}`;
                const clean = cleanBySkinKey.get(skinKey) !== false;
                const isTft = !!petAlias;
                const outputDir = useOutputOverride
                    ? normalizePathString(outputOverridePerSkin[skinKey] || outputOverrideDefault) || extractionPath
                    : extractionPath;

                if (!isTft && !championId) {
                    addConsoleLog(`${progress} Skipped ${skinName} (${championName}) — no League WAD found for this champion.`, 'warning');
                    continue;
                }

                addConsoleLog(
                    `${progress} Extracting ${skinName} (${isTft ? petAlias : championName})${!isTft && useExtractVoiceover ? ' — Normal & Voiceover WADs' : ''}...`,
                    'info',
                );

                currentSkinKeyRef.current = skinKey;
                setExtractingSkins((prev) => ({ ...prev, [skinKey]: true }));
                setExtractionProgress((prev) => ({ ...prev, [skinKey]: 'Starting extraction...' }));

                try {
                    // TFT companions use the Companions WAD but the SAME skin-graph
                    // clean extract + finalize pipeline; champion id === pet alias.
                    // Only meaningful for a single-skin run; the modal blanks it otherwise.
                    const folderName = payload?.options?.folderName || undefined;
                    const result = isTft
                        ? await extractTftCompanion(petAlias!, tier ?? skinId, outputDir, {
                              clean,
                              preserveHudIcons2D: payload?.options?.preserveHudIcons2D !== false,
                              skipSfx: payload?.options?.skipSfx !== false,
                              folderName,
                          })
                        : await extractChampionAssets(championId, skinId, outputDir, useExtractVoiceover, {
                              clean,
                              chromaId: chromaId ?? undefined,
                              preserveHudIcons2D: payload?.options?.preserveHudIcons2D !== false,
                              skipSfx: payload?.options?.skipSfx !== false,
                              folderName,
                          });
                    addRecentOutputPath(outputDir);
                    addConsoleLog(
                        `${progress} Extracted ${skinName} (${isTft ? petAlias : championName}): ${result.files} file(s) → ${result.outputDir}`,
                        'success',
                    );

                    // Skin Files Only: run the old-Quartz clean-mode pipeline —
                    // combine linked BINs into each skin BIN (no repath prefix),
                    // prune base <char>.bin, then optional split VFX/ANM + consolidate.
                    if (clean) {
                        try {
                            const fin = await extractorFinalizeSkinOnly({
                                contentDir: result.outputDir,
                                // For TFT the "champion" folder is the pet alias.
                                champion: isTft ? petAlias! : championId,
                                skinId: isTft ? (tier ?? skinId) : (chromaId ?? skinId),
                                splitVfx: payload?.options?.splitVfx === true,
                                splitAnm: payload?.options?.splitAnm === true,
                                consolidateAssets: payload?.options?.consolidateAssets !== false,
                            });
                            addConsoleLog(
                                `${progress} Finalized ${skinName}: combined ${fin.binsCombined} BINs across ${fin.charactersCombined} character(s), pruned ${fin.baseBinsPruned} base BIN(s)`,
                                'success',
                            );
                        } catch (finErr) {
                            addConsoleLog(`${progress} Finalize warning for ${skinName}: ${String((finErr as Error)?.message || finErr)}`, 'warning');
                        }
                    }
                } catch (err) {
                    log.error('extractChampionAssets', err);
                    addConsoleLog(`${progress} Failed to extract ${skinName}: ${String((err as Error)?.message || err)}`, 'error');
                    setExtractionProgress((prev) => ({ ...prev, [skinKey]: `Error: ${String((err as Error)?.message || err)}` }));
                } finally {
                    setExtractingSkins((prev) => ({ ...prev, [skinKey]: false }));
                    currentSkinKeyRef.current = null;
                }
            }
            setSelectedSkins([]);
            setSelectedChromas({});
            addConsoleLog('All extractions completed!', 'success');
        } catch (error) {
            log.error('executeExtraction', error);
            addConsoleLog(`Extraction failed: ${String((error as Error)?.message || error)}`, 'error');
        } finally {
            setIsExtracting(false);
            setPendingExtractionSkins([]);
        }
    };

    /* Repath: open the prefix modal for the selected skins. Wards/emotes/TFT
       are not repathable (they aren't champion skin graphs). */
    const handleRepath = async () => {
        if (viewMode !== 'champion' && viewMode !== 'tft') {
            addConsoleLog('Repath is only available for champion skins and TFT companions.', 'warning');
            return;
        }
        if (!(await ensureSetupReady('repathing'))) return;
        const normalized = getNormalizedSelectedSkins();
        if (normalized.length === 0) return;
        setPendingRepathSkins(
            normalized.map((n) => ({ championId: n.championId, championName: n.championName, skinId: n.skinId, skinName: n.skinName, chromaId: n.chromaId, petAlias: n.petAlias, tier: n.tier })),
        );
        setShowPrefixModal(true);
    };

    /* Per skin: clean-extract the champion WAD, then run the Flint repath engine
       (combine linked BINs + rewrite under ASSETS/<prefix>) on that folder,
       producing an installable mod in place. */
    const executeRepath = async (payload: RepathOptionsPayload) => {
        setShowPrefixModal(false);
        const skins = pendingRepathSkins;
        if (skins.length === 0) return;

        const outOverride = payload.outputOverride;
        const useOverride = outOverride?.enabled === true;
        const overrideDefault = normalizePathString(outOverride?.path || '');
        const overridePerSkin = outOverride?.perSkinPaths || {};

        setIsRepathing(true);
        cancelRef.current = false;
        addConsoleLog(`Repathing ${skins.length} skin(s)...`, 'info');

        try {
            for (let i = 0; i < skins.length; i++) {
                if (cancelRef.current) {
                    addConsoleLog('Repath cancelled by user', 'warning');
                    break;
                }
                const skin = skins[i];
                // Match on champion id where available: modern and legacy
                // ("Jade") champions share a display name.
                const norm = getNormalizedSelectedSkins().find((n) =>
                    n.skinId === skin.skinId
                    && (skin.championId ? n.championId === skin.championId : n.championName === skin.championName),
                );
                const isTft = !!skin.petAlias;
                const championId = skin.championId
                    || norm?.championId
                    || champions.find((c) => c.name === skin.championName)?.id
                    || '';
                // For TFT the "champion" folder is the pet alias; skin index is the tier.
                const repathChampion = isTft ? skin.petAlias! : championId;
                const repathSkinId = isTft ? (skin.tier ?? skin.skinId) : (skin.chromaId ?? skin.skinId);
                const progress = `${i + 1}/${skins.length}`;
                // Must match CustomPrefixModal's skinKeyOf (champion id first).
                const skinKey = `${skin.championId || skin.championName}_${skin.skinId}`;
                const prefix = payload.prefixesBySkinId[skin.skinId] || '';

                if (!isTft && !championId) {
                    addConsoleLog(`${progress} Skipped ${skin.skinName} (${skin.championName}) — no League WAD found.`, 'warning');
                    continue;
                }
                if (!prefix) {
                    addConsoleLog(`${progress} Skipped ${skin.skinName} — no prefix set.`, 'warning');
                    continue;
                }

                const outputDir = useOverride
                    ? normalizePathString(overridePerSkin[skinKey] || overrideDefault) || extractionPath
                    : extractionPath;

                currentSkinKeyRef.current = skinKey;
                setExtractingSkins((prev) => ({ ...prev, [skinKey]: true }));

                try {
                    // 1) Clean-extract this skin (skin files only) into a folder.
                    addConsoleLog(`${progress} Extracting ${skin.skinName} (${isTft ? skin.petAlias : skin.championName})...`, 'info');
                    // The repath runs IN PLACE on whatever this extract creates, so
                    // naming the extract folder names the finished mod folder too.
                    const folderName = payload.folderName || undefined;
                    const ext = isTft
                        ? await extractTftCompanion(skin.petAlias!, skin.tier ?? skin.skinId, outputDir, {
                              clean: true,
                              preserveHudIcons2D: payload.preserveHudIcons2D,
                              skipSfx: payload.skipSfxRepath,
                              folderName,
                          })
                        : await extractChampionAssets(championId, skin.skinId, outputDir, payload.extractVoiceover, {
                              clean: true,
                              chromaId: skin.chromaId ?? undefined,
                              preserveHudIcons2D: payload.preserveHudIcons2D,
                              skipSfx: payload.skipSfxRepath,
                              folderName,
                          });

                    // 2) Repath the extracted folder in place -> installable mod.
                    addConsoleLog(`${progress} Repathing ${skin.skinName} with prefix "${prefix}"...`, 'info');
                    const rep = await extractorRepath({
                        contentDir: ext.outputDir,
                        champion: repathChampion,
                        skinId: repathSkinId,
                        prefix,
                        combineLinked: true,
                        cleanupUnused: false,
                        skipSfx: payload.skipSfxRepath,
                        extractVoiceover: payload.extractVoiceover,
                        splitVfx: payload.splitVfx,
                        splitAnm: payload.splitAnm,
                        consolidateAssets: payload.consolidateAssets,
                    });
                    addRecentOutputPath(outputDir);
                    addConsoleLog(
                        `${progress} Repathed ${skin.skinName}: ${rep.pathsModified} paths, ${rep.filesRelocated} files${rep.binsCombined ? `, ${rep.binsCombined} BINs combined` : ''}${rep.charactersCombined > 1 ? ` across ${rep.charactersCombined} characters` : ''} → ${rep.outputDir}`,
                        'success',
                    );
                } catch (err) {
                    log.error('executeRepath', err);
                    addConsoleLog(`${progress} Failed to repath ${skin.skinName}: ${String((err as Error)?.message || err)}`, 'error');
                } finally {
                    setExtractingSkins((prev) => ({ ...prev, [skinKey]: false }));
                    currentSkinKeyRef.current = null;
                }
            }
            setSelectedSkins([]);
            setSelectedChromas({});
            addConsoleLog('All repath operations completed!', 'success');
        } catch (error) {
            log.error('executeRepath', error);
            addConsoleLog(`Repath failed: ${String((error as Error)?.message || error)}`, 'error');
        } finally {
            setIsRepathing(false);
            setPendingRepathSkins([]);
        }
    };

    /* ── Sidebar resize ───────────────────────────────────────────────────── */
    const handleStartSidebarResize = (event: React.MouseEvent) => {
        event.preventDefault();
        isResizingRef.current = true;
        resizeStartXRef.current = Number(event.clientX);
        resizeStartWidthRef.current = sidebarWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    /* ── Render ───────────────────────────────────────────────────────────── */
    if (!settingsLoaded) return wrap(<LoadingSkeletonView sidebarWidth={sidebarWidth} />);
    if (loading && champions.length === 0) return wrap(<LoadingSkeletonView sidebarWidth={sidebarWidth} />);
    if (error && champions.length === 0) return wrap(<ErrorStateView error={error} onRetry={loadChampions} />);

    return wrap(
        <>
            <SearchHelpModal open={showSearchInfo} onClose={() => setShowSearchInfo(false)} />

            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', userSelect: isResizingRef.current ? 'none' : 'auto' }}>
              <div className="flex" style={{ flex: 1, minHeight: 0 }}>
                <ChampionSidebar
                    searchTerm={searchTerm}
                    onSearchTermChange={setSearchTerm}
                    skinlineSearchTerm={skinlineSearchTerm}
                    onSkinlineSearchTermChange={setSkinlineSearchTerm}
                    onSearchSkinlines={handleSearchSkinlines}
                    showSkinlineSearch={showSkinlineSearch}
                    onClearSkinlineSearch={clearSkinlineSearch}
                    filteredChampions={filteredChampions}
                    selectedChampion={selectedChampion}
                    onSelectChampion={handleChampionSelect}
                    onYouTubeChampion={handleYouTubeChampion}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    showSearchInfo={showSearchInfo}
                    onToggleSearchInfo={() => setShowSearchInfo(!showSearchInfo)}
                    offlineMode={offlineMode}
                    sidebarWidth={sidebarWidth}
                />

                <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={handleStartSidebarResize}
                    title="Drag to resize sidebar"
                    style={{
                        width: 8,
                        cursor: 'col-resize',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                        borderLeft: '1px solid rgba(255,255,255,0.06)',
                        borderRight: '1px solid rgba(255,255,255,0.06)',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
                        flexShrink: 0,
                    }}
                />

                <main className="flex-1 overflow-y-auto relative" style={{ minWidth: 0, padding: '12px 16px 16px', scrollbarGutter: 'stable' }}>
                    {offlineMode && (
                        <div
                            style={{
                                marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 14,
                                border: '1px solid color-mix(in oklab, var(--color-warning) 40%, transparent)',
                                background: 'color-mix(in oklab, var(--color-warning) 12%, transparent)',
                                color: 'var(--color-warning)',
                            }}
                        >
                            No internet connection detected. Splash art and metadata may be unavailable.
                        </div>
                    )}

                    {showSkinlineSearch ? (
                        <SkinlineResultsPanel
                            skinlineSearchTerm={skinlineSearchTerm}
                            skinlineSearchResults={skinlineSearchResults}
                            loading={loading}
                            selectedSkins={selectedSkins}
                            chromaData={chromaData}
                            selectedChromas={selectedChromas}
                            extractingSkins={extractingSkins}
                            extractionProgress={extractionProgress}
                            onSkinClick={handleSkinlineSkinClick}
                            onChromaClick={handleChromaClick}
                            onDownloadSplashArt={handleDownloadSplashArt}
                            onYouTubeSkin={handleYouTubeSkin}
                            onOpenInJade={(champion, skin) => {
                                void runCardAssetAction('jade', champion.name, skin.skinNumber, skin.name);
                            }}
                            onInspectModel={(champion, skin) => {
                                const skinKey = `${champion.name}_${skin.skinNumber}`;
                                void runCardAssetAction(
                                    'model', champion.name, skin.skinNumber, skin.name,
                                    selectedChromas[skinKey]?.id ?? null,
                                    chromaData[skinKey] ?? [],
                                );
                            }}
                            offlineMode={offlineMode}
                        />
                    ) : selectedChampion ? (
                        <ChampionSkinsPanel
                            selectedChampion={selectedChampion}
                            loadingSkins={loadingSkins}
                            championSkins={championSkins}
                            selectedSkins={selectedSkins}
                            extractingSkins={extractingSkins}
                            extractionProgress={extractionProgress}
                            chromaData={chromaData}
                            selectedChromas={selectedChromas}
                            onSkinClick={handleSkinClick}
                            onChromaClick={handleChromaClick}
                            onDownloadSplashArt={handleDownloadSplashArt}
                            onYouTubeSkin={handleYouTubeSkin}
                            onOpenInJade={viewMode === 'champion' ? handleOpenSkinInJade : undefined}
                            onInspectModel={viewMode === 'champion' ? handleInspectSkinModel : undefined}
                            offlineMode={offlineMode}
                        />
                    ) : (
                        <NoChampionSelectedView />
                    )}
                </main>
              </div>

              <SelectionActionBar
                  selectedSkins={selectedSkins}
                  statusMessage={latestStatus}
                  isExtracting={isExtracting}
                  isRepathing={isRepathing}
                  isPreviewing={isPreparingAssetPreview}
                  isSetupValid={isSetupValid}
                  onExtract={handleExtractWad}
                  onRepath={handleRepath}
                  onClearAll={() => setSelectedSkins([])}
              />
            </div>

            <ExtractionModeModal
                open={showExtractionModeModal}
                skins={pendingExtractionSkins}
                defaultOutputPath={extractionPath}
                recentOutputPaths={recentOutputPaths}
                onBrowseOutputPath={handleBrowseOverrideOutputPath}
                onDecide={executeExtraction}
                onCancel={() => {
                    setShowExtractionModeModal(false);
                    setPendingExtractionSkins([]);
                }}
            />

            <CustomPrefixModal
                open={showPrefixModal}
                skins={pendingRepathSkins}
                defaultOutputPath={extractionPath}
                recentOutputPaths={recentOutputPaths}
                onBrowseOutputPath={handleBrowseOverrideOutputPath}
                onStart={executeRepath}
                onCancel={() => {
                    setShowPrefixModal(false);
                    setPendingRepathSkins([]);
                }}
            />
        </>,
    );
}

/* Wrap every render branch in the scoped wrapper. Background is transparent so
   the app's global background (wallpaper / effects layer) shows through. */
function wrap(children: React.ReactNode) {
    return (
        <div
            className="assetextractor-wrapper"
            style={{ height: '100%', background: 'transparent', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden' }}
        >
            {children}
        </div>
    );
}

export default AssetExtractor;
