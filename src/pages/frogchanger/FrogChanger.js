import React, { useState, useEffect, useRef } from 'react';
import './FrogChanger.css';
import electronPrefs from '../../utils/core/electronPrefs.js';
import CelestiaGuide from '../../components/celestia/CelestiaGuide';
import SearchHelpModal from './components/SearchHelpModal.js';
import TopControls from './components/TopControls.js';
import ChampionSidebar from './components/ChampionSidebar.js';
import SkinlineResultsPanel from './components/SkinlineResultsPanel.js';
import ChampionSkinsPanel from './components/ChampionSkinsPanel.js';
import LoadingStateView from './components/LoadingStateView.js';
import ErrorStateView from './components/ErrorStateView.js';
import NoChampionSelectedView from './components/NoChampionSelectedView.js';
import SelectionSummaryBar from './components/SelectionSummaryBar.js';
import SettingsModal from './components/SettingsModal.js';
import CustomPrefixModal from './components/CustomPrefixModal.js';
import ExtractionModeModal from './components/ExtractionModeModal.js';
import WarningModal from './components/WarningModal.js';
import useModelInspect from '../../hooks/useModelInspect.js';
import ModelInspectModal from '../../components/model-inspect/ModelInspectModal.js';
import {
  api,
  fetchAllChromaData,
  getFrogDataStatus,
  getFrogOfflineSimulationEnabled,
  getChromaDataForSkin,
  getDefaultChromaColor,
} from './services/communityDragonApi.js';
import {
  getTacticians,
  getTacticianSkins,
  getTacticianIconUrl,
  searchTacticianSkinline,
} from './services/tftApi.js';
import {
  getWards,
  getWardSkins,
  getWardChampionIconUrl,
  getEmotes,
  getEmoteSkins,
} from './services/wardEmoteApi.js';
import { extractSkinWadBundle } from './services/extractionService.js';
import {
  downloadSplashArtToFile,
  getChampionIconUrl,
  getRarityIconUrl,
} from './services/mediaService.js';
import {
  getChampionFileName,
  runBumpathRepath,
} from './services/operationsService.js';
import {
  detectChampionsFolder,
  loadFrogSettings,
  validateFrogSetup,
} from './services/setupService.js';
import { emitJadeMissingModal, isJadeMissingResult } from '../../utils/interop/jadeInterop.js';

