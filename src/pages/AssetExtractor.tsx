import React, { useEffect, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import './assetextractor/AssetExtractor.css';
import {
    getLeaguePath,
    discoverChampions,
    extractChampionAssets,
    getSettings,
    type Champion,
    type ExtractProgress,
} from '@/lib/api';
import { useConfigStore, useNavigationStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';

import {
    getCDragonChampions,
    getCDragonChampionSkins,
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
} from './assetextractor/types';

import { ChampionSidebar } from './assetextractor/components/ChampionSidebar';
import { TopControls } from './assetextractor/components/TopControls';
import { ChampionSkinsPanel } from './assetextractor/components/ChampionSkinsPanel';
import { SkinlineResultsPanel } from './assetextractor/components/SkinlineResultsPanel';
import { SelectionSummaryBar } from './assetextractor/components/SelectionSummaryBar';
import { WarningModal } from './assetextractor/components/WarningModal';
import { SearchHelpModal } from './assetextractor/components/SearchHelpModal';
import { ExtractionModeModal, type ExtractionPayload } from './assetextractor/components/ExtractionModeModal';
import { LoadingStateView, ErrorStateView, NoChampionSelectedView } from './assetextractor/components/StateViews';

const SIDEBAR_WIDTH_STORAGE_KEY = 'assetextractor-sidebar-width';
const OUTPUT_RECENT_PATHS_STORAGE_KEY = 'assetextractor-recent-output-paths';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 620;
const clampSidebarWidth = (value: number) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Number(value) || 260));

const normalizePathString = (value: string | null | undefined) => String(value || '').trim();

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
}

