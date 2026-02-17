/**
 * Paint2 - VFX Color Editor (Rewrite)
 * 
 * Clean, performant version of Paint.js with original layout.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, TextField, Checkbox, Slider, Tooltip, IconButton, Select, MenuItem, Menu, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PaletteIcon from '@mui/icons-material/Palette';
import TuneIcon from '@mui/icons-material/Tune';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CloseIcon from '@mui/icons-material/Close';


// Utils
import { parseVfxFile } from '../../utils/paint2/parser.js';
import { applyPaletteToEmitters, applyPaletteToMaterials } from '../../utils/paint2/colorOps.js';
import { ToPyWithPath, ToBin } from '../../utils/fileOperations.js';
import { loadFileWithBackup, createBackup } from '../../utils/backupManager.js';
import ColorHandler from '../../utils/ColorHandler.js';
import { savePalette, loadAllPalettes, deletePalette } from '../../utils/paletteManager.js';
import { createColorFilter, getColorDescription } from '../../utils/colorFilter.js';
import { CreatePicker } from '../../utils/colorUtils.js';

// Components
import Toolbar from './components/Toolbar';
import SystemList from './components/SystemList';
import PaletteManager from './components/PaletteManager';
import BackupViewer from '../../components/BackupViewer';
import RitobinWarningModal, { detectHashedContent } from '../../components/RitobinWarningModal';
import electronPrefs from '../../utils/electronPrefs.js';
import HistoryIcon from '@mui/icons-material/History';
import { Popover } from '@mui/material'; // Kept if needed elsewhere, but unmounting for texture
import { convertTextureToPNG, findActualTexturePath } from '../../utils/textureConverter.js';
import { openAssetPreview } from '../../utils/assetPreviewEvent.js';
import { processDataURL } from '../../utils/rgbaDataURL.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;


function Paint2() {
    const navigate = useNavigate();

    // === FILE STATE ===
    const [filePath, setFilePath] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileSaved, setFileSaved] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');

    // === PARSED DATA ===
    const [parsedFile, setParsedFile] = useState(null);
    const linesRef = useRef(null);
    const [undoStack, setUndoStack] = useState([]);
    const [paletteNameDialogOpen, setPaletteNameDialogOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [paletteToDelete, setPaletteToDelete] = useState(null);
    const [newPaletteName, setNewPaletteName] = useState('');

    // === SELECTION ===
    const [selection, setSelection] = useState(new Set());
    const [lockedSystems, setLockedSystems] = useState(new Set());

    // === SEARCH/FILTER ===
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSystems, setExpandedSystems] = useState(new Set());
    const [expandedMaterials, setExpandedMaterials] = useState(new Set());
    const [autoExpand, setAutoExpand] = useState(false);
    const autoExpandRef = useRef(false);
    const setAutoExpandWithRef = (val) => {
        setAutoExpand(val);
        autoExpandRef.current = val;
    };
    const [filterAnchor, setFilterAnchor] = useState(null);
    const [variantFilter, setVariantFilter] = useState('all'); // 'all', 'v1', 'v2'
    const [searchByTexture, setSearchByTexture] = useState(false); // New state for texture search toggle

    // === UNSAVED CHANGES MODAL STATE ===
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const pendingNavigationPathRef = useRef(null);

    // === BACKUP VIEWER STATE ===
    const [showBackupViewer, setShowBackupViewer] = useState(false);

    // === RITOBIN WARNING MODAL STATE ===
    const [showRitobinWarning, setShowRitobinWarning] = useState(false);
    const [ritobinWarningContent, setRitobinWarningContent] = useState(null);

    // Reflect unsaved state globally for navigation guard
    useEffect(() => {
        try { window.__DL_unsavedBin = !fileSaved; } catch { }
    }, [fileSaved]);

    // Intercept navigation when unsaved changes exist
    useEffect(() => {
        const handleNavigationBlock = (e) => {
            console.log('🔒 Navigation blocked event received:', e.detail);

            if (!fileSaved && !window.__DL_forceClose) {
                // Prevent default and stop propagation
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();

                const targetPath = e.detail?.path;
                console.log('🔒 Target path:', targetPath, 'File saved:', fileSaved);

                if (targetPath) {
                    // Store navigation path in ref (not state) to avoid render issues
                    pendingNavigationPathRef.current = targetPath;
                    setShowUnsavedDialog(true);
                }
            }
        };

        // Listen for custom navigation-block event from ModernNavigation
        // Use capture phase to catch event early
        window.addEventListener('navigation-blocked', handleNavigationBlock, true);
        return () => {
            window.removeEventListener('navigation-blocked', handleNavigationBlock, true);
        };
    }, [fileSaved, navigate]);

    // Warn on window/tab close if unsaved (native dialog for window closing)
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            try {
                const forceClose = Boolean(window.__DL_forceClose);
                if (!fileSaved && !forceClose) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            } catch {
                if (!fileSaved) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [fileSaved]);

    // Handle unsaved dialog actions
    const handleUnsavedSave = async () => {
        const targetPath = pendingNavigationPathRef.current;
        setShowUnsavedDialog(false);
        pendingNavigationPathRef.current = null;

        try {
            await handleSave();
            // After save, allow navigation
            window.__DL_forceClose = true;
            window.__DL_unsavedBin = false;

            if (targetPath) {
                // Execute navigation after state updates
                setTimeout(() => {
                    console.log('🚀 Executing navigation to:', targetPath);
                    navigate(targetPath);
                    setTimeout(() => {
                        window.__DL_forceClose = false;
                    }, 100);
                }, 50);
            }
        } catch (error) {
            console.error('Error saving before navigation:', error);
        }
    };

    const handleUnsavedDiscard = () => {
        const targetPath = pendingNavigationPathRef.current;
        setShowUnsavedDialog(false);
        pendingNavigationPathRef.current = null;

        // Clear the unsaved flag to allow navigation
        setFileSaved(true);
        window.__DL_forceClose = true;
        window.__DL_unsavedBin = false;

        if (targetPath) {
            // Execute navigation after state updates
            setTimeout(() => {
                console.log('🚀 Executing navigation to:', targetPath);
                navigate(targetPath);
                setTimeout(() => {
                    window.__DL_forceClose = false;
                }, 100);
            }, 50);
        }
    };

    const handleUnsavedCancel = () => {
        setShowUnsavedDialog(false);
        pendingNavigationPathRef.current = null;
    };

    // Persist auto-expand across sessions/navigations
    useEffect(() => {
        const loadPrefs = async () => {
            if (electronPrefs) {
                await electronPrefs.initPromise; // Ensure prefs loaded
                const savedExpand = await electronPrefs.get('PaintAutoExpand');
                if (savedExpand !== undefined) setAutoExpandWithRef(savedExpand);

                // RESTORE PALETTE (for random/linear modes)
                const savedPalette = await electronPrefs.get('Paint2LastPalette');
                if (savedPalette && Array.isArray(savedPalette) && savedPalette.length > 0) {
                    try {
                        const restored = savedPalette.map(p => {
                            const c = new ColorHandler(p.rgba);
                            if (c.vec4) c.vec4[3] = 1;
                            c.a = 1;
                            c.time = p.time;
                            return c;
                        });
                        setPalette(restored);
                    } catch (e) {
                        console.error('Failed to restore palette', e);
                    }
                }

                // RESTORE SHADES PALETTE (for shades mode)
                const savedShadesPalette = await electronPrefs.get('Paint2LastShadesPalette');
                if (savedShadesPalette && Array.isArray(savedShadesPalette) && savedShadesPalette.length > 0) {
                    try {
                        const restored = savedShadesPalette.map(p => {
                            const c = new ColorHandler(p.rgba);
                            if (c.vec4) c.vec4[3] = 1;
                            c.a = 1;
                            c.time = p.time;
                            return c;
                        });
                        setShadesPalette(restored);
                    } catch (e) {
                        console.error('Failed to restore shades palette', e);
                    }
                }

                // RESTORE COLOR COUNT
                const savedCount = await electronPrefs.get('Paint2LastColorCount');
                if (savedCount) setColorCount(savedCount);
            }
        };
        loadPrefs();
    }, []);

    // === MODE & VALUES ===
    const [mode, setMode] = useState('random'); // Default to Random

    // Palette state
    const [palette, setPalette] = useState(() => {
        const def = new ColorHandler();
        def.InputHex('#ecb96a'); // Initialize with orange instead of grey
        def.time = 0;
        return [def];
    });

    const [colorCount, setColorCount] = useState(1);
    const [savedPalettesList, setSavedPalettesList] = useState([]);
    const [ignoreBlackWhite, setIgnoreBlackWhite] = useState(true);
    const [hslValues, setHslValues] = useState({ h: 0, s: 0, l: 0 });
    const [hueTarget, setHueTarget] = useState(60);

    // === COLOR FILTER STATE ===
    const [colorFilterEnabled, setColorFilterEnabled] = useState(false);
    const [targetColors, setTargetColors] = useState([]);
    const [colorTolerance, setColorTolerance] = useState(30);
    const [deleteTargetIndex, setDeleteTargetIndex] = useState(null);

    // Save Palette state on change
    useEffect(() => {
        if (!electronPrefs) return;
        const saveState = async () => {
            await electronPrefs.initPromise;
            // Serialize palette
            const serialized = palette.map(c => ({
                rgba: c.vec4 ? [c.vec4[0], c.vec4[1], c.vec4[2], 1] : [c.r || 0, c.g || 0, c.b || 0, 1],
                time: c.time
            }));
            electronPrefs.set('Paint2LastPalette', serialized);
            electronPrefs.set('Paint2LastColorCount', colorCount);
        };
        const timer = setTimeout(saveState, 500); // Debounce
        return () => clearTimeout(timer);
    }, [palette, colorCount]);

    // === UI OPTIONS ===
    const [targetBC, setTargetBC] = useState(true);
    const [targetOC, setTargetOC] = useState(false);
    const [targetLC, setTargetLC] = useState(false);
    const [targetBaseColor, setTargetBaseColor] = useState(true);

    // === BLEND MODE SELECT ===
    const [blendModeSelect, setBlendModeSelect] = useState(0);
    const [blendModeChance, setBlendModeChance] = useState(100);

    // ============================================================
    // FILE OPERATIONS
    // ============================================================

    // === FILE OPERATIONS ===
    const loadBinFile = useCallback(async (binPath) => {
        if (!binPath || !fs) return;

        setIsLoading(true);
        setStatusMessage('Loading...');

        try {
            const binDir = path.dirname(binPath);
            const binName = path.basename(binPath, '.bin');
            const pyPath = path.join(binDir, `${binName}.py`);

            if (!fs.existsSync(pyPath)) {
                setStatusMessage('Converting bin to py...');
                await ToPyWithPath(binPath);
            }

            let content;
            try {
                content = loadFileWithBackup(pyPath, 'Paint2');
            } catch (e) {
                await ToPyWithPath(binPath);
                content = fs.readFileSync(pyPath, 'utf8');
            }

            setStatusMessage('Parsing...');
            const parsed = parseVfxFile(content);
            linesRef.current = parsed.lines;
            setParsedFile(parsed);

            setFilePath(binPath);
            setFileName(binName);
            setFileSaved(true);
            setSelection(new Set());
            setUndoStack([]); // Clear undo on new file

            // Check if content is hashed - modal will auto-detect
            const isHashed = detectHashedContent(content);

            if (isHashed) {
                setRitobinWarningContent(content);
                setShowRitobinWarning(true);
                setStatusMessage('Warning: File appears to have hashed content - check Ritobin configuration');
            } else {
                setRitobinWarningContent(null);
                setStatusMessage(`Loaded ${parsed.stats.systemCount} systems and ${parsed.stats.emitterCount} emitters`);
            }

            // Auto-expand systems and materials if enabled
            if (autoExpandRef.current) {
                setExpandedSystems(new Set(parsed.systemOrder));
                setExpandedMaterials(new Set(parsed.materialOrder || []));
            } else {
                setExpandedSystems(new Set());
                setExpandedMaterials(new Set());
            }

            if (electronPrefs) {
                electronPrefs.set('PaintLastBinPath', binPath);
            }
        } catch (error) {
            console.error('Error loading file:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // === ASSET PREVIEW LISTENER ===
    useEffect(() => {
        const handleAssetSelected = (e) => {
            const detail = e.detail || {};
            const { path: selectedPath, mode: selectedMode } = detail;

            // Only respond if it's a bin file
            if (selectedPath && selectedPath.toLowerCase().endsWith('.bin')) {
                // Check if the mode matches what we expect (paint-bin or just bin, or undefined)
                if (!selectedMode || selectedMode === 'paint-bin' || selectedMode === 'bin') {
                    // Small delay to allow UI to close if needed
                    setTimeout(async () => {
                        await loadBinFile(selectedPath);
                    }, 100);
                }
            }
        };

        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [loadBinFile]);

    const handleFileOpen = useCallback(async () => {
        // 1. Check if we have unsaved changes (optional, but good practice)
        if (!fileSaved) {
            // In a real implementation we might show a dialog here
            // For now we'll just proceed or you could return;
        }

        try {
            // 2. Check if Ritobin is configured (Critical for conversion)
            let ritobinPath = null;
            if (electronPrefs) {
                await electronPrefs.initPromise;
                ritobinPath = await electronPrefs.get('RitoBinPath');
            }
            // Fallback check
            if (!ritobinPath && window.require) {
                // Try to get from legacy prefs if needed, or just warn
            }

            if (!ritobinPath) {
                setStatusMessage("Error: Ritobin path not configured");
                setShowRitobinWarning(true);
                return;
            }

            // 3. Check User Preference for Native vs Custom Browser
            let useNativeFileBrowser = false;
            let lastBinPath = '';

            if (electronPrefs) {
                useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');
                lastBinPath = await electronPrefs.get('PaintLastBinPath');
                if (!lastBinPath) {
                    lastBinPath = await electronPrefs.get('SharedLastBinPath');
                }
            }

            if (useNativeFileBrowser) {
                // === NATIVE WINDOWS DIALOG ===
                const { ipcRenderer } = window.require('electron');
                const result = await ipcRenderer.invoke('dialog:openFile', {
                    title: 'Select a .bin file',
                    defaultPath: lastBinPath ? path.dirname(lastBinPath) : undefined,
                    filters: [{ name: 'Bin Files', extensions: ['bin'] }],
                    properties: ['openFile']
                });

                if (result && result.filePaths && result.filePaths[0]) {
                    await loadBinFile(result.filePaths[0]);
                }
            } else {
                // === CUSTOM ASSET PREVIEW EXPLORER ===
                // Opens the fullscreen asset explorer in 'paint-bin' mode
                // This will trigger the 'asset-preview-selected' event when a file is chosen
                const startPath = (lastBinPath && fs.existsSync(path.dirname(lastBinPath)))
                    ? lastBinPath
                    : undefined;

                openAssetPreview(startPath, null, 'paint-bin');
            }

        } catch (error) {
            console.error('Error opening file:', error);
            setStatusMessage(`Error: ${error.message}`);
        }
    }, [fileSaved, loadBinFile]);



    const handleSave = useCallback(async () => {
        if (!filePath || !linesRef.current) return;

        setIsLoading(true);
        setStatusMessage('Saving...');

        try {
            const pyPath = filePath.replace('.bin', '.py');
            const content = linesRef.current.join('\n');
            fs.writeFileSync(pyPath, content, 'utf8');
            createBackup(pyPath, content, 'Paint2');
            await ToBin(pyPath, filePath);
            setFileSaved(true);
            setStatusMessage('Saved successfully');
        } catch (error) {
            console.error('Error saving:', error);
            setStatusMessage(`Save error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [filePath]);

    // ============================================================
    // COLOR FILTER
    // ============================================================

    // Non-mutating color picker for filter UI
    const openFilterPicker = useCallback((event, initialVec4, onCommit) => {
        try {
            const localPalette = [];
            const seed = Array.isArray(initialVec4) && initialVec4.length >= 3
                ? new ColorHandler([initialVec4[0], initialVec4[1], initialVec4[2], initialVec4[3] ?? 1])
                : new ColorHandler([0.5, 0.5, 0.5, 1]);
            localPalette[0] = seed;

            const setPaletteWrapper = (updater) => {
                try {
                    const updatedPalette = typeof updater === 'function' ? updater(localPalette) : updater;
                    if (updatedPalette && updatedPalette[0] && typeof updatedPalette[0].ToHEX === 'function') {
                        const hex = updatedPalette[0].ToHEX();
                        const r = parseInt(hex.slice(1, 3), 16) / 255;
                        const g = parseInt(hex.slice(3, 5), 16) / 255;
                        const b = parseInt(hex.slice(5, 7), 16) / 255;
                        if (onCommit) {
                            onCommit([r, g, b, 1]);
                        }
                    }
                } catch (error) {
                    console.error('Error in setPaletteWrapper:', error);
                }
            };

            CreatePicker(
                0,
                event,
                localPalette,
                setPaletteWrapper,
                'shades',
                () => { },
                () => { },
                event?.target || null,
                {
                    onShadesCommit: (hex) => {
                        try {
                            const r = parseInt(hex.slice(1, 3), 16) / 255;
                            const g = parseInt(hex.slice(3, 5), 16) / 255;
                            const b = parseInt(hex.slice(5, 7), 16) / 255;
                            if (onCommit) {
                                onCommit([r, g, b, 1]);
                            }
                        } catch (error) {
                            console.error('Error in onShadesCommit:', error);
                        }
                    }
                }
            );

            setTimeout(() => {
                try {
                    const picker = document.querySelector('.color-picker-container');
                    if (picker && event?.target) {
                        const rect = event.target.getBoundingClientRect();
                        picker.style.position = 'fixed';
                        picker.style.left = `${rect.left}px`;
                        picker.style.top = `${rect.bottom + 6}px`;
                        picker.style.zIndex = '9999';
                    }
                } catch { }
            }, 10);
        } catch (error) {
            console.error('Error in openFilterPicker:', error);
        }
    }, []);

    // Generate color filter predicate
    const getColorFilterPredicate = useCallback(() => {
        if (!colorFilterEnabled || targetColors.length === 0) {
            return null;
        }
        return createColorFilter(targetColors, colorTolerance);
    }, [colorFilterEnabled, targetColors, colorTolerance]);

    // ============================================================
    // RECOLOR
    // ============================================================

    const handleRecolor = useCallback(() => {
        if (!parsedFile || selection.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        // Filter selection to only visible items if search/filter is active
        let effectiveSelection = selection;

        if (searchQuery || variantFilter !== 'all') {
            effectiveSelection = new Set();
            const searchLower = searchQuery.toLowerCase();

            for (const emitterKey of selection) {
                const emitter = parsedFile.emitters.get(emitterKey);
                if (!emitter) continue;

                // 1. Variant Filter
                if (variantFilter === 'v1' && !emitter.name.toLowerCase().endsWith('_variant1')) continue;
                if (variantFilter === 'v2' && !emitter.name.toLowerCase().endsWith('_variant2')) continue;

                // 2. Search Query
                let isVisible = true;
                if (searchQuery) {
                    const system = parsedFile.systems.get(emitter.systemKey);
                    // Match logic matches SystemList.js
                    const systemMatches = (system?.name || '').toLowerCase().includes(searchLower) ||
                        (emitter.systemKey || '').toLowerCase().includes(searchLower);

                    if (!systemMatches) {
                        const emitterMatches = (emitter.name || '').toLowerCase().includes(searchLower) ||
                            (searchByTexture && ((emitter.texturePath && emitter.texturePath.toLowerCase().includes(searchLower)) ||
                                (emitter.textures && emitter.textures.some(t => t.path.toLowerCase().includes(searchLower)))));

                        if (!emitterMatches) isVisible = false;
                    }
                }

                if (isVisible) {
                    effectiveSelection.add(emitterKey);
                }
            }

            if (effectiveSelection.size === 0) {
                setStatusMessage('No visible emitters selected to recolor.');
                return;
            }
        }

        // Save for undo
        if (linesRef.current) {
            const content = linesRef.current.join('\n');
            setUndoStack(prev => {
                const next = [...prev, content];
                if (next.length > 20) return next.slice(1);
                return next;
            });
        }

        const paletteData = palette.map(c => ({
            vec4: c.vec4 ? [c.vec4[0], c.vec4[1], c.vec4[2], 1] : [c.r || 0, c.g || 0, c.b || 0, 1],
            time: c.time || 0
        }));

        const targets = [];
        if (targetBaseColor) targets.push('color');
        if (targetBC) targets.push('birthColor');
        if (targetOC) targets.push('fresnelColor');
        if (targetLC) targets.push('lingerColor');

        if (targets.length === 0) {
            setStatusMessage('Error: No color targets selected (BC, OC, etc)');
            return;
        }

        // Separate emitter keys from material keys
        const emitterKeys = new Set();
        const materialKeys = new Set();

        for (const key of effectiveSelection) {
            if (key.startsWith('mat::')) {
                materialKeys.add(key);
            } else {
                emitterKeys.add(key);
            }
        }

        let modifiedCount = 0;

        // Recolor emitters
        if (emitterKeys.size > 0) {
            modifiedCount += applyPaletteToEmitters(
                parsedFile,
                emitterKeys,
                targets,
                paletteData,
                {
                    mode,
                    ignoreBlackWhite,
                    hslShift: hslValues,
                    hueTarget,
                    colorFilter: getColorFilterPredicate()
                }
            );
        }

        // Recolor materials
        if (materialKeys.size > 0) {
            modifiedCount += applyPaletteToMaterials(
                parsedFile,
                materialKeys,
                paletteData,
                {
                    mode,
                    ignoreBlackWhite,
                    hslShift: hslValues,
                    hueTarget,
                    colorFilter: getColorFilterPredicate()
                }
            );
        }

        setParsedFile({ ...parsedFile });
        setFileSaved(false);
        setStatusMessage(`Recolored ${modifiedCount} properties`);
    }, [parsedFile, selection, palette, mode, ignoreBlackWhite, hslValues, hueTarget, searchQuery, variantFilter, searchByTexture, targetBaseColor, targetBC, targetOC, targetLC, getColorFilterPredicate]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;

        const lastContent = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));

        const parsed = parseVfxFile(lastContent);
        linesRef.current = parsed.lines;
        setParsedFile(parsed);
        setStatusMessage('Restored previous state');
    }, [undoStack]);

    // === BACKUP HANDLERS ===
    const handleOpenBackupViewer = useCallback(() => {
        if (!filePath) {
            setStatusMessage('No file loaded');
            return;
        }
        setShowBackupViewer(true);
    }, [filePath]);

    const performBackupRestore = useCallback(() => {
        try {
            setStatusMessage('Backup restored - reloading file...');
            const pyPath = filePath.replace('.bin', '.py');

            if (fs?.existsSync(pyPath)) {
                const restoredContent = fs.readFileSync(pyPath, 'utf8');
                const parsed = parseVfxFile(restoredContent);
                linesRef.current = parsed.lines;
                setParsedFile(parsed);
                setFileSaved(true);
                setStatusMessage('Backup restored - file reloaded');
            }
        } catch (error) {
            console.error('Error reloading restored backup:', error);
            setStatusMessage('Error reloading restored backup');
        }
    }, [filePath]);

    // === PALETTE MANAGEMENT ===
    const refreshSavedPalettes = useCallback(() => {
        const list = loadAllPalettes(ColorHandler);
        // Map to the format the UI expects (name, palette, filename)
        const formatted = list.map(item => ({
            name: item.name,
            palette: item.colors.map(c => ({
                rgba: c.vec4 ? [c.vec4[0], c.vec4[1], c.vec4[2], 1] : [c.r || 0, c.g || 0, c.b || 0, 1],
                time: c.time
            })),
            filename: item.filename
        }));
        setSavedPalettesList(formatted);
    }, []);

    useEffect(() => {
        refreshSavedPalettes();
    }, [refreshSavedPalettes]);

    const handleSavePalette = useCallback(() => {
        setNewPaletteName(`Palette_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`);
        setPaletteNameDialogOpen(true);
    }, []);

    const confirmSavePalette = useCallback(() => {
        if (!newPaletteName.trim()) return;

        try {
            const name = newPaletteName.trim();
            // Check if exists to avoid unintended duplicates (though file system handles this, UI might need cleanup)
            const existingIndex = savedPalettesList.findIndex(p => p.name === name);

            savePalette(palette, name, mode);
            setPaletteNameDialogOpen(false);
            refreshSavedPalettes();
            setStatusMessage(`Saved palette: ${name}`);
        } catch (error) {
            console.error('Error saving palette:', error);
            setStatusMessage(`Error saving palette: ${error.message}`);
        }
    }, [palette, mode, newPaletteName, refreshSavedPalettes, savedPalettesList]);

    const handleLoadPalette = useCallback((savedItem) => {
        const newPalette = savedItem.palette.map(c => {
            const h = new ColorHandler(c.rgba);
            if (h.vec4) h.vec4[3] = 1;
            h.a = 1;
            h.time = c.time;
            return h;
        });
        setPalette(newPalette);
        setColorCount(newPalette.length);
        setStatusMessage(`Loaded palette: ${savedItem.name}`);
    }, []);

    const handleDeletePalette = useCallback((index) => {
        setPaletteToDelete(index);
        setDeleteConfirmOpen(true);
    }, []);

    const confirmDeletePalette = useCallback(() => {
        const index = paletteToDelete;
        const item = savedPalettesList[index];
        if (!item || !item.filename) return;

        try {
            deletePalette(item.filename);
            setDeleteConfirmOpen(false);
            setPaletteToDelete(null);
            refreshSavedPalettes();
            setStatusMessage(`Deleted palette: ${item.name}`);
        } catch (error) {
            console.error('Error deleting palette:', error);
            setStatusMessage(`Error deleting palette: ${error.message}`);
        }
    }, [paletteToDelete, savedPalettesList, refreshSavedPalettes]);


    // ============================================================
    // SELECTION HELPERS
    // ============================================================

    const selectAllVisible = useCallback(() => {
        if (!parsedFile) return;
        const newSelection = new Set();
        for (const [key, emitter] of parsedFile.emitters) {
            if (lockedSystems.has(emitter.systemKey)) continue;
            if (searchQuery) {
                const system = parsedFile.systems.get(emitter.systemKey);
                const searchLower = searchQuery.toLowerCase();
                if (!emitter.name.toLowerCase().includes(searchLower) &&
                    !system?.name.toLowerCase().includes(searchLower)) {
                    continue;
                }
            }
            newSelection.add(key);
        }
        setSelection(newSelection);
        setStatusMessage(`Selected ${newSelection.size} emitters`);
    }, [parsedFile, lockedSystems, searchQuery]);

    const selectNone = useCallback(() => {
        setSelection(new Set());
    }, []);

    const toggleEmitterSelection = useCallback((emitterKey) => {
        setSelection(prev => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    // === MATERIAL HANDLERS ===
    const toggleMaterialExpand = useCallback((materialKey) => {
        setExpandedMaterials(prev => {
            const next = new Set(prev);
            if (next.has(materialKey)) next.delete(materialKey);
            else next.add(materialKey);
            return next;
        });
    }, []);

    const toggleMaterialParam = useCallback((selectionKey, selected) => {
        setSelection(prev => {
            const next = new Set(prev);
            if (selected) next.add(selectionKey);
            else next.delete(selectionKey);
            return next;
        });
    }, []);

    // Handler for updating material param values (non-color control params)
    const handleMaterialParamValueChange = useCallback((materialKey, paramName, newValues) => {
        if (!parsedFile || !linesRef.current) return;

        const material = parsedFile.materials?.get(materialKey);
        if (!material || !material.colorParams) return;

        const param = material.colorParams.find(p => p.name === paramName);
        if (!param || typeof param.valueLine !== 'number') return;

        const lineIdx = param.valueLine;
        const oldLine = linesRef.current[lineIdx];
        const [r, g, b, a] = newValues;

        // Replace the vec4 value
        const newLine = oldLine.replace(
            /[Vv]alue:\s*vec4\s*=\s*\{[^}]+\}/,
            `value: vec4 = { ${r}, ${g}, ${b}, ${a} }`
        );

        if (newLine !== oldLine) {
            linesRef.current[lineIdx] = newLine;
            // Update the param values in the parsed data
            param.values = newValues;
            setFileSaved(false);
            setStatusMessage(`Updated ${paramName}`);
        }
    }, [parsedFile]);

    const selectSystem = useCallback((systemKey, selected) => {
        if (!parsedFile) return;
        const system = parsedFile.systems.get(systemKey);
        if (!system || lockedSystems.has(systemKey)) return;
        setSelection(prev => {
            const next = new Set(prev);
            for (const emitterKey of system.emitterKeys) {
                if (selected) next.add(emitterKey);
                else next.delete(emitterKey);
            }
            return next;
        });
    }, [parsedFile, lockedSystems]);

    // ============================================================
    // AUTO-LOAD
    // ============================================================

    // ============================================================
    // BLEND MODE LOGIC
    // ============================================================

    const handleSelectByBlendMode = useCallback(() => {
        if (!parsedFile) return;
        const newSelection = new Set(); // Start with empty selection to replace current selection
        let addedCount = 0;

        for (const [key, emitter] of parsedFile.emitters) {
            // Apply filters (search, lock)
            if (lockedSystems.has(emitter.systemKey)) continue;
            if (searchQuery) {
                const system = parsedFile.systems.get(emitter.systemKey);
                const searchLower = searchQuery.toLowerCase();
                if (!emitter.name.toLowerCase().includes(searchLower) &&
                    !system?.name.toLowerCase().includes(searchLower)) {
                    continue;
                }
            }

            // Check blend mode match
            if (emitter.blendMode === blendModeSelect) {
                // Apply chance
                if (blendModeChance >= 100 || Math.random() * 100 < blendModeChance) {
                    newSelection.add(key);
                    addedCount++;
                }
            }
        }
        setSelection(newSelection);
        setStatusMessage(`Selected ${addedCount} emitters with BM ${blendModeSelect}`);
    }, [parsedFile, blendModeSelect, blendModeChance, lockedSystems, searchQuery]);

    const handleSingleBlendModeChange = useCallback((emitterKey, newMode) => {
        if (!parsedFile || !linesRef.current) return;
        const emitter = parsedFile.emitters.get(emitterKey);
        if (!emitter || typeof emitter.blendModeLine !== 'number') return;

        // Update line content
        const lineIdx = emitter.blendModeLine;
        const oldLine = linesRef.current[lineIdx];
        const newLine = oldLine.replace(/blendMode:\s*u8\s*=\s*\d+/, `blendMode: u8 = ${newMode}`);

        linesRef.current[lineIdx] = newLine;
        emitter.blendMode = newMode;

        // Force update
        setParsedFile({ ...parsedFile });
        setFileSaved(false);
        setStatusMessage(`Updated ${emitter.name} to BlendMode ${newMode}`);
    }, [parsedFile]);


    const toggleLockAll = useCallback(() => {
        if (!parsedFile) return;
        // Check if all visible are locked
        let allLocked = true;

        // Only check visible systems (filtered by search)
        const visibleSystems = [];
        for (const sysKey of parsedFile.systemOrder) {
            const system = parsedFile.systems.get(sysKey);
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                // Check if system matches or any of its emitters match
                const sysMatch = system.name.toLowerCase().includes(searchLower);
                const emitterMatch = system.emitterKeys.some(ek => {
                    const em = parsedFile.emitters.get(ek);
                    return em && em.name.toLowerCase().includes(searchLower);
                });
                if (!sysMatch && !emitterMatch) continue;
            }
            visibleSystems.push(sysKey);
        }

        if (visibleSystems.length === 0) return;

        allLocked = visibleSystems.every(k => lockedSystems.has(k));

        const newLocked = new Set(lockedSystems);
        if (allLocked) {
            // Unlock all visible
            visibleSystems.forEach(k => newLocked.delete(k));
            setStatusMessage(`Unlocked ${visibleSystems.length} systems`);
        } else {
            // Lock all visible
            visibleSystems.forEach(k => newLocked.add(k));
            setStatusMessage(`Locked ${visibleSystems.length} systems`);
        }
        setLockedSystems(newLocked);
    }, [parsedFile, lockedSystems, searchQuery]);

    useEffect(() => {
        const autoLoad = async () => {
            if (!electronPrefs) return;
            try {
                await electronPrefs.initPromise;

                // Load Auto-Expand preference
                const autoExpandPref = await electronPrefs.get('PaintAutoExpand');
                if (autoExpandPref !== undefined) setAutoExpandWithRef(autoExpandPref);

                if (filePath) return;
                const autoEnabled = await electronPrefs.get('AutoLoadEnabled');
                if (autoEnabled === false) return;

                let lastPath = await electronPrefs.get('PaintLastBinPath');
                if (!lastPath) {
                    lastPath = await electronPrefs.get('SharedLastBinPath');
                }

                if (lastPath && fs?.existsSync(lastPath)) {
                    await loadBinFile(lastPath);
                }
            } catch (e) { }
        };
        setTimeout(autoLoad, 100);
    }, []);


    // ============================================================
    // TEXTURE PREVIEW (DOM BASED - MATCHING BINEDITOR V2)
    // ============================================================
    const textureCloseTimerRef = useRef(null);
    const conversionTimers = useRef(new Map());
    const activeConversions = useRef(new Set());

    // Show texture preview with grid layout
    const showTexturePreview = useCallback((textureData, buttonElement) => {
        // Clear any existing close timer
        if (textureCloseTimerRef.current) {
            clearTimeout(textureCloseTimerRef.current);
            textureCloseTimerRef.current = null;
        }

        // Remove existing preview
        const existingPreview = document.getElementById('paint2-texture-hover-preview');
        if (existingPreview) existingPreview.remove();

        const rect = buttonElement.getBoundingClientRect();
        const textureCount = textureData.length;

        // Dynamic grid layout based on texture count
        let cols = 1;
        let previewWidth = 260;
        let itemSize = '200px';

        if (textureCount === 1) {
            cols = 1; previewWidth = 260; itemSize = '200px';
        } else if (textureCount === 2) {
            cols = 2; previewWidth = 380; itemSize = '150px';
        } else if (textureCount <= 4) {
            cols = 2; previewWidth = 400; itemSize = '160px';
        } else if (textureCount <= 6) {
            cols = 3; previewWidth = 520; itemSize = '140px';
        } else {
            cols = 3; previewWidth = 560; itemSize = '130px';
        }

        const preview = document.createElement('div');
        preview.id = 'paint2-texture-hover-preview';
        preview.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: rgba(15, 15, 20, 0.96);
            backdrop-filter: blur(12px) saturate(180%);
            -webkit-backdrop-filter: blur(12px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            display: flex;
            flex-direction: column;
            gap: 14px;
            pointer-events: auto;
            width: ${previewWidth}px;
            max-height: ${window.innerHeight - 40}px;
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
            transition: opacity 0.2s ease;
        `;

        // Dynamic grid style
        const gridStyle = textureCount === 1
            ? 'display: flex; justify-content: center;'
            : `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px;`;

        // Build grid items HTML
        // Build grid items HTML
        let itemsHtml = textureData.map((data, idx) => {
            const fileName = data.path.split(/[/\\]/).pop();
            return `
                <div class="texture-item" data-idx="${idx}" title="Left-click: Asset Preview | Right-click: Open in External App" style="cursor: pointer; display: flex; flex-direction: column; gap: 8px; align-items: center; transition: all 0.2s ease; min-width: 0;">
                    <div style="width: 100%; height: ${itemSize}; background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%), linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                        ${data.dataUrl
                    ? `<img src="${processDataURL(data.dataUrl)}" style="width: 100%; height: 100%; object-fit: contain;" />`
                    : `<div style="color: rgba(255,255,255,0.2); font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 500;">LOADING...</div>`
                }
                    </div>
                    <div style="width: 100%; text-align: center; font-family: 'JetBrains Mono', monospace; color: var(--accent); overflow: hidden;">
                        <div style="font-size: 8px; opacity: 0.5; margin-bottom: 2px; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName}</div>
                        <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.08em; opacity: 0.9;">${data.label.toUpperCase()}</div>
                    </div>
                </div>
            `;
        }).join('');

        preview.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="text-align: left; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.12em; display: flex; align-items: center; gap: 10px; opacity: 0.9;">
                    <span style="width: 8px; height: 8px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 8px var(--accent);"></span>
                    TEXTURE PREVIEW (${textureCount})
                </div>
                <div style="${gridStyle}">
                    ${itemsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(preview);

        // Add handlers
        preview.querySelectorAll('.texture-item').forEach(el => {
            el.onclick = (event) => {
                event.stopPropagation();
                const idx = parseInt(el.getAttribute('data-idx'));
                const data = textureData[idx];
                if (data) {
                    preview.remove();
                    if (textureCloseTimerRef.current) {
                        clearTimeout(textureCloseTimerRef.current);
                        textureCloseTimerRef.current = null;
                    }
                    openAssetPreview(data.resolvedDiskPath || data.path, data.dataUrl);
                }
            };
            el.oncontextmenu = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const idx = parseInt(el.getAttribute('data-idx'));
                const data = textureData[idx];
                if (data && data.resolvedDiskPath && window.require) {
                    try {
                        const { shell } = window.require('electron');
                        if (shell) shell.openPath(data.resolvedDiskPath);
                    } catch (err) { console.error(err); }
                }
            };
            // Hover clean up
            el.onmouseenter = () => {
                el.style.transform = 'translateY(-2px)';
                const imgCont = el.querySelector('div');
                if (imgCont) {
                    imgCont.style.borderColor = 'var(--accent)';
                    imgCont.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                }
            };
            el.onmouseleave = () => {
                el.style.transform = 'translateY(0)';
                const imgCont = el.querySelector('div');
                if (imgCont) {
                    imgCont.style.borderColor = 'rgba(255,255,255,0.08)';
                    imgCont.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }
            };
        });

        // Positioning
        const previewRect = preview.getBoundingClientRect();
        let previewTop = rect.top + (rect.height / 2) - (previewRect.height / 2);
        let previewLeft = rect.left - previewWidth - 14;

        if (previewLeft < 10) previewLeft = rect.right + 14;
        if (previewLeft + previewRect.width > window.innerWidth - 10) previewLeft = window.innerWidth - previewRect.width - 10;
        if (previewTop < 10) previewTop = 10;
        if (previewTop + previewRect.height > window.innerHeight - 10) previewTop = window.innerHeight - previewRect.height - 10;

        preview.style.top = `${previewTop}px`;
        preview.style.left = `${previewLeft}px`;

        // Keep open on hover
        preview.onmouseenter = () => {
            if (textureCloseTimerRef.current) {
                clearTimeout(textureCloseTimerRef.current);
                textureCloseTimerRef.current = null;
            }
        };
        preview.onmouseleave = () => {
            textureCloseTimerRef.current = setTimeout(() => preview.remove(), 500);
        };

    }, []);

    const showTextureError = useCallback((texturePath, buttonElement) => {
        if (textureCloseTimerRef.current) {
            clearTimeout(textureCloseTimerRef.current);
            textureCloseTimerRef.current = null;
        }
        const existingPreview = document.getElementById('paint2-texture-hover-preview');
        if (existingPreview) existingPreview.remove();

        const rect = buttonElement.getBoundingClientRect();
        const preview = document.createElement('div');
        preview.id = 'paint2-texture-hover-preview';
        preview.style.cssText = `
            position: fixed; z-index: 10000; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px);
            border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); color: #ef4444; font-family: 'JetBrains Mono', monospace;
            font-size: 12px; max-width: 250px; pointer-events: auto;
        `;
        preview.innerHTML = `<div style="text-align:center;">Failed to load<br/><span style="font-size:10px;opacity:0.7">${texturePath}</span></div>`;
        document.body.appendChild(preview);

        const previewRect = preview.getBoundingClientRect();
        let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
        let left = rect.left - previewRect.width - 14;
        if (left < 10) left = rect.right + 14;
        preview.style.top = `${top}px`;
        preview.style.left = `${left}px`;

        preview.onmouseleave = () => {
            textureCloseTimerRef.current = setTimeout(() => preview.remove(), 500);
        };
    }, []);

    const handleTextureHover = useCallback(async (event, emitter) => {
        const buttonElement = event.currentTarget;
        if (!buttonElement) return;

        // Clean up previous timers
        if (conversionTimers.current.has('hover')) {
            clearTimeout(conversionTimers.current.get('hover'));
        }
        if (textureCloseTimerRef.current) {
            clearTimeout(textureCloseTimerRef.current);
            textureCloseTimerRef.current = null;
        }

        const timer = setTimeout(async () => {
            if (!emitter || !emitter.textures || emitter.textures.length === 0) return;

            const textureData = [];

            for (const tex of emitter.textures) {
                if (activeConversions.current.has(tex.path)) continue;
                activeConversions.current.add(tex.path);
                try {
                    const projectRoot = filePath ? path.dirname(filePath) : null;
                    const result = await convertTextureToPNG(tex.path, filePath, filePath, projectRoot);

                    let dataUrl = null;
                    if (result) {
                        if (result.startsWith('data:')) {
                            dataUrl = result;
                        } else if (fs && fs.existsSync(result)) {
                            const buffer = fs.readFileSync(result);
                            dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
                        }
                    }

                    // Resolve disk path
                    let resolvedDiskPath = tex.path;
                    if (fs && filePath) {
                        const normalizedBin = filePath.replace(/\\/g, '/');
                        const dataMatch = normalizedBin.match(/\/data\//i);
                        if (dataMatch) {
                            const projRoot = normalizedBin.substring(0, dataMatch.index);
                            const clean = tex.path.replace(/\\/g, '/');
                            const cand = path.join(projRoot, clean);
                            if (fs.existsSync(cand)) resolvedDiskPath = cand;
                        }
                        if (resolvedDiskPath === tex.path) {
                            const smart = findActualTexturePath(tex.path, filePath);
                            if (smart) resolvedDiskPath = smart;
                        }
                    }

                    if (dataUrl) {
                        textureData.push({ ...tex, dataUrl, resolvedDiskPath });
                    }
                } catch (e) {
                    console.warn(e);
                } finally {
                    activeConversions.current.delete(tex.path);
                }
            }

            if (textureData.length === 0 && emitter.textures.length > 0) {
                showTextureError(emitter.textures[0].path, buttonElement);
            } else {
                showTexturePreview(textureData, buttonElement);
            }

        }, 200);
        conversionTimers.current.set('hover', timer);
    }, [filePath, showTexturePreview, showTextureError]);

    const handleTextureLeave = useCallback(() => {
        if (conversionTimers.current.has('hover')) {
            clearTimeout(conversionTimers.current.get('hover'));
            conversionTimers.current.delete('hover');
        }
        if (!textureCloseTimerRef.current) {
            textureCloseTimerRef.current = setTimeout(() => {
                const existing = document.getElementById('paint2-texture-hover-preview');
                if (existing) existing.remove();
                textureCloseTimerRef.current = null;
            }, 500);
        }
    }, []);

    const handleTextureClick = useCallback(async (emitter) => {
        // This is handled nicely by the preview now, OR we can keep this for clicking the button directly
        if (!emitter || !emitter.textures || emitter.textures.length === 0) return;
        const main = emitter.textures.find(t => t.label === 'Main Texture') || emitter.textures[0];

        // Use conversion to get resolved path if possible or just try finding it
        if (main && filePath) {
            const resolved = findActualTexturePath(main.path, filePath) || main.path;
            // Try to convert if needed for display, but for clicking just opening is fine
            // If we want the nice preview, we rely on the hover menu.
            // But user might click the icon directly.
            // Let's just open the basic one.
            openAssetPreview(resolved);
        }
    }, [filePath]);

    // Styles
    const controlLabelStyle = {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.75rem',
        color: 'var(--accent-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    };

    // === VISIBLE SELECTION COUNT CALCULATION ===
    const visibleSelectionCount = useMemo(() => {
        if (!parsedFile || selection.size === 0) return 0;
        if (!searchQuery && variantFilter === 'all') return selection.size;

        const searchLower = searchQuery.toLowerCase();
        let count = 0;

        for (const emitterKey of selection) {
            const emitter = parsedFile.emitters.get(emitterKey);
            if (!emitter) continue;

            // 1. Variant Filter
            if (variantFilter === 'v1' && !emitter.name.toLowerCase().endsWith('_variant1')) continue;
            if (variantFilter === 'v2' && !emitter.name.toLowerCase().endsWith('_variant2')) continue;

            // 2. Search Query
            if (searchQuery) {
                const system = parsedFile.systems.get(emitter.systemKey);
                const systemMatches = (system?.name || '').toLowerCase().includes(searchLower) ||
                    (emitter.systemKey || '').toLowerCase().includes(searchLower);

                if (!systemMatches) {
                    const emitterMatches = (emitter.name || '').toLowerCase().includes(searchLower) ||
                        (searchByTexture && ((emitter.texturePath && emitter.texturePath.toLowerCase().includes(searchLower)) ||
                            (emitter.textures && emitter.textures.some(t => t.path.toLowerCase().includes(searchLower)))));

                    if (!emitterMatches) continue;
                }
            }
            count++;
        }
        return count;
    }, [parsedFile, selection, searchQuery, variantFilter, searchByTexture]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%', // Use 100% to fit within parent (App.js TitleBar offset)
            background: 'var(--bg)',
            color: 'var(--accent)',
            overflow: 'hidden'
        }} className="paint2-container">
            {/* Top Toolbar */}
            <Toolbar
                filePath={filePath}
                isLoading={isLoading}
                onFileOpen={handleFileOpen}
                mode={mode}
                onModeChange={setMode}
            />

            {/* Hue Slider (If mode is Shift Hue) */}
            {mode === 'shift-hue' && (
                <Box sx={{ padding: '8px 40px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ ...controlLabelStyle, width: 80 }}>Target: {hueTarget}°</Typography>
                        <Slider
                            value={hueTarget}
                            onChange={(_, v) => {
                                setHueTarget(v);
                                setStatusMessage(`Hue Target Ready: ${v}° (Press Recolor to apply)`);
                            }}
                            min={0}
                            max={360}
                            size="small"
                            sx={{
                                '& .MuiSlider-track': { background: 'transparent', border: 'none' },
                                '& .MuiSlider-rail': {
                                    height: '6px',
                                    opacity: 1,
                                    background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                                },
                                '& .MuiSlider-thumb': {
                                    width: 24, height: 24,
                                    background: 'var(--accent)',
                                    border: '3px solid var(--bg)',
                                    '&:hover': { boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent), transparent 84%)' }
                                }
                            }}
                        />
                    </Box>
                </Box>
            )}

            {/* HSL Shift Sliders (If mode is Shift) */}
            {mode === 'shift' && (
                <Box sx={{ padding: '8px 40px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Hue Shift */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ ...controlLabelStyle, width: 80 }}>Hue: {hslValues.h}°</Typography>
                        <Slider
                            value={hslValues.h}
                            onChange={(_, v) => {
                                setHslValues(prev => ({ ...prev, h: v }));
                                setStatusMessage(`HSL Shift Ready: H:${v}° S:${hslValues.s}% L:${hslValues.l}%`);
                            }}
                            min={-180}
                            max={180}
                            size="small"
                        />
                    </Box>
                    {/* Saturation Shift */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ ...controlLabelStyle, width: 80 }}>Sat: {hslValues.s}%</Typography>
                        <Slider
                            value={hslValues.s}
                            onChange={(_, v) => {
                                setHslValues(prev => ({ ...prev, s: v }));
                                setStatusMessage(`HSL Shift Ready: H:${hslValues.h}° S:${v}% L:${hslValues.l}%`);
                            }}
                            min={-100}
                            max={100}
                            size="small"
                        />
                    </Box>
                    {/* Lightness Shift */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ ...controlLabelStyle, width: 80 }}>Lig: {hslValues.l}%</Typography>
                        <Slider
                            value={hslValues.l}
                            onChange={(_, v) => {
                                setHslValues(prev => ({ ...prev, l: v }));
                                setStatusMessage(`HSL Shift Ready: H:${hslValues.h}° S:${hslValues.s}% L:${v}%`);
                            }}
                            min={-100}
                            max={100}
                            size="small"
                        />
                    </Box>
                </Box>
            )}

            <PaletteManager
                mode={mode}
                palette={palette}
                setPalette={setPalette}
                colorCount={colorCount}
                setColorCount={setColorCount}
                savedPalettesList={savedPalettesList}
                onSavePalette={handleSavePalette}
                onLoadPalette={handleLoadPalette}
                onDeletePalette={handleDeletePalette}
                sx={{ flexShrink: 0 }}
            />

            {/* Texture Preview Popover Removed - replaced by DOM injection */}

            {/* Sub-Toolbar Row 1: BM & Visibility (hidden in materials mode) */}
            {mode !== 'materials' && (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between', // Split left and right
                    padding: '4px 16px',
                    gap: 2,
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: 'var(--surface)',
                    flexShrink: 0
                }}>
                    {/* Left Side: Blend Mode Controls */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ ...controlLabelStyle, opacity: 0.6 }}>BM:</Typography>
                            <Select
                                value={blendModeSelect}
                                onChange={(e) => setBlendModeSelect(e.target.value)}
                                size="small"
                                sx={{
                                    height: 24, fontSize: '0.75rem', color: 'var(--accent)',
                                    '& fieldset': { border: 'none' },
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '4px'
                                }}
                            >
                                <MenuItem value={0}>0</MenuItem>
                                <MenuItem value={1}>1</MenuItem>
                                <MenuItem value={2}>2</MenuItem>
                                <MenuItem value={3}>3</MenuItem>
                                <MenuItem value={4}>4</MenuItem>
                            </Select>
                        </Box>

                        <Button
                            size="small"
                            onClick={handleSelectByBlendMode}
                            sx={{
                                height: 24, textTransform: 'none', background: 'rgba(255,255,255,0.05)',
                                color: 'var(--accent-muted)', fontSize: '0.75rem', px: 1,
                                '&:hover': { background: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            Select BM{blendModeSelect}
                        </Button>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Slider
                                size="small"
                                value={blendModeChance}
                                onChange={(_, v) => setBlendModeChance(v)}
                                sx={{ width: 80, color: 'var(--accent)' }}
                            />
                            <Typography sx={{ ...controlLabelStyle, opacity: 0.5, minWidth: '35px' }}>{blendModeChance}%</Typography>
                        </Box>
                    </Box>

                    {/* Right Side: Color Targets */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetLC} onChange={e => setTargetLC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} />
                            LC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetOC} onChange={e => setTargetOC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} />
                            OC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBC} onChange={e => setTargetBC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} />
                            BC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBaseColor} onChange={e => setTargetBaseColor(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} />
                            Color
                        </Box>
                    </Box>
                </Box>
            )}

            {/* Materials Mode Info Bar */}
            {mode === 'materials' && (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    gap: 2,
                    borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 85%)',
                    background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 92%), transparent)',
                    flexShrink: 0
                }}>
                    <PaletteIcon sx={{ color: 'var(--accent)', fontSize: 18 }} />
                    <Typography sx={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.8rem',
                        color: 'var(--accent)',
                        fontWeight: 500
                    }}>
                        Materials Only Mode — VFX systems hidden
                    </Typography>
                </Box>
            )}

            {/* Color Filter Controls */}
            {colorFilterEnabled && (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    gap: 1.5,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: 'color-mix(in srgb, var(--surface-2), black 10%)',
                    flexShrink: 0
                }}>
                    <Typography sx={{ ...controlLabelStyle, minWidth: '80px' }}>
                        Filter ({targetColors.length}):
                    </Typography>

                    {/* Target Colors Display */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: 1, alignItems: 'center' }}>
                        {targetColors.map((color, index) => {
                            const isDelete = deleteTargetIndex === index;
                            return (
                                <Box
                                    key={index}
                                    sx={{
                                        width: '24px',
                                        height: '24px',
                                        backgroundColor: isDelete
                                            ? '#ff4444'
                                            : `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
                                        border: `1px solid ${isDelete ? '#ff6666' : '#333'}`,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        color: 'white',
                                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                        '&:hover': {
                                            border: '1px solid var(--accent)'
                                        }
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (deleteTargetIndex === index) {
                                            const newColors = targetColors.filter((_, i) => i !== index);
                                            setTargetColors(newColors);
                                            setDeleteTargetIndex(null);
                                            return;
                                        }
                                        setDeleteTargetIndex(index);
                                    }}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDeleteTargetIndex(null);
                                        openFilterPicker(e, color, (vec4) => {
                                            const newColors = [...targetColors];
                                            newColors[index] = vec4;
                                            setTargetColors(newColors);
                                        });
                                    }}
                                    title={isDelete
                                        ? 'Click again to delete'
                                        : `${getColorDescription(color)} - Click to select for deletion, Double-click to edit`}
                                >
                                    {isDelete ? '-' : ''}
                                </Box>
                            );
                        })}

                        {/* Add Color Button */}
                        <Box
                            sx={{
                                width: '24px',
                                height: '24px',
                                border: '2px dashed var(--accent)',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'var(--accent)',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                '&:hover': {
                                    border: '2px solid var(--accent)',
                                    backgroundColor: 'rgba(139, 92, 246, 0.1)'
                                }
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetIndex(null);
                                openFilterPicker(e, [0.5, 0.5, 0.5, 1], (vec4) => {
                                    setTargetColors([...targetColors, vec4]);
                                });
                            }}
                            title="Add target color"
                        >
                            +
                        </Box>
                    </Box>

                    {/* Tolerance Slider */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: '200px' }}>
                        <Typography sx={{ ...controlLabelStyle, minWidth: '60px', fontSize: '0.7rem' }}>
                            Tol: {colorTolerance}
                        </Typography>
                        <Slider
                            value={colorTolerance}
                            onChange={(_, v) => setColorTolerance(v)}
                            min={0}
                            max={100}
                            size="small"
                            sx={{ flex: 1 }}
                        />
                    </Box>
                </Box>
            )}

            {/* Sub-Toolbar Row 2: Search */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 16px',
                gap: 1.5,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'color-mix(in srgb, var(--bg), black 15%)',
                flexShrink: 0
            }}>
                {/* Moved Select All here */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        size="small"
                        indeterminate={selection.size > 0 && parsedFile && selection.size < parsedFile.emitters.size}
                        checked={parsedFile && selection.size === parsedFile.emitters.size && selection.size > 0}
                        onChange={(e) => {
                            // If currently all selected or indeterminate, deselect all
                            // Otherwise, select all visible
                            const isAllSelected = parsedFile && selection.size === parsedFile.emitters.size && selection.size > 0;
                            const isIndeterminate = selection.size > 0 && parsedFile && selection.size < parsedFile.emitters.size;

                            if (isAllSelected || isIndeterminate) {
                                selectNone();
                            } else {
                                selectAllVisible();
                            }
                        }}
                        sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '2px' }}
                    />
                </Box>

                <TextField
                    size="small"
                    placeholder="Filter systems..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    variant="standard"
                    InputProps={{
                        disableUnderline: true,
                        sx: {
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.85rem',
                            color: 'var(--text-2)',
                            opacity: 0.8,
                            padding: '0 8px',
                            flex: 1
                        }
                    }}
                    sx={{ flex: 1 }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, gap: 1 }}>
                    <Select
                        value={variantFilter}
                        onChange={(e) => setVariantFilter(e.target.value)}
                        size="small"
                        variant="standard"
                        disableUnderline
                        sx={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.75rem',
                            color: variantFilter === 'all' ? 'rgba(255,255,255,0.4)' : 'var(--accent)',
                            minWidth: '85px',
                            '& .MuiSelect-select': { py: 0, display: 'flex', alignItems: 'center' },
                            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.2)', fontSize: '1rem' }
                        }}
                    >
                        <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Vars</MenuItem>
                        <MenuItem value="v1" sx={{ fontSize: '0.75rem' }}>Variant 1</MenuItem>
                        <MenuItem value="v2" sx={{ fontSize: '0.75rem' }}>Variant 2</MenuItem>
                    </Select>
                </Box>

                <IconButton
                    size="small"
                    onClick={toggleLockAll}
                    sx={{ color: 'var(--text-2)', opacity: 0.6, mr: 0.5 }}
                >
                    {lockedSystems.size > 0 ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>

                <IconButton
                    size="small"
                    onClick={(e) => setFilterAnchor(e.currentTarget)}
                    sx={{ color: 'var(--text-2)', opacity: 0.6 }}
                >
                    <TuneIcon fontSize="small" />
                </IconButton>

                <Menu
                    anchorEl={filterAnchor}
                    open={Boolean(filterAnchor)}
                    onClose={() => setFilterAnchor(null)}
                    PaperProps={{
                        sx: {
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            minWidth: '200px',
                            '& .MuiMenuItem-root': {
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem',
                                color: 'var(--text-2)',
                                '&:hover': { background: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }}
                >
                    <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, opacity: 0.6 }}>SETTINGS</Typography>
                    </Box>
                    <MenuItem onClick={() => {
                        const next = !autoExpand;
                        setAutoExpandWithRef(next);
                        if (electronPrefs) electronPrefs.set('PaintAutoExpand', next);

                        // Apply immediately if file is open
                        if (parsedFile) {
                            if (next) {
                                setExpandedSystems(new Set(parsedFile.systemOrder));
                                setExpandedMaterials(new Set(parsedFile.materialOrder || []));
                            } else {
                                setExpandedSystems(new Set());
                                setExpandedMaterials(new Set());
                            }
                        }
                    }}>
                        <Checkbox
                            size="small"
                            checked={autoExpand}
                            sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                        Auto-expand on load
                    </MenuItem>

                    <MenuItem onClick={() => setIgnoreBlackWhite(!ignoreBlackWhite)}>
                        <Checkbox
                            size="small"
                            checked={ignoreBlackWhite}
                            sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                        Ignore B/W
                    </MenuItem>

                    <MenuItem onClick={() => setColorFilterEnabled(!colorFilterEnabled)}>
                        <Checkbox
                            size="small"
                            checked={colorFilterEnabled}
                            sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                        Color Filter
                    </MenuItem>

                    <MenuItem onClick={() => setSearchByTexture(!searchByTexture)}>
                        <Checkbox
                            size="small"
                            checked={searchByTexture}
                            sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }}
                        />
                        Search Textures
                    </MenuItem>

                    <Box sx={{ px: 2, py: 1, mt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-2)', opacity: 0.4 }}>VIEW</Typography>
                    </Box>
                    <MenuItem onClick={() => {
                        if (parsedFile) {
                            setExpandedSystems(new Set(parsedFile.systemOrder));
                            setExpandedMaterials(new Set(parsedFile.materialOrder || []));
                        }
                        setFilterAnchor(null);
                    }}>
                        Expand All
                    </MenuItem>
                    <MenuItem onClick={() => {
                        setExpandedSystems(new Set());
                        setExpandedMaterials(new Set());
                        setFilterAnchor(null);
                    }}>
                        Collapse All
                    </MenuItem>
                </Menu>
            </Box>

            {/* Main List */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {parsedFile ? (
                    <SystemList
                        parsedFile={parsedFile}
                        selection={selection}
                        lockedSystems={lockedSystems}
                        expandedSystems={expandedSystems}
                        expandedMaterials={expandedMaterials}
                        searchQuery={searchQuery}
                        searchByTexture={searchByTexture} // Pass prop
                        variantFilter={variantFilter}
                        viewMode={mode} // Pass mode for filtering
                        showBirthColor={true} // Always show
                        showOC={true}
                        showLingerColor={true}
                        showBaseColor={true}
                        onToggleEmitter={toggleEmitterSelection}
                        onToggleSystem={selectSystem}
                        onSetBlendMode={handleSingleBlendModeChange} // NEW: Handle BM change
                        onToggleLock={(k) => setLockedSystems(prev => {
                            const next = new Set(prev);
                            if (next.has(k)) next.delete(k); else next.add(k);
                            return next;
                        })}
                        onToggleExpand={(k) => setExpandedSystems(prev => {
                            const next = new Set(prev);
                            if (next.has(k)) next.delete(k); else next.add(k);
                            return next;
                        })}
                        onToggleMaterialExpand={toggleMaterialExpand}
                        onToggleMaterialParam={toggleMaterialParam}
                        onMaterialParamValueChange={handleMaterialParamValueChange}
                        onTextureHover={handleTextureHover}
                        onTextureLeave={handleTextureLeave}
                        onTextureClick={handleTextureClick}
                        onColorClick={colors => {
                            const newPalette = colors.map(c => {
                                const h = new ColorHandler(c.rgba);
                                if (h.vec4) h.vec4[3] = 1;
                                h.a = 1;
                                h.time = c.time;
                                return h;
                            });
                            setPalette(newPalette);
                            setColorCount(newPalette.length);
                        }}
                    />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                        <Typography variant="h6">Open a .bin file to start</Typography>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box sx={{
                padding: '12px 24px',
                background: 'var(--bg)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                flexShrink: 0
            }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--accent-muted)', opacity: 0.8 }}>
                    {statusMessage}
                </Typography>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                        sx={{
                            flex: 1, height: 44, background: 'rgba(255,255,255,0.03)', color: 'var(--text-2)',
                            border: '1px solid rgba(255,255,255,0.1)', textTransform: 'none', fontWeight: 600,
                            '&:disabled': { opacity: 0.2 }
                        }}
                    >
                        Undo ({undoStack.length})
                    </Button>
                    <Button
                        onClick={handleRecolor}
                        disabled={selection.size === 0}
                        sx={{
                            flex: 3, height: 44, background: 'color-mix(in srgb, var(--accent), transparent 95%)', color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)', textTransform: 'none', fontWeight: 700,
                            fontSize: '1rem', '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
                        }}
                    >
                        Recolor Selected ({visibleSelectionCount})
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || fileSaved}
                        sx={{
                            flex: 1, height: 44, background: 'rgba(52, 211, 153, 0.05)', color: '#34d399',
                            border: '1px solid rgba(52, 211, 153, 0.3)', textTransform: 'none', fontWeight: 600
                        }}
                    >
                        Save Bin
                    </Button>
                </Box>
            </Box>

            {/* Scale/Naming Dialog */}
            <Dialog
                open={paletteNameDialogOpen}
                onClose={() => setPaletteNameDialogOpen(false)}
                PaperProps={{
                    sx: {
                        background: 'var(--surface-2)',
                        border: '1px solid color-mix(in srgb, var(--accent), transparent 80%)',
                        minWidth: '320px'
                    }
                }}
            >
                <DialogTitle sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem' }}>
                    Save Palette
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label="Palette Name"
                        value={newPaletteName}
                        onChange={(e) => setNewPaletteName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && confirmSavePalette()}
                        sx={{
                            mt: 1,
                            '& .MuiOutlinedInput-root': {
                                color: 'white',
                                fontFamily: 'JetBrains Mono, monospace',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                '&:hover fieldset': { borderColor: 'var(--accent)' },
                                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' }
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' },
                            '& .MuiInputLabel-root.Mui-focused': { color: 'var(--accent)' }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setPaletteNameDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'none' }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmSavePalette}
                        variant="contained"
                        sx={{
                            background: 'var(--accent)',
                            color: '#0b0a0f',
                            fontWeight: 700,
                            textTransform: 'none',
                            '&:hover': { background: '#d4a35d' }
                        }}
                    >
                        Save Palette
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                PaperProps={{
                    sx: {
                        background: 'var(--surface-2)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        minWidth: '300px'
                    }
                }}
            >
                <DialogTitle sx={{ color: '#ef4444', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem' }}>
                    Delete Palette?
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                        Are you sure you want to delete "{paletteToDelete !== null && savedPalettesList[paletteToDelete]?.name}"? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'none' }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmDeletePalette}
                        variant="contained"
                        sx={{
                            background: '#ef4444',
                            color: 'white',
                            fontWeight: 700,
                            textTransform: 'none',
                            '&:hover': { background: '#dc2626' }
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Unsaved Changes Dialog - Upscale Aesthetic Refactor */}
            <Dialog
                open={showUnsavedDialog}
                onClose={handleUnsavedCancel}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#020203',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '24px',
                        boxShadow: '0 50px 120px rgba(0, 0, 0, 1)',
                        overflow: 'hidden',
                        position: 'relative'
                    }
                }}
            >
                {/* Dual Accent Animated Bar - Solid Color Refactor */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite',
                        zIndex: 10,
                        '@keyframes shimmer': {
                            '0%': { backgroundPosition: '200% 0' },
                            '100%': { backgroundPosition: '-200% 0' },
                        },
                    }}
                />
                {/* Header Bar */}
                <Box sx={{
                    p: 2.2,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)'
                }}>
                    <Typography sx={{
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        letterSpacing: '0.05em',
                        color: 'var(--accent)',
                        textTransform: 'uppercase'
                    }}>
                        ⚠️ Unsaved Changes
                    </Typography>
                    <IconButton size="small" onClick={handleUnsavedCancel} sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#f87171' } }}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>

                <DialogContent sx={{ p: 4, textAlign: 'center', background: 'transparent' }}>
                    <Typography sx={{
                        color: 'var(--text)',
                        fontSize: '1rem',
                        fontWeight: 500,
                        mb: 1.5
                    }}>
                        You have unsaved changes in <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 700 }}>{fileName}</Box>.
                    </Typography>
                    <Typography sx={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.85rem',
                        lineHeight: 1.6
                    }}>
                        What would you like to do before leaving?
                    </Typography>
                </DialogContent>

                <DialogActions sx={{ p: 3, pt: 0, flexDirection: 'column', gap: 1.25, background: 'transparent' }}>
                    <Button
                        fullWidth
                        variant="contained"
                        onClick={handleUnsavedSave}
                        sx={{
                            background: '#14aa4bff !important',
                            color: '#f3fff3ff !important',
                            fontWeight: 900,
                            textTransform: 'none',
                            fontSize: '0.85rem',
                            borderRadius: '12px',
                            py: 1.25,
                            boxShadow: '0 4px 14px rgba(34, 197, 94, 0.3)',
                            '&:hover': {
                                background: '#22c55e',
                                filter: 'brightness(1.15)',
                                transform: 'translateY(-1.5px)',
                                boxShadow: '0 6px 20px rgba(34, 197, 94, 0.4)'
                            },
                        }}
                    >
                        Save & Continue
                    </Button>

                    <Box sx={{ display: 'flex', width: '100%', gap: 1.25 }}>
                        <Button
                            fullWidth
                            onClick={handleUnsavedDiscard}
                            sx={{
                                background: 'rgba(239, 68, 68, 0.05)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                fontWeight: 700,
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                borderRadius: '10px',
                                py: 1,
                                '&:hover': { background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }
                            }}
                        >
                            Discard Changes
                        </Button>
                        <Button
                            fullWidth
                            onClick={handleUnsavedCancel}
                            sx={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                color: 'rgba(255, 255, 255, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                fontWeight: 700,
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                borderRadius: '10px',
                                py: 1,
                                '&:hover': { background: 'rgba(255, 255, 255, 0.06)', color: '#fff' }
                            }}
                        >
                            Stay Here
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            {/* Floating Backup Viewer Button */}
            {filePath && (
                <Tooltip title="Backup History" placement="left" arrow>
                    <IconButton
                        onClick={handleOpenBackupViewer}
                        aria-label="View Backup History"
                        sx={{
                            position: 'fixed',
                            bottom: 80,
                            right: 24,
                            width: 40,
                            height: 40,
                            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 85%), color-mix(in srgb, var(--accent), transparent 92%))',
                            border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
                            color: 'var(--accent)',
                            backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 75%), color-mix(in srgb, var(--accent), transparent 85%))',
                                transform: 'scale(1.05)',
                                boxShadow: '0 4px 20px color-mix(in srgb, var(--accent), transparent 70%)'
                            }
                        }}
                    >
                        <HistoryIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Tooltip>
            )}

            {/* Backup Viewer Dialog */}
            <BackupViewer
                open={showBackupViewer}
                onClose={(restored) => {
                    setShowBackupViewer(false);
                    if (restored) {
                        if (!fileSaved) {
                            if (window.confirm('You have unsaved changes. Restoring a backup will overwrite them. Continue?')) {
                                performBackupRestore();
                            } else {
                                setStatusMessage('Backup restore cancelled - unsaved changes preserved');
                                return;
                            }
                        } else {
                            performBackupRestore();
                        }
                    }
                }}
                filePath={filePath ? filePath.replace('.bin', '.py') : ''}
                component="Paint2"
            />

            {/* Ritobin Warning Modal */}
            <RitobinWarningModal
                open={showRitobinWarning}
                onClose={() => {
                    setShowRitobinWarning(false);
                    setRitobinWarningContent(null);
                }}
                navigate={navigate}
                content={ritobinWarningContent}
                onContinueAnyway={() => {
                    setShowRitobinWarning(false);
                    setRitobinWarningContent(null);
                    // File is already loaded, just clear the warning
                    if (parsedFile) {
                        setStatusMessage(`Loaded ${parsedFile.stats.systemCount} systems and ${parsedFile.stats.emitterCount} emitters`);
                    }
                }}
            />
        </Box >
    );
}

export default Paint2;