const FrogChanger = () => {
  const SIDEBAR_WIDTH_STORAGE_KEY = 'frogchanger-sidebar-width';
  const OUTPUT_RECENT_PATHS_STORAGE_KEY = 'frogchanger-recent-output-paths';
  const SIDEBAR_MIN = 220;
  const SIDEBAR_MAX = 620;
  const clampSidebarWidth = (value) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Number(value) || 260));

  const modelInspect = useModelInspect();
  const [champions, setChampions] = useState([]);
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [championSkins, setChampionSkins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredChampions, setFilteredChampions] = useState([]);
  const [skinlineSearchTerm, setSkinlineSearchTerm] = useState('');
  const [skinlineSearchResults, setSkinlineSearchResults] = useState([]);
  const [showSkinlineSearch, setShowSkinlineSearch] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [selectedSkins, setSelectedSkins] = useState([]);
  const [showSearchInfo, setShowSearchInfo] = useState(false);
  // viewMode picks the data source: champions, TFT tacticians, ward skins,
  // or summoner emotes. Existing code paths reference `tftMode` so we keep
  // that as a derived boolean to avoid a sweeping rename.
  const [viewMode, setViewMode] = useState('champion'); // 'champion' | 'tft' | 'ward' | 'emote'
  const tftMode = viewMode === 'tft';
  const wardMode = viewMode === 'ward';
  const emoteMode = viewMode === 'emote';
  const setTftMode = (enabled) => setViewMode(enabled ? 'tft' : 'champion');

  // Add log to console
  const addConsoleLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type // 'info', 'success', 'warning', 'error'
    };
    setConsoleLogs(prev => [...prev.slice(-9), logEntry]); // Keep last 10 logs
  };

  // Cancel ongoing operations
  const cancelOperations = async () => {
    setIsCancelling(true);
    addConsoleLog('Cancelling all operations...', 'warning');

    try {
      // Send cancel request to backend
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('cancel:operations');
      } else {
        // Fallback to direct HTTP request for development
        await fetch('http://localhost:5001/api/cancel-operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      addConsoleLog('Backend operations cancelled', 'warning');
    } catch (error) {
      console.error('Error cancelling backend operations:', error);
      addConsoleLog('Failed to cancel backend operations', 'error');
    }

    // Reset all operation states
    setIsExtracting(false);
    setIsRepathing(false);
    setExtractingSkins({});
    setExtractionProgress({});

    // Clear selected skins and chromas
    setSelectedSkins([]);
    setSelectedChromas({});

    addConsoleLog('Operations cancelled', 'warning');

    // Reset cancelling state after a brief delay
    setTimeout(() => {
      setIsCancelling(false);
    }, 1000);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [loadingSkins, setLoadingSkins] = useState({});
  const [extractingSkins, setExtractingSkins] = useState({});
  const [extractionProgress, setExtractionProgress] = useState({});
  const [leaguePath, setLeaguePath] = useState('');
  const [hashPath, setHashPath] = useState('');
  const [extractionPath, setExtractionPath] = useState('');
  const [chromaData, setChromaData] = useState({});
  const [selectedChromas, setSelectedChromas] = useState({});
  const [chromaCache, setChromaCache] = useState(new Set()); // Track which skins we've already checked
  const [isRepathing, setIsRepathing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [showExtractionModeModal, setShowExtractionModeModal] = useState(false);
  const [pendingExtractionSkins, setPendingExtractionSkins] = useState([]);
  const [customPrefix, setCustomPrefix] = useState(() => {
    try { return String(window.localStorage.getItem('frogchanger_repath_prefix') || ''); }
    catch { return ''; }
  });
  const [pendingRepathData, setPendingRepathData] = useState(null);
  const [currentSkinIndex, setCurrentSkinIndex] = useState(0);
  const [skinPrefixes, setSkinPrefixes] = useState({});
  const [repathOutputOverrideEnabled, setRepathOutputOverrideEnabled] = useState(false);
  const [repathOutputKeepForAll, setRepathOutputKeepForAll] = useState(true);
  const [repathOutputPath, setRepathOutputPath] = useState('');
  const [repathOutputPathsBySkin, setRepathOutputPathsBySkin] = useState({});
  const [recentOutputPaths, setRecentOutputPaths] = useState([]);
  const [skipSfxRepath, setSkipSfxRepath] = useState(true);
  const [repathExtractVoiceover, setRepathExtractVoiceover] = useState(false);
  const [repathPreserveHudIcons2D, setRepathPreserveHudIcons2D] = useState(true);
  const [repathSplitVfx, setRepathSplitVfx] = useState(false);
  const [repathSplitAnm, setRepathSplitAnm] = useState(false);
  const [repathConsolidateAssets, setRepathConsolidateAssets] = useState(true);
  const [applyToAll, setApplyToAll] = useState(false);
  const [showLeaguePathTooltip, setShowLeaguePathTooltip] = useState(false);
  const [showExtractionPathTooltip, setShowExtractionPathTooltip] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningDismissedThisSession, setWarningDismissedThisSession] = useState(false);
  const [warningDontShowAgain, setWarningDontShowAgain] = useState(false);
  const [hashStatus, setHashStatus] = useState(null);
  const [showCelestiaGuide, setShowCelestiaGuide] = useState(false);
  const [isSetupValid, setIsSetupValid] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSimulationEnabled, setOfflineSimulationEnabled] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      return clampSidebarWidth(raw ? Number(raw) : 260);
    } catch (_) {
      return 260;
    }
  });
  const hasShownOfflineNoticeRef = useRef(false);
  const leaguePathRef = useRef(null);
  const extractionPathRef = useRef(null);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(260);

  const normalizePathString = (value) => String(value || '').trim();
  const pathExists = (candidate) => {
    const value = normalizePathString(candidate);
    if (!value || !window.require) return false;
    try {
      const fs = window.require('fs');
      return fs.existsSync(value);
    } catch (_) {
      return false;
    }
  };
  const loadValidRecentOutputPaths = () => {
    try {
      const raw = localStorage.getItem(OUTPUT_RECENT_PATHS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const unique = [...new Set(parsed.map(normalizePathString).filter(Boolean))];
      const valid = unique.filter(pathExists);
      if (valid.length !== unique.length) {
        localStorage.setItem(OUTPUT_RECENT_PATHS_STORAGE_KEY, JSON.stringify(valid));
      }
      return valid;
    } catch (_) {
      return [];
    }
  };
  const refreshRecentOutputPaths = () => {
    setRecentOutputPaths(loadValidRecentOutputPaths());
  };
  const addRecentOutputPath = (value) => {
    const normalized = normalizePathString(value);
    if (!normalized || !pathExists(normalized)) return;
    const existing = loadValidRecentOutputPaths().filter((p) => p !== normalized);
    const next = [normalized, ...existing].slice(0, 15);
    try {
      localStorage.setItem(OUTPUT_RECENT_PATHS_STORAGE_KEY, JSON.stringify(next));
    } catch (_) { }
    setRecentOutputPaths(next);
  };

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
    refreshRecentOutputPaths();
  }, []);

  // Reload sidebar list when the view mode switches.
  useEffect(() => {
    loadChampions();
  }, [viewMode]);

  useEffect(() => {
    const updateOfflineFromNavigator = () => {
      const simulationEnabled = getFrogOfflineSimulationEnabled();
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setOfflineSimulationEnabled(simulationEnabled);
      setOfflineMode(offline || simulationEnabled);
      if (!offline && !simulationEnabled) {
        hasShownOfflineNoticeRef.current = false;
      }
    };
    updateOfflineFromNavigator();
    window.addEventListener('online', updateOfflineFromNavigator);
    window.addEventListener('offline', updateOfflineFromNavigator);
    return () => {
      window.removeEventListener('online', updateOfflineFromNavigator);
      window.removeEventListener('offline', updateOfflineFromNavigator);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch (_) { }
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (event) => {
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

  // Clear main-process caches when leaving FrogChanger.
  useEffect(() => {
    return () => {
      window.electronAPI?.hashtable?.setKeepAlive?.(false).catch(() => { });
      window.electronAPI?.hashtable?.clearCache?.();
      // Delete model inspect temp files (userData/cache/model-inspect/).
      // window.electronAPI?.modelInspect?.cleanup?.();
    };
  }, []);

  // Check setup validity when setup inputs change.
  useEffect(() => {
    const checkSetup = async () => {
      // Only validate after settings are loaded
      if (!settingsLoaded) {
        return;
      }

      const validation = await validateSetup();
      setIsSetupValid(validation.isValid);

      // Show warning only if paths are missing (not hash issues) and user hasn't dismissed it
      // Hash issues should only show when user tries to use buttons, not on page load
      const hasPathIssues = (!leaguePath || leaguePath.trim() === '') ||
        (!extractionPath || extractionPath.trim() === '');

      if (hasPathIssues && settingsLoaded) {
        await electronPrefs.initPromise;
        const dismissed = electronPrefs.obj.FrogChangerWarningDismissed === true;
        if (!dismissed && !showWarningModal && !warningDismissedThisSession) {
          setShowWarningModal(true);
        }
      }
    };

    checkSetup();
  }, [leaguePath, extractionPath, settingsLoaded, warningDismissedThisSession]);

  // Load prefix for current skin when modal opens or skin index changes.
  // If this skin has no per-skin override, keep whatever prefix is already in the
  // input (which itself is persisted across sessions via localStorage below) so
  // batches of extractions don't force the user to retype the same prefix.
  useEffect(() => {
    if (showPrefixModal && pendingRepathData && pendingRepathData.allSkins[currentSkinIndex]) {
      const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
      const override = skinPrefixes[currentSkin.skinId];
      if (override) setCustomPrefix(override);
    }
  }, [showPrefixModal, currentSkinIndex, pendingRepathData, skinPrefixes]);

  // Persist last-used prefix across sessions
  useEffect(() => {
    try { window.localStorage.setItem('frogchanger_repath_prefix', String(customPrefix || '')); }
    catch { /* ignore */ }
  }, [customPrefix]);

  const validateSetup = async () => {
    return validateFrogSetup({
      leaguePath,
      extractionPath,
      setHashStatus,
    });
  };

  const loadSettings = async () => {
    try {
      const loaded = await loadFrogSettings(electronPrefs);
      setHashPath(loaded.hashPath || '');
      setLeaguePath(loaded.leaguePath || '');
      setExtractionPath(loaded.extractionPath || '');
      // repathExtractVoiceover intentionally NOT loaded from prefs â€” it must always
      // default to false so repath never silently includes voiceover unless the
      // user explicitly checks it in the CustomPrefixModal for that session.
      setRepathPreserveHudIcons2D(loaded.preserveHudIcons2D !== false);
      if (loaded.hashStatus) setHashStatus(loaded.hashStatus);
      setSettingsLoaded(true);
    } catch (error) {
      console.error('Error loading settings:', error);
      setIsHashPreloading(false);
      setSettingsLoaded(true);
    }
  };
  useEffect(() => {
    const filtered = champions.filter(champion =>
      champion.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      champion.alias.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredChampions(filtered);
  }, [searchTerm, champions]);

  // Search for skinlines using Community Dragon skins.json
  const searchSkinlines = async () => {
    if (!skinlineSearchTerm.trim()) {
      setSkinlineSearchResults([]);
      setShowSkinlineSearch(false);
      return;
    }

    setLoading(true);
    addConsoleLog(`Searching for "${skinlineSearchTerm}" skins...`, 'info');

    // TFT skinline search runs entirely against CDragon companions.json — the
    // champion-skin id arithmetic (championId = skinId.slice(0,-3)) below does
    // not apply to tactician itemIds. Skip chroma loading too.
    if (tftMode) {
      try {
        const results = await searchTacticianSkinline(skinlineSearchTerm);
        setSkinlineSearchResults(results);
        setShowSkinlineSearch(true);
        addConsoleLog(`Found ${results.length} tactician(s) with "${skinlineSearchTerm}" skins`, 'success');
      } catch (error) {
        console.error('TFT skinline search failed:', error);
        addConsoleLog(`Search failed: ${error.message}`, 'error');
        setSkinlineSearchResults([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const searchTermLower = skinlineSearchTerm.toLowerCase();
      console.log(`ðŸ” Searching for "${skinlineSearchTerm}" in Community Dragon skins data...`);

      // Fetch all skins data from Community Dragon
      const allSkinsData = await fetchAllChromaData();
      console.log(`ðŸ“Š Loaded ${Object.keys(allSkinsData).length} skins from Community Dragon`);

      // Find all skins that match the search term (skinline or rarity matching)
      const matchingSkins = [];
      for (const [skinId, skinData] of Object.entries(allSkinsData)) {
        let isMatch = false;

        // Check for skinline name match
        if (skinData.name) {
          const skinNameLower = skinData.name.toLowerCase();
          const normalizedSkinName = skinNameLower.replace(/[^a-z0-9]/g, '');
          const normalizedSearch = searchTermLower.replace(/[^a-z0-9]/g, '');

          const hasDirectMatch = skinNameLower.includes(searchTermLower);
          const hasNormalizedMatch = normalizedSearch && normalizedSkinName.includes(normalizedSearch);

          // Additional filtering to avoid known false positives
          const isFalsePositive =
            (searchTermLower === 'coven' && skinNameLower.includes('covenant')) ||
            (searchTermLower === 'star' && skinNameLower.includes('starguardian') && !skinNameLower.includes('star guardian')) ||
            (searchTermLower === 'project' && skinNameLower.includes('projection'));

          if (!isFalsePositive && (hasDirectMatch || hasNormalizedMatch)) {
            isMatch = true;
          }
        }

        // Check for rarity match (only if no skinline match found yet)
        if (!isMatch && skinData.rarity) {
          const rarityLower = skinData.rarity.toLowerCase();
          const rarityNameMap = {
            'kepic': 'epic',
            'klegendary': 'legendary',
            'kmythic': 'mythic',
            'kultimate': 'ultimate',
            'kexalted': 'exalted',
            'ktranscendent': 'transcendent',
            'knorarity': 'base'
          };

          // Check if search term matches rarity name
          const rarityName = rarityNameMap[rarityLower];
          if (rarityName && rarityName.includes(searchTermLower)) {
            isMatch = true;
          }

          // Also check direct rarity enum match
          if (rarityLower.includes(searchTermLower)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matchingSkins.push({
            id: parseInt(skinId),
            name: skinData.name,
            skinData: skinData
          });
        }
      }

      console.log(`ðŸŽ¯ Found ${matchingSkins.length} skins matching "${skinlineSearchTerm}":`, matchingSkins.map(s => s.name));

      // Group skins by champion
      const results = [];
      const championMap = new Map();

      // Create a map of champion ids to champion objects
      champions.forEach(champion => {
        championMap.set(String(champion.id), champion);
      });

      // Group matching skins by champion
      for (const skin of matchingSkins) {
        const championId = String(skin.id).slice(0, -3);
        const champion = championMap.get(championId);
        if (champion) {
          // Find existing champion group or create new one
          let championGroup = results.find(r => r.champion.id === champion.id);
          if (!championGroup) {
            championGroup = { champion, skins: [] };
            results.push(championGroup);
          }

          // Add skin to champion group
          const skinObject = {
            id: skin.id,
            name: skin.name,
            // Extract skin number from ID (e.g., 1001 -> 1, 1002 -> 2)
            skinNumber: skin.id % 1000,
            // Store champion alias for splash art URL
            championAlias: champion.alias,
            // Include rarity from Community Dragon data
            rarity: skin.skinData.rarity
          };

          championGroup.skins.push(skinObject);
        }
      }

      // Sort skins by ID within each champion group
      results.forEach(group => {
        group.skins.sort((a, b) => a.id - b.id);
      });

      setSkinlineSearchResults(results);
      setShowSkinlineSearch(true);
      addConsoleLog(`Found ${results.length} champions with "${skinlineSearchTerm}" skins`, 'success');
      console.log(`ðŸŽ¯ Search complete! Found ${results.length} champions with "${skinlineSearchTerm}" skins:`, results);

      // Load chroma data for all found skins
      loadChromaDataForSkinlineResults(results);
    } catch (error) {
      console.error('Error searching skinlines:', error);
      addConsoleLog(`Search failed: ${error.message}`, 'error');
      setError('Failed to search skinlines');
    } finally {
      setLoading(false);
    }
  };

  const clearSkinlineSearch = () => {
    setShowSkinlineSearch(false);
    setSkinlineSearchResults([]);
    setSkinlineSearchTerm('');
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
    setShowLeaguePathTooltip(false);
    setShowExtractionPathTooltip(false);
  };

  const handleCloseSettingsAndGuide = () => {
    handleCloseSettings();
    setShowCelestiaGuide(false);
  };

  const handleAutoDetectLeaguePath = async () => {
    try {
      const detectedPath = await detectChampionsFolder();
      if (detectedPath) {
        setLeaguePath(detectedPath);
        electronPrefs.obj.FrogChangerLeaguePath = detectedPath;
        await electronPrefs.save();
        addConsoleLog(`Auto-detected Champions folder: ${detectedPath}`, 'success');
        return { success: true, path: detectedPath };
      } else {
        return { success: false, error: 'Could not find Champions folder' };
      }
    } catch (error) {
      console.error('Error auto-detecting directory:', error);
      return { success: false, error: 'Detection failed' };
    }
  };

  const handleBrowseLeaguePath = async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setLeaguePath(result);
        electronPrefs.obj.FrogChangerLeaguePath = result;
        await electronPrefs.save();
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      alert('Error selecting directory. Please try again.');
    }
  };

  const handleBrowseExtractionPath = async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setExtractionPath(result);
        electronPrefs.obj.FrogChangerExtractionPath = result;
        await electronPrefs.save();
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      alert('Error selecting directory. Please try again.');
    }
  };

  const handleLeaguePathChange = async (newPath) => {
    setLeaguePath(newPath);
    electronPrefs.obj.FrogChangerLeaguePath = newPath;
    await electronPrefs.save();
  };

  const handleExtractionPathChange = async (newPath) => {
    setExtractionPath(newPath);
    electronPrefs.obj.FrogChangerExtractionPath = newPath;
    await electronPrefs.save();
  };

  const handleCancelPrefixModal = () => {
    setShowPrefixModal(false);
    setPendingRepathData(null);
  };

  const handlePreviousPrefix = () => {
    if (!pendingRepathData) return;
    const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
    const currentSkinKey = `${currentSkin.championName}_${currentSkin.skinId}`;
    const updatedPrefixes = {
      ...skinPrefixes,
      [currentSkin.skinId]: customPrefix.trim(),
    };
    const updatedOutputPaths = { ...repathOutputPathsBySkin };
    if (repathOutputOverrideEnabled && !repathOutputKeepForAll) {
      updatedOutputPaths[currentSkinKey] = normalizePathString(repathOutputPath) || extractionPath;
      setRepathOutputPathsBySkin(updatedOutputPaths);
    }
    setSkinPrefixes(updatedPrefixes);
    const prevIndex = currentSkinIndex - 1;
    setCurrentSkinIndex(prevIndex);
    {
      const prevOverride = updatedPrefixes[pendingRepathData.allSkins[prevIndex]?.skinId];
      if (prevOverride) setCustomPrefix(prevOverride);
    }
    const prevSkin = pendingRepathData.allSkins[prevIndex];
    if (repathOutputOverrideEnabled) {
      if (repathOutputKeepForAll) {
        setRepathOutputPath((prev) => normalizePathString(prev) || extractionPath);
      } else if (prevSkin) {
        const prevKey = `${prevSkin.championName}_${prevSkin.skinId}`;
        setRepathOutputPath(updatedOutputPaths[prevKey] || extractionPath);
      }
    }
  };

  const handleNextOrStartPrefix = () => {
    if (!pendingRepathData) return;
    const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
    const currentSkinKey = `${currentSkin.championName}_${currentSkin.skinId}`;
    const newPrefixes = {
      ...skinPrefixes,
      [currentSkin.skinId]: customPrefix.trim(),
    };
    const newOutputPaths = { ...repathOutputPathsBySkin };
    if (repathOutputOverrideEnabled && !repathOutputKeepForAll) {
      newOutputPaths[currentSkinKey] = normalizePathString(repathOutputPath) || extractionPath;
    }

    if (applyToAll) {
      const remainingSkins = pendingRepathData.allSkins.slice(currentSkinIndex + 1);
      remainingSkins.forEach(skin => {
        newPrefixes[skin.skinId] = customPrefix.trim();
        if (repathOutputOverrideEnabled && !repathOutputKeepForAll) {
          const key = `${skin.championName}_${skin.skinId}`;
          newOutputPaths[key] = normalizePathString(repathOutputPath) || extractionPath;
        }
      });
    }

    setSkinPrefixes(newPrefixes);
    if (repathOutputOverrideEnabled && !repathOutputKeepForAll) {
      setRepathOutputPathsBySkin(newOutputPaths);
    }

    if (currentSkinIndex === pendingRepathData.allSkins.length - 1) {
      const activeOutputPath = normalizePathString(repathOutputPath);
      if (repathOutputOverrideEnabled && activeOutputPath) addRecentOutputPath(activeOutputPath);
      setShowPrefixModal(false);
      executeRepath(newPrefixes);
    } else {
      const nextIndex = currentSkinIndex + 1;
      setCurrentSkinIndex(nextIndex);
      {
        const nextOverride = newPrefixes[pendingRepathData.allSkins[nextIndex]?.skinId];
        if (nextOverride) setCustomPrefix(nextOverride);
      }
      const nextSkin = pendingRepathData.allSkins[nextIndex];
      if (repathOutputOverrideEnabled) {
        if (repathOutputKeepForAll) {
          setRepathOutputPath((prev) => normalizePathString(prev) || extractionPath);
        } else if (nextSkin) {
          const nextKey = `${nextSkin.championName}_${nextSkin.skinId}`;
          setRepathOutputPath(newOutputPaths[nextKey] || extractionPath);
        }
      }
      setApplyToAll(false);
    }
  };

  const persistWarningDismissalIfNeeded = async () => {
    if (!warningDontShowAgain) return;
    electronPrefs.obj.FrogChangerWarningDismissed = true;
    await electronPrefs.save();
  };

  const handleWarningCancel = async () => {
    await persistWarningDismissalIfNeeded();
    setShowWarningModal(false);
    setWarningDismissedThisSession(true);
  };

  const handleWarningOpenSettings = async () => {
    await persistWarningDismissalIfNeeded();
    setShowWarningModal(false);
    setWarningDismissedThisSession(true);
    setShowSettings(true);
    setTimeout(() => {
      setShowCelestiaGuide(true);
    }, 300);
  };

  // Load chroma data for skinline search results
  const loadChromaDataForSkinlineResults = async (results) => {
    try {
      console.log('Loading chroma data for skinline search results...');
      const pendingChromaUpdates = {};
      const checkedSkinKeys = new Set();
      const knownSkinKeys = new Set(chromaCache);
      for (const { champion, skins } of results) {
        for (const skin of skins) {
          const skinKey = `${champion.name}_${skin.skinNumber}`;
          if (knownSkinKeys.has(skinKey)) {
            continue;
          }
          try {
            const chromas = await getChromaDataForSkin(champion.id, skin.skinNumber);
            if (chromas.length > 0) {
              pendingChromaUpdates[skinKey] = chromas;
              console.log(`Loaded ${chromas.length} chromas for ${skin.name}`);
            }
            knownSkinKeys.add(skinKey);
            checkedSkinKeys.add(skinKey);
          } catch (error) {
            console.warn(`Failed to load chromas for ${skin.name}:`, error.message);
          }
        }
      }
      if (Object.keys(pendingChromaUpdates).length > 0) {
        setChromaData(prev => ({ ...prev, ...pendingChromaUpdates }));
      }
      if (checkedSkinKeys.size > 0) {
        setChromaCache(prev => {
          const next = new Set(prev);
          checkedSkinKeys.forEach(key => next.add(key));
          return next;
        });
      }
    } catch (error) {
      console.error('Error loading chroma data for skinline results:', error);
    }
  };

  const loadChampions = async () => {
    try {
      setLoading(true);
      setError(null);
      // Pick the data source based on the current view mode. Wards/Emotes
      // come from CDragon ward-skins.json and summoner-emotes.json
      // respectively; emotes need the champions list to group by tag.
      let data;
      if (viewMode === 'tft') {
        data = await getTacticians();
      } else if (viewMode === 'ward') {
        data = await getWards();
      } else if (viewMode === 'emote') {
        const champs = await api.getChampions();
        data = await getEmotes(champs);
      } else {
        data = await api.getChampions();
      }
      const status = getFrogDataStatus();
      const noInternetDetected = status.offlineDetected || (typeof navigator !== 'undefined' && navigator.onLine === false);
      const simulationEnabled = getFrogOfflineSimulationEnabled();
      const usingCache = status.usedCache || status.source.champions === 'cache' || status.source.skins === 'cache';
      const shouldUseOfflineMode = noInternetDetected || usingCache || simulationEnabled;
      setOfflineSimulationEnabled(simulationEnabled);
      setOfflineMode(shouldUseOfflineMode);
      if (shouldUseOfflineMode && !hasShownOfflineNoticeRef.current) {
        addConsoleLog(simulationEnabled
          ? 'Offline simulation enabled. Using cached files if available.'
          : 'No internet connection detected. Using cached files if available.', 'warning');
        hasShownOfflineNoticeRef.current = true;
      }
      console.log('Loaded champions:', data.length, data.slice(0, 3)); // Debug log
      setChampions(data);
      setFilteredChampions(data);
    } catch (err) {
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      setError(offline
        ? 'No internet connection detected and no cached files are available.'
        : 'Failed to load champions');
      console.error('Error loading champions:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadChampionSkins = async (championName) => {
    try {
      setLoadingSkins(prev => ({ ...prev, [championName]: true }));
      let skins;
      if (viewMode === 'tft') {
        const champ = champions.find(c => c.name === championName);
        skins = await getTacticianSkins(champ.id, champ.alias);
      } else if (viewMode === 'ward') {
        skins = await getWardSkins(championName);
      } else if (viewMode === 'emote') {
        skins = await getEmoteSkins(championName, champions);
      } else {
        skins = await api.getChampionSkins(championName, champions);
      }
      setChampionSkins(skins);

      // Chroma data only applies to real champions. Skip for TFT, Ward and
      // Emote modes — they don't have champion-style chromas, and TFT in
      // particular has speciesId collisions with Riot champion IDs (e.g.
      // Ao Shin speciesId=25 hits Morgana championId=25).
      if (viewMode === 'champion') {
        setTimeout(() => {
          loadChromaData(championName, skins).catch(err => {
            console.warn('Chroma data loading failed (non-critical):', err);
          });
        }, 100);
      }
    } catch (err) {
      setError('Failed to load champion skins');
      console.error('Error loading skins:', err);
    } finally {
      setLoadingSkins(prev => ({ ...prev, [championName]: false }));
    }
  };

  const loadChromaData = async (championName, skins) => {
    try {
      const champion = champions.find(c => c.name === championName);
      if (!champion) {
        console.log(`No champion found for ${championName}`);
        return;
      }
      const championId = champion.id;
      console.log(`Loading chroma data for ${championName} (ID: ${championId}) with ${skins.length} skins`);
      // Warm global skins/chroma cache once before per-skin lookups.
      await fetchAllChromaData();
      let foundChromas = 0;
      const pendingChromaUpdates = {};
      const checkedSkinKeys = new Set();
      const knownSkinKeys = new Set(chromaCache);
      for (const skin of skins) {
        const skinKey = `${championName}_${skin.id}`;
        if (knownSkinKeys.has(skinKey)) {
          continue;
        }
        try {
          const chromas = await getChromaDataForSkin(championId, skin.id);
          knownSkinKeys.add(skinKey);
          checkedSkinKeys.add(skinKey);
          if (chromas && chromas.length > 0) {
            pendingChromaUpdates[skinKey] = chromas;
            foundChromas++;
          }
        } catch (error) {
          console.warn(`Failed to load chromas for ${skinKey}:`, error);
        }
      }
      if (Object.keys(pendingChromaUpdates).length > 0) {
        setChromaData(prev => ({ ...prev, ...pendingChromaUpdates }));
      }
      if (checkedSkinKeys.size > 0) {
        setChromaCache(prev => {
          const next = new Set(prev);
          checkedSkinKeys.forEach(key => next.add(key));
          return next;
        });
      }
      console.log(`Chroma loading complete for ${championName}: ${foundChromas} skins with chromas`);
    } catch (error) {
      console.warn('Error loading chroma data:', error);
    }
  };

  const handleChampionSelect = (champion) => {
    setSelectedChampion(champion);
    loadChampionSkins(champion.name);
    setSelectedSkins([]);
  };


  const handleSkinClick = (skin) => {
    setSelectedSkins(prev => {
      // Handle both old format (string) and new format (object with champion info)
      if (typeof skin === 'string') {
        // Old format - just skin name
        if (prev.includes(skin)) {
          return prev.filter(s => s !== skin);
        } else {
          return [...prev, skin];
        }
      } else {
        // New format - skin object with champion info
        if (prev.some(s => s.name === skin.name && s.champion?.name === skin.champion?.name)) {
          return prev.filter(s => !(s.name === skin.name && s.champion?.name === skin.champion?.name));
        } else {
          return [...prev, skin];
        }
      }
    });
  };

  const handleSkinlineSkinClick = (champion, skin) => {
    // Just toggle the skin selection without changing the view
    const skinForSelection = {
      id: skin.skinNumber,
      name: skin.name,
      champion: champion // Store champion info for extraction
    };

    // Toggle skin selection
    setSelectedSkins(prev => {
      if (prev.some(s => s.name === skin.name && s.champion?.name === champion.name)) {
        // Remove if already selected
        return prev.filter(s => !(s.name === skin.name && s.champion?.name === champion.name));
      } else {
        // Add if not selected
        return [...prev, skinForSelection];
      }
    });
  };

  const handleChromaClick = (chroma, skin, championName) => {
    const rawSkinId = Number(
      skin?.skinNumber != null
        ? skin.skinNumber
        : (skin?.id != null ? skin.id : 0)
    );
    const normalizedSkinId = rawSkinId >= 1000 ? rawSkinId % 1000 : rawSkinId;
    const skinKey = `${championName}_${normalizedSkinId}`;
    const wasSelected = selectedChromas[skinKey]?.id === chroma?.id;
    setSelectedChromas(prev => {
      if (wasSelected) {
        const next = { ...prev };
        delete next[skinKey];
        return next;
      }
      return {
        ...prev,
        [skinKey]: chroma,
      };
    });

    if (wasSelected) {
      // If chroma was toggled off, also allow fast deselect of that auto-selected card.
      setSelectedSkins(prev => prev.filter(
        (s) => !(typeof s !== 'string' && s?.champion?.name === championName && Number(s?.id) === normalizedSkinId)
      ));
      return;
    }

    // Ensure chroma selection also selects the parent skin so action bar appears.
    const skinSelection = {
      id: normalizedSkinId,
      name: skin?.name || `Skin ${normalizedSkinId}`,
      champion: { name: championName },
    };
    setSelectedSkins(prev => {
      const exists = prev.some(
        (s) =>
          typeof s !== 'string' &&
          s?.champion?.name === championName &&
          Number(s?.id) === normalizedSkinId
      );
      if (exists) return prev;
      return [...prev, skinSelection];
    });
  };

  const ensureSetupReady = async (actionLabel) => {
    const validation = await validateSetup();
    if (validation.isValid) {
      return true;
    }

    await electronPrefs.initPromise;
    const dismissed = electronPrefs.obj.FrogChangerWarningDismissed === true;
    if (!dismissed) {
      setShowWarningModal(true);
    } else {
      alert(`Please configure League Path, Output Path, and ensure hash files are downloaded in Settings before ${actionLabel}.`);
    }
    return false;
  };

  const normalizeSelectedSkin = (skin) => {
    if (typeof skin !== 'string') {
      if (!skin?.champion?.name || skin.id == null || !skin.name) {
        return null;
      }
      const chromaKey = `${skin.champion.name}_${skin.id}`;
      const selectedChroma = selectedChromas[chromaKey] || null;
      return {
        championName: skin.champion.name,
        skinId: skin.id,
        skinName: skin.name,
        chromaId: selectedChroma?.id ?? null,
      };
    }

    if (!selectedChampion) {
      return null;
    }

    const foundSkin = championSkins.find(s => s.name === skin);
    if (!foundSkin) {
      return null;
    }

    return {
      championName: selectedChampion.name,
      skinId: foundSkin.id,
      skinName: skin,
      chromaId: selectedChromas[`${selectedChampion.name}_${foundSkin.id}`]?.id ?? null,
    };
  };

  const handleBrowseOverrideOutputPath = async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        addRecentOutputPath(result);
      }
      return result || '';
    } catch (error) {
      console.error('Error selecting override output directory:', error);
      return '';
    }
  };

  const openExternalUrl = (url) => {
    try {
      if (window?.require) {
        const { shell } = window.require('electron');
        if (shell?.openExternal) {
          shell.openExternal(url);
          return;
        }
      }
    } catch (_) { }
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) { }
  };

  const openYouTubeSearch = (query) => {
    const q = String(query || '').trim();
    if (!q) return;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    openExternalUrl(url);
  };

  const handleYouTubeChampion = (champion) => {
    const championName = String(champion?.name || '').trim();
    if (!championName) return;
    openYouTubeSearch(`ALL ${championName} SKINS SPOTLIGHT League of Legends`);
  };

  const handleYouTubeSkin = (championName, skinName) => {
    const c = String(championName || '').trim();
    const s = String(skinName || '').trim();
    if (!c && !s) return;
    openYouTubeSearch(`${c} ${s} skin spotlight League of Legends`);
  };

  const handleStartSidebarResize = (event) => {
    event.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = Number(event.clientX);
    resizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const getNormalizedSelectedSkins = () => (
    selectedSkins
      .map(normalizeSelectedSkin)
      .filter(Boolean)
  );

  const handleInspectModel = async () => {
    const setupReady = await ensureSetupReady('inspecting models');
    if (!setupReady) return;

    const normalizedSelections = getNormalizedSelectedSkins();
    if (normalizedSelections.length === 0) return;

    const target = normalizedSelections[0];
    const chromaKey = `${target.championName}_${target.skinId}`;
    const chromaOptions = chromaData[chromaKey] || [];
    const selectedChroma = selectedChromas[chromaKey] || null;
    const inspectSkinId = target.skinId;
    const inspectSkinName = selectedChroma?.name
      ? `${target.skinName} (${selectedChroma.name})`
      : target.skinName;
    if (normalizedSelections.length > 1) {
      addConsoleLog('Inspect Model currently uses the first selected skin.', 'warning');
    }

    // In TFT mode, route to the tactician's per-skin WAD alias instead of the
    // species display name (e.g. "Ahri" -> "petstyletwoahri" for K/DA Unbound).
    let inspectChampionName = target.championName;
    let inspectWadTheme = null;
    let inspectWadTier = null;
    if (tftMode) {
      const matchSkin = championSkins.find(s =>
        String(s.id) === String(inspectSkinId) &&
        (!target.skinName || s.name === target.skinName)
      );
      if (matchSkin?.wadAlias) {
        inspectChampionName = matchSkin.wadAlias;
        inspectWadTheme = matchSkin.wadTheme || null;
        inspectWadTier = matchSkin.wadTier || null;
      } else {
        const tac = champions.find(c => c.name === target.championName);
        if (tac?.alias) inspectChampionName = tac.alias;
      }
    }

    await modelInspect.inspect({
      championName: inspectChampionName,
      skinId: inspectSkinId,
      chromaId: selectedChroma?.id ?? null,
      chromaOptions,
      skinName: inspectSkinName,
      leaguePath,
      hashPath,
      isTftMode: tftMode,
      wadTheme: inspectWadTheme,
      wadTier: inspectWadTier,
    });
  };

  const handleExtractWad = async () => {
    const setupReady = await ensureSetupReady('extracting');
    if (!setupReady) return;

    const normalizedSelections = getNormalizedSelectedSkins();
    if (normalizedSelections.length === 0) return;

    // Show the extraction mode modal â€” the actual loop runs in executeExtraction()
    refreshRecentOutputPaths();
    setPendingExtractionSkins(normalizedSelections);
    setShowExtractionModeModal(true);
  };

  const executeExtraction = async (payload) => {
    const decisions = payload?.decisions || [];
    const extractOptions = payload?.options || {};
    const useExtractVoiceover = extractOptions.extractVoiceover === true;
    const usePreserveHudIcons2D = extractOptions.preserveHudIcons2D !== false;
    const useSplitVfx = extractOptions.splitVfx === true;
    const useSplitAnm = extractOptions.splitAnm === true;
    const useConsolidateAssets = extractOptions.consolidateAssets !== false;
    const outputOverride = extractOptions.outputOverride || {};
    const useOutputOverride = outputOverride?.enabled === true;
    const outputOverrideDefault = normalizePathString(outputOverride?.path || '');
    const outputOverridePerSkin = outputOverride?.perSkinPaths && typeof outputOverride.perSkinPaths === 'object'
      ? outputOverride.perSkinPaths
      : {};

    setShowExtractionModeModal(false);
    const normalizedSelections = pendingExtractionSkins;

    setIsExtracting(true);
    addConsoleLog(`Extracting ${normalizedSelections.length} skin(s)...`, 'info');
    try {
      for (let i = 0; i < normalizedSelections.length; i++) {
        if (isCancelling) {
          addConsoleLog('Extraction cancelled by user', 'warning');
          break;
        }

        const { championName, skinId, skinName } = normalizedSelections[i];
        const skinKey = `${championName}_${skinId}`;
        const decision = decisions.find(d => d.skinKey === skinKey);
        const cleanAfterExtract = decision?.clean ?? false;
        const progress = `${i + 1}/${normalizedSelections.length}`;
        const outputPathForSkin = useOutputOverride
          ? normalizePathString(outputOverridePerSkin[skinKey] || outputOverrideDefault)
          : '';

        if (useExtractVoiceover) {
          addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal & Voiceover WADs...`, 'info');
        } else {
          addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal WAD only (Voiceover disabled)...`, 'info');
        }

        const selectedChroma = selectedChromas[skinKey];
        let extractionResult;
        if (selectedChroma) {
          addConsoleLog(`${progress} Extracting with chroma ${selectedChroma.id}...`, 'info');
          extractionResult = await extractWadFile(championName, skinId, skinName, selectedChroma.id, cleanAfterExtract, {
            extractVoiceover: useExtractVoiceover,
            fastSkinOnly: cleanAfterExtract === true,
            preserveHudIcons2D: usePreserveHudIcons2D,
            outputPathOverride: outputPathForSkin || null,
          });
        } else {
          extractionResult = await extractWadFile(championName, skinId, skinName, null, cleanAfterExtract, {
            extractVoiceover: useExtractVoiceover,
            fastSkinOnly: cleanAfterExtract === true,
            preserveHudIcons2D: usePreserveHudIcons2D,
            outputPathOverride: outputPathForSkin || null,
          });
        }
        if (outputPathForSkin) addRecentOutputPath(outputPathForSkin);

        // Split + consolidate run only on Skin Files Only mode (clean=true).
        // Whole-WAD extraction keeps the original layout, so post-processing
        // would just litter the output with stuff the user didn't ask for.
        const splitDir = cleanAfterExtract
          ? (extractionResult?.outputDir
              || extractionResult?.cleanDir
              || extractionResult?.cleanedDir
              || null)
          : null;

        if (splitDir && (useSplitVfx || useSplitAnm) && window.electronAPI?.bin?.splitSkinBins) {
          try {
            const splitRes = await window.electronAPI.bin.splitSkinBins({
              dir: splitDir,
              splitVfx: useSplitVfx,
              splitAnm: useSplitAnm,
            });
            if (splitRes?.error) {
              addConsoleLog(`${progress} Bin split warning: ${splitRes.error}`, 'warning');
            } else {
              const splitCount = (splitRes?.results || []).filter((r) => r.status === 'split').length;
              if (splitCount > 0) {
                addConsoleLog(`${progress} Split ${splitCount} bin entry group(s)`, 'info');
              }
            }
          } catch (splitErr) {
            addConsoleLog(`${progress} Bin split error: ${splitErr.message}`, 'warning');
          }
        } else if (cleanAfterExtract && (useSplitVfx || useSplitAnm) && !splitDir) {
          addConsoleLog(`${progress} Skipped bin split (no clean output dir reported)`, 'warning');
        }

        if (splitDir && useConsolidateAssets && window.electronAPI?.bin?.consolidateAssets) {
          try {
            const conRes = await window.electronAPI.bin.consolidateAssets({ dir: splitDir });
            if (conRes?.error) {
              addConsoleLog(`${progress} Asset consolidate warning: ${conRes.error}`, 'warning');
            } else {
              const moved = (conRes?.results || []).reduce((s, r) => s + (r.moved || 0), 0);
              if (moved > 0) {
                addConsoleLog(`${progress} Consolidated ${moved} asset(s) into per-skin folders`, 'info');
              }
            }
          } catch (conErr) {
            addConsoleLog(`${progress} Asset consolidate error: ${conErr.message}`, 'warning');
          }
        }

        addConsoleLog(`${progress} Successfully extracted ${skinName} (${championName})`, 'success');
      }
      setSelectedSkins([]);
      setSelectedChromas({});
      addConsoleLog(`All extractions completed successfully!`, 'success');
    } catch (error) {
      console.error('Error during WAD extraction:', error);
      addConsoleLog(`Extraction failed: ${error.message}`, 'error');
      alert(`Failed to extract WAD files: ${error.message}`);
    } finally {
      setIsExtracting(false);
      setPendingExtractionSkins([]);
    }
  };

  const handleRepath = async () => {
    const setupReady = await ensureSetupReady('repathing');
    if (!setupReady) {
      return;
    }

    const normalizedSelections = getNormalizedSelectedSkins();
    if (normalizedSelections.length > 0) {
      // Prepare repath data with flattened skin list
      const skinsByChampion = {};
      const allSkins = [];

      for (const { championName, skinId, skinName, chromaId } of normalizedSelections) {
        if (!skinsByChampion[championName]) {
          skinsByChampion[championName] = [];
        }
        skinsByChampion[championName].push({ skinId, skinName, chromaId });

        // Add to flattened list for individual prefix selection
        allSkins.push({ championName, skinId, skinName, chromaId });
      }

      // Store the repath data and show prefix modal
      setPendingRepathData({ skinsByChampion, allSkins });
      setCurrentSkinIndex(0);
      setSkinPrefixes({});
      refreshRecentOutputPaths();
      setRepathOutputOverrideEnabled(false);
      setRepathOutputKeepForAll(true);
      setRepathOutputPath(extractionPath || '');
      setRepathOutputPathsBySkin({});
      setApplyToAll(false);
      setSkipSfxRepath(true);
      setRepathSplitVfx(false);
      setRepathSplitAnm(false);
      setRepathConsolidateAssets(true);
      setShowPrefixModal(true);
    }
  };

  const executeRepath = async (finalPrefixes = null) => {
    if (!pendingRepathData) return;

    setIsRepathing(true);
    addConsoleLog(`Repathing ${selectedSkins.length} skin(s) with individual prefixes...`, 'info');

    try {
      const { skinsByChampion } = pendingRepathData;
      const championNames = Object.keys(skinsByChampion);

      const prefixesToUse = finalPrefixes || skinPrefixes;
      // Hard-stop if any selected skin is missing a prefix — the UI gates
      // against this, but defending here too so nothing falls back to bum.
      for (const [skinId, p] of Object.entries(prefixesToUse)) {
        if (!String(p || '').trim()) {
          addConsoleLog(`Repath aborted: skin ${skinId} has no prefix set.`, 'error');
          setIsRepathing(false);
          setPendingRepathData(null);
          return;
        }
      }
      console.log('[REPATH] Using prefixes:', prefixesToUse);

      for (let i = 0; i < championNames.length; i++) {
        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }

        const championName = championNames[i];
        const championSkins = skinsByChampion[championName];
        const progress = `${i + 1}/${championNames.length}`;
        const championFileName = getChampionFileName(championName);

        addConsoleLog(`${progress} Processing ${championName} (${championSkins.length} skins)...`, 'info');

        const perSkinJobs = championSkins.map((skin) => {
          const skinKey = `${championName}_${skin.skinId}`;
          const effectiveBasePath = repathOutputOverrideEnabled
            ? normalizePathString(
              repathOutputKeepForAll
                ? repathOutputPath
                : (repathOutputPathsBySkin[skinKey] || repathOutputPath)
            ) || extractionPath
            : extractionPath;
          const effectivePrefix = prefixesToUse[skin.skinId] || '';
          return {
            ...skin,
            skinKey,
            effectiveBasePath,
            effectivePrefix,
            selectedSkinId: skin.chromaId ?? skin.skinId,
          };
        });

        const extractionBase = perSkinJobs[0]?.effectiveBasePath || extractionPath;
        const firstSkin = championSkins[0];
        const firstSkinId = firstSkin.skinId;
        const firstChromaId = firstSkin.chromaId ?? null;

        addConsoleLog(`${progress} Extracting ${firstSkin.skinName} (${championName}) - Normal WAD for repath...`, 'info');
        const extractionResult = await extractWadFile(championName, firstSkinId, firstSkin.skinName, firstChromaId, true, {
          extractVoiceover: repathExtractVoiceover,
          fastSkinOnly: true,
          preserveHudIcons2D: repathPreserveHudIcons2D,
          outputPathOverride: extractionBase,
          isRepathExtract: true, // USER REQUEST: Prefix folder if for repath
        });
        addRecentOutputPath(extractionBase);

        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }

        const firstSkinSafe = firstSkin.skinName.replace(/[^a-zA-Z0-9]/g, '_');
        const extractedDir = firstChromaId != null
          ? `${extractionBase}\\repath_extracted_${firstSkinSafe}_chroma_${firstChromaId}`
          : `${extractionBase}\\repath_extracted_${firstSkinSafe}`;
        const cleanedDir = `${extractedDir}_clean`;
        const usedFastSelected = String(extractionResult?.finalMessage || '').toLowerCase().includes('fast selected mode');
        let sourceDir = usedFastSelected
          ? (extractionResult?.outputDir || extractedDir)
          : (extractionResult?.outputDir ? `${extractionResult.outputDir}_clean` : cleanedDir);

        if (window.require) {
          try {
            const fs = window.require('fs');
            if (!fs.existsSync(sourceDir) && fs.existsSync(extractedDir)) {
              sourceDir = extractedDir;
              addConsoleLog(`${progress} Clean folder missing, falling back to extracted source for ${championName}`, 'warning');
            }
          } catch (_) {
            // Ignore fs lookup errors; repath call will report a proper error if source is invalid.
          }
        }

        const groupedRuns = new Map();
        for (const job of perSkinJobs) {
          const key = `${job.effectiveBasePath}|||${job.effectivePrefix}`;
          if (!groupedRuns.has(key)) {
            groupedRuns.set(key, {
              outputBasePath: job.effectiveBasePath,
              prefix: job.effectivePrefix,
              skins: [],
            });
          }
          groupedRuns.get(key).skins.push(job);
        }

        let runIndex = 0;
        for (const run of groupedRuns.values()) {
          if (isCancelling) {
            addConsoleLog('Repath cancelled by user', 'warning');
            break;
          }

          runIndex += 1;
          const repathSkinIds = run.skins.map((s) => s.selectedSkinId);
          const representative = run.skins[0];
          const repathSkinSafe = representative.skinName.replace(/[^a-zA-Z0-9]/g, '_');
          const outputDir = representative.chromaId != null
            ? `${run.outputBasePath}\\repathed_${repathSkinSafe}_chroma_${representative.chromaId}`
            : `${run.outputBasePath}\\repathed_${repathSkinSafe}`;

          addConsoleLog(
            `${progress} Run ${runIndex}/${groupedRuns.size}: repathing ${championName} (${repathSkinIds.length} skin${repathSkinIds.length > 1 ? 's' : ''}) to ${run.outputBasePath} with prefix "${run.prefix}"...`,
            'info'
          );

          const repathResult = await runBumpathRepath({
            sourceDir,
            outputDir,
            selectedSkinIds: repathSkinIds,
            hashPath,
            prefix: run.prefix,
            processTogether: repathSkinIds.length > 1,
            preserveHudIcons2D: repathPreserveHudIcons2D,
            skipSfxRepath,
            skipVoiceoverRepath: !repathExtractVoiceover,
          });

          if (repathResult.success) {
            addRecentOutputPath(run.outputBasePath);
            addConsoleLog(`${progress} Successfully repathed ${championName} (${repathSkinIds.length} skins) to: ${outputDir}`, 'success');

            // Repath already merges all linked bin content into the output
            // skin bin via combineLinked, so the splitter just operates on
            // that one file.
            if ((repathSplitVfx || repathSplitAnm) && window.electronAPI?.bin?.splitSkinBins) {
              try {
                const splitRes = await window.electronAPI.bin.splitSkinBins({
                  dir: outputDir,
                  splitVfx: repathSplitVfx,
                  splitAnm: repathSplitAnm,
                });
                if (splitRes?.error) {
                  addConsoleLog(`${progress} Bin split warning: ${splitRes.error}`, 'warning');
                } else {
                  const splitCount = (splitRes?.results || []).filter((r) => r.status === 'split').length;
                  if (splitCount > 0) {
                    addConsoleLog(`${progress} Split ${splitCount} bin entry group(s) for ${championName}`, 'info');
                  }
                }
              } catch (splitErr) {
                addConsoleLog(`${progress} Bin split error: ${splitErr.message}`, 'warning');
              }
            }

            // Consolidate runs AFTER split so it sees VFX entries in whichever
            // bin holds them (skin*.bin if split was off, <champ>_vfx_skin*.bin if on).
            if (repathConsolidateAssets && window.electronAPI?.bin?.consolidateAssets) {
              try {
                const conRes = await window.electronAPI.bin.consolidateAssets({
                  dir: outputDir,
                  prefix: run.prefix || '',
                });
                if (conRes?.error) {
                  addConsoleLog(`${progress} Asset consolidate warning: ${conRes.error}`, 'warning');
                } else {
                  const moved = (conRes?.results || []).reduce((s, r) => s + (r.moved || 0), 0);
                  if (moved > 0) {
                    addConsoleLog(`${progress} Consolidated ${moved} asset(s) into per-skin folders`, 'info');
                  }
                }
              } catch (conErr) {
                addConsoleLog(`${progress} Asset consolidate error: ${conErr.message}`, 'warning');
              }
            }
          } else if (repathResult.cancelled) {
            addConsoleLog(`${progress} Repath cancelled for ${championName}`, 'warning');
            break;
          } else {
            addConsoleLog(`${progress} Failed to repath ${championName}: ${repathResult.error}`, 'error');
          }
        }

        // Per-champion cleanup runs AFTER the inline split above so the
        // source bins are still on disk when the splitter reads them.
        try {
          const fs = window.require?.('fs');
          if (fs) {
            const cleanupDirs = [...new Set([sourceDir, cleanedDir, extractedDir])];
            let cleanedAny = false;
            for (const dir of cleanupDirs) {
              if (!dir || !fs.existsSync(dir)) continue;
              fs.rmSync(dir, { recursive: true, force: true });
              cleanedAny = true;
              console.log(`Cleaned up extracted folder: ${dir}`);
            }
            if (cleanedAny) {
              addConsoleLog(`${progress} Cleaned up extracted folders for ${championName}`, 'info');
            }
          }
        } catch (cleanupError) {
          console.warn(`Failed to clean up extracted folder: ${cleanupError.message}`);
        }
      }

      addConsoleLog(`All repath operations completed!`, 'success');
      setSelectedSkins([]);
    } catch (error) {
      console.error('Repath error:', error);
      addConsoleLog(`Repath failed: ${error.message}`, 'error');
      alert(`Repath failed: ${error.message}`);
    } finally {
      setIsRepathing(false);
      setPendingRepathData(null);
    }
  };
  const downloadSplashArt = async (championName, championAlias, skinId, skinName, skin = null) => {
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    addConsoleLog(`Downloading splash art: ${skinName}`, 'info');
    try {
      // ddragon only has splash art for real champions. For TFT tacticians,
      // ward skins and emotes, fall back to the CDragon icon URL already
      // attached as centeredSplashPath/tilePath.
      const splashUrlOverride = (tftMode || wardMode || emoteMode)
        ? (skin?.centeredSplashPath || skin?.tilePath || null)
        : null;
      const filePath = await downloadSplashArtToFile({
        championName,
        championAlias,
        skinId,
        skinName,
        outputPath: extractionPath,
        splashUrlOverride,
      });
      console.log(`Splash art downloaded: ${filePath}`);
      alert(`Splash art downloaded successfully!\nSaved to: ${filePath}`);

    } catch (error) {
      console.error('Splash art download error:', error);
      alert(`Failed to download splash art: ${error.message}`);
    }
  };
  const extractWadFile = async (championName, skinId, skinName = null, chromaId = null, cleanAfterExtract = false, options = {}) => {
    if (!leaguePath) {
      alert('Please set the League of Legends Games folder path in settings first!');
      return;
    }
    const outputPath = normalizePathString(options.outputPathOverride || extractionPath);
    if (!outputPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    const extractVoiceover = options.extractVoiceover === true;
    const fastSkinOnly = options.fastSkinOnly === true;
    const preserveHudIcons2D = options.preserveHudIcons2D !== false;
    const isRepathExtract = options.isRepathExtract === true;

    const skinKey = `${championName}_${skinId}`;
    setExtractingSkins(prev => ({ ...prev, [skinKey]: true }));
    setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Starting extraction...' }));

    // In TFT mode the Companions WAD layout is keyed by the tactician's alias
    // (e.g. "petdsswordguy"), not the display name. Furthermore, sibling skins
    // under one CDragon speciesId can live in DIFFERENT pet* folders — e.g.
    // "Ahri" species mixes chibi variants (petchibiahri) with K/DA Ahri Unbound
    // (petstyletwoahri). So prefer the per-skin wadAlias set by tftApi, falling
    // back to the species-level alias only if no match is found.
    let effectiveChampionName = championName;
    if (tftMode) {
      const matchSkin = championSkins.find(s =>
        String(s.id) === String(skinId) &&
        (!skinName || s.name === skinName)
      );
      if (matchSkin?.wadAlias) {
        effectiveChampionName = matchSkin.wadAlias;
      } else {
        const tac = champions.find(c => c.name === championName);
        if (tac?.alias) effectiveChampionName = tac.alias;
      }
    }

    try {
      const result = await extractSkinWadBundle({
        championName: effectiveChampionName,
        skinId,
        skinName,
        chromaId,
        leaguePath,
        extractionPath: outputPath,
        hashPath,
        extractVoiceover,
        cleanAfterExtract,
        fastSkinOnly,
        preserveHudIcons2D,
        isRepathExtract,
        isTftMode: tftMode,
        onProgress: (message) => {
          setExtractionProgress(prev => ({ ...prev, [skinKey]: message }));
        },
      });
      return result;
    } catch (error) {
      console.error('WAD extraction error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        championName,
        skinId,
        wadFilePath: `${leaguePath}\\${getChampionFileName(championName)}.wad.client`,
        outputPath,
      });
      setExtractionProgress(prev => ({ ...prev, [skinKey]: `Error: ${error.message}` }));
      alert(`Failed to extract WAD file: ${error.message}`);
      return null;
    } finally {
      setExtractingSkins(prev => ({ ...prev, [skinKey]: false }));
    }
  };

  // Open a skin's combined main BIN in Jade for fast lookup. Reuses the Port
  // donor pipeline (extracts + combines linked bins from the WAD into a temp
  // folder), then hands off the combined BIN to Jade via the existing interop.
  const handleOpenSkinInJade = async (skin) => {
    if (!leaguePath) {
      alert('Please set the League of Legends Games folder path in settings first!');
      return;
    }
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const championName = selectedChampion?.name;
    if (!championName) return;

    const skinKey = `${championName}_${skin.id}`;
    const setProgress = (msg) =>
      setExtractionProgress(prev => ({ ...prev, [skinKey]: msg }));
    const clearProgress = () =>
      setExtractionProgress(prev => {
        const next = { ...prev };
        delete next[skinKey];
        return next;
      });

    const progressHandler = (_e, payload) => setProgress(payload?.message || 'Working...');
    ipcRenderer.on('port:donorProgress', progressHandler);

    setExtractingSkins(prev => ({ ...prev, [skinKey]: true }));
    setProgress('Preparing donor for Jade...');

    // TFT: route to the per-skin tactician alias + Companions.wad.client.
    const donorChampionName = tftMode && skin?.wadAlias ? skin.wadAlias : championName;

    try {
      const donor = await ipcRenderer.invoke('port:prepareDonorFromSkin', {
        championName: donorChampionName,
        skinId: skin.id,
        leaguePath,
        hashPath,
        isTftMode: tftMode,
      });
      if (!donor?.success || !donor.combinedBinPath) {
        clearProgress();
        alert(`Failed to prepare bin for Jade: ${donor?.error || 'unknown error'}`);
        return;
      }

      setProgress('Opening in Jade...');
      const sendResult = await ipcRenderer.invoke('interop:sendToJade', {
        binPath: donor.combinedBinPath,
        sourceMode: null,
      });
      if (!sendResult?.success || isJadeMissingResult(sendResult)) {
        clearProgress();
        if (isJadeMissingResult(sendResult)) {
          emitJadeMissingModal(sendResult?.error || sendResult?.warning || 'jade-not-installed');
        } else {
          alert(`Failed to open in Jade: ${sendResult?.error || 'unknown error'}`);
        }
        return;
      }
      clearProgress();
    } catch (error) {
      console.error('Open in Jade error:', error);
      clearProgress();
      alert(`Failed to open in Jade: ${error.message}`);
    } finally {
      setExtractingSkins(prev => ({ ...prev, [skinKey]: false }));
      ipcRenderer.removeListener('port:donorProgress', progressHandler);
    }
  };

  // Extract a skin's combined main BIN (with all linked bins merged) to the
  // user's configured extraction folder. Independent of Jade — works whether
  // Jade is installed or not. Output lands as <champ>_skin<id>_combined.bin.
  const handleExtractSkinBin = async (skin) => {
    if (!leaguePath) {
      alert('Please set the League of Legends Games folder path in settings first!');
      return;
    }
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    const path = window.require('path');
    const championName = selectedChampion?.name;
    if (!championName) return;

    const skinKey = `${championName}_${skin.id}`;
    const setProgress = (msg) =>
      setExtractionProgress(prev => ({ ...prev, [skinKey]: msg }));
    const clearProgress = () =>
      setExtractionProgress(prev => {
        const next = { ...prev };
        delete next[skinKey];
        return next;
      });

    const progressHandler = (_e, payload) => setProgress(payload?.message || 'Working...');
    ipcRenderer.on('port:donorProgress', progressHandler);

    setExtractingSkins(prev => ({ ...prev, [skinKey]: true }));
    setProgress('Preparing combined BIN...');

    // TFT: route to the per-skin tactician alias + Companions.wad.client.
    const donorChampionName = tftMode && skin?.wadAlias ? skin.wadAlias : championName;

    try {
      const donor = await ipcRenderer.invoke('port:prepareDonorFromSkin', {
        championName: donorChampionName,
        skinId: skin.id,
        leaguePath,
        hashPath,
        isTftMode: tftMode,
      });
      if (!donor?.success || !donor.combinedBinPath) {
        clearProgress();
        alert(`Failed to extract BIN: ${donor?.error || 'unknown error'}`);
        return;
      }

      setProgress('Copying to extraction folder...');
      const safeSkinName = (skin.name || `skin${skin.id}`)
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_');
      const champFile = getChampionFileName(championName);
      const baseName = `${champFile}_skin${donor.skinId ?? skin.id}_${safeSkinName}_combined`;
      const destBin = path.join(extractionPath, `${baseName}.bin`);
      const destPy = path.join(extractionPath, `${baseName}.py`);
      try {
        if (!fs.existsSync(extractionPath)) {
          fs.mkdirSync(extractionPath, { recursive: true });
        }
        fs.copyFileSync(donor.combinedBinPath, destBin);
        if (donor.donorPyPath && fs.existsSync(donor.donorPyPath)) {
          fs.copyFileSync(donor.donorPyPath, destPy);
        }
      } catch (copyErr) {
        clearProgress();
        alert(`Failed to copy BIN to extraction folder: ${copyErr.message}`);
        return;
      }

      clearProgress();
      alert(`Combined BIN saved to:\n${destBin}`);
    } catch (error) {
      console.error('Extract skin BIN error:', error);
      clearProgress();
      alert(`Failed to extract BIN: ${error.message}`);
    } finally {
      setExtractingSkins(prev => ({ ...prev, [skinKey]: false }));
      ipcRenderer.removeListener('port:donorProgress', progressHandler);
    }
  };

  if (!settingsLoaded) {
    return <LoadingStateView />;
  }

  if (loading && champions.length === 0) {
    return <LoadingStateView />;
  }

  if (error) {
    return <ErrorStateView error={error} onRetry={loadChampions} />;
  }

  return (
    <div className="frogchanger-wrapper h-screen bg-black text-white relative overflow-hidden">


      <SearchHelpModal open={showSearchInfo} onClose={() => setShowSearchInfo(false)} />

      <div className="frog-changer-container flex h-screen" style={{ userSelect: isResizingRef.current ? 'none' : 'auto' }}>
        {/* Sidebar */}
        <ChampionSidebar
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          skinlineSearchTerm={skinlineSearchTerm}
          onSkinlineSearchTermChange={setSkinlineSearchTerm}
          onSearchSkinlines={searchSkinlines}
          showSkinlineSearch={showSkinlineSearch}
          onClearSkinlineSearch={clearSkinlineSearch}
          filteredChampions={filteredChampions}
          selectedChampion={selectedChampion}
          onSelectChampion={handleChampionSelect}
          onYouTubeChampion={handleYouTubeChampion}
          getChampionIconUrl={
            viewMode === 'tft' ? getTacticianIconUrl
            : viewMode === 'ward' ? getWardChampionIconUrl
            : getChampionIconUrl
          }
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

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto relative" style={{ minWidth: 0 }}>
          {offlineMode && (
            <div className="mb-4 px-3 py-2 rounded-md border border-yellow-600/40 bg-yellow-500/10 text-yellow-300 text-sm">
              {offlineSimulationEnabled
                ? 'Offline simulation enabled. Using cached files if available.'
                : 'No internet connection detected. Using cached files if available.'}
            </div>
          )}
          <TopControls
            consoleLogs={consoleLogs}
            showSearchInfo={showSearchInfo}
            onToggleSearchInfo={() => setShowSearchInfo(!showSearchInfo)}
            isExtracting={isExtracting}
            isRepathing={isRepathing}
            isCancelling={isCancelling}
            onCancelOperations={cancelOperations}
            onOpenSettings={() => setShowSettings(true)}
            viewMode={viewMode}
            setViewMode={(next) => {
              setViewMode(next);
              setSearchTerm('');
            }}
            tftMode={tftMode}
            setTftMode={(mode) => {
              setViewMode(mode ? 'tft' : 'champion');
              setSearchTerm('');
            }}
          />

          {showSkinlineSearch ? (
            <SkinlineResultsPanel
              skinlineSearchTerm={skinlineSearchTerm}
              skinlineSearchResults={skinlineSearchResults}
              loading={loading}
              selectedSkins={selectedSkins}
              chromaData={chromaData}
              selectedChromas={selectedChromas}
              getRarityIconUrl={getRarityIconUrl}
              getDefaultChromaColor={getDefaultChromaColor}
              onSkinClick={handleSkinlineSkinClick}
              onChromaClick={handleChromaClick}
              onDownloadSplashArt={downloadSplashArt}
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
              getRarityIconUrl={getRarityIconUrl}
              getDefaultChromaColor={getDefaultChromaColor}
              onSkinClick={handleSkinClick}
              onChromaClick={handleChromaClick}
              onDownloadSplashArt={downloadSplashArt}
              onYouTubeSkin={handleYouTubeSkin}
              onOpenInJade={wardMode || emoteMode ? null : handleOpenSkinInJade}
              onExtractSkinBin={wardMode || emoteMode ? null : handleExtractSkinBin}
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
        isRepathing={isRepathing}
        isSetupValid={isSetupValid}
        onExtract={handleExtractWad}
        onRepath={handleRepath}
        onInspectModel={handleInspectModel}
        onClearAll={() => setSelectedSkins([])}
      />

      <SettingsModal
        open={showSettings}
        onClose={handleCloseSettings}
        onCloseAndHideGuide={handleCloseSettingsAndGuide}
        leaguePathRef={leaguePathRef}
        extractionPathRef={extractionPathRef}
        showLeaguePathTooltip={showLeaguePathTooltip}
        setShowLeaguePathTooltip={setShowLeaguePathTooltip}
        showExtractionPathTooltip={showExtractionPathTooltip}
        setShowExtractionPathTooltip={setShowExtractionPathTooltip}
        leaguePath={leaguePath}
        extractionPath={extractionPath}
        hashPath={hashPath}
        onAutoDetectLeaguePath={handleAutoDetectLeaguePath}
        onBrowseLeaguePath={handleBrowseLeaguePath}
        onBrowseExtractionPath={handleBrowseExtractionPath}
        onLeaguePathChange={handleLeaguePathChange}
        onExtractionPathChange={handleExtractionPathChange}
        showCelestiaGuide={showCelestiaGuide}
        onOpenGuide={() => setShowCelestiaGuide(true)}
      />

      <CustomPrefixModal
        open={showPrefixModal}
        pendingRepathData={pendingRepathData}
        currentSkinIndex={currentSkinIndex}
        customPrefix={customPrefix}
        setCustomPrefix={setCustomPrefix}
        applyToAll={applyToAll}
        setApplyToAll={setApplyToAll}
        skipSfxRepath={skipSfxRepath}
        setSkipSfxRepath={setSkipSfxRepath}
        extractVoiceover={repathExtractVoiceover}
        setExtractVoiceover={setRepathExtractVoiceover}
        preserveHudIcons2D={repathPreserveHudIcons2D}
        setPreserveHudIcons2D={setRepathPreserveHudIcons2D}
        splitVfx={repathSplitVfx}
        setSplitVfx={setRepathSplitVfx}
        splitAnm={repathSplitAnm}
        setSplitAnm={setRepathSplitAnm}
        consolidateAssets={repathConsolidateAssets}
        setConsolidateAssets={setRepathConsolidateAssets}
        outputOverrideEnabled={repathOutputOverrideEnabled}
        setOutputOverrideEnabled={setRepathOutputOverrideEnabled}
        outputKeepForAll={repathOutputKeepForAll}
        setOutputKeepForAll={setRepathOutputKeepForAll}
        outputPath={repathOutputPath}
        setOutputPath={setRepathOutputPath}
        recentOutputPaths={recentOutputPaths}
        onBrowseOutputPath={handleBrowseOverrideOutputPath}
        onCancel={handleCancelPrefixModal}
        onPrevious={handlePreviousPrefix}
        onNextOrStart={handleNextOrStartPrefix}
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
        hashStatus={hashStatus}
        warningDontShowAgain={warningDontShowAgain}
        setWarningDontShowAgain={setWarningDontShowAgain}
        onCancel={handleWarningCancel}
        onOpenSettings={handleWarningOpenSettings}
      />

      <ModelInspectModal
        open={modelInspect.open}
        loading={modelInspect.loading}
        error={modelInspect.error}
        progressMessage={modelInspect.progressMessage}
        manifest={modelInspect.manifest}
        onSelectChroma={modelInspect.selectChroma}
        onClose={modelInspect.close}
      />

      {/* Celestia Guide */}
      {showCelestiaGuide && showSettings && (
        <CelestiaGuide
          id="frogchanger-settings"
          steps={[
            {
              title: "League Champions Path",
              text: "This is where your League of Legends game files are located. Select the Champions folder inside your League directory (e.g., C:\\Riot Games\\League of Legends\\Game\\DATA\\FINAL\\Champions). This path is required to extract WAD files from the game.",
              targetSelector: "[data-league-path]",
              padding: 15,
            },
            {
              title: "WAD Output Path",
              text: "This is where extracted WAD files will be saved. Choose a folder on your computer where you want the extracted skin files to be stored. You can use your Desktop or create a dedicated folder for extracted skins.",
              targetSelector: "[data-extraction-path]",
              padding: 15,
            },
            {
              title: "Hash Tables Path",
              text: "Hash files are lookup tables that translate file names to their internal game IDs. They're essential for extracting and repathing skins correctly. The location is automatically managed by the app and should NOT be changed. Hash files are automatically downloaded from CommunityDragon and kept in a secure integrated location. Changing this path could break skin extraction and repathing functionality.",
              targetSelector: "[data-hash-path]",
              padding: 15,
            },
            {
              title: "Voiceover Extraction",
              text: "This setting controls whether voiceover WAD files are extracted along with the skin files. IMPORTANT: Only repath voiceover files if you have actually modified them in your mod. If you repath voiceover files without changing them, users will hear a different language than expected. Voiceover files contain champion voice lines in different languages, so repathing unchanged voiceovers will cause language mismatches.",
              targetSelector: "[data-voiceover-extraction]",
              padding: 15,
            },
          ]}
          onClose={() => {
            setShowCelestiaGuide(false);
          }}
        />
      )}
    </div>
  );
};

export default FrogChanger;







