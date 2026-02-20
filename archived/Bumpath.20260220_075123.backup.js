import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Alert,
  InputAdornment,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material';
import ConsoleWindow from '../components/ConsoleWindow';
import CelestiaGuide from '../components/celestia/CelestiaGuide';
import {
  Folder as FolderIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
  FilterList as FilterIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Terminal as TerminalIcon,
  Edit as EditIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckboxIcon,
  Clear as ClearIcon,
  Search as SearchIcon,
  FormatListBulleted as FormatListBulletedIcon,
  Source as SourceIcon,
} from '@mui/icons-material';
import electronPrefs from '../utils/core/electronPrefs.js';
import { BumpathCore } from '../utils/bumpath/index.js';

// Memoized TextField component to prevent parent re-renders on every keystroke
const MemoizedPrefixInput = React.memo(({
  value,
  onChange,
  sx,
  ...otherProps
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const valueRef = useRef(value || '');
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
    valueRef.current = value || '';
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    valueRef.current = newValue;

    // Debounce the onChange call to prevent parent re-renders on every keystroke
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Call onChange after user stops typing
    debounceTimeoutRef.current = setTimeout(() => {
      onChange(e);
    }, 100);
  };

  const handleBlur = () => {
    // Clear any pending debounced call
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    // Sync with parent on blur
    if (valueRef.current !== value) {
      const syntheticEvent = {
        target: { value: valueRef.current }
      };
      onChange(syntheticEvent);
    }
  };

  const handleKeyPress = (e) => {
    // Also sync on Enter
    if (e.key === 'Enter') {
      // Clear any pending debounced call
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      handleBlur();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <TextField
      size="small"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyPress={handleKeyPress}
      sx={sx}
      {...otherProps}
    />
  );
});

// Memoized TextField component for BIN filter
const MemoizedBinFilterInput = React.memo(({
  value,
  onChange,
  sx,
  ...otherProps
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const valueRef = useRef(value || '');
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
    valueRef.current = value || '';
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    valueRef.current = newValue;

    // Debounce the onChange call to prevent parent re-renders on every keystroke
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Call onChange after user stops typing
    debounceTimeoutRef.current = setTimeout(() => {
      onChange(e);
    }, 150);
  };

  const handleBlur = () => {
    // Clear any pending debounced call
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    // Sync with parent on blur
    if (valueRef.current !== value) {
      const syntheticEvent = {
        target: { value: valueRef.current }
      };
      onChange(syntheticEvent);
    }
  };

  const handleKeyPress = (e) => {
    // Also sync on Enter
    if (e.key === 'Enter') {
      // Clear any pending debounced call
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      handleBlur();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <TextField
      size="small"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyPress={handleKeyPress}
      sx={sx}
      {...otherProps}
    />
  );
});

const Bumpath = () => {
  // Create bumpath core instance
  const bumpathCoreRef = useRef(new BumpathCore());

  const [sourceDirs, setSourceDirs] = useState([]);
  const [sourceFiles, setSourceFiles] = useState({});
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
  const [selectedBins, setSelectedBins] = useState(new Set());
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [expandedFilePaths, setExpandedFilePaths] = useState(new Set()); // Track expanded file paths (for missing file headers)
  const [backendRunning, setBackendRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [showCelestiaGuide, setShowCelestiaGuide] = useState(false);
  const [celestiaStepIndex, setCelestiaStepIndex] = useState(0);
  const [simulatedBinSelected, setSimulatedBinSelected] = useState(false);
  const [binListHighlightRect, setBinListHighlightRect] = useState(null);
  const [settingsAutoOpened, setSettingsAutoOpened] = useState(false);

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

  // Clear console logs
  const clearLogs = useCallback(() => {
    setConsoleLogs([]);
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

  // Backend is no longer used - we use native JS implementation
  useEffect(() => {
    // Set to false since we're using native JS, not Python backend
    setBackendRunning(false);
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
  const handlePrefixTextChange = useCallback((e) => {
    setPrefixText(e.target.value);
  }, []);

  // Save settings
  const saveSettings = async (key, value) => {
    try {
      await electronPrefs.set(key, value);
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  // API call helper
  // Native JavaScript implementation - no API calls needed
  const apiCall = async (endpoint, data = {}) => {
    const core = bumpathCoreRef.current;

    try {
      switch (endpoint) {
        case 'add-source-dirs':
          const result = await core.addSourceDirs(data.sourceDirs || []);
          return {
            success: true,
            source_files: result.source_files,
            source_bins: result.source_bins
          };

        case 'update-bin-selection':
          core.updateBinSelection(data.binSelections || {});
          return { success: true };

        case 'scan':
          const scanned = await core.scan(data.hashtablesPath);
          return {
            success: true,
            data: scanned
          };

        case 'apply-prefix':
          core.applyPrefix(data.entryHashes || [], data.prefix || 'bum');
          return {
            success: true,
            data: core._convertScannedData()
          };

        case 'process':
          const processResult = await core.process(
            data.outputPath,
            data.ignoreMissing || false,
            data.combineLinked || false,
            (count, message) => {
              addLog(message);
            }
          );
          return {
            success: true,
            ...processResult
          };

        case 'reset':
          core.reset();
          return { success: true };

        default:
          throw new Error(`Unknown endpoint: ${endpoint}`);
      }
    } catch (error) {
      console.error(`Bumpath operation ${endpoint} failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  };

  // Handle source directory selection
  const handleSelectSourceDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result && !sourceDirs.includes(result)) {
        const newDirs = [...sourceDirs, result];
        setSourceDirs(newDirs);

        // Automatically discover BIN files when adding source directories
        try {
          const response = await apiCall('add-source-dirs', { sourceDirs: newDirs });
          if (response.success) {
            setSourceFiles(response.source_files || {});
            setSourceBins(response.source_bins || {});
            setError(null);
            const binCount = response.source_bins ? Object.keys(response.source_bins).length : 0;
            setSuccess(`Added source directory and discovered ${binCount} BIN files`);
          } else {
            setError(response.error || 'Failed to discover BIN files');
          }
        } catch (apiError) {
          // If backend is not running, just add the directory without discovering BINs
          setError(null);
          setSuccess(`Added source directory: ${result}`);
        }
      }
    } catch (error) {
      setError('Failed to select directory: ' + error.message);
    }
  }, [sourceDirs]);

  // Hash directory is now automatically managed (integrated system)

  // Remove source directory
  const handleRemoveSourceDir = useCallback((index) => {
    const newDirs = sourceDirs.filter((_, i) => i !== index);
    setSourceDirs(newDirs);
    if (newDirs.length === 0) {
      setSourceFiles({});
      setSourceBins({});
      setScannedData(null);
      setSelectedEntries(new Set());
    }
  }, [sourceDirs]);

  // Handle bin selection
  const handleBinSelect = useCallback(async (unifyPath, selected) => {
    const newSelections = { ...(sourceBins || {}) };
    newSelections[unifyPath] = { ...newSelections[unifyPath], selected };
    setSourceBins(newSelections);

    // Update backend
    const binSelections = {};
    Object.entries(newSelections).forEach(([path, data]) => {
      binSelections[path] = data.selected;
    });

    try {
      await apiCall('update-bin-selection', { binSelections });

      // Automatically scan when BIN files are selected (like LtMAO)
      if (selected && hashesPath) {
        const selectedBins = Object.values(newSelections).filter(bin => bin.selected);
        if (selectedBins.length > 0) {
          setIsScanning(true);
          setError(null);
          setScannedData(null);

          try {
            const result = await apiCall('scan', {
              hashesPath,
              ritobinPath: electronPrefs.obj.RitoBinPath || ''
            });
            if (result.success) {
              setScannedData(result.data);
              setAppliedPrefixes(new Map()); // Clear applied prefixes on new scan
              setSuccess(`Scan completed: Found ${Object.keys(result.data.entries).length} entries`);
            } else {
              setError(result.error || 'Scan failed');
            }
          } catch (scanError) {
            setError('Scan failed: ' + scanError.message);
          } finally {
            setIsScanning(false);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update bin selection:', error);
    }
  }, [sourceBins, hashesPath]);


  // Apply prefix to selected entries
  const handleApplyPrefix = useCallback(async () => {
    if (selectedEntries.size === 0) {
      setError('Please select at least one entry');
      return;
    }

    if (!prefixText.trim()) {
      setError('Please enter a prefix');
      return;
    }

    try {
      const result = await apiCall('apply-prefix', {
        entryHashes: Array.from(selectedEntries),
        prefix: debouncedPrefixText.trim()
      });

      if (result.success) {
        // The apply-prefix endpoint returns a different structure than scan
        // Preserve existing scanned data and just update the prefixes to avoid losing entry names
        if (scannedData) {
          const updatedData = {
            ...scannedData,
            entries: { ...scannedData.entries }
          };

          // Update prefixes for selected entries (preserve all other data including type_name)
          selectedEntries.forEach(entryHash => {
            if (updatedData.entries[entryHash]) {
              updatedData.entries[entryHash] = {
                ...updatedData.entries[entryHash],
                prefix: debouncedPrefixText.trim()
                // type_name and other fields are preserved via spread operator
              };
            }
          });

          setScannedData(updatedData);
        } else {
          // If no scanned data exists, try to convert backend response
          if (result.data.entries && result.data.entry_names && result.data.entry_prefixes) {
            const convertedData = {
              entries: {},
              all_bins: {}
            };

            for (const [entryHash, entryData] of Object.entries(result.data.entries)) {
              if (entryHash === 'All_BINs') continue;

              const referenced_files = [];
              if (typeof entryData === 'object' && entryData !== null) {
                for (const [unify_file, fileData] of Object.entries(entryData)) {
                  if (Array.isArray(fileData) && fileData.length === 2) {
                    const [exists, path] = fileData;
                    referenced_files.push({
                      path: path,
                      exists: exists,
                      unify_file: unify_file
                    });
                  }
                }
              }

              convertedData.entries[entryHash] = {
                name: result.data.entry_names[entryHash] || scannedData?.entries[entryHash]?.name || `Entry_${entryHash}`,
                type_name: scannedData?.entries[entryHash]?.type_name,  // Preserve type_name from existing data
                prefix: result.data.entry_prefixes[entryHash] || scannedData?.entries[entryHash]?.prefix || 'bum',
                referenced_files: referenced_files.length > 0 ? referenced_files : (scannedData?.entries[entryHash]?.referenced_files || [])
              };
            }

            setScannedData(convertedData);
          }
        }

        // Update UI prefix tracking
        const newAppliedPrefixes = new Map(appliedPrefixes);
        selectedEntries.forEach(entryHash => {
          newAppliedPrefixes.set(entryHash, debouncedPrefixText.trim());
        });
        setAppliedPrefixes(newAppliedPrefixes);

        setSuccess(`Applied prefix "${debouncedPrefixText}" to ${selectedEntries.size} entries`);
        console.log('Applied prefix result:', result.data); // Debug log
      } else {
        setError(result.error || 'Failed to apply prefix');
      }
    } catch (error) {
      setError('Failed to apply prefix: ' + error.message);
    }
  }, [selectedEntries, debouncedPrefixText, scannedData, appliedPrefixes]);

  // Process (bum) the files
  const handleProcess = useCallback(async () => {
    if (!scannedData) {
      setError('Please scan first');
      addLog('❌ Error: Please scan first');
      return;
    }

    if (!outputPath) {
      setError('Please select an output directory');
      addLog('❌ Error: Please select an output directory');
      return;
    }

    setIsProcessing(true);
    setError(null);
    addLog('🚀 Starting bumpath process...');
    addLog(`📁 Output directory: ${outputPath}`);
    addLog(`🔗 Combine linked: ${combineLinked}`);
    addLog(`⚠️ Ignore missing: ${ignoreMissing}`);

    try {
      const processData = {
        outputPath,
        ignoreMissing,
        combineLinked
      };
      console.log('📤 Sending process request with data:', processData);
      const result = await apiCall('process', processData);

      if (result.success) {
        const message = `Processing completed: ${result.total_files || result.processedFiles || 0} files processed`;
        setSuccess(message);
        addLog(`🎉 ${message}`);
        addLog(`📁 Output: ${result.output_dir || outputPath}`);

        // Check for warnings about skipped files (e.g., path length issues)
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            addLog(`⚠️ ${warning}`);
          });
        }

        // Fetch backend logs to show detailed processing
        await fetchLogs();

        // Clear frontend state after successful processing
        addLog('🧹 Clearing state after successful processing...');
        setScannedData(null);
        setSelectedEntries(new Set());
        setExpandedEntries(new Set());
        setAppliedPrefixes(new Map());
        // Note: We keep sourceDirs, sourceFiles, sourceBins, and outputPath for user convenience
        // The backend state is already cleared by the backend reset call
      } else {
        const errorMsg = result.error || 'Processing failed';
        setError(errorMsg);
        addLog(`❌ ${errorMsg}`);

        // If error mentions path length or malformed paths, provide helpful message
        if (errorMsg.includes('Malformed') || errorMsg.includes('path') || errorMsg.includes('skins_skin')) {
          addLog('💡 Tip: This may be caused by Windows path length limits (260 chars). Try using shorter folder names or moving files closer to the root drive.');
        }
      }
    } catch (error) {
      const errorMsg = 'Processing failed: ' + error.message;
      setError(errorMsg);
      addLog(`❌ ${errorMsg}`);

      // Check if it's a path-related error
      if (error.message.includes('path') || error.message.includes('ENAMETOOLONG')) {
        addLog('💡 Tip: Windows path length limit (260 chars) may be causing this. Try shorter folder names or move files closer to root.');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [scannedData, outputPath, ignoreMissing, combineLinked, addLog]);

  // Select output directory
  const handleSelectOutputDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setOutputPath(result);
      }
    } catch (error) {
      setError('Failed to select output directory: ' + error.message);
    }
  }, []);

  // Handle entry selection
  const handleEntrySelect = useCallback((entryHash) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryHash)) {
        newSet.delete(entryHash);
      } else {
        newSet.add(entryHash);
      }
      return newSet;
    });
  }, []);

  // Handle entry expansion
  const handleEntryExpand = useCallback((entryHash) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryHash)) {
        newSet.delete(entryHash);
      } else {
        newSet.add(entryHash);
      }
      return newSet;
    });
  }, []);

  // Handle file path expansion (for missing file headers)
  const handleFilePathExpand = useCallback((filePath) => {
    setExpandedFilePaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  }, []);

  // Select all entries
  const handleSelectAll = useCallback(() => {
    if (scannedData) {
      const allEntries = Object.keys(scannedData.entries).filter(hash =>
        scannedData.entries[hash].prefix !== 'Uneditable'
      );
      setSelectedEntries(new Set(allEntries));
    }
  }, [scannedData]);

  // Deselect all entries
  const handleDeselectAll = useCallback(() => {
    setSelectedEntries(new Set());
  }, []);

  // Reset everything
  const handleReset = useCallback(async () => {
    try {
      await apiCall('reset');
      bumpathCoreRef.current.reset();
      setSourceDirs([]);
      setSourceFiles({});
      setSourceBins({});
      setScannedData(null);
      setSelectedEntries(new Set());
      setExpandedEntries(new Set());
      setError(null);
      setSuccess(null);
    } catch (error) {
      setError('Failed to reset: ' + error.message);
    }
  }, []);

  // Celestial minimalistic style
  const panelStyle = {
    background: 'transparent', // Removed background
    border: 'none', // Removed border
    boxShadow: 'none', // Removed shadow
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    borderRadius: 0,
  };

  // Celestial minimalistic button style
  const celestialButtonStyle = {
    background: 'var(--bg-2)',
    border: '1px solid var(--accent-muted)',
    color: 'var(--text)',
    borderRadius: '5px',
    transition: 'all 200ms ease',
    textTransform: 'none',
    fontFamily: 'JetBrains Mono, monospace',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    '&:hover': {
      background: 'var(--surface-2)',
      borderColor: 'var(--accent)',
      boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)'
    },
    '&:disabled': {
      background: 'var(--bg-2)',
      borderColor: 'var(--text-2)',
      color: 'var(--text-2)',
      opacity: 0.6,
      cursor: 'not-allowed'
    },
  };

  // Filter bins based on search (exclude animation BINs from display)
  const filteredBins = Object.entries(sourceBins || {}).filter(([unifyPath, data]) => {
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
    const filterLower = (binFilter || '').toLowerCase();
    return pathLower.includes(filterLower);
  });

  // Helper function to clean path by removing prefix and normalizing
  const cleanPath = useCallback((path) => {
    if (!path) return path;
    // Remove any prefix at the start (e.g., "bum/Characters/..." -> "Characters/...")
    let cleaned = path.replace(/^[^\/\\]+\/(assets|data|characters|particles|materials)/i, '$1');
    // Remove leading 'assets/' or 'data/' if present for cleaner display
    cleaned = cleaned.replace(/^(assets|data)[\/\\]/i, '');
    // Normalize to lowercase for consistency
    return cleaned.toLowerCase();
  }, []);

  // Helper function to get display name for entry
  // Python: entry_name is the unhashed entry name (filepath like "Characters/Aatrox/Skins/Skin0/Particles/Aatrox_Base_W_mis")
  // Python: type_name is the entry type (like "VFXSystemDefinitionData")
  const getEntryDisplayName = useCallback((entryHash, entryData) => {
    // Truncate long names (like aatrox_skins_skin0_skins_skin1...)
    const truncateName = (str, maxLength = 60) => {
      if (!str) return '';
      if (str.length <= maxLength) return str;
      return str.substring(0, maxLength - 3) + '...';
    };

    // Python: entry_name is the entry name (the filepath like "Characters/Aatrox/Skins/Skin0/Particles/Aatrox_Base_P_Ready")
    const name = entryData.name || '';

    // If name exists and is not "Entry_hash", use it directly (it's already unhashed)
    if (name && !name.startsWith('Entry_')) {
      return truncateName(name);
    }

    // If name is "Entry_hash", we need to find the unhashed entry name from referenced files
    // The unhashed entry name is the missing file path that is NOT a texture (.tex file)
    if (entryData.referenced_files && entryData.referenced_files.length > 0) {
      // Find the missing file that is NOT a texture path (.tex)
      // This should be the unhashed entry name (like "Characters/Aatrox/Skins/Skin0/Particles/Aatrox_Base_P_Ready")
      const unhashedName = entryData.referenced_files.find(file =>
        !file.exists &&
        file.path &&
        !file.path.toLowerCase().endsWith('.tex')
      );

      if (unhashedName && unhashedName.path) {
        return truncateName(unhashedName.path);
      }

      // Fallback: find any missing file
      const missingFile = entryData.referenced_files.find(file => !file.exists && file.path);

      if (missingFile && missingFile.path) {
        return truncateName(missingFile.path);
      }
    }

    // Final fallback to entry hash
    return truncateName(name || `Entry_${entryHash}` || 'Unknown Entry');
  }, []);

  // Filter scanned entries based on missing files only
  const filteredEntries = scannedData ? Object.entries(scannedData.entries).filter(([hash, data]) => {
    if (!showMissingOnly) return true;
    return data.referenced_files.some(file => !file.exists);
  }) : [];

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
    }}>

      <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <Box sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          minHeight: '60px'
        }}>
          <Button
            startIcon={<FolderIcon />}
            onClick={handleSelectSourceDir}
            sx={{
              ...celestialButtonStyle,
              fontSize: '0.8rem',
              height: '34px',
              padding: '0 12px',
              borderColor: '#ecb96a !important',
              color: '#ecb96a !important',
              '&:hover': {
                ...celestialButtonStyle['&:hover'],
                borderColor: '#d4a259 !important',
                color: '#d4a259 !important',
                boxShadow: '0 0 15px color-mix(in srgb, #ecb96a, transparent 60%)'
              }
            }}
          >
            Add Source Folders
          </Button>


          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              startIcon={<CheckBoxIcon />}
              onClick={handleSelectAll}
              disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
              data-bumpath-select-all
              sx={{
                ...celestialButtonStyle,
                fontSize: '0.8rem',
                height: '34px',
                padding: '0 12px',
                borderColor: '#10b981 !important',
                color: '#10b981 !important',
                '&:hover': {
                  ...celestialButtonStyle['&:hover'],
                  borderColor: '#059669 !important',
                  color: '#059669 !important',
                  boxShadow: '0 0 15px color-mix(in srgb, #10b981, transparent 60%)'
                }
              }}
            >
              Select All
            </Button>

            <Button
              startIcon={<ClearIcon />}
              onClick={handleDeselectAll}
              disabled={!scannedData || selectedEntries.size === 0}
              sx={{
                ...celestialButtonStyle,
                fontSize: '0.8rem',
                height: '34px',
                padding: '0 12px',
                borderColor: '#ef4444 !important',
                color: '#ef4444 !important',
                '&:hover': {
                  ...celestialButtonStyle['&:hover'],
                  borderColor: '#dc2626 !important',
                  color: '#dc2626 !important',
                  boxShadow: '0 0 15px color-mix(in srgb, #ef4444, transparent 60%)'
                }
              }}
            >
              Deselect All
            </Button>
          </Box>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showMissingOnly}
                onChange={(e) => setShowMissingOnly(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent)' },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{
                color: 'var(--accent2)',
                fontSize: '0.7rem',
                fontWeight: '500'
              }}>
                🔴 Show Missing Files Only
              </Typography>
            }
          />
        </Box>

        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Left Panel - Source Directories and BINs */}
          <Box sx={{
            width: '350px',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Source BINs */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-bumpath-bin-list>
              <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormatListBulletedIcon sx={{
                      color: 'var(--accent)',
                      fontSize: '1.2rem'
                    }} />
                    <Typography variant="h6" sx={{
                      color: 'var(--accent)',
                      fontSize: '1rem'
                    }}>
                      Source BINs:
                    </Typography>
                  </Box>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <Typography variant="body2" sx={{
                      color: '#8b5cf6',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      {Object.values(sourceBins || {}).filter(bin => bin.selected).length} / {Object.keys(sourceBins || {}).length} selected
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MemoizedBinFilterInput
                    placeholder="Filter BIN files..."
                    value={binFilter}
                    onChange={(e) => setBinFilter(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{
                            color: 'var(--accent2)',
                            fontSize: '1rem'
                          }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': {
                        color: 'var(--text)',
                        fontSize: '0.8rem',
                        backgroundColor: 'var(--bg-2)',
                        borderRadius: '6px',
                        '& fieldset': {
                          borderColor: 'var(--glass-border)',
                          borderWidth: '1px'
                        },
                        '&:hover fieldset': {
                          borderColor: 'var(--accent-muted)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: 'var(--accent)',
                        },
                      },
                      '& .MuiInputBase-input': {
                        fontSize: '0.8rem',
                        fontFamily: 'JetBrains Mono, monospace'
                      }
                    }}
                  />
                  {binFilter && (
                    <Button
                      size="small"
                      onClick={() => setBinFilter('')}
                      sx={{
                        minWidth: 'auto',
                        px: 1,
                        py: 0.5,
                        color: 'var(--accent2)',
                        '&:hover': { color: 'var(--accent)' }
                      }}
                    >
                      ✕
                    </Button>
                  )}
                </Box>
                {binFilter && (
                  <Typography variant="body2" sx={{
                    color: 'var(--accent2)',
                    fontSize: '0.7rem',
                    mt: 0.5
                  }}>
                    Showing {filteredBins.length} of {Object.keys(sourceBins || {}).length} BINs
                  </Typography>
                )}
              </Box>

              <Box sx={{
                flex: 1,
                overflow: 'auto',
                p: 0.5,
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  background: 'var(--bg-2)',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'var(--accent2)',
                  borderRadius: '4px',
                  '&:hover': {
                    background: 'var(--accent)',
                  },
                },
                minHeight: '200px'
              }}>
                <List dense sx={{ py: 0 }}>
                  {filteredBins.map(([unifyPath, data], index) => {
                    const isEven = index % 2 === 0;
                    const pathToUse = data?.rel_path || data?.path || unifyPath || '';
                    const fileName = pathToUse.split('/').pop() || pathToUse.split('\\').pop() || pathToUse;
                    const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : '';
                    const pathWithoutFile = pathToUse.replace(fileName, '');

                    return (
                      <ListItem
                        key={unifyPath}
                        sx={{
                          px: 1,
                          py: 0.75,
                          minHeight: 'auto',
                          backgroundColor: 'transparent',
                          borderRadius: '4px',
                          mb: 0.25,
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          },
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <Checkbox
                          checked={data.selected}
                          onChange={(e) => handleBinSelect(unifyPath, e.target.checked)}
                          sx={{
                            color: 'var(--text-2)',
                            '&.Mui-checked': {
                              color: 'var(--accent)',
                            },
                            p: 0.25,
                            mr: 1,
                            '& .MuiSvgIcon-root': {
                              fontSize: '1.1rem'
                            },
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <Typography variant="body2" sx={{
                              color: 'var(--text-2)',
                              fontSize: '0.65rem',
                              opacity: 0.7,
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {pathWithoutFile}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{
                              color: 'var(--text)',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {fileName.replace(`.${fileExtension}`, '')}
                            </Typography>
                            {fileExtension && (
                              <Typography variant="body2" sx={{
                                color: 'var(--accent)',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                fontFamily: 'JetBrains Mono, monospace',
                                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                px: 0.5,
                                py: 0.25,
                                borderRadius: '3px'
                              }}>
                                .{fileExtension}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            </Box>
          </Box>

          {/* Right Panel - Scanned Tree */}
          <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
              {isScanning ? (
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <CircularProgress sx={{ color: 'var(--accent)' }} />
                  <Typography variant="body2" sx={{ color: 'var(--accent2)' }}>
                    Scanning BIN files...
                  </Typography>
                </Box>
              ) : scannedData ? (
                <List dense>
                  {filteredEntries.map(([entryHash, entryData]) => (
                    <ListItem
                      key={entryHash}
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.03)' }
                      }}
                    >
                      <Box sx={{ width: '100%' }}>
                        {/* Entry Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEntryExpand(entryHash)}
                            sx={{
                              color: 'var(--text-2)',
                              '&:hover': {
                                color: 'var(--accent)',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)'
                              }
                            }}
                          >
                            {expandedEntries.has(entryHash) ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                          </IconButton>

                          <Checkbox
                            checked={selectedEntries.has(entryHash)}
                            onChange={() => handleEntrySelect(entryHash)}
                            disabled={entryData.prefix === 'Uneditable'}
                            sx={{
                              color: 'var(--text-2)',
                              '&.Mui-checked': {
                                color: 'var(--accent)',
                              },
                            }}
                          />

                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{
                                color: 'var(--text)',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                fontFamily: 'JetBrains Mono, monospace',
                                flex: '1 1 auto',
                                minWidth: 0
                              }}>
                                {getEntryDisplayName(entryHash, entryData)}
                              </Typography>
                              <Box sx={{
                                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.2)',
                                borderRadius: '3px',
                                px: 0.5,
                                py: 0.25,
                                display: 'inline-flex',
                                alignItems: 'center',
                                flex: '0 0 auto'
                              }}>
                                <Typography variant="body2" sx={{
                                  color: 'var(--accent)',
                                  fontSize: '0.65rem',
                                  fontWeight: '600',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {appliedPrefixes.get(entryHash) || entryData.prefix || 'No Prefix'}
                                </Typography>
                              </Box>
                            </Box>
                            {/* Only show Hash when expanded - Python: type_name is the entry type (VFXSystemDefinitionData), hash is entryHash */}
                            {expandedEntries.has(entryHash) && (
                              <Typography variant="body2" sx={{
                                color: 'var(--text-2)',
                                fontSize: '0.65rem',
                                fontFamily: 'JetBrains Mono, monospace',
                                opacity: 0.7,
                                display: 'block',
                                width: '100%'
                              }}>
                                {entryData.type_name ? `${entryData.type_name} | Hash: ${entryHash}` : `Hash: ${entryHash}`}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Referenced Files */}
                        {expandedEntries.has(entryHash) && (
                          <Box sx={{ ml: 4 }}>
                            {(() => {
                              // Get the entry name to filter it out from the list
                              let entryName = entryData.name || '';
                              if (entryName.startsWith('Entry_') && entryData.referenced_files && entryData.referenced_files.length > 0) {
                                // Find the missing file that is NOT a texture path (.tex) - this is the unhashed entry name
                                const unhashedName = entryData.referenced_files.find(file =>
                                  !file.exists &&
                                  file.path &&
                                  !file.path.toLowerCase().endsWith('.tex')
                                );
                                if (unhashedName && unhashedName.path) {
                                  entryName = unhashedName.path;
                                }
                              }

                              // Filter out the entry name from referenced files
                              const filteredFiles = entryData.referenced_files.filter(file =>
                                file.path && file.path !== entryName
                              );

                              // Group files: missing files become headers, texture files are children
                              const missingFiles = new Map(); // Map of missing file path -> array of texture files that reference it
                              const existingFiles = []; // Regular existing files

                              filteredFiles.forEach((file) => {
                                if (!file.exists) {
                                  // Missing file - check if it's a texture path or should be a header
                                  const isTexture = file.path.toLowerCase().endsWith('.tex');
                                  if (isTexture) {
                                    // Texture files that are missing - these should be headers
                                    if (!missingFiles.has(file.path)) {
                                      missingFiles.set(file.path, []);
                                    }
                                  } else {
                                    // Non-texture missing file - this should be a header
                                    if (!missingFiles.has(file.path)) {
                                      missingFiles.set(file.path, []);
                                    }
                                  }
                                } else {
                                  // Existing file - check if it's a texture that should be grouped under a missing file
                                  const isTexture = file.path.toLowerCase().endsWith('.tex');
                                  if (isTexture) {
                                    // Find if this texture references a missing file path
                                    // Check if any missing file path is a parent/related to this texture
                                    let grouped = false;
                                    for (const [missingPath] of missingFiles) {
                                      // If the texture path contains the missing path or vice versa, group them
                                      const texturePathLower = file.path.toLowerCase();
                                      const missingPathLower = missingPath.toLowerCase();
                                      if (texturePathLower.includes(missingPathLower) || missingPathLower.includes(texturePathLower)) {
                                        missingFiles.get(missingPath).push(file);
                                        grouped = true;
                                        break;
                                      }
                                    }
                                    if (!grouped) {
                                      existingFiles.push(file);
                                    }
                                  } else {
                                    existingFiles.push(file);
                                  }
                                }
                              });

                              // Render missing files as collapsible headers
                              const result = [];

                              // First, render missing files as headers (red dots)
                              missingFiles.forEach((textureFiles, missingPath) => {
                                const isExpanded = expandedFilePaths.has(missingPath);
                                result.push(
                                  <Box key={`missing-${missingPath}`} sx={{ mb: 0.5 }}>
                                    <Box sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      cursor: 'pointer',
                                      opacity: showMissingOnly ? 1 : 1,
                                      '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        borderRadius: '4px'
                                      },
                                      py: 0.25,
                                      px: 0.5
                                    }}
                                      onClick={() => handleFilePathExpand(missingPath)}
                                    >
                                      <IconButton
                                        size="small"
                                        sx={{
                                          color: 'var(--text-2)',
                                          p: 0.25,
                                          '&:hover': {
                                            color: 'var(--accent)',
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)'
                                          }
                                        }}
                                      >
                                        {isExpanded ? <ExpandMoreIcon sx={{ fontSize: '0.9rem' }} /> : <ChevronRightIcon sx={{ fontSize: '0.9rem' }} />}
                                      </IconButton>
                                      <Box sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: '#f87171',
                                        flexShrink: 0
                                      }} />
                                      <Typography variant="body2" sx={{
                                        color: 'var(--text)',
                                        fontSize: '0.7rem',
                                        fontWeight: '600',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        wordBreak: 'break-all'
                                      }}>
                                        {missingPath}
                                      </Typography>
                                    </Box>
                                    {/* Show texture files under missing file header when expanded */}
                                    {isExpanded && textureFiles.length > 0 && (
                                      <Box sx={{ ml: 4, mt: 0.25 }}>
                                        {textureFiles.map((textureFile, texIndex) => (
                                          <Box key={`tex-${texIndex}`} sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            mb: 0.5,
                                            opacity: showMissingOnly && textureFile.exists ? 0.3 : 1
                                          }}>
                                            <Box sx={{
                                              width: 8,
                                              height: 8,
                                              borderRadius: '50%',
                                              backgroundColor: textureFile.exists ? '#4ade80' : '#f87171',
                                              flexShrink: 0
                                            }} />
                                            <Typography variant="body2" sx={{
                                              color: 'var(--text-2)',
                                              fontSize: '0.7rem',
                                              wordBreak: 'break-all'
                                            }}>
                                              {textureFile.path}
                                            </Typography>
                                          </Box>
                                        ))}
                                      </Box>
                                    )}
                                  </Box>
                                );
                              });

                              // Then render existing files as regular items (green dots)
                              existingFiles.forEach((file, index) => (
                                result.push(
                                  <Box key={`existing-${index}`} sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    mb: 0.5,
                                    opacity: showMissingOnly && file.exists ? 0.3 : 1
                                  }}>
                                    <Box sx={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      backgroundColor: file.exists ? '#4ade80' : '#f87171',
                                      flexShrink: 0
                                    }} />
                                    <Typography variant="body2" sx={{
                                      color: 'var(--text-2)',
                                      fontSize: '0.7rem',
                                      wordBreak: 'break-all'
                                    }}>
                                      {file.path}
                                    </Typography>
                                  </Box>
                                )
                              ));

                              return result;
                            })()}
                          </Box>
                        )}
                      </Box>
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <Typography variant="h6" sx={{ color: 'var(--text-2)' }}>
                    No scanned data
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--text-2)', textAlign: 'center' }}>
                    Select BIN files and click "Scan BIN Files" to analyze them
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Bottom Controls */}
        <Box sx={{
          p: 1.5,
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          minHeight: '70px'
        }}>
          <Button
            startIcon={<CloseIcon />}
            onClick={handleReset}
            sx={{
              ...celestialButtonStyle,
              fontSize: '0.8rem',
              height: '34px',
              padding: '0 12px',
              borderColor: '#ef4444 !important',
              color: '#ef4444 !important',
              '&:hover': {
                ...celestialButtonStyle['&:hover'],
                borderColor: '#dc2626 !important',
                color: '#dc2626 !important',
                boxShadow: '0 0 15px color-mix(in srgb, #ef4444, transparent 60%)'
              }
            }}
          >
            Reset
          </Button>


          <MemoizedPrefixInput
            value={prefixText}
            onChange={handlePrefixTextChange}
            data-bumpath-prefix
            sx={{
              width: '100px',
              '& .MuiOutlinedInput-root': {
                color: 'var(--text)',
                fontSize: '0.8rem',
                backgroundColor: 'var(--bg-2)',
                borderRadius: '6px',
                '& fieldset': {
                  borderColor: 'var(--glass-border)',
                  borderWidth: '1px'
                },
                '&:hover fieldset': {
                  borderColor: 'var(--accent-muted)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'var(--accent)',
                },
              },
              '& .MuiInputBase-input': {
                fontSize: '0.8rem',
                textAlign: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: '600'
              }
            }}
          />


          <Button
            startIcon={<EditIcon />}
            onClick={handleApplyPrefix}
            disabled={selectedEntries.size === 0 || !debouncedPrefixText.trim()}
            sx={{
              ...celestialButtonStyle,
              fontSize: '0.8rem',
              height: '34px',
              padding: '0 12px',
              borderColor: '#8b5cf6 !important',
              color: '#8b5cf6 !important',
              '&:hover': {
                ...celestialButtonStyle['&:hover'],
                borderColor: '#7c3aed !important',
                color: '#7c3aed !important',
                boxShadow: '0 0 15px color-mix(in srgb, #8b5cf6, transparent 60%)'
              }
            }}
          >
            Apply Prefix
          </Button>

          <Button
            startIcon={<FolderIcon />}
            onClick={handleSelectOutputDir}
            data-bumpath-output
            color="inherit"
            sx={{
              ...celestialButtonStyle,
              fontSize: '0.8rem',
              height: '34px',
              padding: '0 12px',
              borderColor: '#06b6d4 !important',
              color: '#06b6d4 !important',
              '&:hover': {
                background: 'var(--surface-2)',
                borderColor: '#0891b2 !important',
                color: '#0891b2 !important',
                boxShadow: '0 0 15px color-mix(in srgb, #06b6d4, transparent 60%)'
              }
            }}
          >
            Select Output
          </Button>

          <Button
            startIcon={isProcessing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            onClick={handleProcess}
            disabled={isProcessing || !scannedData || !outputPath}
            data-bumpath-process
            sx={{
              ...celestialButtonStyle,
              fontSize: '0.8rem',
              height: '34px',
              padding: '0 12px',
              minWidth: '120px',
              fontWeight: 700,
              borderColor: '#f97316 !important',
              color: '#f97316 !important',
              boxShadow: '0 0 0 2px color-mix(in srgb, #f97316, transparent 70%), 0 2px 4px rgba(0,0,0,0.2)',
              '&:hover': {
                ...celestialButtonStyle['&:hover'],
                borderColor: '#ea580c !important',
                color: '#ea580c !important',
                boxShadow: '0 0 0 2px color-mix(in srgb, #f97316, transparent 50%), 0 0 15px color-mix(in srgb, #f97316, transparent 60%)'
              },
              '&:disabled': {
                ...celestialButtonStyle['&:disabled'],
                boxShadow: 'none'
              }
            }}
          >
            {isProcessing ? 'Processing...' : 'Bum'}
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
            <Button
              onClick={() => setConsoleOpen(true)}
              sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '36px', minWidth: '40px', width: '40px', px: 0 }}
            >
              <TerminalIcon />
            </Button>

            <Button
              onClick={() => {
                setSettingsExpanded(!settingsExpanded);
                // Reset auto-opened flag when manually toggled
                setSettingsAutoOpened(false);
              }}
              data-bumpath-settings
              sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '36px', minWidth: '40px', width: '40px', px: 0 }}
            >
              <SettingsIcon />
            </Button>
          </Box>
        </Box>

        {/* Collapsible Settings Panel */}
        <Box
          data-bumpath-settings-panel
          sx={{
            ...panelStyle,
            borderTop: '1px solid var(--glass-border)',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            maxHeight: settingsExpanded ? '160px' : '0px',
            opacity: settingsExpanded ? 1 : 0
          }}>
          <Box sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            flexWrap: 'wrap'
          }}>
            <FormControlLabel
              control={
                <Switch
                  checked={ignoreMissing}
                  onChange={(e) => {
                    setIgnoreMissing(e.target.checked);
                    saveSettings('BumpathIgnoreMissing', e.target.checked);
                  }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#06b6d4',
                      '&:hover': {
                        backgroundColor: 'rgba(6, 182, 212, 0.1)'
                      }
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#06b6d4',
                      opacity: 0.8
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(107, 114, 128, 0.3)',
                      border: '1px solid rgba(107, 114, 128, 0.2)'
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 114, 128, 0.2)',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{
                  color: 'var(--accent2)',
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  🚫 Ignore Missing Files
                </Typography>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={combineLinked}
                  onChange={(e) => {
                    setCombineLinked(e.target.checked);
                    saveSettings('BumpathCombineLinked', e.target.checked);
                  }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#06b6d4',
                      '&:hover': {
                        backgroundColor: 'rgba(6, 182, 212, 0.1)'
                      }
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#06b6d4',
                      opacity: 0.8
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(107, 114, 128, 0.3)',
                      border: '1px solid rgba(107, 114, 128, 0.2)'
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 114, 128, 0.2)',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{
                  color: 'var(--accent2)',
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  🧬 Combine Linked BINs to Source BINs
                </Typography>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={hideDataFolderBins}
                  onChange={(e) => {
                    setHideDataFolderBins(e.target.checked);
                    saveSettings('BumpathHideDataFolderBins', e.target.checked);
                  }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#06b6d4',
                      '&:hover': {
                        backgroundColor: 'rgba(6, 182, 212, 0.1)'
                      }
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#06b6d4',
                      opacity: 0.8
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(107, 114, 128, 0.3)',
                      border: '1px solid rgba(107, 114, 128, 0.2)'
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 114, 128, 0.2)',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{
                  color: 'var(--accent2)',
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  Hide path in bin list
                </Typography>
              }
            />
          </Box>
        </Box>

        {/* Status Messages */}
        {error && (
          <Alert severity="error" sx={{
            position: 'fixed',
            top: 80,
            right: 20,
            zIndex: 1000,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            '& .MuiAlert-message': { color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }
          }}>
            {error}
          </Alert>
        )}

        {/* Success Toast */}
        {success && (
          <Box sx={{
            position: 'fixed',
            top: 80,
            right: 20,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.95)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            transition: 'all 0.3s ease-out'
          }}>
            <CheckCircleIcon sx={{
              color: '#ffffff',
              fontSize: '1.2rem'
            }} />
            <Typography variant="body2" sx={{
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '500',
              fontFamily: 'JetBrains Mono, monospace',
              flex: 1
            }}>
              {success}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setSuccess(null)}
              sx={{
                color: '#ffffff',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              }}
            >
              <CloseIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Box>
        )}

      </Box>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
          Bumpath Settings
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Hash Directory (Automatic)"
              value={hashesPath}
              placeholder="Loading..."
              InputProps={{
                readOnly: true,
              }}
              helperText="Hash files are automatically managed. Use Settings page to download/update hash files."
              data-bumpath-hash-dir
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent2)' },
                '& .MuiFormHelperText-root': { color: 'var(--accent-muted)', fontSize: '0.75rem' },
              }}
            />
            <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.8rem' }}>
              Hash files are downloaded automatically from CommunityDragon.
              Go to Settings → Hash Files section to download or update hash files.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} sx={{ color: 'var(--accent2)' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Console Window */}
      <ConsoleWindow
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        logs={consoleLogs}
        onRefresh={fetchLogs}
      />

      {/* Floating Celestia trigger button */}
      {!showCelestiaGuide && (
        <Tooltip title="Celestia guide" placement="left" arrow>
          <IconButton
            onClick={() => setShowCelestiaGuide(true)}
            aria-label="Open Celestia guide"
            sx={{
              position: 'fixed',
              bottom: settingsExpanded ? 150 : 90,
              right: 24,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: 'var(--bg-2)',
              color: 'var(--text)',
              border: '1px solid var(--accent-muted)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              '&:hover': {
                background: 'var(--surface-2)',
                borderColor: 'var(--accent)',
                boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>!</Box>
          </IconButton>
        </Tooltip>
      )}

      {/* Simulated BIN List Overlay for Tutorial - Show on BIN list step (step index 1) */}
      {showCelestiaGuide && celestiaStepIndex === 1 && binListHighlightRect && (
        <>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {/* Simulated BIN list - positioned to match highlight size exactly */}
            <Box
              sx={{
                position: 'fixed',
                left: `${binListHighlightRect.left}px`,
                top: `${binListHighlightRect.top}px`,
                width: `${binListHighlightRect.width}px`,
                height: `${binListHighlightRect.height}px`,
                ...panelStyle,
                opacity: 0.95,
                pointerEvents: 'none',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Simulated BIN list content - sized to match highlight */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                {/* Simulated header */}
                <Box sx={{ p: 2, borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FormatListBulletedIcon sx={{
                        color: 'var(--accent)',
                        fontSize: '1.2rem'
                      }} />
                      <Typography variant="h6" sx={{
                        color: 'var(--accent)',
                        fontSize: '1rem'
                      }}>
                        Source BINs:
                      </Typography>
                    </Box>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1,
                      backgroundColor: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.2)'
                    }}>
                      <Typography variant="body2" sx={{
                        color: '#8b5cf6',
                        fontSize: '0.7rem',
                        fontWeight: '600'
                      }}>
                        {simulatedBinSelected ? '1' : '0'} / 3 selected
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Simulated BIN list */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 0.5 }}>
                  <List dense sx={{ py: 0 }}>
                    {[
                      { path: 'data\\characters\\aatrox\\skins\\skin0', ext: 'bin', selected: simulatedBinSelected, animateClick: true },
                      { path: 'data\\characters\\aatrox\\skins\\skin1', ext: 'bin', selected: false, animateClick: false },
                      { path: 'data\\characters\\aatrox\\skins\\skin3', ext: 'bin', selected: false, animateClick: false },
                    ].map((bin, idx) => (
                      <ListItem
                        key={idx}
                        sx={{
                          px: 1,
                          py: 0.75,
                          minHeight: 'auto',
                          backgroundColor: idx % 2 === 0 ? 'rgba(139, 92, 246, 0.02)' : 'transparent',
                          borderRadius: '4px',
                          mb: 0.25,
                          position: 'relative',
                        }}
                      >
                        {/* Animated click indicator for skin0 */}
                        {bin.animateClick && !simulatedBinSelected && (
                          <Box
                            sx={{
                              position: 'absolute',
                              left: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(139, 92, 246, 0.3)',
                              border: '2px solid var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              animation: 'clickPulse 1.5s ease-in-out infinite',
                              zIndex: 1,
                              '@keyframes clickPulse': {
                                '0%, 100%': {
                                  transform: 'translateY(-50%) scale(1)',
                                  opacity: 1,
                                },
                                '50%': {
                                  transform: 'translateY(-50%) scale(1.3)',
                                  opacity: 0.6,
                                },
                              },
                            }}
                          >
                            <Box
                              sx={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--accent)',
                              }}
                            />
                          </Box>
                        )}
                        <Checkbox
                          checked={bin.selected}
                          sx={{
                            color: '#8b5cf6',
                            '&.Mui-checked': {
                              color: '#7c3aed',
                            },
                            p: 0.25,
                            mr: 1,
                            position: 'relative',
                            zIndex: 2,
                            '& .MuiSvgIcon-root': {
                              fontSize: '1.1rem'
                            },
                            transition: 'all 0.3s ease',
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <Typography variant="body2" sx={{
                              color: 'var(--accent2)',
                              fontSize: '0.65rem',
                              opacity: 0.7,
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {bin.path.split('\\').slice(0, -1).join('\\')}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{
                              color: 'var(--accent)',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {bin.path.split('\\').pop()}
                            </Typography>
                            <Typography variant="body2" sx={{
                              color: '#06b6d4',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              fontFamily: 'JetBrains Mono, monospace',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              px: 0.5,
                              py: 0.25,
                              borderRadius: '3px'
                            }}>
                              .{bin.ext}
                            </Typography>
                          </Box>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Auto-click animation effect - mouse cursor click (matches clickPulse position) */}
          {celestiaStepIndex === 1 && !simulatedBinSelected && binListHighlightRect && (
            <Box
              sx={{
                position: 'fixed',
                left: `${binListHighlightRect.left + 4 + 8}px`, // Container padding (4px) + ListItem px:1 (8px) = checkbox position
                top: `${binListHighlightRect.top + 64 + 6 + 11}px`, // Header (~64px) + ListItem py:0.75 (6px) + checkbox center (~11px)
                width: '20px',
                height: '20px',
                pointerEvents: 'none',
                zIndex: 1001,
                animation: 'autoClick 2s ease-in-out 1',
                '@keyframes autoClick': {
                  '0%': {
                    opacity: 0,
                    transform: 'scale(0.8)',
                  },
                  '30%': {
                    opacity: 1,
                    transform: 'scale(1.2)',
                  },
                  '50%': {
                    opacity: 1,
                    transform: 'scale(0.9)',
                  },
                  '100%': {
                    opacity: 0,
                    transform: 'scale(1)',
                  },
                },
              }}
              onAnimationEnd={() => {
                setTimeout(() => setSimulatedBinSelected(true), 200);
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(139, 92, 246, 0.6)',
                  border: '2px solid var(--accent)',
                  boxShadow: '0 0 10px rgba(139, 92, 246, 0.8)',
                }}
              />
            </Box>
          )}
        </>
      )}

      {/* Simulated Entries Overlay for Tutorial - Show on Select All step (step index 2) */}
      {showCelestiaGuide && celestiaStepIndex === 2 && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {/* Simulated entries in the right panel - positioned to match actual right panel */}
          <Box
            sx={{
              position: 'absolute',
              left: '414px', // 64px (navbar) + 350px (left panel)
              right: 0,
              top: '60px', // Top bar height
              bottom: 0,
              ...panelStyle,
              p: 1,
              opacity: 0.95,
              pointerEvents: 'none',
              border: '2px solid var(--accent)',
              boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <List dense sx={{ py: 0 }}>
              {[
                { id: '00276f1a', prefix: 'bum' },
                { id: '012770ad', prefix: 'bum' },
                { id: '1bb05ac9', prefix: 'bum' },
                { id: '1fb3af50', prefix: 'bum' },
                { id: '21b3b276', prefix: 'bum' },
                { id: '22b3b409', prefix: 'bum' },
                { id: '23ac426b', prefix: 'bum' },
                { id: '27f20d91', prefix: 'bum' },
                { id: '2822d7b8', prefix: 'bum' },
                { id: '2c0d8728', prefix: 'bum' },
              ].map((entry, idx) => (
                <ListItem
                  key={idx}
                  sx={{
                    px: 1,
                    py: 0.5,
                    borderBottom: '1px solid var(--glass-border)',
                    '&:hover': { backgroundColor: 'color-mix(in srgb, var(--accent2), transparent 95%)' }
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    {/* Entry Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <IconButton
                        size="small"
                        sx={{
                          color: '#06b6d4',
                          backgroundColor: 'rgba(6, 182, 212, 0.1)',
                          borderRadius: '6px',
                          width: 24,
                          height: 24,
                          p: 0.5,
                        }}
                      >
                        <ChevronRightIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>

                      <Checkbox
                        checked={true}
                        sx={{
                          color: '#10b981',
                          '&.Mui-checked': {
                            color: '#059669',
                          },
                          p: 0.25,
                          mr: 1,
                          '& .MuiSvgIcon-root': {
                            fontSize: '1.1rem'
                          },
                        }}
                      />

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{
                            color: 'var(--accent)',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            fontFamily: 'JetBrains Mono, monospace',
                            flex: '1 1 auto',
                            minWidth: 0
                          }}>
                            {entry.id}
                          </Typography>
                          <Box sx={{
                            backgroundColor: 'rgba(6, 182, 212, 0.1)',
                            border: '1px solid rgba(6, 182, 212, 0.2)',
                            borderRadius: '3px',
                            px: 0.5,
                            py: 0.25,
                            display: 'inline-flex',
                            alignItems: 'center',
                            flex: '0 0 auto'
                          }}>
                            <Typography variant="body2" sx={{
                              color: '#06b6d4',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              fontFamily: 'JetBrains Mono, monospace',
                              lineHeight: 1,
                              whiteSpace: 'nowrap'
                            }}>
                              {entry.prefix}
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="body2" sx={{
                          color: 'var(--accent2)',
                          fontSize: '0.65rem',
                          fontFamily: 'JetBrains Mono, monospace',
                          opacity: 0.7,
                          display: 'block',
                          width: '100%'
                        }}>
                          ID: {entry.id}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      )}

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
