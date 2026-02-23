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


// Utils
import { parseVfxFile } from './utils/parser.js';
import { applyPaletteToEmitters, applyPaletteToMaterials } from './utils/colorOps.js';
import { ToPyWithPath, ToBin } from '../../utils/io/fileOperations.js';
import { loadFileWithBackup, createBackup } from '../../utils/io/backupManager.js';
import { reparseBinWithFreshPy } from '../../utils/io/reparseHelpers.js';
import ColorHandler from '../../utils/colors/ColorHandler.js';
import { savePalette, loadAllPalettes, deletePalette } from './utils/paletteManager.js';
import { createColorFilter, getColorDescription } from '../../utils/colors/colorFilter.js';
import { CreatePicker } from '../../utils/colors/colorUtils.js';

// Components
import Toolbar from './components/Toolbar';
import SystemList from './components/SystemList';
import PaletteManager from './components/PaletteManager';
import BackupViewer from '../../components/modals/BackupViewer';
import RitobinWarningModal, { detectHashedContent } from '../../components/modals/RitobinWarningModal';
import CombineLinkedBinsModal from '../../components/modals/CombineLinkedBinsModal';
import { useCombineLinkedBinsCheck } from '../../hooks/useCombineLinkedBinsCheck.js';
import RitoBinErrorDialog from '../../components/modals/RitoBinErrorDialog';
import UnsavedChangesModal from '../../components/modals/UnsavedChangesModal';
import electronPrefs from '../../utils/core/electronPrefs.js';
import HistoryIcon from '@mui/icons-material/History';
import { Popover } from '@mui/material'; // Kept if needed elsewhere, but unmounting for texture
import { convertTextureToPNG, findActualTexturePath } from '../../utils/assets/textureConverter.js';
import { openAssetPreview } from '../../utils/assets/assetPreviewEvent.js';
import useUnsavedNavigationGuard from '../../hooks/navigation/useUnsavedNavigationGuard.js';
import VfxFloatingActions from '../../components/floating/VfxFloatingActions';
import {
    cancelTextureHoverClose,
    removeTextureHoverPreview,
    scheduleTextureHoverClose,
    showTextureHoverError,
    showTextureHoverPreview
} from '../../components/modals/textureHoverPreview.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const ShiftHueControl = React.memo(function ShiftHueControl({
    value,
    controlLabelStyle,
    onCommit,
    onStatus
}) {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    return (
        <Box sx={{ padding: '8px 40px', background: 'var(--glass-bg, rgba(18, 18, 24, 0.55))', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.1))', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Target: {draft}°</Typography>
                <Slider
                    value={draft}
                    onChange={(_, v) => {
                        const next = Array.isArray(v) ? v[0] : v;
                        setDraft(next);
                    }}
                    onChangeCommitted={(_, v) => {
                        const next = Array.isArray(v) ? v[0] : v;
                        setDraft(next);
                        onCommit(next);
                        onStatus(`Hue Target Ready: ${next}° (Press Recolor to apply)`);
                    }}
                    min={0}
                    max={360}
                    size="small"
                    sx={{
                        '& .MuiSlider-track': { background: 'transparent', border: 'none' },
                        '& .MuiSlider-rail': {
                            height: '5px',
                            opacity: 1,
                            background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                        },
                        '& .MuiSlider-thumb': {
                            width: 14,
                            height: 14,
                            background: 'var(--accent)',
                            border: '2px solid rgba(255,255,255,0.75)',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                            transition: 'all 0.16s ease',
                            '&:hover': { boxShadow: '0 0 0 6px color-mix(in srgb, var(--accent), transparent 84%)' },
                            '&.Mui-active': {
                                boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent), transparent 80%)',
                            }
                        }
                    }}
                />
            </Box>
        </Box>
    );
});

