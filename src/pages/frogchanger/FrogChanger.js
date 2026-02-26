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

const FrogChanger = () => {
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
  const [customPrefix, setCustomPrefix] = useState('');
  const [pendingRepathData, setPendingRepathData] = useState(null);
  const [currentSkinIndex, setCurrentSkinIndex] = useState(0);
  const [skinPrefixes, setSkinPrefixes] = useState({});
  const [skipSfxRepath, setSkipSfxRepath] = useState(true);
  const [repathPreserveHudIcons2D, setRepathPreserveHudIcons2D] = useState(true);
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
  const hasShownOfflineNoticeRef = useRef(false);
  const leaguePathRef = useRef(null);
  const extractionPathRef = useRef(null);

  // Load champions and settings on component mount
  useEffect(() => {
    loadChampions();
    loadSettings();
  }, []);

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

  // Clear main-process caches when leaving FrogChanger.
  useEffect(() => {
    return () => {
      window.electronAPI?.hashtable?.setKeepAlive?.(false).catch(() => { });
      window.electronAPI?.hashtable?.clearCache?.();
      // Delete model inspect temp files (userData/cache/model-inspect/).
      window.electronAPI?.modelInspect?.cleanup?.();
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

  // Load prefix for current skin when modal opens or skin index changes
  useEffect(() => {
    if (showPrefixModal && pendingRepathData && pendingRepathData.allSkins[currentSkinIndex]) {
      const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
      setCustomPrefix(skinPrefixes[currentSkin.skinId] || '');
    }
  }, [showPrefixModal, currentSkinIndex, pendingRepathData, skinPrefixes]);

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
    try {
      const searchTermLower = skinlineSearchTerm.toLowerCase();
      console.log(`🔍 Searching for "${skinlineSearchTerm}" in Community Dragon skins data...`);

      // Fetch all skins data from Community Dragon
      const allSkinsData = await fetchAllChromaData();
      console.log(`📊 Loaded ${Object.keys(allSkinsData).length} skins from Community Dragon`);

      // Find all skins that match the search term (skinline or rarity matching)
      const matchingSkins = [];
      for (const [skinId, skinData] of Object.entries(allSkinsData)) {
        let isMatch = false;

        // Check for skinline name match
        if (skinData.name && skinData.name.toLowerCase().includes(searchTermLower)) {
          // More precise matching to avoid false positives like "Covenant" matching "Coven"
          const skinNameLower = skinData.name.toLowerCase();

          // Check if the search term appears as a complete word or at the start of the skin name
          const isExactMatch =
            skinNameLower.startsWith(searchTermLower + ' ') || // "Coven Ahri"
            skinNameLower.includes(' ' + searchTermLower + ' ') || // "Prestige Coven Akali"
            skinNameLower.endsWith(' ' + searchTermLower) || // "Some Coven"
            skinNameLower === searchTermLower; // Exact match

          // Additional filtering to avoid false positives
          const isFalsePositive =
            (searchTermLower === 'coven' && skinNameLower.includes('covenant')) ||
            (searchTermLower === 'star' && skinNameLower.includes('starguardian') && !skinNameLower.includes('star guardian')) ||
            (searchTermLower === 'project' && skinNameLower.includes('projection'));

          if (!isFalsePositive && isExactMatch) {
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

      console.log(`🎯 Found ${matchingSkins.length} skins matching "${skinlineSearchTerm}":`, matchingSkins.map(s => s.name));

      // Group skins by champion
      const results = [];
      const championMap = new Map();

      // Create a map of champion names to champion objects
      champions.forEach(champion => {
        championMap.set(champion.name.toLowerCase(), champion);
      });

      // Group matching skins by champion
      for (const skin of matchingSkins) {
        // Extract champion name from skin name (e.g., "Coven Ahri" -> "Ahri")
        const skinNameParts = skin.name.split(' ');
        const championName = skinNameParts[skinNameParts.length - 1]; // Last part is usually champion name

        const champion = championMap.get(championName.toLowerCase());
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
      console.log(`🎯 Search complete! Found ${results.length} champions with "${skinlineSearchTerm}" skins:`, results);

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
    const updatedPrefixes = {
      ...skinPrefixes,
      [currentSkin.skinId]: customPrefix.trim() || 'bum',
    };
    setSkinPrefixes(updatedPrefixes);
    const prevIndex = currentSkinIndex - 1;
    setCurrentSkinIndex(prevIndex);
    setCustomPrefix(updatedPrefixes[pendingRepathData.allSkins[prevIndex]?.skinId] || '');
  };

  const handleNextOrStartPrefix = () => {
    if (!pendingRepathData) return;
    const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
    const newPrefixes = {
      ...skinPrefixes,
      [currentSkin.skinId]: customPrefix.trim() || 'bum',
    };

    if (applyToAll) {
      const remainingSkins = pendingRepathData.allSkins.slice(currentSkinIndex + 1);
      remainingSkins.forEach(skin => {
        newPrefixes[skin.skinId] = customPrefix.trim() || 'bum';
      });
    }

    setSkinPrefixes(newPrefixes);

    if (currentSkinIndex === pendingRepathData.allSkins.length - 1) {
      setShowPrefixModal(false);
      executeRepath(newPrefixes);
    } else {
      const nextIndex = currentSkinIndex + 1;
      setCurrentSkinIndex(nextIndex);
      setCustomPrefix(newPrefixes[pendingRepathData.allSkins[nextIndex]?.skinId] || '');
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
      const data = await api.getChampions();
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
      const skins = await api.getChampionSkins(championName, champions);
      setChampionSkins(skins);

      // Load chroma data in the background (truly non-blocking)
      setTimeout(() => {
        loadChromaData(championName, skins).catch(err => {
          console.warn('Chroma data loading failed (non-critical):', err);
        });
      }, 100); // Small delay to let UI update first
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
      return {
        championName: skin.champion.name,
        skinId: skin.id,
        skinName: skin.name,
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
    };
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

    await modelInspect.inspect({
      championName: target.championName,
      skinId: inspectSkinId,
      chromaId: selectedChroma?.id ?? null,
      chromaOptions,
      skinName: inspectSkinName,
      leaguePath,
      hashPath,
    });
  };

  const handleExtractWad = async () => {
    const setupReady = await ensureSetupReady('extracting');
    if (!setupReady) return;

    const normalizedSelections = getNormalizedSelectedSkins();
    if (normalizedSelections.length === 0) return;

    // Show the extraction mode modal — the actual loop runs in executeExtraction()
    setPendingExtractionSkins(normalizedSelections);
    setShowExtractionModeModal(true);
  };

  const executeExtraction = async (payload) => {
    const decisions = payload?.decisions || [];
    const extractOptions = payload?.options || {};
    const useExtractVoiceover = extractOptions.extractVoiceover === true;
    const usePreserveHudIcons2D = extractOptions.preserveHudIcons2D !== false;

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

        if (useExtractVoiceover) {
          addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal & Voiceover WADs...`, 'info');
        } else {
          addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal WAD only (Voiceover disabled)...`, 'info');
        }

        const selectedChroma = selectedChromas[skinKey];
        if (selectedChroma) {
          addConsoleLog(`${progress} Extracting with chroma ${selectedChroma.id}...`, 'info');
          await extractWadFile(championName, skinId, skinName, selectedChroma.id, cleanAfterExtract, {
            extractVoiceover: useExtractVoiceover,
            preserveHudIcons2D: usePreserveHudIcons2D,
          });
        } else {
          await extractWadFile(championName, skinId, skinName, null, cleanAfterExtract, {
            extractVoiceover: useExtractVoiceover,
            preserveHudIcons2D: usePreserveHudIcons2D,
          });
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

      for (const { championName, skinId, skinName } of normalizedSelections) {
        if (!skinsByChampion[championName]) {
          skinsByChampion[championName] = [];
        }
        skinsByChampion[championName].push({ skinId, skinName });

        // Add to flattened list for individual prefix selection
        allSkins.push({ championName, skinId, skinName });
      }

      // Store the repath data and show prefix modal
      setPendingRepathData({ skinsByChampion, allSkins });
      setCurrentSkinIndex(0);
      setSkinPrefixes({});
      setApplyToAll(false);
      setSkipSfxRepath(true);
      setRepathPreserveHudIcons2D(true);
      setShowPrefixModal(true);
    }
  };

  const executeRepath = async (finalPrefixes = null) => {
    if (!pendingRepathData) return;

    setIsRepathing(true);
    addConsoleLog(`Repathing ${selectedSkins.length} skin(s) with individual prefixes...`, 'info');

    try {
      const { skinsByChampion, allSkins } = pendingRepathData;
      const championNames = Object.keys(skinsByChampion);

      // Use the passed prefixes or fall back to state
      const prefixesToUse = finalPrefixes || skinPrefixes;
      console.log('🔍 Using prefixes:', prefixesToUse);

      // Process each champion separately
      for (let i = 0; i < championNames.length; i++) {
        // Check for cancellation (but not immediately)
        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }

        const championName = championNames[i];
        const championSkins = skinsByChampion[championName];
        const progress = `${i + 1}/${championNames.length}`;

        addConsoleLog(`${progress} Processing ${championName} (${championSkins.length} skins)...`, 'info');

        // Use first skin for extraction (all skins of same champion share the same WAD)
        const firstSkin = championSkins[0];
        const firstSkinId = firstSkin.skinId;

        addConsoleLog(`${progress} Extracting ${firstSkin.skinName} (${championName}) - Normal WAD for repath...`, 'info');
        // Extract WAD file (only once per champion)
        await extractWadFile(championName, firstSkinId, firstSkin.skinName, null, false, {
          extractVoiceover: false,
          preserveHudIcons2D: repathPreserveHudIcons2D,
        });

        // Check for cancellation after extraction
        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }

        // Now run repath using the extracted folder as source
        const skinNameSafe = firstSkin.skinName.replace(/[^a-zA-Z0-9]/g, '_');
        const championFileName = getChampionFileName(championName);
        const sourceDir = `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}`;
        const outputDir = `${extractionPath}\\${championFileName}_repathed_${skinNameSafe}`;

        // Get ALL skin IDs for this champion (not just first skin)
        const championSkinIds = championSkins.map(s => s.skinId);
        const prefixes = championSkinIds.map(skinId => prefixesToUse[skinId] || 'bum');
        const uniquePrefixes = [...new Set(prefixes)];

        console.log(`🔍 Champion ${championName} ALL skin IDs:`, championSkinIds);
        console.log(`🔍 Champion ${championName} prefixes:`, prefixes);
        console.log(`🔍 Champion ${championName} unique prefixes:`, uniquePrefixes);

        if (uniquePrefixes.length === 1) {
          addConsoleLog(`${progress} Running repath for ${championName} with ${championSkinIds.length} skins using prefix "${uniquePrefixes[0]}"...`, 'info');
        } else {
          addConsoleLog(`${progress} Running repath for ${championName} with ${championSkinIds.length} skins using mixed prefixes: ${uniquePrefixes.join(', ')}...`, 'info');
        }

        // Run repath through Bumpath backend with ALL skin IDs for this champion
        // If multiple skins from same champion, process them together
        const processTogether = championSkinIds.length > 1;
        const repathResult = await runBumpathRepath({
          sourceDir,
          outputDir,
          selectedSkinIds: championSkinIds,
          hashPath,
          prefix: uniquePrefixes[0],
          processTogether,
          preserveHudIcons2D: repathPreserveHudIcons2D,
          skipSfxRepath,
        });

        if (repathResult.success) {
          addConsoleLog(`${progress} Successfully repathed ${championName} (${championSkinIds.length} skins) to: ${outputDir}`, 'success');
          console.log(`Successfully repathed ${championName} (${championSkinIds.length} skins) to: ${outputDir}`);

          // Clean up extracted folder after successful repath
          try {
            const fs = window.require('fs');
            if (fs.existsSync(sourceDir)) {
              fs.rmSync(sourceDir, { recursive: true, force: true });
              addConsoleLog(`${progress} Cleaned up extracted folder for ${championName}`, 'info');
              console.log(`Cleaned up extracted folder: ${sourceDir}`);
            }
          } catch (cleanupError) {
            console.warn(`Failed to clean up extracted folder: ${cleanupError.message}`);
            // Don't fail the whole operation if cleanup fails
          }
        } else if (repathResult.cancelled) {
          addConsoleLog(`${progress} Repath cancelled for ${championName}`, 'warning');
          console.log(`Repath cancelled for ${championName}`);
          break; // Stop processing remaining champions
        } else {
          addConsoleLog(`${progress} Failed to repath ${championName}: ${repathResult.error}`, 'error');
          console.error(`Repath failed for ${championName}: ${repathResult.error}`);
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


  const downloadSplashArt = async (championName, championAlias, skinId, skinName) => {
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    addConsoleLog(`Downloading splash art: ${skinName}`, 'info');
    try {
      const filePath = await downloadSplashArtToFile({
        championName,
        championAlias,
        skinId,
        skinName,
        outputPath: extractionPath,
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
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    const extractVoiceover = options.extractVoiceover === true;
    const preserveHudIcons2D = options.preserveHudIcons2D !== false;

    const skinKey = `${championName}_${skinId}`;
    setExtractingSkins(prev => ({ ...prev, [skinKey]: true }));
    setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Starting extraction...' }));

    try {
      await extractSkinWadBundle({
        championName,
        skinId,
        skinName,
        chromaId,
        leaguePath,
        extractionPath,
        hashPath,
        extractVoiceover,
        cleanAfterExtract,
        preserveHudIcons2D,
        onProgress: (message) => {
          setExtractionProgress(prev => ({ ...prev, [skinKey]: message }));
        },
      });
    } catch (error) {
      console.error('WAD extraction error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        championName,
        skinId,
        wadFilePath: `${leaguePath}\\${getChampionFileName(championName)}.wad.client`,
      });
      setExtractionProgress(prev => ({ ...prev, [skinKey]: `Error: ${error.message}` }));
      alert(`Failed to extract WAD file: ${error.message}`);
    } finally {
      setExtractingSkins(prev => ({ ...prev, [skinKey]: false }));
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

      <div className="frog-changer-container flex h-screen">
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
          getChampionIconUrl={getChampionIconUrl}
          offlineMode={offlineMode}
        />

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto relative">
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
        preserveHudIcons2D={repathPreserveHudIcons2D}
        setPreserveHudIcons2D={setRepathPreserveHudIcons2D}
        onCancel={handleCancelPrefixModal}
        onPrevious={handlePreviousPrefix}
        onNextOrStart={handleNextOrStartPrefix}
      />

      <ExtractionModeModal
        open={showExtractionModeModal}
        skins={pendingExtractionSkins}
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






