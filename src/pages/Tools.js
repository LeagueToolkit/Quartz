import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  Tooltip,
  LinearProgress,
  Snackbar,
  Avatar,
} from '@mui/material';
import './Tools.css';
// Legacy stylesheet removed in favor of inline glass styles
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  FileCopy as FileCopyIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  DragIndicator as DragIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Apps as AppsIcon,
  EmojiEmotions as EmojiIcon,
} from '@mui/icons-material';

// Import necessary Node.js modules for Electron
const { ipcRenderer, shell } = window.require ? window.require('electron') : { ipcRenderer: null, shell: null };
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const Tools = () => {
  const [exes, setExes] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [toolsRoot, setToolsRoot] = useState('');
  const [executablesPath, setExecutablesPath] = useState('');
  const [skinsPath, setSkinsPath] = useState('');
  const [emojiDialog, setEmojiDialog] = useState({ open: false, exeName: null });
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [dragTarget, setDragTarget] = useState(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const lastDropSigRef = useRef({ ts: 0, names: [] });
  const hideDragTimerRef = useRef(null);
  const isOverExeDropRef = useRef(false);
  const dragTargetRef = useRef(null);
  const dragKindRef = useRef({ hasExe: false, hasFolder: false });

  // Load tools directory and existing exes on component mount
  useEffect(() => {
    loadToolsDirectory();
  }, []);

  // Reload emoji data when executables change
  useEffect(() => {
    if (exes.length > 0 && executablesPath) {
      const emojiData = loadEmojiData();
      if (Object.keys(emojiData).length > 0) {
        setExes(prev => prev.map(exe => ({
          ...exe,
          emoji: emojiData[exe.name] || exe.emoji
        })));
      }
    }
  }, [executablesPath]);

  // ─── Modern Styles ────────────────────────────────────────────────────────
  const cardSx = {
    background: 'rgba(255,255,255,0.026)',
    border: '1px solid rgba(255,255,255,0.055)',
    borderRadius: '12px',
    position: 'relative', overflow: 'hidden',
    transition: 'all 0.2s ease-in-out',
    '&::before': {
      content: '""', position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
      pointerEvents: 'none'
    },
    '&:hover': {
      borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)',
      background: 'rgba(255,255,255,0.04)',
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    },
  };

  const dropZoneSx = (active) => ({
    p: 2.5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderRadius: '10px',
    border: active ? '1.5px dashed var(--accent)' : '1.5px dashed rgba(255,255,255,0.1)',
    background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'rgba(255,255,255,0.015)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    '&:hover': {
      borderColor: 'color-mix(in srgb, var(--accent) 60%, transparent)',
      background: 'rgba(255,255,255,0.035)',
    }
  });

  const loadToolsDirectory = () => {
    try {
      const appPath = process.cwd();
      const rootDir = path.join(appPath, 'tools');
      const exesDir = path.join(rootDir, 'executables');
      const skinsDir = path.join(rootDir, 'skins');
      setToolsRoot(rootDir);
      setExecutablesPath(exesDir);
      setSkinsPath(skinsDir);

      // Create tools directory if it doesn't exist
      if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
      if (!fs.existsSync(exesDir)) fs.mkdirSync(exesDir, { recursive: true });
      if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
      // After establishing path, load exes
      setTimeout(() => loadExistingExes(exesDir), 0);
    } catch (error) {
      console.error('Error loading tools directory:', error);
    }
  };

  const getEmojiDataPath = () => {
    try {
      // Get the app path - works in both dev and production
      const appPath = process.cwd();
      const rootDir = path.join(appPath, 'tools');

      // Ensure directory exists
      if (!fs.existsSync(rootDir)) {
        fs.mkdirSync(rootDir, { recursive: true });
      }

      return path.join(rootDir, 'emoji-data.json');
    } catch (error) {
      console.error('Error getting emoji data path:', error);
      return null;
    }
  };

  const loadEmojiData = () => {
    try {
      const emojiPath = getEmojiDataPath();
      if (emojiPath && fs.existsSync(emojiPath)) {
        const data = fs.readFileSync(emojiPath, 'utf8');
        const parsed = JSON.parse(data);
        console.log('Loaded emoji data:', parsed);
        return parsed;
      }
    } catch (error) {
      console.error('Error loading emoji data:', error);
    }
    return {};
  };

  const saveEmojiData = (emojiData) => {
    try {
      const emojiPath = getEmojiDataPath();
      if (emojiPath) {
        fs.writeFileSync(emojiPath, JSON.stringify(emojiData, null, 2));
        console.log('Saved emoji data:', emojiData);
      }
    } catch (error) {
      console.error('Error saving emoji data:', error);
    }
  };

  const loadExistingExes = (dirOverride) => {
    try {
      const baseDir = dirOverride || executablesPath;
      if (!baseDir) return;

      const files = fs.readdirSync(baseDir);
      const exeFiles = files.filter(file => {
        const lower = file.toLowerCase();
        return lower.endsWith('.exe') || lower.endsWith('.bat');
      });

      // Load saved emoji data
      const emojiData = loadEmojiData();

      setExes(exeFiles.map(file => {
        const lower = file.toLowerCase();
        const type = lower.endsWith('.bat') ? 'bat' : 'exe';
        return {
          name: file,
          path: path.join(baseDir, file),
          type,
          status: 'ready',
          lastUsed: null,
          skinFolders: [],
          emoji: emojiData[file] || null
        };
      }));
    } catch (error) {
      console.error('Error loading existing exes:', error);
    }
  };

  const hasFiles = (e) => {
    try {
      if (e?.dataTransfer?.types?.includes?.('Files')) return true;
      const items = e?.dataTransfer?.items;
      if (items && typeof items.length === 'number') {
        for (let i = 0; i < items.length; i++) { if (items[i]?.kind === 'file') return true; }
      }
    } catch { }
    return false;
  };

  // Determine what is being dragged so we can adjust UI affordances
  const detectDragKind = (e) => {
    const result = { hasExe: false, hasFolder: false };
    try {
      const items = Array.from(e?.dataTransfer?.items || []);
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile?.();
        const name = file?.name?.toLowerCase?.() || '';
        const p = file?.path;
        if (name.endsWith('.exe') || name.endsWith('.bat') || name.endsWith('.cmd')) {
          result.hasExe = true;
        } else if (p && fs && fs.existsSync?.(p)) {
          try {
            if (fs.statSync(p).isDirectory()) {
              result.hasFolder = true;
            }
          } catch { }
        }
      }
    } catch { }
    return result;
  };

  const handleDragOver = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    try { e.dataTransfer.dropEffect = 'copy'; } catch { }
    if (isOverExeDropRef.current || dragTargetRef.current) return;
    // Only show global overlay when dragging executables to add
    setIsDragOver(Boolean(kind.hasExe));
  };

  const handleDragLeave = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      if (hideDragTimerRef.current) clearTimeout(hideDragTimerRef.current);
      hideDragTimerRef.current = setTimeout(() => {
        setIsDragOver(false);
        setDragTarget(null);
      }, 80);
    }
  };

  const handleDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (hideDragTimerRef.current) {
      clearTimeout(hideDragTimerRef.current);
      hideDragTimerRef.current = null;
    }
    dragCounter.current += 1;
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    if (isOverExeDropRef.current || dragTargetRef.current) return;
    setIsDragOver(Boolean(kind.hasExe));
  };

  const handleDrop = async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current = 0;
    if (hideDragTimerRef.current) { clearTimeout(hideDragTimerRef.current); hideDragTimerRef.current = null; }
    setIsDragOver(false);
    setDragTarget(null);
    const files = Array.from(e.dataTransfer.files || []);
    const kind = detectDragKind(e);
    // Only process here when executables are being dropped; folder drops belong on per-exe cards
    if (kind.hasExe) {
      await processDroppedFiles(files);
    }
  };

  // Global drag listeners to avoid flicker from nested elements
  useEffect(() => {
    const onDocDragEnter = (e) => handleDragEnter(e);
    const onDocDragOver = (e) => handleDragOver(e);
    const onDocDragLeave = (e) => handleDragLeave(e);
    const onDocDrop = (e) => handleDrop(e);
    document.addEventListener('dragenter', onDocDragEnter, true);
    document.addEventListener('dragover', onDocDragOver, true);
    document.addEventListener('dragleave', onDocDragLeave, true);
    document.addEventListener('drop', onDocDrop, true);
    return () => {
      document.removeEventListener('dragenter', onDocDragEnter, true);
      document.removeEventListener('dragover', onDocDragOver, true);
      document.removeEventListener('dragleave', onDocDragLeave, true);
      document.removeEventListener('drop', onDocDrop, true);
    };
  }, []);

  const handleExeDragOver = (e, exe) => {
    e.preventDefault();
    e.stopPropagation();
    // Accept any files or folders being dragged onto exe
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    if (kind.hasFolder || hasFiles(e)) {
      setDragTarget(exe.name);
      dragTargetRef.current = exe.name;
      // Suppress global overlay while hovering a card drop zone
      isOverExeDropRef.current = true;
      if (isDragOver) setIsDragOver(false);
    }
  };

  const handleExeDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    dragTargetRef.current = null;
    isOverExeDropRef.current = false;
  };

  const handleExeDrop = async (e, exe) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    dragTargetRef.current = null;
    isOverExeDropRef.current = false;

    const files = Array.from(e.dataTransfer.files);
    // Execute the target exe with each dropped file/folder path
    for (const f of files) {
      const filePath = f.path;
      try {
        // Accept any file or folder - let the exe decide what to do with it
        const normalizedPath = path.resolve(filePath).replace(/\//g, '\\');
        const workingDir = path.dirname(normalizedPath);
        await runExe(exe, [normalizedPath], workingDir);
      } catch (error) {
        console.error('Error processing dropped item:', error);
        setSnackbar({
          open: true,
          message: `Error processing ${path.basename(filePath)}: ${error.message}`,
          severity: 'error'
        });
      }
    }
  };

  const processDroppedFiles = async (files) => {
    setIsProcessing(true);

    try {
      let addedCount = 0;
      // Debounce duplicate drops (Windows can emit multiple drop events)
      const now = Date.now();
      const names = files.map(f => f.name);
      const prev = lastDropSigRef.current;
      const isSameAsLast = (now - prev.ts < 600) && names.join('|') === prev.names.join('|');
      lastDropSigRef.current = { ts: now, names };
      if (isSameAsLast) {
        setIsProcessing(false);
        return;
      }

      const existingNames = new Set(exes.map(e => e.name.toLowerCase()));
      for (const file of files) {
        const fileName = file.name;
        const filePath = file.path;
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd')) {
          if (existingNames.has(lower)) {
            continue;
          }
          const added = await addExe(filePath, fileName);
          if (added) {
            existingNames.add(lower);
            addedCount += 1;
          }
        }
      }

      setSnackbar({
        open: addedCount > 0,
        message: addedCount > 0 ? `Added ${addedCount} executable(s)` : '',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error processing files: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Removed: storing skin folders

  const addExe = async (sourcePath, fileName) => {
    try {
      const baseDir = executablesPath && executablesPath.length > 0
        ? executablesPath
        : path.join(process.cwd(), 'tools', 'executables');
      // Ensure destination directory exists
      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
      const destPath = path.join(baseDir, fileName);
      const lower = fileName.toLowerCase();
      const type = lower.endsWith('.bat') ? 'bat' : 'exe';

      // Copy file to tools directory
      if (fs.existsSync(destPath)) {
        // Skip duplicates by name
        return false;
      }
      fs.copyFileSync(sourcePath, destPath);

      // Add to exes list
      setExes(prev => [...prev, {
        name: fileName,
        path: destPath,
        type,
        status: 'ready',
        lastUsed: null,
        skinFolders: [],
        emoji: null
      }]);

      return true;
    } catch (error) {
      throw new Error(`Failed to add executable: ${error.message}`);
    }
  };

  // Removed: addSkinFolderToExe

  // Removed: copyFolderRecursive

  const removeExe = async (exeName) => {
    const exe = exes.find(e => e.name === exeName);
    if (!exe) return;
    try {
      // Try main-process first
      if (ipcRenderer) {
        try {
          const result = await ipcRenderer.invoke('tools:deletePath', { path: exe.path, exeName: exe.name });
          if (!result?.ok) throw new Error(result?.error || 'Unknown delete error');
        } catch (ipcErr) {
          // Fallback in renderer when handler is missing or failed
          const cp = window.require ? window.require('child_process') : null;
          try {
            // Try direct unlink
            fs.unlinkSync(exe.path);
          } catch (e1) {
            try {
              // Try taskkill then unlink (Windows)
              if (process.platform === 'win32' && cp?.execSync) {
                try { cp.execSync(`taskkill /f /im "${exe.name.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }); } catch { }
              }
              fs.unlinkSync(exe.path);
            } catch (e2) {
              // Rename then delete
              try {
                const dir = path.dirname(exe.path);
                const tmp = path.join(dir, `${exe.name}.pendingDelete-${Date.now()}`);
                fs.renameSync(exe.path, tmp);
                if (fs.rmSync) fs.rmSync(tmp, { force: true }); else fs.unlinkSync(tmp);
              } catch (e3) {
                throw ipcErr; // bubble original ipc error if all fallbacks fail
              }
            }
          }
        }
      } else {
        fs.unlinkSync(exe.path);
      }
      setExes(prev => {
        const updated = prev.filter(e => e.name !== exeName);

        // Clean up emoji data
        const emojiData = {};
        updated.forEach(exe => {
          if (exe.emoji) {
            emojiData[exe.name] = exe.emoji;
          }
        });
        saveEmojiData(emojiData);

        return updated;
      });
      setSnackbar({ open: true, message: `Removed ${exeName}`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: `Error removing executable: ${String(error?.message || error)}`, severity: 'error' });
    }
  };

  // Removed: removeSkinFolder

  const runExe = async (exe, args = [], cwd) => {
    try {
      if (!ipcRenderer) throw new Error('ipcRenderer unavailable');

      console.log(`Running ${exe.name} with args:`, JSON.stringify(args), 'in directory:', cwd);

      const result = await ipcRenderer.invoke('tools:runExe', {
        exePath: exe.path,
        args,
        cwd,
        openConsole: true, // CMD tool that should show console
      });

      console.log('Execution result:', {
        code: result?.code,
        stdout: result?.stdout?.substring(0, 200),
        stderr: result?.stderr?.substring(0, 200)
      });

      if (result?.code === 0) {
        setSnackbar({
          open: true,
          message: `${exe.name} completed successfully! Check your folder for changes.`,
          severity: 'success'
        });
      } else {
        const errMsg = (result?.stderr || result?.stdout || 'Unknown error').toString().slice(0, 500);
        console.error(`${exe.name} failed with code ${result?.code}:`, errMsg);
        setSnackbar({
          open: true,
          message: `${exe.name} failed (code ${result?.code}): ${errMsg}`,
          severity: 'error'
        });
      }
      setExes(prev => prev.map(e => e.name === exe.name ? { ...e, lastUsed: new Date().toISOString() } : e));
    } catch (error) {
      console.error('Error in runExe:', error);
      // Fallback: run directly from renderer if main handler missing
      try {
        const cp = window.require ? window.require('child_process') : null;
        if (!cp?.exec) throw error;
        const quoted = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
        const normalizedExePath = path.resolve(exe.path);
        const normalizedArgs = args.map(arg => path.resolve(arg));
        const cmd = `start "" ${quoted(normalizedExePath)} ${normalizedArgs.map(quoted).join(' ')}`;

        console.log('Fallback command:', cmd);

        cp.exec(cmd, { cwd: cwd || path.dirname(exe.path), shell: 'cmd.exe' }, (err) => {
          if (err) {
            console.error('Fallback execution error:', err);
            setSnackbar({
              open: true,
              message: `Error running ${exe.name}: ${String(err?.message || err)}`,
              severity: 'error'
            });
          } else {
            setSnackbar({ open: true, message: `Ran ${exe.name} (fallback)`, severity: 'success' });
          }
        });
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr);
        setSnackbar({
          open: true,
          message: `Error running ${exe.name}: ${String(fallbackErr?.message || fallbackErr)}`,
          severity: 'error'
        });
      }
    }
  };

  const fixSkinFolder = (exe, folder) => {
    try {
      // This would contain the logic to fix skin folders
      // For now, just show a success message
      setSnackbar({
        open: true,
        message: `Fixed skin folder: ${folder.name} for ${exe.name}`,
        severity: 'success'
      });

      // Update last used time
      setExes(prev => prev.map(e =>
        e.name === exe.name
          ? {
            ...e,
            skinFolders: e.skinFolders.map(f =>
              f.name === folder.name
                ? { ...f, lastUsed: new Date().toISOString() }
                : f
            )
          }
          : e
      ));
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error fixing skin folder: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const handleFileInput = (event) => {
    const files = Array.from(event.target.files);
    processDroppedFiles(files);
    event.target.value = null; // Reset input
  };

  const openToolsFolder = () => {
    try {
      shell?.openPath?.(toolsRoot);
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error opening tools folder: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const openEmojiDialog = (exeName) => {
    setEmojiDialog({ open: true, exeName });
    setSelectedEmoji('');
  };

  const closeEmojiDialog = () => {
    setEmojiDialog({ open: false, exeName: null });
    setSelectedEmoji('');
  };

  const setExeEmoji = (exeName, emoji) => {
    setExes(prev => {
      const updated = prev.map(exe =>
        exe.name === exeName
          ? { ...exe, emoji: emoji || null }
          : exe
      );

      // Save emoji data to file
      const emojiData = {};
      updated.forEach(exe => {
        if (exe.emoji) {
          emojiData[exe.name] = exe.emoji;
        }
      });
      saveEmojiData(emojiData);

      return updated;
    });
    closeEmojiDialog();
    setSnackbar({
      open: true,
      message: emoji ? `Emoji ${emoji} added to ${exeName}` : `Emoji removed from ${exeName}`,
      severity: 'success'
    });
  };

  // Popular emojis for quick selection
  const popularEmojis = [
    // Gaming & Entertainment
    '🎮', '🎲', '🃏', '🎰', '🎳', '🏹', '⚔️', '🛡️', '🎯', '🎪', '🎭', '🎬', '🎵', '🎤', '🎧', '🎹', '🎸', '🥁', '🎺', '🎻',

    // Tools & Technology
    '🔧', '⚙️', '🛠️', '🔨', '🔩', '⚡', '💻', '🖥️', '📱', '📟', '📠', '🖨️', '📡', '🔌', '🔋', '💾', '💿', '📀', '🖱️', '⌨️',

    // Files & Organization
    '📁', '📂', '📄', '📋', '📝', '📚', '📖', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📰', '🗞️', '📑', '🔖', '🏷️', '📎',

    // Creative & Art
    '🎨', '🖼️', '🎭', '🎪', '🎟️', '🎫', '🎬', '🎤', '🎧', '🎼', '🎹', '🎸', '🥁', '🎺', '🎻', '🎷', '🪕', '🪘', '🎵', '🎶',

    // Success & Achievement
    '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '⭐', '🌟', '✨', '💫', '💎', '💍', '👑', '🎊', '🎉', '🎈', '🎁', '🎀', '🎪',

    // Nature & Elements
    '🔥', '💧', '🌊', '☀️', '🌙', '⭐', '🌟', '✨', '💫', '⚡', '🌈', '☁️', '🌪️', '❄️', '🌺', '🌸', '🌼', '🌻', '🌹', '🌷',

    // Animals & Creatures
    '🐉', '🐲', '🦄', '🦁', '🐯', '🐻', '🐼', '🐨', '🐸', '🐙', '🦋', '🦅', '🦉', '🦊', '🐺', '🐱', '🐶', '🐹', '🐰', '🦊',

    // Food & Drinks
    '🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🍰', '🧁', '🍦', '🍧', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼',

    // Sports & Activities
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🎯', '🎳', '🎮', '🎲', '🎰', '🎪',

    // Objects & Items
    '🔮', '💎', '💍', '👑', '🎁', '🎀', '🎈', '🎊', '🎉', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '⭐', '🌟', '✨', '💫',

    // Symbols & Shapes
    '❤️', '💙', '💚', '💛', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✌️',

    // Fantasy & Magic
    '🔮', '✨', '💫', '🌟', '⭐', '🌙', '☀️', '🌈', '⚡', '🔥', '💧', '🌊', '🌪️', '❄️', '🌺', '🌸', '🌼', '🌻', '🌹', '🌷'
  ];

  return (
    <Box className="tools-root" sx={{
      minHeight: '100%', height: '100%', width: '100%',
      background: 'var(--bg)',
      color: 'var(--text)', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}
      onDragOver={handleDragOver} onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave} onDrop={handleDrop}
    >

      {/* Slim Header */}
      <Box sx={{
        p: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 3 },
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative', zIndex: 10,
        background: 'rgba(0,0,0,0.05)',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            color: 'var(--accent)'
          }}>
            <AppsIcon />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff', lineHeight: 1.2 }}>Tools Manager</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
              Add executables and drag skin folders onto them
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => loadExistingExes()} size="small" sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
          <IconButton onClick={openToolsFolder} size="small" sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}>
            <FolderIcon fontSize="small" />
          </IconButton>
          <Button
            size="small" variant="contained" startIcon={<AddIcon />} onClick={() => fileInputRef.current?.click()}
            sx={{
              ml: 1, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', boxShadow: 'none', borderRadius: '8px',
              textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, px: 2,
              '&:hover': { background: 'color-mix(in srgb, var(--accent) 25%, transparent)', borderColor: 'var(--accent)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }
            }}
          >
            Add Exe
          </Button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInput} />
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflow: 'auto', position: 'relative', zIndex: 1 }}>
        {isProcessing && (
          <Box sx={{ mb: 3 }}>
            <LinearProgress sx={{
              borderRadius: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.05)',
              '& .MuiLinearProgress-bar': { background: 'var(--accent-gradient)' }
            }} />
            <Typography sx={{ mt: 1, color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Processing files...
            </Typography>
          </Box>
        )}

        {exes.length === 0 ? (
          <Box sx={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', py: 8,
            color: 'rgba(255,255,255,0.25)'
          }}>
            <AppsIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>No Executables Added</Typography>
            <Typography variant="body2">Drag and drop .exe files here or use the Add button</Typography>
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            {exes.map((exe) => (
              <Grid item xs={12} md={6} lg={4} key={exe.name}>
                <Box
                  sx={{
                    ...cardSx,
                    height: '100%',
                    display: 'flex', flexDirection: 'column',
                    p: 2,
                    ...(dragTarget === exe.name && {
                      borderColor: 'var(--accent)',
                      borderWidth: '1px',
                      boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 15%, transparent)',
                      transform: 'translateY(-2px)'
                    })
                  }}
                  onDragOver={(e) => handleExeDragOver(e, exe)}
                  onDragLeave={handleExeDragLeave}
                  onDrop={(e) => handleExeDrop(e, exe)}
                >
                  {/* Card Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, overflow: 'hidden' }}>
                      <Box sx={{
                        fontSize: '1.25rem', width: 32, height: 32,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        {exe.emoji || <FileCopyIcon sx={{ fontSize: '1rem', opacity: 0.4 }} />}
                      </Box>
                      <Typography sx={{
                        color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        {exe.name}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEmojiDialog(exe.name)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: 'var(--accent)' } }}>
                        <EmojiIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton size="small" onClick={() => removeExe(exe.name)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}>
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Drop Zone */}
                  <Box sx={dropZoneSx(dragTarget === exe.name)}>
                    <FolderIcon sx={{ fontSize: 28, color: dragTarget === exe.name ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }} />
                    <Typography sx={{
                      fontSize: '0.75rem', fontWeight: 500,
                      color: dragTarget === exe.name ? 'var(--accent)' : 'rgba(255,255,255,0.35)'
                    }}>
                      Drop skin folders here
                    </Typography>
                  </Box>

                  {/* Skin Folders List */}
                  {exe.skinFolders && exe.skinFolders.length > 0 && (
                    <Box sx={{ mt: 1, flex: 1 }}>
                      <Typography sx={{
                        color: 'var(--accent)', fontSize: '0.62rem', fontWeight: 800,
                        textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1, opacity: 0.8
                      }}>
                        Recent Folders ({exe.skinFolders.length})
                      </Typography>
                      <List sx={{ p: 0, '& .MuiListItem-root': { px: 1, py: 0.75, borderRadius: '6px', mb: 0.5, transition: 'all 0.2s', '&:hover': { background: 'rgba(255,255,255,0.03)' } } }}>
                        {exe.skinFolders.map((folder) => (
                          <ListItem key={folder.name} secondaryAction={
                            <Box sx={{ display: 'flex', gap: 0.25 }}>
                              <IconButton size="small" onClick={() => fixSkinFolder(exe, folder)} sx={{ color: 'rgba(255,255,255,0.25)', '&:hover': { color: 'var(--accent)' } }}>
                                <SettingsIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                              <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.25)', '&:hover': { color: '#ff4d4d' } }}>
                                <DeleteIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Box>
                          }>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <FolderIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.25)' }} />
                            </ListItemIcon>
                            <ListItemText
                              primary={folder.name}
                              secondary={folder.lastUsed ? `Used ${new Date(folder.lastUsed).toLocaleDateString()}` : 'Never used'}
                              primaryTypographyProps={{ sx: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 } }}
                              secondaryTypographyProps={{ sx: { fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', mt: -0.25 } }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Info Strip */}
      <Box sx={{
        p: 1.5, px: 3, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 10
      }}>
        <InfoIcon sx={{ fontSize: 16, color: 'var(--accent)', opacity: 0.8 }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
          <strong>Workflow:</strong> Add your favorite tools once, then drag'n'drop folders onto them to process.
        </Typography>
      </Box>

      {/* Emoji dialog */}
      <Dialog
        open={emojiDialog.open} onClose={closeEmojiDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { background: 'var(--surface, #1a1630)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } }}
      >
        <DialogTitle sx={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, pb: 1 }}>Choose Emoji for {emojiDialog.exeName}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth placeholder="Paste any emoji here..." value={selectedEmoji} onChange={(e) => setSelectedEmoji(e.target.value)}
            sx={{
              mb: 2.5, mt: 1,
              '& .MuiOutlinedInput-root': {
                background: 'rgba(255,255,255,0.03)', color: '#fff', borderRadius: '8px', fontSize: '0.9rem',
                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
            }}
          />
          <Typography sx={{ color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1.5 }}>Popular Choices</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 0.75 }}>
            {popularEmojis.map((emoji, idx) => (
              <Button
                key={idx} onClick={() => setSelectedEmoji(emoji)}
                sx={{
                  minWidth: 0, p: 0.5, fontSize: '1.25rem', borderRadius: '6px',
                  background: selectedEmoji === emoji ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedEmoji === emoji ? 'var(--accent)' : 'transparent'}`,
                  '&:hover': { background: 'rgba(255,255,255,0.08)' }
                }}
              >
                {emoji}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setExeEmoji(emojiDialog.exeName, null)} sx={{ color: '#ff4d4d', fontSize: '0.8rem', fontWeight: 600, textTransform: 'none' }}>Remove Emoji</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeEmojiDialog} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none', fontWeight: 600 }}>Cancel</Button>
          <Button onClick={() => setExeEmoji(emojiDialog.exeName, selectedEmoji)} disabled={!selectedEmoji} variant="contained"
            sx={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', textTransform: 'none', fontWeight: 700, px: 3, '&:hover': { background: 'var(--accent)', opacity: 0.9 }, '&.Mui-disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.2)' } }}
          >Save Emoji</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}
          variant="filled"
          sx={{
            background: 'var(--surface, #1a1630)', color: '#fff', borderRadius: '10px',
            border: `1px solid ${snackbar.severity === 'error' ? '#ff4d4d' : snackbar.severity === 'success' ? '#4caf50' : 'var(--accent)'}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            '& .MuiAlert-icon': { color: snackbar.severity === 'error' ? '#ff4d4d' : snackbar.severity === 'success' ? '#4caf50' : 'var(--accent)' }
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Global Drag Overlay */}
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: isDragOver && !isOverExeDropRef.current ? 'auto' : 'none',
        display: isDragOver && !isOverExeDropRef.current ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        transition: 'opacity 0.2s ease', opacity: isDragOver && !isOverExeDropRef.current ? 1 : 0,
      }}>
        <Box sx={{
          p: 6, borderRadius: '24px', textAlign: 'center',
          background: 'rgba(255,255,255,0.03)', border: '2px dashed var(--accent)',
          backdropFilter: 'blur(16px)', boxShadow: '0 48px 96px rgba(0,0,0,0.6)',
        }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '20px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', mb: 3, mx: 'auto'
          }}>
            <AddIcon sx={{ fontSize: 40 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>Add Executables</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Drop .exe, .bat, or .cmd files to add them to your manager</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Tools;
