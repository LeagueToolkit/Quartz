import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import ConsoleWindow from '../../components/ConsoleWindow';
import CelestiaGuide from '../../components/celestia/CelestiaGuide';
import electronPrefs from '../../utils/core/electronPrefs.js';
import { BumpathCore } from '../../utils/bumpath/index.js';
import SourceBinsPanel from './components/SourceBinsPanel';
import EntriesPanel from './components/EntriesPanel';
import BumpathTopBar from './components/BumpathTopBar';
import BumpathBottomControls from './components/BumpathBottomControls';
import BumpathSettingsPanel from './components/BumpathSettingsPanel';
import BumpathStatusOverlays from './components/BumpathStatusOverlays';
import BumpathSettingsDialog from './components/BumpathSettingsDialog';
import CelestiaTriggerButton from './components/CelestiaTriggerButton';
import CelestiaTutorialOverlays from './components/CelestiaTutorialOverlays';
import QuickRepathWizardModal from './components/QuickRepathWizardModal';
import SourceAddModeModal from './components/SourceAddModeModal';
import { panelStyle } from './utils/styles';
import useBumpathCoreApi from './hooks/useBumpathCoreApi';
import useBumpathSourceScan from './hooks/useBumpathSourceScan';
import useBumpathActions from './hooks/useBumpathActions';
import useBumpathEntries from './hooks/useBumpathEntries';