const HslShiftControls = React.memo(function HslShiftControls({
    values,
    controlLabelStyle,
    onCommit,
    onStatus
}) {
    const [draft, setDraft] = useState(values);

    useEffect(() => {
        setDraft(values);
    }, [values.h, values.s, values.l]);

    const commitPart = (part, value) => {
        const nextValue = Array.isArray(value) ? value[0] : value;
        const next = { ...draft, [part]: nextValue };
        setDraft(next);
        onCommit(next);
        onStatus(`HSL Shift Ready: H:${next.h}° S:${next.s}% L:${next.l}%`);
    };

    return (
        <Box sx={{ padding: '8px 40px', background: 'var(--glass-bg, rgba(18, 18, 24, 0.55))', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.1))', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Hue: {draft.h}°</Typography>
                <Slider
                    value={draft.h}
                    onChange={(_, v) => {
                        const next = Array.isArray(v) ? v[0] : v;
                        setDraft(prev => ({ ...prev, h: next }));
                    }}
                    onChangeCommitted={(_, v) => commitPart('h', v)}
                    min={-180}
                    max={180}
                    size="small"
                />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Sat: {draft.s}%</Typography>
                <Slider
                    value={draft.s}
                    onChange={(_, v) => {
                        const next = Array.isArray(v) ? v[0] : v;
                        setDraft(prev => ({ ...prev, s: next }));
                    }}
                    onChangeCommitted={(_, v) => commitPart('s', v)}
                    min={-100}
                    max={100}
                    size="small"
                />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Lig: {draft.l}%</Typography>
                <Slider
                    value={draft.l}
                    onChange={(_, v) => {
                        const next = Array.isArray(v) ? v[0] : v;
                        setDraft(prev => ({ ...prev, l: next }));
                    }}
                    onChangeCommitted={(_, v) => commitPart('l', v)}
                    min={-100}
                    max={100}
                    size="small"
                />
            </Box>
        </Box>
    );
});

const BlendModeChanceSlider = React.memo(function BlendModeChanceSlider({
    value,
    controlLabelStyle,
    onCommit
}) {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Slider
                size="small"
                value={draft}
                onChange={(_, v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    setDraft(next);
                }}
                onChangeCommitted={(_, v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    setDraft(next);
                    onCommit(next);
                }}
                sx={{ width: 80, color: 'var(--accent)' }}
            />
            <Typography sx={{ ...controlLabelStyle, opacity: 0.5, minWidth: '35px' }}>{draft}%</Typography>
        </Box>
    );
});


