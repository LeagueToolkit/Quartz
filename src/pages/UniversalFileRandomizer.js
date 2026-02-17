import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  Chip,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Folder as FolderIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  AutoAwesome as SparklesIcon,
  Casino as CasinoIcon,
  FolderOpen as FolderOpenIcon,
  ContentCopy as CopyIcon,
  Help as HelpIcon,
  Shuffle as ShuffleIcon,
  Backup as BackupIcon,

  Settings as SettingsIcon,
} from '@mui/icons-material';


import './UniversalFileRandomizer.css';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
const nodePath = window.require ? window.require('path') : null;
const nodeFs = window.require ? window.require('fs') : null;

const UniversalFileRandomizer = () => {
  const theme = useTheme();

  // State
  const [mode, setMode] = useState('randomizer'); // 'randomizer' or 'renamer'
  const [replacementFiles, setReplacementFiles] = useState([]);
  const [targetFolder, setTargetFolder] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('idle');
  const [showHelp, setShowHelp] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState('');
  const [createBackup, setCreateBackup] = useState(true); // Default to true for safety
  const [smartNameMatching, setSmartNameMatching] = useState(true); // Default to true for better emote consistency
  const [filterMode, setFilterMode] = useState('skip'); // 'skip' or 'replace'
  const [filterKeywords, setFilterKeywords] = useState(''); // Comma-separated keywords
  const [scanSubdirectories, setScanSubdirectories] = useState(true); // Whether to scan into subdirectories

  const [showSettings, setShowSettings] = useState(false);

  // Renamer mode state
  const [textToFind, setTextToFind] = useState('');
  const [textToReplaceWith, setTextToReplaceWith] = useState('');
  const [prefixToAdd, setPrefixToAdd] = useState('');
  const [suffixToAdd, setSuffixToAdd] = useState('');
  const [renamerMode, setRenamerMode] = useState('replace'); // 'replace' or 'add'

  // Refs
  const logRef = useRef(null);

  // Initialize console
  useEffect(() => {
    const modeText = mode === 'randomizer' ? 'randomize files across your project' : 'handle files by renaming or modifying them';
    const instructionText = mode === 'randomizer' ? 'Select replacement files and target folder to begin.' : 'Choose renaming mode and select target folder to begin.';

    setLog('Universal File Handler v1.0\n' +
      '================================\n' +
      `Ready to ${modeText}.\n\n` +
      `${instructionText}\n`);
  }, [mode]);

  // Auto-scroll console
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // Close mode dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModeDropdown) {
        setShowModeDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showModeDropdown]);

  // Listen for progress updates from main process
  useEffect(() => {
    if (!ipcRenderer) return;

    const handleProgress = (event, progressData) => {
      const { current, total, percentage } = progressData;
      setProgress(60 + (percentage * 0.4)); // Progress from 60% to 100%
      setCurrentOperation(`Replacing files... ${current}/${total} (${percentage}%)`);
      addToLog(`🔄 Progress: ${current}/${total} files replaced (${percentage}%)\n`);
    };

    ipcRenderer.on('filerandomizer:progress', handleProgress);

    return () => {
      ipcRenderer.removeListener('filerandomizer:progress', handleProgress);
    };
  }, [ipcRenderer]);

  // Handle replacement files selection
  const handleReplacementFilesSelect = async () => {
    if (!ipcRenderer) return;

    try {
      const result = await ipcRenderer.invoke('dialog:openFiles', {
        title: 'Select Replacement Files',
        filters: [
          { name: 'All Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'wav', 'ogg', 'mp3', 'flac', 'aac', 'm4a', 'wma', 'txt', 'json', 'xml', 'csv', 'md', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'skn', 'skl', 'scb', 'sco', 'anm', 'obj', 'fbx', 'dae', 'blend'] },
          { name: 'Common Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg', 'ttf', 'otf', 'wav', 'ogg', 'mp3', 'txt', 'json', 'xml', 'zip', 'rar', 'mp4', 'avi', 'skn', 'skl', 'scb', 'sco', 'anm'] },
          { name: 'Image Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg'] },
          { name: '3D Model Files', extensions: ['skn', 'skl', 'scb', 'sco', 'anm', 'obj', 'fbx', 'dae', 'blend'] },
          { name: 'Audio Files', extensions: ['wav', 'ogg', 'mp3', 'flac', 'aac', 'm4a', 'wma'] },
          { name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'] },
          { name: 'Text Files', extensions: ['txt', 'json', 'xml', 'csv', 'md', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h'] },
          { name: 'Archive Files', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'] },
          { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
          { name: 'DDS Files', extensions: ['dds'] },
          { name: 'TEX Files', extensions: ['tex'] }
        ],
        properties: ['multiSelections']
      });

      if (result.canceled || result.filePaths.length === 0) return;

      // Validate files before processing
      const validFiles = [];
      const invalidFiles = [];

      for (const filePath of result.filePaths) {
        try {
          if (nodeFs.existsSync(filePath)) {
            const stat = nodeFs.statSync(filePath);
            if (stat.isFile()) {
              validFiles.push({
                path: filePath,
                name: nodePath.basename(filePath),
                extension: nodePath.extname(filePath).toLowerCase(),
                size: stat.size
              });
            } else {
              invalidFiles.push(filePath);
            }
          } else {
            invalidFiles.push(filePath);
          }
        } catch (fileError) {
          console.warn(`Skipping file ${filePath}:`, fileError.message);
          invalidFiles.push(filePath);
        }
      }

      if (validFiles.length === 0) {
        addToLog(`❌ No valid files selected. Please try again.\n`);
        return;
      }

      if (invalidFiles.length > 0) {
        addToLog(`⚠️  Skipped ${invalidFiles.length} invalid files.\n`);
      }

      setReplacementFiles(validFiles);
      addToLog(`Selected ${validFiles.length} replacement files:\n${validFiles.map(f => `  • ${f.name} (${f.extension})`).join('\n')}\n`);

      // Auto-detect if we have mixed file types
      const extensions = [...new Set(validFiles.map(f => f.extension))];
      if (extensions.length > 1) {
        addToLog(`⚠️  Mixed file types detected: ${extensions.join(', ')}\n   Files will be matched by extension during replacement.\n`);
      }
    } catch (error) {
      console.error('Error selecting replacement files:', error);
      addToLog(`❌ Error selecting files: ${error.message}\n`);
      setStatus('error');
    }
  };

  // Handle target folder selection
  const handleTargetFolderSelect = async () => {
    if (!ipcRenderer) return;

    try {
      console.log('Opening folder selection dialog...');
      addToLog('🔍 Opening folder selection dialog...\n');

      const result = await ipcRenderer.invoke('dialog:openDirectory', {
        title: 'Select Target Folder'
      });

      console.log('Folder selection result:', result);

      if (result.canceled) {
        addToLog('❌ Folder selection was canceled\n');
        return;
      }

      const selectedPath = result.filePaths[0];
      console.log('Selected folder path:', selectedPath);

      setTargetFolder(selectedPath);
      addToLog(`✅ Selected target folder: ${selectedPath}\n`);
    } catch (error) {
      console.error('Error selecting target folder:', error);
      addToLog(`❌ Error selecting target folder: ${error.message}\n`);
      setStatus('error');
    }
  };

  // Add message to console log
  const addToLog = (message) => {
    setLog(prev => prev + message);
  };

  // Clear console log
  const clearLog = () => {
    setLog('Console cleared.\n');
  };

  // Copy console log
  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(log);
      addToLog('📋 Console log copied to clipboard.\n');
    } catch (error) {
      addToLog(`❌ Failed to copy log: ${error.message}\n`);
    }
  };

  // Start process based on mode
  const startProcess = async () => {
    if (mode === 'randomizer') {
      if (!replacementFiles.length || !targetFolder || !ipcRenderer) {
        addToLog('❌ Please select both replacement files and target folder.\n');
        return;
      }
    } else {
      if (renamerMode === 'replace') {
        if (!textToFind.trim() || !targetFolder || !ipcRenderer) {
          addToLog('❌ Please enter text to find and select target folder.\n');
          return;
        }
      } else {
        // Add prefix/suffix mode - at least one should be specified
        if (!prefixToAdd.trim() && !suffixToAdd.trim()) {
          addToLog('❌ Please specify at least a prefix or suffix to add.\n');
          return;
        }
        if (!targetFolder || !ipcRenderer) {
          addToLog('❌ Please select target folder.\n');
          return;
        }
      }
    }

    setIsRunning(true);
    setStatus('running');
    setProgress(0);
    setCurrentOperation('Initializing...');

    if (mode === 'randomizer') {
      addToLog(`🚀 Starting file randomization process...\n`);
      addToLog(`📁 Target: ${targetFolder}\n`);
      addToLog(`🎲 Replacement files: ${replacementFiles.length}\n`);
      addToLog(`🧠 Smart name matching: ${smartNameMatching ? 'ENABLED' : 'DISABLED'}\n`);
      addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
      if (filterKeywords.trim()) {
        addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
      }
      addToLog('\n');
    } else {
      addToLog(`🚀 Starting file renaming process...\n`);
      addToLog(`📁 Target: ${targetFolder}\n`);

      if (renamerMode === 'replace') {
        addToLog(`🔧 Text replacement mode\n`);
        if (textToReplaceWith.trim()) {
          addToLog(`✂️  Text to find: "${textToFind}"\n`);
          addToLog(`🔄 Replace with: "${textToReplaceWith}"\n`);
        } else {
          addToLog(`✂️  Text to find: "${textToFind}"\n`);
          addToLog(`🗑️  Replace with: (delete completely)\n`);
        }
      } else {
        addToLog(`🔧 Add prefix/suffix mode\n`);
        if (prefixToAdd.trim()) {
          addToLog(`➕ Prefix to add: "${prefixToAdd}"\n`);
        }
        if (suffixToAdd.trim()) {
          addToLog(`➕ Suffix to add: "${suffixToAdd}"\n`);
        }
      }

      addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
      if (filterKeywords.trim()) {
        addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
      }
      addToLog('\n');
    }

    try {
      // Create backup first (if enabled)
      if (createBackup) {
        setCurrentOperation('Creating backup...');
        setProgress(10);
        addToLog('💾 Creating backup of target folder...\n');

        // Use setTimeout to prevent UI blocking
        const backupResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:createBackup', {
                targetFolder,
                replacementFiles: mode === 'randomizer' ? replacementFiles.map(f => f.path) : []
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });

        if (!backupResult.success) {
          throw new Error(backupResult.error || 'Failed to create backup');
        }

        addToLog(`✅ Backup created: ${backupResult.backupPath}\n`);
        setProgress(30);
      } else {
        addToLog('⚠️  Skipping backup creation (disabled by user)\n');
        setProgress(30);
      }

      if (mode === 'randomizer') {
        // Start file discovery and replacement for randomizer mode
        setCurrentOperation('Discovering files...');
        setProgress(40);
        addToLog('🔍 Discovering files for replacement...\n');

        // Use setTimeout to prevent UI blocking
        const discoveryResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:discoverFiles', {
                targetFolder,
                replacementFiles: replacementFiles.map(f => ({ path: f.path, extension: f.extension })),
                smartNameMatching,
                filterMode,
                filterKeywords: filterKeywords.trim(),
                scanSubdirectories
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });

        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'Failed to discover files');
        }

        const { discoveredFiles, totalFiles, filteredFiles } = discoveryResult;
        addToLog(`📊 Found ${totalFiles} files to replace:\n`);

        if (filteredFiles > 0) {
          addToLog(`🚫 Filtered out ${filteredFiles} files\n`);
        }

        Object.entries(discoveredFiles).forEach(([ext, files]) => {
          addToLog(`   ${ext}: ${files.length} files\n`);
        });

        setProgress(60);
        setCurrentOperation('Replacing files...');
        addToLog('\n🔄 Starting file replacement...\n');

        // Replace files with progress updates
        const replacementResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:replaceFiles', {
                targetFolder,
                replacementFiles: replacementFiles.map(f => ({ path: f.path, extension: f.extension })),
                discoveredFiles,
                smartNameMatching
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });

        if (!replacementResult.success) {
          throw new Error(replacementResult.error || 'Failed to replace files');
        }

        setProgress(100);
        setCurrentOperation('Completed');
        addToLog(`✅ File randomization completed successfully!\n`);
        addToLog(`📈 Replaced ${replacementResult.replacedCount} files\n`);
        addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);

        setStatus('completed');
      } else {
        // Renamer mode logic
        setCurrentOperation('Discovering files...');
        setProgress(40);
        addToLog('🔍 Discovering files for renaming...\n');

        // Use setTimeout to prevent UI blocking
        const discoveryResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:discoverFiles', {
                targetFolder,
                replacementFiles: [], // No replacement files needed for renaming
                smartNameMatching: false, // Not needed for renaming
                filterMode,
                filterKeywords: filterKeywords.trim(),
                scanSubdirectories
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });

        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'Failed to discover files');
        }

        const { discoveredFiles, totalFiles, filteredFiles } = discoveryResult;
        addToLog(`📊 Found ${totalFiles} files to rename:\n`);

        if (filteredFiles > 0) {
          addToLog(`🚫 Filtered out ${filteredFiles} files\n`);
        }

        Object.entries(discoveredFiles).forEach(([ext, files]) => {
          addToLog(`   ${ext}: ${files.length} files\n`);
        });

        setProgress(60);
        setCurrentOperation('Renaming files...');
        addToLog('\n✂️  Starting file renaming...\n');

        // Rename files with progress updates
        const renameResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:renameFiles', {
                targetFolder,
                textToFind: textToFind.trim(),
                textToReplaceWith: textToReplaceWith.trim(),
                prefixToAdd: prefixToAdd.trim(),
                suffixToAdd: suffixToAdd.trim(),
                discoveredFiles
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });

        if (!renameResult.success) {
          throw new Error(renameResult.error || 'Failed to rename files');
        }

        setProgress(100);
        setCurrentOperation('Completed');
        addToLog(`✅ File renaming completed successfully!\n`);
        addToLog(`📈 Renamed ${renameResult.renamedCount} files\n`);
        addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);

        setStatus('completed');
      }

    } catch (error) {
      console.error('Error during randomization:', error);
      addToLog(`❌ Error during randomization: ${error.message}\n`);
      setStatus('error');
      setCurrentOperation('Error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  // Stop process
  const stopProcess = async () => {
    if (!ipcRenderer) return;

    try {
      await ipcRenderer.invoke('filerandomizer:stop');
      setIsRunning(false);
      setStatus('stopped');
      setCurrentOperation('Stopped by user');
      addToLog('⏹️  Process stopped by user.\n');
    } catch (error) {
      addToLog(`❌ Error stopping process: ${error.message}\n`);
    }
  };



  // ─── Modern style helpers ──────────────────────────────────────────────────
  const panelSx = {
    background: 'rgba(255,255,255,0.026)',
    border: '1px solid rgba(255,255,255,0.055)',
    borderRadius: '12px',
    p: { xs: 1.25, sm: 1.5 },
    position: 'relative',
    overflow: 'hidden',
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0, left: '20%', right: '20%', height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
      pointerEvents: 'none',
    },
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      background: 'rgba(255,255,255,0.03)',
      color: 'var(--text)',
      fontSize: '0.8rem',
      borderRadius: '8px',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
      '&:hover fieldset': { borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)' },
      '&.Mui-focused fieldset': { borderColor: 'var(--accent)', borderWidth: '1px' },
    },
    '& .MuiInputBase-input': {
      color: 'var(--text)',
      '&::placeholder': { color: 'rgba(255,255,255,0.25)', opacity: 1 },
    },
  };

  const labelStyle = { color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', cursor: 'pointer', userSelect: 'none', fontFamily: 'inherit' };
  const radioStyle = { width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', marginRight: 4 };
  const checkStyle = { width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', marginRight: 6 };

  const modePillSx = (active) => ({
    px: 1.35, py: 0.45,
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'rgba(255,255,255,0.28)',
    border: active ? '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' : '1px solid transparent',
    transition: 'all 0.18s ease',
    userSelect: 'none',
    '&:hover': { color: active ? 'var(--accent)' : 'rgba(255,255,255,0.5)' },
  });

  return (
    <Box sx={{
      height: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      color: 'var(--text)',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── Page header ── */}
      <Box sx={{
        flexShrink: 0,
        px: { xs: 2, sm: 2.5 }, py: { xs: 1.1, sm: 1.35 },
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 1.5,
        position: 'relative', zIndex: 2,
      }}>
        <FolderIcon sx={{ color: 'var(--accent)', fontSize: 18 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.2 }}>
            File Handler
          </Typography>
          <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-2)', opacity: 0.5, mt: 0.1, lineHeight: 1 }}>
            {mode === 'randomizer' ? 'Randomly swap files with your collection' : 'Rename files with text operations'}
          </Typography>
        </Box>

        {/* Mode toggle pills */}
        <Box sx={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', p: '3px' }}>
          {[{ key: 'randomizer', label: 'Randomizer' }, { key: 'renamer', label: 'Renamer' }].map(({ key, label }) => (
            <Box key={key} onClick={() => setMode(key)} sx={modePillSx(mode === key)}>{label}</Box>
          ))}
        </Box>

        {/* Reset + Settings */}
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <Tooltip title="Reset" arrow>
            <IconButton size="small"
              onClick={() => {
                setMode('randomizer');
                setReplacementFiles([]);
                setTargetFolder('');
                setTextToFind('');
                setTextToReplaceWith('');
                setPrefixToAdd('');
                setSuffixToAdd('');
                setRenamerMode('replace');
                setIsRunning(false);
                setShowModeDropdown(false);
                setLog('Universal File Handler v1.0\n================================\nReady to randomize files across your project.\n\nSelect replacement files and target folder to begin.\n');
                setStatus('idle');
                setProgress(0);
                setCurrentOperation('');
                setCreateBackup(true);
                setSmartNameMatching(true);
                setFilterMode('skip');
                setFilterKeywords('');
                setScanSubdirectories(true);
              }}
              sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } }}
            >
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings" arrow>
            <IconButton size="small" onClick={() => setShowSettings(true)}
              sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } }}
            >
              <SettingsIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Body: left controls + right console ── */}
      <Box sx={{
        flex: 1, display: 'flex', gap: { xs: 1, sm: 1.5 },
        px: { xs: 1.5, sm: 2 }, pt: { xs: 1.25, sm: 1.5 }, pb: { xs: 1.5, sm: 2 },
        overflow: 'hidden', minHeight: 0,
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Left panel ── */}
        <Box sx={{
          width: { xs: '100%', sm: '300px', md: '320px' },
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1,
          minHeight: 0, overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 2 },
        }}>

          {/* — Mode-specific inputs — */}
          <Box sx={panelSx}>
            {mode === 'randomizer' ? (
              <>
                <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <ShuffleIcon sx={{ fontSize: 13 }} /> Replacement Files
                </Typography>
                <Button onClick={handleReplacementFilesSelect} disabled={isRunning}
                  startIcon={<FolderOpenIcon sx={{ fontSize: '15px !important' }} />}
                  sx={{ width: '100%', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', borderRadius: '8px', py: 0.75, transition: 'all 0.2s ease', '&:hover': { background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)', transform: 'translateY(-1px)' }, '&:disabled': { opacity: 0.35, transform: 'none' } }}>
                  Select Files
                </Button>
                {replacementFiles.length > 0 && (
                  <Box sx={{ mt: 0.75, px: 1, py: 0.5, borderRadius: '7px', background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>{replacementFiles.length} files</Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>
                      {(() => { const ext = [...new Set(replacementFiles.map(f => f.extension))]; return ext.length === 1 ? ext[0].toUpperCase() : `${ext.length} types`; })()}
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <CopyIcon sx={{ fontSize: 13 }} /> File Renaming
                </Typography>
                {/* Renamer sub-mode tabs */}
                <Box sx={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.2)', borderRadius: '7px', p: '3px', mb: 1.25 }}>
                  {[{ key: 'replace', label: 'Replace Text' }, { key: 'add', label: 'Prefix / Suffix' }].map(({ key, label }) => (
                    <Box key={key} onClick={() => setRenamerMode(key)} sx={{ flex: 1, textAlign: 'center', ...modePillSx(renamerMode === key) }}>{label}</Box>
                  ))}
                </Box>
                {renamerMode === 'replace' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)', mb: 0.25 }}>Find and replace text in filenames:</Typography>
                    <TextField fullWidth size="small" value={textToFind} onChange={(e) => setTextToFind(e.target.value)} placeholder="Text to find..." sx={inputSx} />
                    <TextField fullWidth size="small" value={textToReplaceWith} onChange={(e) => setTextToReplaceWith(e.target.value)} placeholder="Replace with (empty = delete)..." sx={inputSx} />
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)', mb: 0.25 }}>Add prefix and/or suffix to all filenames:</Typography>
                    <TextField fullWidth size="small" value={prefixToAdd} onChange={(e) => setPrefixToAdd(e.target.value)} placeholder="Prefix (e.g. new_)" sx={inputSx} />
                    <TextField fullWidth size="small" value={suffixToAdd} onChange={(e) => setSuffixToAdd(e.target.value)} placeholder="Suffix (e.g. _v2)" sx={inputSx} />
                    <Typography sx={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', fontStyle: 'italic' }}>Suffix inserts before the file extension</Typography>
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* — Target Folder — */}
          <Box sx={panelSx}>
            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <FolderIcon sx={{ fontSize: 13 }} /> Target Folder
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <TextField fullWidth size="small" value={targetFolder} placeholder="Select target folder..." InputProps={{ readOnly: true }} sx={inputSx} />
              <IconButton onClick={handleTargetFolderSelect} disabled={isRunning} size="small"
                sx={{ flexShrink: 0, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)', borderRadius: '8px', color: 'var(--accent)', '&:hover': { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)' }, '&:disabled': { opacity: 0.35 } }}>
                <FolderOpenIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Box>
          </Box>

          {/* — Filtering & Options — */}
          <Box sx={panelSx}>
            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <InfoIcon sx={{ fontSize: 13 }} /> {mode === 'randomizer' ? 'File Filtering' : 'Options'}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
              {mode === 'randomizer' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.4)', minWidth: 40 }}>Mode:</Typography>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="filterMode" value="skip" checked={filterMode === 'skip'} onChange={(e) => setFilterMode(e.target.value)} style={radioStyle} />
                    <span style={labelStyle}>Skip</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="filterMode" value="replace" checked={filterMode === 'replace'} onChange={(e) => setFilterMode(e.target.value)} style={radioStyle} />
                    <span style={labelStyle}>Replace Only</span>
                  </label>
                </Box>
              )}
              {mode === 'randomizer' && (
                <Box>
                  <Typography sx={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)', mb: 0.5 }}>Keywords (comma-separated):</Typography>
                  <TextField fullWidth size="small" value={filterKeywords} onChange={(e) => setFilterKeywords(e.target.value)} placeholder="glow, sparkle, shine" sx={inputSx} />
                  <Typography sx={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', mt: 0.4 }}>
                    {filterMode === 'skip' ? 'Files containing these keywords will be skipped' : 'Only files containing these keywords will be replaced'}
                  </Typography>
                </Box>
              )}
              {mode === 'randomizer' && (
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={smartNameMatching} onChange={(e) => setSmartNameMatching(e.target.checked)} style={checkStyle} />
                  <span style={labelStyle}>Smart name matching (same base name = same emote)</span>
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={scanSubdirectories} onChange={(e) => setScanSubdirectories(e.target.checked)} style={checkStyle} />
                <span style={labelStyle}>Scan subdirectories (climb down into folders)</span>
              </label>
            </Box>
          </Box>

          {/* — Progress (while running) — */}
          {isRunning && (
            <Box sx={panelSx}>
              <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1 }}>
                Progress
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', mb: 0.75 }}>{currentOperation}</Typography>
              <LinearProgress variant="determinate" value={progress}
                sx={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--accent2)))', borderRadius: 3 } }} />
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--accent)', mt: 0.5, textAlign: 'right', fontWeight: 600 }}>{progress}%</Typography>
            </Box>
          )}

          {/* — Actions — */}
          <Box sx={panelSx}>
            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <PlayIcon sx={{ fontSize: 13 }} /> Actions
            </Typography>
            <Button
              onClick={isRunning ? stopProcess : startProcess}
              disabled={!isRunning && (mode === 'randomizer' ? (!replacementFiles.length || !targetFolder) : (renamerMode === 'replace' ? (!textToFind.trim() || !targetFolder) : (!targetFolder || (!prefixToAdd.trim() && !suffixToAdd.trim()))))}
              startIcon={isRunning ? <StopIcon sx={{ fontSize: '15px !important' }} /> : <PlayIcon sx={{ fontSize: '15px !important' }} />}
              sx={{
                width: '100%',
                background: isRunning ? 'color-mix(in srgb, #ef4444 10%, transparent)' : 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: `1px solid ${isRunning ? 'rgba(239,68,68,0.35)' : 'color-mix(in srgb, var(--accent) 32%, transparent)'}`,
                color: isRunning ? '#ef4444' : 'var(--accent)',
                fontWeight: 600, fontSize: '0.8rem', textTransform: 'none', borderRadius: '8px', py: 0.85,
                letterSpacing: '0.02em', transition: 'all 0.2s ease',
                '&:hover': { background: isRunning ? 'color-mix(in srgb, #ef4444 18%, transparent)' : 'color-mix(in srgb, var(--accent) 18%, transparent)', borderColor: isRunning ? 'rgba(239,68,68,0.6)' : 'color-mix(in srgb, var(--accent) 55%, transparent)', transform: 'translateY(-1px)' },
                '&:disabled': { opacity: 0.32, transform: 'none' },
              }}
            >
              {isRunning ? 'Stop Process' : (mode === 'randomizer' ? 'Start Randomization' : 'Start Renaming')}
            </Button>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
              <Tooltip title="Clear console" arrow>
                <IconButton onClick={clearLog} size="small" sx={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', '&:hover': { color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' } }}>
                  <RefreshIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy console" arrow>
                <IconButton onClick={copyLog} size="small" sx={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', '&:hover': { color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' } }}>
                  <CopyIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Help" arrow>
                <IconButton onClick={() => setShowHelp(true)} size="small" sx={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '7px', '&:hover': { color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' } }}>
                  <HelpIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
            {status === 'completed' && (
              <Alert severity="success" icon={<CheckIcon sx={{ fontSize: 15 }} />}
                sx={{ mt: 1, py: 0.4, px: 1, borderRadius: '8px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.72rem', '& .MuiAlert-message': { color: '#4ade80' } }}>
                {mode === 'randomizer' ? 'Randomization complete!' : 'Renaming complete!'}
              </Alert>
            )}
            {status === 'error' && (
              <Alert severity="error" icon={<ErrorIcon sx={{ fontSize: 15 }} />}
                sx={{ mt: 1, py: 0.4, px: 1, borderRadius: '8px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.72rem', '& .MuiAlert-message': { color: '#f87171' } }}>
                Error during {mode === 'randomizer' ? 'randomization' : 'renaming'}
              </Alert>
            )}
          </Box>
        </Box>

        {/* ── Console panel ── */}
        <Box sx={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(255,255,255,0.055)',
          borderRadius: '12px', overflow: 'hidden', position: 'relative',
          '&::before': { content: '""', position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)', pointerEvents: 'none' },
        }}>
          <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.055)', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <InfoIcon sx={{ color: 'var(--accent)', fontSize: 14, opacity: 0.8 }} />
            <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.8 }}>
              Console Output
            </Typography>
          </Box>
          <Box ref={logRef} sx={{
            flex: 1, minHeight: 0, p: 1.5, overflow: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            color: 'rgba(255,255,255,0.75)',
            background: 'rgba(0,0,0,0.15)',
            '&::-webkit-scrollbar': { width: 5 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 3 },
          }}>
            {log || 'Console ready...\n'}
          </Box>
        </Box>
      </Box>



      {/* ── Help Dialog ── */}
      <Dialog open={showHelp} onClose={() => setShowHelp(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { background: 'var(--surface, #1a1630)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'var(--accent)', fontWeight: 700, fontSize: '0.95rem' }}>
          <HelpIcon sx={{ color: 'var(--accent)', fontSize: 18 }} /> File Handler — Help
        </DialogTitle>
        <DialogContent sx={{ color: 'var(--text)' }}>
          <Typography variant="body1" sx={{ mb: 2, fontSize: '0.875rem' }}>
            Two modes: <strong>Randomizer</strong> — replace files with random selections; <strong>Renamer</strong> — manipulate filenames.
          </Typography>
          <Typography sx={{ mb: 1, color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>Randomizer Mode:</Typography>
          <Box component="ol" sx={{ pl: 2, mb: 2, fontSize: '0.85rem' }}>
            <li>Select replacement files (.dds, .tex, .png, etc.)</li>
            <li>Choose the target folder</li>
            <li>Click "Start Randomization"</li>
            <li>Monitor progress in the console</li>
          </Box>
          <Typography sx={{ mb: 1, color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>Renamer Mode:</Typography>
          <Box component="ol" sx={{ pl: 2, mb: 2, fontSize: '0.85rem' }}>
            <li><strong>Replace Text:</strong> Find and replace text in filenames</li>
            <li><strong>Prefix/Suffix:</strong> Add prefixes and/or suffixes to all filenames</li>
            <li>Choose target folder and click "Start Renaming"</li>
          </Box>
          <Box sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', p: 1.5, borderRadius: '10px', fontSize: '0.82rem', mb: 2, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent)' }}>Randomizer:</strong> Replaces files of matching type from your collection. Backup recommended.<br /><br />
            <strong style={{ color: 'var(--accent)' }}>Renamer:</strong> Replace Text: find/replace any pattern in filenames. Prefix/Suffix: add text before or after the filename (suffix inserts before extension).
          </Box>
          <Typography sx={{ mb: 1, color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>Key Features:</Typography>
          <Box component="ul" sx={{ pl: 2, fontSize: '0.85rem', lineHeight: 1.8 }}>
            <li>🔒 Only replaces files of the same type</li>
            <li>🎯 Smart: related files get the same replacement</li>
            <li>🔍 Filter: skip or target specific files by keyword</li>
            <li>📁 Optional subdirectory scanning</li>
            <li>💾 Optional safety backup before changes</li>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setShowHelp(false)}
            sx={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)', fontWeight: 600, textTransform: 'none', borderRadius: '8px', '&:hover': { background: 'color-mix(in srgb, var(--accent) 18%, transparent)' } }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <Box sx={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ background: 'var(--surface, #16142a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', width: '100%', maxWidth: 440, boxShadow: '0 24px 48px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SettingsIcon sx={{ color: 'var(--accent)', fontSize: 17 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>Settings</Typography>
              </Box>
              <IconButton size="small" onClick={() => setShowSettings(false)} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--text)' } }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
              </IconButton>
            </Box>
            <Box sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.8, mb: 1.25 }}>
                Backup Options
              </Typography>
              <Box sx={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', p: 1.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" id="backupToggle" checked={createBackup} onChange={(e) => setCreateBackup(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', userSelect: 'none' }}>Create backup before replacement</span>
                </label>
                <Box sx={{ mt: 1, p: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                    Creates a timestamped backup of your target folder before making changes. Backup stored in the same directory. Recommended to keep enabled.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default UniversalFileRandomizer;