const Bumpath = () => {
  // Create bumpath core instance
  const bumpathCoreRef = useRef(new BumpathCore());

  const [sourceDirs, setSourceDirs] = useState([]);
  const [, setSourceFiles] = useState({});
  const [sourceBins, setSourceBins] = useState({});
  const [scannedData, setScannedData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState(new Set());
  const [prefixText, setPrefixText] = useState('bum');
  const [debouncedPrefixText, setDebouncedPrefixText] = useState('bum');
  const [appliedPrefixes, setAppliedPrefixes] = useState(new Map()); // Track applied prefixes per entry
  const [ignoreMissing, setIgnoreMissing] = useState(false);
  const [combineLinked, setCombineLinked] = useState(false);
  const [hideDataFolderBins, setHideDataFolderBins] = useState(false);
  const [hashesPath, setHashesPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [binFilter, setBinFilter] = useState('');
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [expandedFilePaths, setExpandedFilePaths] = useState(new Set()); // Track expanded file paths (for missing file headers)
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [showCelestiaGuide, setShowCelestiaGuide] = useState(false);
  const [celestiaStepIndex, setCelestiaStepIndex] = useState(0);
  const [simulatedBinSelected, setSimulatedBinSelected] = useState(false);
  const [binListHighlightRect, setBinListHighlightRect] = useState(null);
  const [settingsAutoOpened, setSettingsAutoOpened] = useState(false);
  const [quickRepathOpen, setQuickRepathOpen] = useState(false);
  const [quickRepathStep, setQuickRepathStep] = useState(0);
  const [quickMainBin, setQuickMainBin] = useState('');
  const [quickPrefix, setQuickPrefix] = useState('bum');
  const [quickOutputPath, setQuickOutputPath] = useState('');
  const [isQuickRepathRunning, setIsQuickRepathRunning] = useState(false);
  const [sourceAddModeOpen, setSourceAddModeOpen] = useState(false);
  const [lastAddedSourceDir, setLastAddedSourceDir] = useState('');
  const [isDragOverSource, setIsDragOverSource] = useState(false);
  const scanDebounceTimerRef = useRef(null);

  // Reset simulated state when step changes or guide closes
  useEffect(() => {
    if (celestiaStepIndex !== 1) {
      setSimulatedBinSelected(false);
    }
  }, [celestiaStepIndex]);

  useEffect(() => {
    if (!showCelestiaGuide) {
      setSimulatedBinSelected(false);
      setBinListHighlightRect(null);
      // Reset auto-opened flag and close settings when guide closes
      if (settingsAutoOpened) {
        setSettingsExpanded(false);
        setSettingsAutoOpened(false);
      }
    }
  }, [showCelestiaGuide, settingsAutoOpened]);

  // Update bin list highlight rect when on step 2 (bin list step, index 1)
  useEffect(() => {
    if (showCelestiaGuide && celestiaStepIndex === 1) {
      const updateRect = () => {
        const element = document.querySelector('[data-bumpath-bin-list]');
        if (element) {
          const rect = element.getBoundingClientRect();
          const padding = 15; // Same padding as in the step definition
          setBinListHighlightRect({
            left: rect.left - padding,
            top: rect.top - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
          });
        } else {
          setBinListHighlightRect(null);
        }
      };

      updateRect();
      const onResize = () => updateRect();
      const onScroll = () => updateRect();
      window.addEventListener('resize', onResize, { passive: true });
      window.addEventListener('scroll', onScroll, true);

      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll, true);
      };
    } else {
      setBinListHighlightRect(null);
    }
  }, [showCelestiaGuide, celestiaStepIndex]);

  // Auto-open/close settings when on step 7 (index 6)
  useEffect(() => {
    if (!showCelestiaGuide) {
      // Don't do anything if guide is not open
      return;
    }

    // Only manage settings on step 7
    if (celestiaStepIndex === 6) {
      // Open settings when entering step 7
      setSettingsAutoOpened(true);
      setSettingsExpanded(true);
    } else {
      // Close settings when not on step 7
      // If we auto-opened them, close and reset the flag
      if (settingsAutoOpened) {
        const timer = setTimeout(() => {
          setSettingsExpanded(false);
          setSettingsAutoOpened(false);
        }, 100);
        return () => clearTimeout(timer);
      }
      // Also ensure settings are closed if they're open when guide starts on earlier steps
      // This prevents settings from briefly showing when guide opens on step 1
      if (settingsExpanded && !settingsAutoOpened) {
        // Settings were manually opened, but we want them closed for the guide
        // Only close if we're on step 1-6 (indices 0-5)
        if (celestiaStepIndex < 6) {
          setSettingsExpanded(false);
        }
      }
    }
  }, [showCelestiaGuide, celestiaStepIndex, settingsAutoOpened, settingsExpanded]);

  // Add log to console
  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Fetch logs - no longer needed with native implementation
  // Logs are added directly via addLog callback
  const fetchLogs = useCallback(async () => {
    // Native implementation - logs are already in consoleLogs via addLog
    // This function is kept for compatibility but does nothing
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      await electronPrefs.initPromise;
      // Always use integrated hash directory - get it natively
      if (window.require) {
        const path = window.require('path');
        const fs = window.require('fs');
        const os = window.require('os');

        // Same logic as hashManager.getHashDirectory() - native implementation
        // Use os.homedir() and process.platform for cross-platform support
        let appDataPath;
        const platform = process.platform;
        if (platform === 'win32') {
          appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        } else if (platform === 'darwin') {
          appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
        } else {
          // Linux
          appDataPath = path.join(os.homedir(), '.local', 'share');
        }

        const frogToolsDir = path.join(appDataPath, 'FrogTools');
        if (!fs.existsSync(frogToolsDir)) {
          fs.mkdirSync(frogToolsDir, { recursive: true });
        }

        const hashDir = path.join(frogToolsDir, 'hashes');
        if (!fs.existsSync(hashDir)) {
          fs.mkdirSync(hashDir, { recursive: true });
        }

        setHashesPath(hashDir);
      } else {
        // Fallback for development - show placeholder
        setHashesPath('AppData\\Roaming\\FrogTools\\hashes (Integrated)');
      }
      // Check if this is the first time (preferences not set)
      const isFirstTime = electronPrefs.obj.BumpathIgnoreMissing === undefined &&
        electronPrefs.obj.BumpathCombineLinked === undefined;

      if (isFirstTime) {
        // First time: set both to true by default
        const defaultIgnoreMissing = true;
        const defaultCombineLinked = true;
        setIgnoreMissing(defaultIgnoreMissing);
        setCombineLinked(defaultCombineLinked);
        // Save the defaults
        await electronPrefs.set('BumpathIgnoreMissing', defaultIgnoreMissing);
        await electronPrefs.set('BumpathCombineLinked', defaultCombineLinked);
      } else {
        // Not first time: use saved values or default to false
        setIgnoreMissing(electronPrefs.obj.BumpathIgnoreMissing || false);
        setCombineLinked(electronPrefs.obj.BumpathCombineLinked || false);
        setHideDataFolderBins(electronPrefs.obj.BumpathHideDataFolderBins || false);
      }
    };
    loadSettings();
  }, []);

  // Auto-dismiss success toast after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [success]);

  // Debounce prefix text to reduce lag
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPrefixText(prefixText);
    }, 150);

    return () => clearTimeout(timer);
  }, [prefixText]);

  // Optimized prefix text change handler
  const handlePrefixTextChange = useCallback((value) => {
    setPrefixText(value);
  }, []);

  // Save settings
  const saveSettings = async (key, value) => {
    try {
      await electronPrefs.set(key, value);
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  const apiCall = useBumpathCoreApi({ bumpathCoreRef, addLog });

  const handleSourceDirAdded = useCallback((payload) => {
    const addedPath = payload?.sourceDir || '';
    setLastAddedSourceDir(addedPath);
    setQuickRepathOpen(false);
    setSourceAddModeOpen(true);
  }, []);

  const {
    handleSelectSourceDir,
    handleBinSelect,
    addSourceDirByPath
  } = useBumpathSourceScan({
    apiCall,
    sourceDirs,
    sourceBins,
    hashesPath,
    scanDebounceTimerRef,
    setSourceDirs,
    setSourceFiles,
    setSourceBins,
    setScannedData,
    setSelectedEntries,
    setExpandedEntries,
    setAppliedPrefixes,
    setIsScanning,
    setError,
    setSuccess,
    onSourceDirAdded: handleSourceDirAdded
  });
  const {
    handleApplyPrefix,
    handleProcess,
    handleSelectOutputDir,
    handleReset
  } = useBumpathActions({
    apiCall,
    selectedEntries,
    prefixText,
    debouncedPrefixText,
    scannedData,
    appliedPrefixes,
    outputPath,
    ignoreMissing,
    combineLinked,
    addLog,
    fetchLogs,
    setError,
    setSuccess,
    setScannedData,
    setAppliedPrefixes,
    setSelectedEntries,
    setExpandedEntries,
    setIsProcessing,
    setOutputPath,
    setSourceDirs,
    setSourceFiles,
    setSourceBins
  });

  const openQuickWizard = useCallback(() => {
    setSourceAddModeOpen(false);
    setQuickRepathStep(0);
    setQuickRepathOpen(true);
  }, []);

  const handleChooseNormalRepath = useCallback(() => {
    setSourceAddModeOpen(false);
    setQuickRepathOpen(false);
    setSuccess('Source folder added. Continue with normal repath flow.');
  }, [setSuccess]);

  const handleRootDragOver = useCallback((e) => {
    const types = e.dataTransfer?.types;
    if (!types) return;
    const hasFiles = Array.from(types).includes('Files');
    if (!hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverSource) setIsDragOverSource(true);
  }, [isDragOverSource]);

  const handleRootDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverSource(false);
  }, []);

  const handleRootDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverSource(false);

    try {
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (!droppedFiles.length) {
        setError('No folder detected in drop');
        return;
      }

      const droppedPath = droppedFiles[0]?.path;
      if (!droppedPath) {
        setError('Dropped item path is unavailable');
        return;
      }

      if (!window.require) {
        setError('Drag and drop folder import requires Electron runtime');
        return;
      }

      const fs = window.require('fs');
      let folderPath = droppedPath;
      try {
        const stat = fs.lstatSync(droppedPath);
        if (!stat.isDirectory()) {
          setError('Please drop a folder, not a file');
          return;
        }
      } catch {
        setError('Failed to read dropped folder');
        return;
      }

      await addSourceDirByPath(folderPath);
    } catch (dropError) {
      setError(`Failed to add dropped folder: ${dropError.message}`);
    }
  }, [addSourceDirByPath, setError]);

  useEffect(() => {
    if (!quickRepathOpen) return;
    if (quickOutputPath) return;
    if (outputPath) {
      setQuickOutputPath(outputPath);
    }
  }, [outputPath, quickOutputPath, quickRepathOpen]);

  const quickBinOptions = useMemo(() => {
    return Object.entries(sourceBins || {})
      .filter(([unifyPath, data]) => {
        const pathToUse = data?.rel_path || data?.path || unifyPath || '';
        return !String(pathToUse).toLowerCase().includes('/animations/');
      })
      .map(([unifyPath, data]) => {
        const pathToUse = data?.rel_path || data?.path || unifyPath || '';
        return { value: unifyPath, label: pathToUse };
      });
  }, [sourceBins]);

  useEffect(() => {
    if (!quickRepathOpen) return;
    if (quickMainBin) return;
    if (quickBinOptions.length > 0) {
      setQuickMainBin(quickBinOptions[0].value);
    }
  }, [quickBinOptions, quickMainBin, quickRepathOpen]);

  const handleQuickSelectOutputDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setQuickOutputPath(result);
      }
    } catch (selectError) {
      setError('Failed to select output directory: ' + selectError.message);
    }
  }, [setError]);

  const handleRunQuickRepath = useCallback(async () => {
    if (!quickMainBin) {
      setError('Select a main BIN first');
      return;
    }
    const prefix = (quickPrefix || '').trim();
    if (!prefix) {
      setError('Enter a prefix first');
      return;
    }
    const outPath = (quickOutputPath || '').trim();
    if (!outPath) {
      setError('Select an output directory first');
      return;
    }
    if (!hashesPath) {
      setError('Hashes path is not ready yet');
      return;
    }

    setIsQuickRepathRunning(true);
    setError(null);
    addLog('Quick Repath: starting...');

    try {
      if (window.require) {
        const fs = window.require('fs');
        if (!fs.existsSync(outPath)) {
          fs.mkdirSync(outPath, { recursive: true });
        }
      }

      const newSelections = {};
      Object.entries(sourceBins || {}).forEach(([path, data]) => {
        newSelections[path] = { ...data, selected: path === quickMainBin };
      });
      setSourceBins(newSelections);

      const binSelections = {};
      Object.entries(newSelections).forEach(([path, data]) => {
        binSelections[path] = Boolean(data?.selected);
      });
      await apiCall('update-bin-selection', { binSelections });

      setIsScanning(true);
      const scanResult = await apiCall('scan', {
        hashesPath,
        ritobinPath: electronPrefs.obj.RitoBinPath || ''
      });
      setIsScanning(false);

      if (!scanResult.success || !scanResult.data?.entries) {
        setError(scanResult.error || 'Quick Repath scan failed');
        return;
      }

      const entries = scanResult.data.entries || {};
      const editableEntries = Object.keys(entries).filter((entryHash) => entries[entryHash]?.prefix !== 'Uneditable');

      if (editableEntries.length === 0) {
        setError('No editable entries found in selected main BIN');
        return;
      }

      setSelectedEntries(new Set(editableEntries));

      const applyResult = await apiCall('apply-prefix', {
        entryHashes: editableEntries,
        prefix
      });

      if (!applyResult.success) {
        setError(applyResult.error || 'Quick Repath failed while applying prefix');
        return;
      }

      const prefixedData = {
        ...scanResult.data,
        entries: { ...entries }
      };
      editableEntries.forEach((entryHash) => {
        if (prefixedData.entries[entryHash]) {
          prefixedData.entries[entryHash] = {
            ...prefixedData.entries[entryHash],
            prefix
          };
        }
      });
      setScannedData(prefixedData);

      const prefixMap = new Map();
      editableEntries.forEach((entryHash) => prefixMap.set(entryHash, prefix));
      setAppliedPrefixes(prefixMap);

      setPrefixText(prefix);
      setDebouncedPrefixText(prefix);
      setOutputPath(outPath);

      setIsProcessing(true);
      const processResult = await apiCall('process', {
        outputPath: outPath,
        ignoreMissing,
        combineLinked
      });
      setIsProcessing(false);

      if (!processResult.success) {
        setError(processResult.error || 'Quick Repath process failed');
        return;
      }

      const processedCount = processResult.total_files || processResult.processedFiles || 0;
      setSuccess(`Quick Repath completed: ${processedCount} files processed`);
      addLog(`Quick Repath: completed (${processedCount} files)`);

      setScannedData(null);
      setSelectedEntries(new Set());
      setExpandedEntries(new Set());
      setAppliedPrefixes(new Map());

      setQuickRepathOpen(false);
      setQuickRepathStep(0);
    } catch (quickError) {
      setError(`Quick Repath failed: ${quickError.message}`);
      addLog(`Quick Repath error: ${quickError.message}`);
      setIsProcessing(false);
      setIsScanning(false);
    } finally {
      setIsQuickRepathRunning(false);
    }
  }, [
    addLog,
    apiCall,
    combineLinked,
    hashesPath,
    ignoreMissing,
    quickMainBin,
    quickOutputPath,
    quickPrefix,
    setAppliedPrefixes,
    setIsScanning,
    setDebouncedPrefixText,
    setError,
    setExpandedEntries,
    setOutputPath,
    setScannedData,
    setSelectedEntries,
    sourceBins,
  ]);
  const {
    handleEntrySelect,
    handleEntryExpand,
    handleFilePathExpand,
    handleSelectAll,
    handleDeselectAll,
    getEntryDisplayName,
    filteredEntries
  } = useBumpathEntries({
    scannedData,
    showMissingOnly,
    setSelectedEntries,
    setExpandedEntries,
    setExpandedFilePaths
  });

  const selectedBinCount = useMemo(
    () => Object.values(sourceBins || {}).filter((bin) => bin?.selected).length,
    [sourceBins]
  );
  const totalBinCount = useMemo(() => Object.keys(sourceBins || {}).length, [sourceBins]);

  // Filter bins based on search (exclude animation BINs from display)
  const filteredBins = useMemo(() => {
    const filterLower = (binFilter || '').toLowerCase();
    return Object.entries(sourceBins || {}).filter(([unifyPath, data]) => {
      if (!data) return false;
      const pathToCheck = data?.path || data?.rel_path || unifyPath || '';
      const pathLower = pathToCheck.toLowerCase();
      // Filter out animation BINs from the list (but they can still be merged)
      if (pathLower.includes('/animations/')) return false;
      // Filter out bins directly in data folder if setting is enabled
      if (hideDataFolderBins) {
        // Check if bin is directly in data folder (e.g., "data/something.bin" or "data\\something.bin")
        // Not "data/characters/..." or "data/particles/..." - those are subdirectories
        const dataFolderPattern = /^data[\/\\][^\/\\]+\.bin$/i;
        if (dataFolderPattern.test(pathToCheck)) {
          return false;
        }
      }
      return pathLower.includes(filterLower);
    });
  }, [sourceBins, hideDataFolderBins, binFilter]);

  return (
    <Box className="bumpath-container" sx={{
      width: '100%',
      height: '100%',
      minHeight: '100%',
      overflow: 'hidden',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}
      onDragOver={handleRootDragOver}
      onDragEnter={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {isDragOverSource && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
            border: '2px dashed color-mix(in srgb, var(--accent2), transparent 30%)',
          }}
        >
          <Box sx={{
            px: 2,
            py: 1.1,
            borderRadius: '8px',
            border: '1px solid color-mix(in srgb, var(--accent2), transparent 45%)',
            background: 'color-mix(in srgb, var(--surface), black 10%)',
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.82rem'
          }}>
            Drop source folder to add it
          </Box>
        </Box>
      )}

      <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <BumpathTopBar
          handleSelectSourceDir={handleSelectSourceDir}
          handleSelectAll={handleSelectAll}
          handleDeselectAll={handleDeselectAll}
          scannedData={scannedData}
          selectedEntriesSize={selectedEntries.size}
          showMissingOnly={showMissingOnly}
          setShowMissingOnly={setShowMissingOnly}
        />
        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <SourceBinsPanel
            binFilter={binFilter}
            setBinFilter={setBinFilter}
            filteredBins={filteredBins}
            selectedBinCount={selectedBinCount}
            totalBinCount={totalBinCount}
            handleBinSelect={handleBinSelect}
          />
          <EntriesPanel
            isScanning={isScanning}
            scannedData={scannedData}
            filteredEntries={filteredEntries}
            expandedEntries={expandedEntries}
            selectedEntries={selectedEntries}
            expandedFilePaths={expandedFilePaths}
            appliedPrefixes={appliedPrefixes}
            showMissingOnly={showMissingOnly}
            getEntryDisplayName={getEntryDisplayName}
            handleEntryExpand={handleEntryExpand}
            handleEntrySelect={handleEntrySelect}
            handleFilePathExpand={handleFilePathExpand}
          />
        </Box>
        {/* Bottom Controls */}
        <BumpathBottomControls
          handleReset={handleReset}
          prefixText={prefixText}
          handlePrefixTextChange={handlePrefixTextChange}
          handleApplyPrefix={handleApplyPrefix}
          selectedEntriesSize={selectedEntries.size}
          debouncedPrefixText={debouncedPrefixText}
          handleSelectOutputDir={handleSelectOutputDir}
          isProcessing={isProcessing}
          handleProcess={handleProcess}
          handleOpenQuickRepath={openQuickWizard}
          quickRepathDisabled={isProcessing || Object.keys(sourceBins || {}).length === 0}
          scannedData={scannedData}
          outputPath={outputPath}
          setConsoleOpen={setConsoleOpen}
          settingsExpanded={settingsExpanded}
          setSettingsExpanded={setSettingsExpanded}
          setSettingsAutoOpened={setSettingsAutoOpened}
        />
        {/* Collapsible Settings Panel */}
        <BumpathSettingsPanel
          panelStyle={panelStyle}
          settingsExpanded={settingsExpanded}
          ignoreMissing={ignoreMissing}
          setIgnoreMissing={setIgnoreMissing}
          combineLinked={combineLinked}
          setCombineLinked={setCombineLinked}
          hideDataFolderBins={hideDataFolderBins}
          setHideDataFolderBins={setHideDataFolderBins}
          saveSettings={saveSettings}
        />
        <BumpathStatusOverlays
          error={error}
          success={success}
          setSuccess={setSuccess}
        />
      </Box>

      <BumpathSettingsDialog
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        hashesPath={hashesPath}
      />
      <QuickRepathWizardModal
        open={quickRepathOpen}
        step={quickRepathStep}
        setStep={setQuickRepathStep}
        binOptions={quickBinOptions}
        selectedMainBin={quickMainBin}
        setSelectedMainBin={setQuickMainBin}
        quickPrefix={quickPrefix}
        setQuickPrefix={setQuickPrefix}
        quickOutputPath={quickOutputPath}
        setQuickOutputPath={setQuickOutputPath}
        ignoreMissing={ignoreMissing}
        setIgnoreMissing={setIgnoreMissing}
        combineLinked={combineLinked}
        setCombineLinked={setCombineLinked}
        onSelectOutputDir={handleQuickSelectOutputDir}
        onRunQuickRepath={handleRunQuickRepath}
        onClose={() => setQuickRepathOpen(false)}
        isRunning={isQuickRepathRunning}
      />
      <SourceAddModeModal
        open={sourceAddModeOpen}
        sourceDirLabel={lastAddedSourceDir}
        onQuick={openQuickWizard}
        onNormal={handleChooseNormalRepath}
        onClose={handleChooseNormalRepath}
      />
      {/* Console Window */}
      <ConsoleWindow
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        logs={consoleLogs}
        onRefresh={fetchLogs}
      />

      <CelestiaTriggerButton
        showCelestiaGuide={showCelestiaGuide}
        setShowCelestiaGuide={setShowCelestiaGuide}
        settingsExpanded={settingsExpanded}
      />
      <CelestiaTutorialOverlays
        showCelestiaGuide={showCelestiaGuide}
        celestiaStepIndex={celestiaStepIndex}
        binListHighlightRect={binListHighlightRect}
        panelStyle={panelStyle}
        simulatedBinSelected={simulatedBinSelected}
        setSimulatedBinSelected={setSimulatedBinSelected}
      />
      {/* Celestia Guide */}
      {showCelestiaGuide && (
        <CelestiaGuide
          id="bumpath-guide"
          onStepChange={(stepIndex) => setCelestiaStepIndex(stepIndex)}
          enableTopRightForSteps={[4, 5, 6]} // Steps 5, 6, and 7 (0-based indices 4, 5, 6)
          steps={[
            {
              title: "Source BINs List",
              text: "After adding source directories, BIN files will appear in this list. Select your main BIN file - this is usually skin0.bin or the primary BIN file for your mod. Click the checkbox next to the BIN file you want to scan. The main BIN file typically contains references to all the other files in your mod.",
              targetSelector: "[data-bumpath-bin-list]",
              padding: 15,
            },
            {
              title: "Select All Entries",
              text: "After scanning your BIN file, entries will appear in the right panel. Click 'Select All' to select all entries that need to be repathed. This ensures all file references in your mod are updated with the prefix, preventing broken file paths and ensuring your mod works correctly.",
              targetSelector: "[data-bumpath-select-all]",
              padding: 15,
            },
            {
              title: "Prefix",
              text: "The prefix is CRITICAL for preventing your mod from breaking. When you set a prefix (like 'bum'), all file paths will be moved to 'assets/bum/path/to/file' instead of 'assets/path/to/file'. This prevents conflicts with the original game files and ensures your mod files are loaded correctly. Without a prefix, your mod may break when the game updates or when other mods are installed. Always use a unique prefix for your mod!",
              targetSelector: "[data-bumpath-prefix]",
              padding: 15,
            },
            {
              title: "Output Directory",
              text: "This is where the repathed files will be saved. Select a folder where you want the processed files to be written. The output directory should be different from your source directories to avoid overwriting your original mod files. Typically, this would be your League of Legends mod folder or a staging directory.",
              targetSelector: "[data-bumpath-output]",
              padding: 15,
            },
            {
              title: "Process Button",
              text: "Click this button to start the repathing process. Bumpath will scan the selected BIN files, apply the prefix to all file paths (moving them to assets/[prefix]/...), and write the modified files to the output directory. Make sure you have selected source directories, chosen your main BIN file, selected all entries, set a prefix, and chosen an output directory before processing.",
              targetSelector: "[data-bumpath-process]",
              padding: 15,
            },
            {
              title: "Settings",
              text: "These settings control how Bumpath processes your files. 'Ignore Missing Files' should usually be ON - it prevents errors when some referenced files don't exist. 'Combine Linked BINs to Source BINs' should also typically be ON - it ensures all linked BIN files are properly combined with your source BIN. Most users should keep both of these enabled for the best results. The settings panel can be toggled open and closed using the gear icon button.",
              targetSelector: "[data-bumpath-settings-panel]",
              padding: 15,
            },
          ]}
          onClose={() => {
            setShowCelestiaGuide(false);
          }}
        />
      )}
    </Box>
  );
};

export default Bumpath;