function Paint2() {
    const navigate = useNavigate();
    const { checkAndPromptCombine, combineModalState, handleCombineYes, handleCombineNo } = useCombineLinkedBinsCheck();

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
    const [showBackupViewer, setShowBackupViewer] = useState(false);
    const [showRitobinWarning, setShowRitobinWarning] = useState(false);
    const [ritobinWarningContent, setRitobinWarningContent] = useState(null);
    const [showRitoBinErrorDialog, setShowRitoBinErrorDialog] = useState(false);

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
    const [searchByTexture, setSearchByTexture] = useState(false);

    // Persist auto-expand across sessions/navigations
    useEffect(() => {
        const loadPrefs = async () => {
            if (electronPrefs) {
                await electronPrefs.initPromise; // Ensure prefs loaded
                const savedExpand = await electronPrefs.get('PaintAutoExpand');
                if (savedExpand === undefined) {
                    // First install/default: enable auto-expand on load.
                    setAutoExpandWithRef(true);
                    await electronPrefs.set('PaintAutoExpand', true);
                } else {
                    setAutoExpandWithRef(savedExpand);
                }

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
                await checkAndPromptCombine(binPath);
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
            const errorText = String(error?.message || '').toLowerCase();
            if (errorText.includes('bin conversion failed') || errorText.includes('ritobin')) {
                setShowRitoBinErrorDialog(true);
            }
        } finally {
            setIsLoading(false);
        }
    }, [filePath]);

    const unsavedGuard = useUnsavedNavigationGuard({
        fileSaved,
        setFileSaved,
        onSave: handleSave,
        navigate,
    });

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
                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const margin = 8;
                        const pickerWidth = picker.offsetWidth || 280;
                        const pickerHeight = picker.offsetHeight || 320;

                        let left = rect.left;
                        let top = rect.bottom + 6;

                        if (left + pickerWidth + margin > vw) {
                            left = Math.max(margin, vw - pickerWidth - margin);
                        }

                        if (top + pickerHeight + margin > vh) {
                            const aboveTop = rect.top - pickerHeight - 6;
                            if (aboveTop >= margin) {
                                top = aboveTop;
                            } else {
                                top = Math.max(margin, vh - pickerHeight - margin);
                            }
                        }

                        picker.style.position = 'fixed';
                        picker.style.left = `${Math.round(left)}px`;
                        picker.style.top = `${Math.round(top)}px`;
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
                const autoLoadRaw = await electronPrefs.get('AutoLoadEnabled');
                const autoEnabled = autoLoadRaw === true || autoLoadRaw === 'true' || autoLoadRaw === 1;
                if (!autoEnabled) return;

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
    const showTexturePreview = useCallback((textureData, buttonElement, colorData = []) => {
        showTextureHoverPreview({
            previewId: "shared-texture-hover-preview",
            textureData,
            buttonElement,
            colorData,
        });
    }, []);
    const showTextureError = useCallback((texturePath, buttonElement) => {
        showTextureHoverError({
            previewId: "shared-texture-hover-preview",
            texturePath,
            buttonElement,
        });
    }, []);


    const handleTextureHover = useCallback(async (event, emitter) => {
        const buttonElement = event.currentTarget;
        if (!buttonElement) return;
        cancelTextureHoverClose('shared-texture-hover-preview');

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
            scheduleTextureHoverClose('shared-texture-hover-preview', 500);
            textureCloseTimerRef.current = null;
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
            removeTextureHoverPreview('shared-texture-hover-preview');
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

    const hasResourceResolver = useMemo(
        () => parsedFile?.lines?.some(l => /\bResourceResolver\s*\{/m.test(l)) || false,
        [parsedFile]
    );
    const hasSkinCharacterData = useMemo(
        () => parsedFile?.lines?.some(l => /=\s*SkinCharacterDataProperties\s*\{/m.test(l)) || false,
        [parsedFile]
    );

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
                <ShiftHueControl
                    value={hueTarget}
                    controlLabelStyle={controlLabelStyle}
                    onCommit={setHueTarget}
                    onStatus={setStatusMessage}
                />
            )}

            {/* HSL Shift Sliders (If mode is Shift) */}
            {mode === 'shift' && (
                <HslShiftControls
                    values={hslValues}
                    controlLabelStyle={controlLabelStyle}
                    onCommit={setHslValues}
                    onStatus={setStatusMessage}
                />
            )}
            <PaletteManager
                mode={mode}
                palette={palette}
                setPalette={setPalette}
                colorCount={colorCount}
                setColorCount={setColorCount}
                savedPalettesList={savedPalettesList}
                onLoadPalette={handleLoadPalette}
                onPalettesChanged={refreshSavedPalettes}
                onStatus={setStatusMessage}
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
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '0.82rem',
                                    color: 'var(--text)',
                                    height: '26px',
                                    minWidth: '60px',
                                    borderRadius: '8px',
                                    background: 'rgba(18, 20, 28, 0.55)',
                                    border: '1px solid rgba(255, 255, 255, 0.24)',
                                    transition: 'all 160ms ease',
                                    '& .MuiSelect-select': { padding: '3px 10px', paddingRight: '28px !important' },
                                    '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.78)', fontSize: '1rem' },
                                    '&:hover': { background: 'rgba(34, 38, 52, 0.62)', borderColor: 'rgba(255,255,255,0.52)', boxShadow: '0 8px 18px rgba(0,0,0,0.28)' },
                                    '&.Mui-focused': { borderColor: 'color-mix(in srgb, var(--accent2), transparent 35%)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent2), transparent 75%)' },
                                    '& fieldset': { border: 'none' },
                                    '&:hover fieldset': { border: 'none' },
                                    '&.Mui-focused fieldset': { border: 'none' }
                                }}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            mt: 0.6,
                                            background: 'var(--glass-bg, rgba(20, 20, 24, 0.94))',
                                            border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
                                            borderRadius: '12px',
                                            boxShadow: '0 20px 48px rgba(0,0,0,0.5), 0 0 16px color-mix(in srgb, var(--accent2), transparent 80%)',
                                            backdropFilter: 'saturate(180%) blur(12px)',
                                            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                                            overflow: 'hidden',
                                            '& .MuiMenu-list': { py: 0.5 },
                                            '& .MuiMenuItem-root': {
                                                fontFamily: 'JetBrains Mono, monospace',
                                                fontSize: '0.82rem',
                                                color: 'var(--text-2)',
                                                mx: 0.6,
                                                borderRadius: '8px',
                                                minHeight: '34px',
                                                transition: 'all 140ms ease',
                                                '&:hover': { background: 'rgba(255,255,255,0.07)', color: 'var(--text)' },
                                                '&.Mui-selected': { background: 'color-mix(in srgb, var(--accent), transparent 85%)', color: 'var(--accent)', fontWeight: 700 },
                                                '&.Mui-selected:hover': { background: 'color-mix(in srgb, var(--accent), transparent 80%)' }
                                            }
                                        }
                                    }
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
                                background: 'color-mix(in srgb, var(--accent), transparent 95%)',
                                border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                                color: 'var(--accent)',
                                borderRadius: '4px',
                                textTransform: 'none',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.78rem',
                                padding: '1px 10px',
                                minWidth: 'auto',
                                height: '26px',
                                '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent)' }
                            }}
                        >
                            Select BM{blendModeSelect}
                        </Button>

                        <BlendModeChanceSlider
                            value={blendModeChance}
                            controlLabelStyle={controlLabelStyle}
                            onCommit={setBlendModeChance}
                        />
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
                        Materials Only Mode â€” VFX systems hidden
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

            <UnsavedChangesModal
                open={unsavedGuard.showUnsavedDialog}
                onCancel={unsavedGuard.handleUnsavedCancel}
                onSave={unsavedGuard.handleUnsavedSave}
                onDiscard={unsavedGuard.handleUnsavedDiscard}
                fileName={fileName}
            />

            {/* Floating Tools Drawer */}
            {filePath && (
                <VfxFloatingActions
                    targetPyContent={parsedFile?.lines?.join('\n')}
                    isProcessing={isLoading}
                    handleOpenBackupViewer={handleOpenBackupViewer}
                    hasResourceResolver={hasResourceResolver}
                    hasSkinCharacterData={hasSkinCharacterData}
                    showPortAllButton={false}
                    showNewSystemButton={false}
                    showPersistentButton={false}
                />
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
                onReparseFromBin={async () => {
                    if (filePath) {
                        await reparseBinWithFreshPy({
                            sourcePath: filePath,
                            reparseFn: loadBinFile,
                            logPrefix: '[Paint2]',
                        });
                    }
                }}
                onContinueAnyway={() => {
                    setShowRitobinWarning(false);
                    setRitobinWarningContent(null);
                    // File is already loaded, just clear the warning
                    if (parsedFile) {
                        setStatusMessage(`Loaded ${parsedFile.stats.systemCount} systems and ${parsedFile.stats.emitterCount} emitters`);
                    }
                }}
            />

            {/* Combine Linked BINs Modal */}
            <CombineLinkedBinsModal
                open={combineModalState.open}
                linkCount={combineModalState.linkCount}
                onYes={handleCombineYes}
                onNo={handleCombineNo}
            />

            <RitoBinErrorDialog
                open={showRitoBinErrorDialog}
                onClose={() => setShowRitoBinErrorDialog(false)}
                onRestoreBackup={() => {
                    performBackupRestore();
                    setShowRitoBinErrorDialog(false);
                }}
            />
        </Box >
    );
}

export default Paint2;