export function AssetExtractor() {
    const wadOutputPath = useConfigStore((s) => s.settings.wadOutputPath);
    const goToSettings = useNavigationStore((s) => s.setPage);

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

    const [leaguePath, setLeaguePath] = useState('');
    const extractionPath = normalizePathString(wadOutputPath);

    const [isExtracting, setIsExtracting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const cancelRef = useRef(false);

    const [showExtractionModeModal, setShowExtractionModeModal] = useState(false);
    const [pendingExtractionSkins, setPendingExtractionSkins] = useState<NormalizedSelection[]>([]);
    const [recentOutputPaths, setRecentOutputPaths] = useState<string[]>(() => loadRecentOutputPaths());

    const [showWarningModal, setShowWarningModal] = useState(false);
    const [warningDismissedThisSession, setWarningDismissedThisSession] = useState(false);
    const [warningDontShowAgain, setWarningDontShowAgain] = useState(false);

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

    /* Champion sidebar filter. */
    useEffect(() => {
        const term = searchTerm.toLowerCase();
        setFilteredChampions(
            champions.filter((c) => c.name.toLowerCase().includes(term) || c.alias.toLowerCase().includes(term)),
        );
    }, [searchTerm, champions]);

    /* Show the setup warning once paths are missing. */
    useEffect(() => {
        if (!settingsLoaded) return;
        const hasPathIssues = !leaguePath || !extractionPath;
        if (hasPathIssues && !showWarningModal && !warningDismissedThisSession) {
            setShowWarningModal(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leaguePath, extractionPath, settingsLoaded, warningDismissedThisSession]);

    const loadSettings = async () => {
        try {
            const detected = await getLeaguePath().catch(() => null);
            const stored = await getSettings().catch(() => null);
            const lp = normalizePathString(detected || stored?.leaguePath || '');
            setLeaguePath(lp);
            if (lp) addConsoleLog(`League folder: ${lp}`, 'success');
            else addConsoleLog('League folder not detected — set it in Settings.', 'warning');
        } catch (e) {
            log.error('loadSettings', e);
        } finally {
            setSettingsLoaded(true);
        }
    };

    /* Merge backend champions (file id + WAD skin ids) with CommunityDragon
       metadata (numeric id, display name, alias, icon). */
    const loadChampions = async () => {
        try {
            setLoading(true);
            setError(null);

            const backendPromise = discoverChampions().catch((e) => {
                log.error('discoverChampions', e);
                return [] as Champion[];
            });
            const cdragonPromise = getCDragonChampions().catch((e) => {
                log.error('getCDragonChampions', e);
                return [] as CDragonChampion[];
            });
            const [backend, cdragon] = await Promise.all([backendPromise, cdragonPromise]);

            const cdragonByAlias = new Map<string, CDragonChampion>();
            for (const c of cdragon) cdragonByAlias.set(c.alias.toLowerCase(), c);

            const merged: ExtractorChampion[] = backend.map((champ) => {
                const meta = cdragonByAlias.get(champ.id.toLowerCase());
                const availableSkinIds = champ.skins.map((s) => s.id);
                return {
                    id: champ.id,
                    cdragonId: meta?.id ?? null,
                    name: meta?.name || champ.name,
                    alias: meta?.alias || champ.id,
                    wadPath: champ.wadPath,
                    availableSkinIds,
                    skinCount: champ.skinCount,
                    championIconUrl: meta ? getChampionIconUrl(meta.id) : undefined,
                };
            });

            merged.sort((a, b) => a.name.localeCompare(b.name));

            // If the backend found nothing (no League install), fall back to the
            // CDragon champion list so the UI is still populated and browsable.
            let finalList = merged;
            if (merged.length === 0 && cdragon.length > 0) {
                finalList = cdragon.map((c) => ({
                    id: c.alias.toLowerCase(),
                    cdragonId: c.id,
                    name: c.name,
                    alias: c.alias,
                    wadPath: '',
                    availableSkinIds: [],
                    skinCount: 0,
                    championIconUrl: getChampionIconUrl(c.id),
                }));
                addConsoleLog('No League install detected — showing CommunityDragon champion list.', 'warning');
            }

            if (finalList.length === 0) {
                setError('Failed to load champions');
            }

            setChampions(finalList);
            setFilteredChampions(finalList);
            addConsoleLog(`Loaded ${finalList.length} champions.`, 'success');
        } catch (err) {
            log.error('loadChampions', err);
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            setError(offline ? 'No internet connection detected and no cached files are available.' : 'Failed to load champions');
        } finally {
            setLoading(false);
        }
    };

    /* Build the per-champion skin grid: prefer CommunityDragon art/rarity, but
       only show skins that actually exist in the WAD (when known). */
    const loadChampionSkins = async (champion: ExtractorChampion) => {
        const key = champion.name;
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
            const skinKey = `${champion.name}_${skin.id}`;
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
            const cdragonId = champions.find((c) => c.name === champion.name)?.cdragonId;
            if (!cdragonId) continue;
            for (const skin of skins) {
                const skinKey = `${champion.name}_${skin.skinNumber}`;
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
        };
        setSelectedSkins((prev) => {
            const exists = prev.some((s) => s.name === entry.name && s.champion?.name === entry.champion.name);
            return exists
                ? prev.filter((s) => !(s.name === entry.name && s.champion?.name === entry.champion.name))
                : [...prev, entry];
        });
    };

    const handleSkinlineSkinClick = (
        champion: SkinlineGroup['champion'],
        skin: SkinlineGroup['skins'][number],
    ) => {
        const backendChamp = champions.find((c) => c.name === champion.name);
        const entry: SelectedSkin = {
            id: skin.skinNumber,
            name: skin.name,
            champion: { name: champion.name, id: backendChamp?.id, alias: champion.alias },
        };
        setSelectedSkins((prev) => {
            const exists = prev.some((s) => s.name === skin.name && s.champion?.name === champion.name);
            return exists
                ? prev.filter((s) => !(s.name === skin.name && s.champion?.name === champion.name))
                : [...prev, entry];
        });
    };

    const handleChromaClick = (chroma: Chroma, skin: { id?: number; skinNumber?: number; name?: string }, championName: string) => {
        const rawSkinId = Number(skin?.skinNumber != null ? skin.skinNumber : skin?.id ?? 0);
        const normalizedSkinId = rawSkinId >= 1000 ? rawSkinId % 1000 : rawSkinId;
        const skinKey = `${championName}_${normalizedSkinId}`;
        const wasSelected = selectedChromas[skinKey]?.id === chroma?.id;
        setSelectedChromas((prev) => {
            if (wasSelected) {
                const next = { ...prev };
                delete next[skinKey];
                return next;
            }
            return { ...prev, [skinKey]: chroma };
        });

        if (wasSelected) {
            setSelectedSkins((prev) => prev.filter((s) => !(s.champion?.name === championName && Number(s.id) === normalizedSkinId)));
            return;
        }

        const backendChamp = champions.find((c) => c.name === championName);
        const skinSelection: SelectedSkin = {
            id: normalizedSkinId,
            name: skin?.name || `Skin ${normalizedSkinId}`,
            champion: { name: championName, id: backendChamp?.id, alias: backendChamp?.alias },
        };
        setSelectedSkins((prev) => {
            const exists = prev.some((s) => s.champion?.name === championName && Number(s.id) === normalizedSkinId);
            return exists ? prev : [...prev, skinSelection];
        });
    };

    /* ── Output / League folder pickers ───────────────────────────────────── */
    const pickDirectory = async (): Promise<string> => {
        const dir = await openDialog({ directory: true, multiple: false });
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
        try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
    };
    const handleYouTubeChampion = (champion: ExtractorChampion) => {
        if (!champion?.name) return;
        openYouTubeSearch(`ALL ${champion.name} SKINS SPOTLIGHT League of Legends`);
    };
    const handleYouTubeSkin = (championName: string, skinName: string) => {
        openYouTubeSearch(`${championName} ${skinName} skin spotlight League of Legends`);
    };

    /* Splash art download is display-only in the Tauri port (no fs plugin). */
    const handleDownloadSplashArt = () => {
        addConsoleLog('Saving splash art to disk is not supported in this build.', 'warning');
    };

    /* ── Extraction ───────────────────────────────────────────────────────── */
    const ensureSetupReady = async (actionLabel: string): Promise<boolean> => {
        if (leaguePath && extractionPath) return true;
        if (!warningDontShowAgain) {
            setShowWarningModal(true);
        } else {
            addConsoleLog(`Configure League Path and Output Path in Settings before ${actionLabel}.`, 'error');
        }
        return false;
    };

    const getNormalizedSelectedSkins = (): NormalizedSelection[] =>
        selectedSkins
            .map((skin): NormalizedSelection | null => {
                if (!skin.champion?.name || skin.id == null || !skin.name) return null;
                const championId = skin.champion.id
                    || champions.find((c) => c.name === skin.champion?.name)?.id
                    || '';
                const chromaKey = `${skin.champion.name}_${skin.id}`;
                const chroma = selectedChromas[chromaKey] || null;
                return {
                    championId,
                    championName: skin.champion.name,
                    skinId: skin.id,
                    skinName: skin.name,
                    chromaId: chroma?.id ?? null,
                };
            })
            .filter((s): s is NormalizedSelection => s !== null);

    const handleExtractWad = async () => {
        if (!(await ensureSetupReady('extracting'))) return;
        const normalized = getNormalizedSelectedSkins();
        if (normalized.length === 0) return;
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

        setIsExtracting(true);
        cancelRef.current = false;
        addConsoleLog(`Extracting ${normalized.length} skin(s)...`, 'info');

        try {
            for (let i = 0; i < normalized.length; i++) {
                if (cancelRef.current) {
                    addConsoleLog('Extraction cancelled by user', 'warning');
                    break;
                }
                const { championId, championName, skinId, skinName } = normalized[i];
                const skinKey = `${championName}_${skinId}`;
                const progress = `${i + 1}/${normalized.length}`;
                const outputDir = useOutputOverride
                    ? normalizePathString(outputOverridePerSkin[skinKey] || outputOverrideDefault) || extractionPath
                    : extractionPath;

                if (!championId) {
                    addConsoleLog(`${progress} Skipped ${skinName} (${championName}) — no League WAD found for this champion.`, 'warning');
                    continue;
                }

                addConsoleLog(
                    `${progress} Extracting ${skinName} (${championName})${useExtractVoiceover ? ' — Normal & Voiceover WADs' : ' — Normal WAD only'}...`,
                    'info',
                );

                currentSkinKeyRef.current = skinKey;
                setExtractingSkins((prev) => ({ ...prev, [skinKey]: true }));
                setExtractionProgress((prev) => ({ ...prev, [skinKey]: 'Starting extraction...' }));

                try {
                    const result = await extractChampionAssets(championId, skinId, outputDir, useExtractVoiceover);
                    addRecentOutputPath(outputDir);
                    addConsoleLog(
                        `${progress} Extracted ${skinName} (${championName}): ${result.files} file(s) → ${result.outputDir}`,
                        'success',
                    );
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

    const cancelOperations = async () => {
        setIsCancelling(true);
        cancelRef.current = true;
        addConsoleLog('Cancelling all operations...', 'warning');
        setTimeout(() => setIsCancelling(false), 1000);
    };

    /* ── Warning modal handlers ───────────────────────────────────────────── */
    const handleWarningCancel = () => {
        setShowWarningModal(false);
        setWarningDismissedThisSession(true);
    };
    const handleWarningOpenSettings = () => {
        setShowWarningModal(false);
        setWarningDismissedThisSession(true);
        goToSettings('settings');
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
    if (!settingsLoaded) return wrap(<LoadingStateView />);
    if (loading && champions.length === 0) return wrap(<LoadingStateView />);
    if (error && champions.length === 0) return wrap(<ErrorStateView error={error} onRetry={loadChampions} />);

    return wrap(
        <>
            <SearchHelpModal open={showSearchInfo} onClose={() => setShowSearchInfo(false)} />

            <div className="flex h-screen" style={{ userSelect: isResizingRef.current ? 'none' : 'auto' }}>
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

                <main className="flex-1 p-6 overflow-y-auto relative" style={{ minWidth: 0 }}>
                    {offlineMode && (
                        <div className="mb-4 px-3 py-2 rounded-md border border-yellow-600/40 bg-yellow-500/10 text-yellow-300 text-sm">
                            No internet connection detected. Splash art and metadata may be unavailable.
                        </div>
                    )}

                    <TopControls
                        consoleLogs={consoleLogs}
                        showSearchInfo={showSearchInfo}
                        onToggleSearchInfo={() => setShowSearchInfo(!showSearchInfo)}
                        isExtracting={isExtracting}
                        isCancelling={isCancelling}
                        onCancelOperations={cancelOperations}
                        onOpenSettings={() => goToSettings('settings')}
                    />

                    {showSkinlineSearch ? (
                        <SkinlineResultsPanel
                            skinlineSearchTerm={skinlineSearchTerm}
                            skinlineSearchResults={skinlineSearchResults}
                            loading={loading}
                            selectedSkins={selectedSkins}
                            chromaData={chromaData}
                            selectedChromas={selectedChromas}
                            onSkinClick={handleSkinlineSkinClick}
                            onChromaClick={handleChromaClick}
                            onDownloadSplashArt={handleDownloadSplashArt}
                            onYouTubeSkin={handleYouTubeSkin}
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
                            offlineMode={offlineMode}
                        />
                    ) : (
                        <NoChampionSelectedView loading={loading} />
                    )}
                </main>
            </div>

            <SelectionSummaryBar
                selectedSkins={selectedSkins}
                isExtracting={isExtracting}
                isSetupValid={isSetupValid}
                onExtract={handleExtractWad}
                onClearAll={() => setSelectedSkins([])}
            />

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

            <WarningModal
                open={showWarningModal}
                leaguePath={leaguePath}
                extractionPath={extractionPath}
                warningDontShowAgain={warningDontShowAgain}
                setWarningDontShowAgain={setWarningDontShowAgain}
                onCancel={handleWarningCancel}
                onOpenSettings={handleWarningOpenSettings}
            />
        </>,
    );
}

/* Wrap every render branch in the scoped wrapper so the ported utility CSS
   (and theme vars) apply consistently. */
function wrap(children: React.ReactNode) {
    return (
        <div className="assetextractor-wrapper h-screen bg-black text-white relative overflow-hidden">
            {children}
        </div>
    );
}

export default AssetExtractor;
