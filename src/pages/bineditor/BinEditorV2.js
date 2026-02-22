/**
 * BinEditorV2 - Clean, simplified VFX Bin Editor
 * 
 * A complete rewrite focused on:
 * - Simple, reliable parsing and serialization
 * - Clean UI without complex modes
 * - Efficient, targeted edits that don't corrupt data
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    parsePyFile,
    getParseStats,
    serializeToFile,
    scaleBirthScale,
    scaleScale0,
    addBindWeight,
    setBindWeight,
    addTranslationOverride,
    setTranslationOverride,
    scaleTranslationOverride,
    scaleParticleLifetime,
    scaleLifetime,
    searchEmitters,
    createEmitterKey,
    updateParticleLifetime,
    updateLifetime,
    updateParticleLinger,
    updateRate,
    setMiscRenderFlags,
    addMiscRenderFlags
} from './utils/binEditor/index.js';
import {
    updateBirthScale,
    updateScale0,
    updateBindWeight,
    updateTranslationOverride,
    updateMiscRenderFlags,
    markSystemModified,
    updateRate as updateRateSerializer
} from './utils/binEditor/serializer.js';
import GlowingSpinner from '../../components/GlowingSpinner.js';
import RitobinWarningModal, { detectHashedContent } from '../../components/modals/RitobinWarningModal';
import CombineLinkedBinsModal from '../../components/modals/CombineLinkedBinsModal';
import { useCombineLinkedBinsCheck } from '../../hooks/useCombineLinkedBinsCheck.js';
import electronPrefs from '../../utils/core/electronPrefs.js';
import { openAssetPreview } from '../../utils/assets/assetPreviewEvent';
import { convertTextureToPNG, findActualTexturePath } from '../../utils/assets/textureConverter';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import UnsavedChangesModal from '../../components/modals/UnsavedChangesModal';
import useUnsavedNavigationGuard from '../../hooks/navigation/useUnsavedNavigationGuard.js';
import {
    cancelTextureHoverClose,
    showTextureHoverPreview,
    showTextureHoverError,
    removeTextureHoverPreview,
    scheduleTextureHoverClose
} from '../../components/modals/textureHoverPreview.js';

// Icons (using simple Unicode for now)
const ICONS = {
    folder: '',
    save: '',
    undo: '',
    expand: '▼',
    collapse: '▶',
    search: '',
    scale: '',
    check: '✓'
};

// Helper to parse numbers with both comma and period as decimal separators
const parseLocaleFloat = (value) => {
    if (typeof value === 'number') return value;
    if (!value || typeof value !== 'string') return NaN;
    // Replace comma with period for European locales
    const normalized = value.replace(',', '.');
    return parseFloat(normalized);
};

export default function BinEditorV2() {
    const navigate = useNavigate();
    const { checkAndPromptCombine, combineModalState, handleCombineYes, handleCombineNo } = useCombineLinkedBinsCheck();
    // ============ STATE ============
    const [data, setData] = useState(null);                    // Parsed file data
    const [originalContent, setOriginalContent] = useState(''); // Content when file was loaded (for restore)
    const [initialContent, setInitialContent] = useState('');   // Very first content (survives saves)
    const [undoHistory, setUndoHistory] = useState([]);         // Stack of previous states for undo
    const [currentPath, setCurrentPath] = useState(null);       // Current .py file path
    const [binPath, setBinPath] = useState(null);               // Original .bin path

    const [selectedEmitters, setSelectedEmitters] = useState(new Set());
    const [expandedSystems, setExpandedSystems] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Load a .bin file to start');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showRitobinWarning, setShowRitobinWarning] = useState(false);
    const [ritobinWarningContent, setRitobinWarningContent] = useState(null);

    // Scale multiplier
    const [scaleMultiplier, setScaleMultiplier] = useState(2);

    // TranslationOverride bulk values
    const [toX, setToX] = useState(0);
    const [toY, setToY] = useState(0);
    const [toZ, setToZ] = useState(0);

    // Toolbar state
    const [toolbarTab, setToolbarTab] = useState('scale'); // 'scale', 'bindWeight', 'misc', 'to'

    // ============ REFS ============
    const fileInputRef = useRef(null);
    const activeConversions = useRef(new Set());
    const conversionTimers = useRef(new Map());
    const MAX_UNDO_HISTORY = 20; // Limit undo history size

    // ============ COMPUTED VALUES ============
    const stats = useMemo(() => {
        if (!data) return null;
        return getParseStats(data);
    }, [data]);

    const filteredSystems = useMemo(() => {
        if (!data) return [];

        const systems = Object.values(data.systems);

        if (!searchQuery.trim()) {
            return systems;
        }

        const query = searchQuery.toLowerCase();

        return systems.filter(system => {
            // Match system name
            if (system.name.toLowerCase().includes(query)) return true;
            if (system.displayName.toLowerCase().includes(query)) return true;

            // Match any emitter name
            return system.emitters.some(e =>
                e.name.toLowerCase().includes(query)
            );
        });
    }, [data, searchQuery]);

    const selectedEmitter = useMemo(() => {
        if (!data || selectedEmitters.size !== 1) return null;

        const [key] = selectedEmitters;
        const [systemName, emitterName] = key.split(':');

        const system = data.systems[systemName];
        if (!system) return null;

        return system.emitters.find(e => e.name === emitterName) || null;
    }, [data, selectedEmitters]);

    // ============ EFFECTS ============

    // ============ FILE OPERATIONS ============

    const processBinFile = useCallback(async (filePath) => {
        if (!window.require) {
            setStatusMessage('Error: Electron environment required');
            return;
        }

        try {
            // Check ritobin path
            let ritobinPath = await electronPrefs.get('RitoBinPath');
            if (!ritobinPath) {
                setStatusMessage('Error: Configure ritobin path in Settings first');
                setRitobinWarningContent(null);
                setShowRitobinWarning(true);
                return;
            }


            setBinPath(filePath);

            try {
                await electronPrefs.set('BinEditorLastBinPath', filePath);
            } catch (e) { console.warn('Failed to save BinEditor path', e); }

            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            const path = window.require('path');
            const fs = window.require('fs');
            const { execSync } = window.require('child_process');

            const binDir = path.dirname(filePath);
            const binName = path.basename(filePath, '.bin');
            const pyPath = path.join(binDir, `${binName}.py`);

            // Check if .py already exists
            if (!fs.existsSync(pyPath)) {
                setLoadingText('Converting .bin to .py...');
                await checkAndPromptCombine(filePath);

                try {
                    execSync(`"${ritobinPath}" "${filePath}"`, {
                        cwd: binDir,
                        timeout: 30000
                    });
                } catch (err) {
                    throw new Error(`Ritobin failed: ${err.message}`);
                }

                if (!fs.existsSync(pyPath)) {
                    throw new Error('Failed to create .py file');
                }
            }

            setLoadingText('Parsing file...');

            // Read and parse
            const content = fs.readFileSync(pyPath, 'utf8');

            // Check for hashed content
            const isHashed = detectHashedContent(content);
            if (isHashed) {
                setRitobinWarningContent(content);
                setShowRitobinWarning(true);
                setStatusMessage('Warning: File appears to have hashed content - check Ritobin configuration');
            } else {
                setRitobinWarningContent(null);
            }

            const parsed = parsePyFile(content);

            setData(parsed);
            setOriginalContent(content);
            setInitialContent(content);  // Store the very first content
            setUndoHistory([]);           // Clear undo history on new file load
            setCurrentPath(pyPath);
            setSelectedEmitters(new Set());
            setExpandedSystems(new Set());
            setHasUnsavedChanges(false);

            const parseStats = getParseStats(parsed);
            if (!isHashed) {
                setStatusMessage(`Loaded: ${parseStats.systemCount} systems, ${parseStats.emitterCount} emitters`);
            }

        } catch (error) {
            console.error('Load error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, []);

    const loadBinFile = useCallback(async () => {
        let binFilePath = binPath || undefined;
        if (!binFilePath) {
            try {
                binFilePath = await electronPrefs.get('BinEditorLastBinPath');
            } catch (e) { }
        }

        // Check if user prefers native file browser
        const useNativeFileBrowser = await electronPrefs.get('UseNativeFileBrowser');

        if (useNativeFileBrowser) {
            // Use native Windows file dialog
            try {
                if (window.require) {
                    const { ipcRenderer } = window.require('electron');
                    const path = window.require('path');
                    const result = await ipcRenderer.invoke('dialog:openFile', {
                        title: 'Select a .bin file',
                        defaultPath: binFilePath ? path.dirname(binFilePath) : undefined,
                        filters: [
                            { name: 'Bin Files', extensions: ['bin'] },
                            { name: 'All Files', extensions: ['*'] }
                        ],
                        properties: ['openFile']
                    });

                    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                        processBinFile(result.filePaths[0]);
                    }
                }
            } catch (error) {
                console.error('Error opening native file dialog:', error);
                setStatusMessage('Error opening file dialog: ' + error.message);
            }
        } else {
            // Use custom explorer
            openAssetPreview(binFilePath, null, 'bineditor-bin');
        }
    }, [binPath, processBinFile]);

    // Listen for file selection
    useEffect(() => {
        const handleAssetSelected = (e) => {
            const { path: filePath, mode } = e.detail || {};
            if (!filePath) return;

            if (mode === 'bineditor-bin') {
                processBinFile(filePath);
            }
        };

        window.addEventListener('asset-preview-selected', handleAssetSelected);
        return () => window.removeEventListener('asset-preview-selected', handleAssetSelected);
    }, [processBinFile]);

    const saveFile = useCallback(async () => {
        if (!data || !currentPath || !binPath) {
            setStatusMessage('Nothing to save');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Saving...');

            const fs = window.require('fs');
            const { execSync } = window.require('child_process');
            const path = window.require('path');

            // Serialize data back to file format
            const content = serializeToFile(data);

            // Write .py file
            fs.writeFileSync(currentPath, content, 'utf8');

            setLoadingText('Converting to .bin...');

            // Convert back to .bin
            const ritobinPath = await electronPrefs.get('RitoBinPath');
            execSync(`"${ritobinPath}" "${currentPath}"`, {
                cwd: path.dirname(currentPath),
                timeout: 30000
            });

            setOriginalContent(content);
            setUndoHistory([]);  // Clear undo history after saving (saved state is new baseline)
            setHasUnsavedChanges(false);
            setStatusMessage('Saved successfully');

        } catch (error) {
            console.error('Save error:', error);
            setStatusMessage(`Save failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [data, currentPath, binPath]);

    const fileSaved = !hasUnsavedChanges;
    const setFileSaved = useCallback((saved) => {
        setHasUnsavedChanges(!saved);
    }, []);

    const unsavedGuard = useUnsavedNavigationGuard({
        fileSaved,
        setFileSaved,
        onSave: saveFile,
        navigate,
    });

    const restoreOriginal = useCallback(async () => {
        // Use initialContent (original when first loaded) if available, otherwise originalContent (last loaded/saved)
        const contentToRestore = initialContent || originalContent;

        if (!contentToRestore || !currentPath) {
            setStatusMessage('Nothing to restore');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Restoring to original...');

            // Re-parse original content
            const parsed = parsePyFile(contentToRestore);

            // Write original back to file
            const fs = window.require('fs');
            const { execSync } = window.require('child_process');
            const path = window.require('path');
            fs.writeFileSync(currentPath, contentToRestore, 'utf8');

            setLoadingText('Converting to .bin...');

            // Convert back to .bin (same as save)
            const ritobinPath = await electronPrefs.get('RitoBinPath');
            execSync(`"${ritobinPath}" "${currentPath}"`, {
                cwd: path.dirname(currentPath),
                timeout: 30000
            });

            setData(parsed);
            setOriginalContent(contentToRestore);
            setUndoHistory([]); // Clear undo history after restore
            setHasUnsavedChanges(false);
            setSelectedEmitters(new Set());
            setStatusMessage('Restored to original');

        } catch (error) {
            console.error('Restore error:', error);
            setStatusMessage(`Restore failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [initialContent, originalContent, currentPath]);

    // Undo the last change
    const undoLastChange = useCallback(() => {
        if (undoHistory.length === 0) {
            setStatusMessage('Nothing to undo');
            return;
        }

        // Pop the last state from history
        const previousData = undoHistory[undoHistory.length - 1];
        setUndoHistory(prev => prev.slice(0, -1));

        setData(previousData);
        setStatusMessage(`Undo successful (${undoHistory.length - 1} more steps available)`);

        // Still has unsaved changes unless undo history is now empty and data matches original
        if (undoHistory.length <= 1) {
            // Check if we're back to original
            const currentContent = serializeToFile(previousData);
            if (currentContent === originalContent) {
                setHasUnsavedChanges(false);
            }
        }
    }, [undoHistory, originalContent]);

    // ============ SELECTION ============

    const toggleEmitterSelection = useCallback((systemName, emitterName, ctrlKey) => {
        const key = createEmitterKey(systemName, emitterName);

        setSelectedEmitters(prev => {
            const next = new Set(ctrlKey ? prev : []);

            if (prev.has(key) && ctrlKey) {
                next.delete(key);
            } else {
                next.add(key);
            }

            return next;
        });
    }, []);

    const selectAllInSystem = useCallback((systemName) => {
        const system = data?.systems[systemName];
        if (!system) return;

        setSelectedEmitters(prev => {
            const next = new Set(prev);

            // Check if all are already selected
            const allSelected = system.emitters.every(e =>
                next.has(createEmitterKey(systemName, e.name))
            );

            if (allSelected) {
                // Deselect all
                system.emitters.forEach(e => {
                    next.delete(createEmitterKey(systemName, e.name));
                });
            } else {
                // Select all
                system.emitters.forEach(e => {
                    next.add(createEmitterKey(systemName, e.name));
                });
            }

            return next;
        });
    }, [data]);

    const toggleSystemExpanded = useCallback((systemName) => {
        setExpandedSystems(prev => {
            const next = new Set(prev);
            if (next.has(systemName)) {
                next.delete(systemName);
            } else {
                next.add(systemName);
            }
            return next;
        });
    }, []);

    // ============ EDITING OPERATIONS ============

    // Save current state to undo history before making changes
    const saveToUndoHistory = useCallback(() => {
        if (!data) return;

        // Deep clone the data to save
        const clonedData = JSON.parse(JSON.stringify(data));

        setUndoHistory(prev => {
            const newHistory = [...prev, clonedData];
            // Limit history size
            if (newHistory.length > MAX_UNDO_HISTORY) {
                return newHistory.slice(-MAX_UNDO_HISTORY);
            }
            return newHistory;
        });
    }, [data]);

    const markChanged = useCallback(() => {
        setHasUnsavedChanges(true);
    }, []);

    // Scale only birthScale
    const applyScaleBirthScale = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = scaleBirthScale(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled birthScale for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with birthScale in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    // Scale only scale0
    const applyScaleScale0 = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = scaleScale0(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled scale0 for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with scale0 in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    const handleAddBindWeight = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = addBindWeight(data, selectedEmitters, 1);

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added bindWeight to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have bindWeight');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetBindWeightZero = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = setBindWeight(data, selectedEmitters, 0);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set bindWeight to 0 for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with bindWeight in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetBindWeightOne = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = setBindWeight(data, selectedEmitters, 1);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set bindWeight to 1 for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with bindWeight in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleAddTranslationOverride = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = addTranslationOverride(data, selectedEmitters, { x: 0, y: 0, z: 0 });

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added translationOverride to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have translationOverride');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    // Set translationOverride values for all selected emitters
    const handleSetTranslationOverride = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const newValue = { x: toX, y: toY, z: toZ };
        const result = setTranslationOverride(data, selectedEmitters, newValue);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set translationOverride to (${toX}, ${toY}, ${toZ}) for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with translationOverride in selection');
        }
    }, [data, selectedEmitters, toX, toY, toZ, markChanged, saveToUndoHistory]);

    // Scale particleLifetime
    const handleScaleParticleLifetime = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = scaleParticleLifetime(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled particleLifetime for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with particleLifetime in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    // Scale lifetime (emitter duration)
    const handleScaleLifetime = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = scaleLifetime(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled lifetime for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with lifetime in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    const handleSetMiscRenderFlagsZero = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = setMiscRenderFlags(data, selectedEmitters, 0);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set miscRenderFlags to 0 for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with miscRenderFlags in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetMiscRenderFlagsOne = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = setMiscRenderFlags(data, selectedEmitters, 1);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set miscRenderFlags to 1 for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with miscRenderFlags in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleAddMiscRenderFlags = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();  // Save state before change
        const result = addMiscRenderFlags(data, selectedEmitters, 1);

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added miscRenderFlags to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have miscRenderFlags');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    // Single emitter property changes
    const handlePropertyChange = useCallback((property, axis, value) => {
        if (!selectedEmitter || !data) return;

        const numValue = parseLocaleFloat(value);
        if (isNaN(numValue)) return;

        saveToUndoHistory();  // Save state before change

        // Find the system
        const systemName = [...selectedEmitters][0].split(':')[0];
        const system = data.systems[systemName];
        if (!system) return;

        let success = false;

        if (property === 'birthScale0' && selectedEmitter.birthScale0?.constantValue) {
            const newValue = { ...selectedEmitter.birthScale0.constantValue };
            newValue[axis] = numValue;
            success = updateBirthScale(selectedEmitter, newValue);
        } else if (property === 'scale0' && selectedEmitter.scale0?.constantValue) {
            const newValue = { ...selectedEmitter.scale0.constantValue };
            newValue[axis] = numValue;
            success = updateScale0(selectedEmitter, newValue);
        } else if (property === 'translationOverride' && selectedEmitter.translationOverride?.constantValue) {
            const newValue = { ...selectedEmitter.translationOverride.constantValue };
            newValue[axis] = numValue;
            success = updateTranslationOverride(selectedEmitter, newValue);
        } else if (property === 'bindWeight') {
            success = updateBindWeight(selectedEmitter, numValue);
        } else if (property === 'particleLifetime') {
            success = updateParticleLifetime(selectedEmitter, numValue);
        } else if (property === 'lifetime') {
            success = updateLifetime(selectedEmitter, numValue);
        } else if (property === 'particleLinger') {
            success = updateParticleLinger(selectedEmitter, numValue);
        } else if (property === 'rate') {
            success = updateRate(selectedEmitter, numValue);
        } else if (property === 'miscRenderFlags') {
            success = updateMiscRenderFlags(selectedEmitter, numValue);
        }

        if (success) {
            markSystemModified(data, systemName);
            setData({ ...data });
            markChanged();
        }
    }, [selectedEmitter, data, selectedEmitters, markChanged, saveToUndoHistory]);

    // ============ RENDER HELPERS ============

    // Extract ALL texture paths from emitter rawContent (matches Paint.js/Port.js)
    const extractAllTexturesFromEmitter = useCallback((emitter) => {
        if (!emitter || !emitter.rawContent) return [];
        const content = emitter.rawContent;
        const textures = [];
        const textureSet = new Set();

        // Define texture field patterns with labels (same as Port.js)
        const texturePatterns = [
            { key: 'texture', label: 'Main' },
            { key: 'particleColorTexture', label: 'Color' },
            { key: 'erosionMapName', label: 'Erosion' },
            { key: 'textureMult', label: 'Mult' },
            { key: 'meshColorTexture', label: 'Mesh Color' },
            { key: 'paletteTexture', label: 'Palette' },
            { key: 'normalMap', label: 'Normal' },
            { key: 'normalMapTexture', label: 'Normal' },
            { key: 'particleColorLookupTexture', label: 'Color Lookup' },
            { key: 'reflectionMapName', label: 'Reflection' },
            { key: 'rimColorLookupTexture', label: 'Rim Lookup' },
            { key: 'rimColorTexture', label: 'Rim Color' },
            { key: 'textureLookupTexture', label: 'Lookup' },
            { key: 'distortionTexture', label: 'Distortion' },
            { key: 'emissiveTexture', label: 'Emissive' },
            { key: 'glossIntensityTexture', label: 'Gloss' },
            { key: 'fresnelTexture', label: 'Fresnel' }
        ];

        texturePatterns.forEach(pattern => {
            const regex = new RegExp(`(?<![a-zA-Z])${pattern.key}:\\s*string\\s*=\\s*"([^"]+)"`, 'gi');
            let match;
            while ((match = regex.exec(content)) !== null) {
                const path = match[1].trim();
                if (path && !textureSet.has(path)) {
                    textureSet.add(path);
                    textures.push({ path, label: pattern.label });
                }
            }
        });

        // Fallback: find any texture paths by extension
        const pathRegex = /:\s*string\s*=\s*"([^"]+\.(?:tex|dds|tga|png|jpg|jpeg|bmp))"/gi;
        let match;
        while ((match = pathRegex.exec(content)) !== null) {
            const path = match[1].trim();
            if (path && !textureSet.has(path)) {
                textureSet.add(path);
                textures.push({ path, label: 'Other' });
            }
        }

        return textures;
    }, []);

    // Find single texture path (for hasTexture check)
    const findTexturePathInEmitter = useCallback((emitter) => {
        const textures = extractAllTexturesFromEmitter(emitter);
        return textures.length > 0 ? textures[0].path : null;
    }, [extractAllTexturesFromEmitter]);

    // Extract colors from emitter content (same as Port.js)
    const extractColorsFromEmitterContent = useCallback((originalContent) => {
        try {
            if (!originalContent) return [];

            const results = [];

            // Match ValueColor blocks with constantValue (case-insensitive)
            const valueColorRegex = /(\w*color\w*)\s*:\s*embed\s*=\s*valuecolor\s*\{[\s\S]*?constantvalue\s*:\s*vec4\s*=\s*\{\s*([^}]+)\s*\}[\s\S]*?\}/gi;
            let match;
            while ((match = valueColorRegex.exec(originalContent)) !== null) {
                const name = match[1] || 'color';
                const vec = match[2]
                    .split(',')
                    .map((v) => parseFloat(v.trim()))
                    .filter((n) => !Number.isNaN(n));
                if (vec.length >= 3) {
                    const [r, g, b, a = 1] = vec;
                    const css = `rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`;
                    results.push({ name, colors: [css] });
                }
            }

            // Match Animated color lists (case-insensitive)
            const animatedRegex = /(\w*color\w*)[\s\S]*?vfxanimatedcolorvariabledata\s*\{[\s\S]*?values\s*:\s*list\[vec4\]\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/gi;
            let anim;
            while ((anim = animatedRegex.exec(originalContent)) !== null) {
                const name = anim[1] || 'colorAnim';
                const body = anim[2] || '';
                const stops = [];
                const vecLineRegex = /\{\s*([^}]+?)\s*\}/g;
                let line;
                while ((line = vecLineRegex.exec(body)) !== null) {
                    const vec = line[1]
                        .split(',')
                        .map((v) => parseFloat(v.trim()))
                        .filter((n) => !Number.isNaN(n));
                    if (vec.length >= 3) {
                        const [r, g, b, a = 1] = vec;
                        stops.push(`rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`);
                    }
                }
                if (stops.length > 0) results.push({ name, colors: stops });
            }

            // Deduplicate by name keeping first
            const seen = new Set();
            return results.filter((c) => {
                if (seen.has(c.name)) return false;
                seen.add(c.name);
                return true;
            });
        } catch (_) {
            return [];
        }
    }, []);

    // Ref for texture close timer
    const textureCloseTimerRef = useRef(null);
    // Shared texture preview modal helper (same style as port/paint)
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


    // Handle texture preview on hover - loads ALL textures like Paint.js
    const handleTexturePreview = useCallback(async (e, emitter) => {
        cancelTextureHoverClose('shared-texture-hover-preview');
        const allTextures = extractAllTexturesFromEmitter(emitter);
        if (allTextures.length === 0) return;

        const buttonElement = e.currentTarget;
        if (!buttonElement) return;

        // Clear previous timer
        if (conversionTimers.current.has('hover')) {
            clearTimeout(conversionTimers.current.get('hover'));
        }

        // Clear texture close timer when entering a new button
        if (textureCloseTimerRef.current) {
            clearTimeout(textureCloseTimerRef.current);
            textureCloseTimerRef.current = null;
        }

        const timer = setTimeout(async () => {
            const textureData = [];

            // Extract colors from emitter content
            const colorData = extractColorsFromEmitterContent(emitter.rawContent);

            for (const { path: texturePath, label } of allTextures) {
                if (activeConversions.current.has(texturePath)) continue;
                activeConversions.current.add(texturePath);

                try {
                    const projectRoot = binPath ? window.require('path').dirname(binPath) : null;
                    const result = await convertTextureToPNG(texturePath, binPath, binPath, projectRoot);

                    let dataUrl = null;
                    if (result) {
                        if (result.startsWith('data:')) {
                            dataUrl = result;
                        } else if (window.require) {
                            const fs = window.require('fs');
                            if (fs.existsSync(result)) {
                                const imageBuffer = fs.readFileSync(result);
                                dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                            }
                        }
                    }

                    // Resolve disk path for explorer navigation
                    let resolvedDiskPath = texturePath;
                    if (window.require) {
                        const fs = window.require('fs');
                        const path = window.require('path');
                        const normalizedBin = binPath.replace(/\\/g, '/');
                        const dataMatch = normalizedBin.match(/\/data\//i);

                        if (dataMatch) {
                            const projRoot = normalizedBin.substring(0, dataMatch.index);
                            const cleanTexture = texturePath.replace(/\\/g, '/');
                            const candidate = path.join(projRoot, cleanTexture);
                            if (fs.existsSync(candidate)) resolvedDiskPath = candidate;
                        }

                        if (resolvedDiskPath === texturePath) {
                            const smartPath = findActualTexturePath(texturePath, binPath);
                            if (smartPath) resolvedDiskPath = smartPath;
                        }
                    }

                    if (dataUrl) {
                        textureData.push({ path: texturePath, label, dataUrl, resolvedDiskPath });
                    }
                } catch (error) {
                    console.warn(`Failed to convert ${texturePath}:`, error);
                } finally {
                    activeConversions.current.delete(texturePath);
                }
            }

            if (textureData.length === 0) {
                showTextureError(allTextures[0]?.path || 'Unknown', buttonElement);
            } else {
                showTexturePreview(textureData, buttonElement, colorData);
            }
        }, 200);

        conversionTimers.current.set('hover', timer);
    }, [binPath, extractAllTexturesFromEmitter, extractColorsFromEmitterContent, showTexturePreview, showTextureError]);

    // Handle texture click (open in asset preview)
    const handleTextureClick = useCallback(async (e, emitter) => {
        e.stopPropagation();
        const texturePath = findTexturePathInEmitter(emitter);
        if (!texturePath) return;

        try {
            let resolvedPath = texturePath;

            if (binPath && window.require) {
                const fs = window.require('fs');
                const path = window.require('path');
                const normalizedBin = binPath.replace(/\\/g, '/');
                const dataMatch = normalizedBin.match(/\/data\//i);

                if (dataMatch) {
                    const projectRoot = normalizedBin.substring(0, dataMatch.index);
                    const cleanTexture = texturePath.replace(/\\/g, '/');
                    const candidate = path.join(projectRoot, cleanTexture);
                    if (fs.existsSync(candidate)) {
                        resolvedPath = candidate;
                    }
                }

                if (resolvedPath === texturePath) {
                    const smartPath = findActualTexturePath(texturePath, binPath);
                    if (smartPath) resolvedPath = smartPath;
                }
            }

            // Try to get data URL for preview
            const projectRoot = binPath ? window.require('path').dirname(binPath) : null;
            let dataUrl = null;
            try {
                const result = await convertTextureToPNG(texturePath, binPath, binPath, projectRoot);
                if (result) {
                    if (result.startsWith('data:')) {
                        dataUrl = result;
                    } else if (window.require) {
                        const fs = window.require('fs');
                        if (fs.existsSync(result)) {
                            const imageBuffer = fs.readFileSync(result);
                            dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                        }
                    }
                }
            } catch (convErr) {
                console.warn('Conversion on click failed:', convErr);
            }

            removeTextureHoverPreview('shared-texture-hover-preview');
            openAssetPreview(resolvedPath, dataUrl);
        } catch (err) {
            console.error('Error opening texture:', err);
        }
    }, [binPath, findTexturePathInEmitter]);


    const renderEmitter = (emitter, systemName) => {
        const key = createEmitterKey(systemName, emitter.name);
        const isSelected = selectedEmitters.has(key);
        const hasTexture = findTexturePathInEmitter(emitter) !== null;

        return (
            <div
                key={key}
                className={`bin-editor-emitter ${isSelected ? 'selected' : ''}`}
                onClick={(e) => toggleEmitterSelection(systemName, emitter.name, e.ctrlKey || e.metaKey)}
                style={{
                    padding: '8px 12px',
                    marginLeft: '16px',
                    marginBottom: '4px',
                    background: isSelected ? 'rgba(236, 185, 106, 0.3)' : 'rgba(255,255,255,0.06)',
                    border: isSelected ? '1px solid rgba(236, 185, 106, 0.5)' : '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    outline: 'none'
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: isSelected ? '#ecb96a' : '#e8e6e3', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {emitter.name}
                        {isSelected && <span>✓</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {emitter.birthScale0?.constantValue && (
                            <span style={{ color: '#6cb6ff' }} title="Birth Scale">BS: ({emitter.birthScale0.constantValue.x.toFixed(1)}, {emitter.birthScale0.constantValue.y.toFixed(1)}, {emitter.birthScale0.constantValue.z.toFixed(1)})</span>
                        )}
                        {emitter.scale0?.constantValue && (
                            <span style={{ color: '#7ee787' }} title="Scale">S: ({emitter.scale0.constantValue.x.toFixed(1)}, {emitter.scale0.constantValue.y.toFixed(1)}, {emitter.scale0.constantValue.z.toFixed(1)})</span>
                        )}
                        {emitter.bindWeight && (
                            <span style={{ color: '#9d8cd9' }} title="Bind Weight">BW: {emitter.bindWeight.constantValue}</span>
                        )}
                        {emitter.translationOverride && (
                            <span style={{ color: '#d29922' }} title="Translation Override">TO: ({emitter.translationOverride.constantValue.x}, {emitter.translationOverride.constantValue.y}, {emitter.translationOverride.constantValue.z})</span>
                        )}
                        {emitter.particleLifetime?.constantValue != null && (
                            <span style={{ color: '#f97316' }} title="Particle Lifetime">PL: {emitter.particleLifetime.constantValue.toFixed(2)}</span>
                        )}
                        {emitter.lifetime?.value != null && (
                            <span style={{ color: '#22c55e' }} title="Emitter Lifetime">LT: {emitter.lifetime.value.toFixed(2)}</span>
                        )}
                        {emitter.rate?.constantValue != null && (
                            <span style={{ color: '#06b6d4' }} title="Emission Rate">R: {emitter.rate.constantValue}</span>
                        )}
                        {emitter.miscRenderFlags != null && (
                            <span style={{ color: '#ef4444' }} title="Misc Render Flags">MR: {emitter.miscRenderFlags}</span>
                        )}
                    </div>
                </div>
                {/* Texture Preview Button */}
                {hasTexture && (
                    <button
                        onClick={(e) => handleTextureClick(e, emitter)}
                        onMouseEnter={(e) => handleTexturePreview(e, emitter)}
                        onMouseLeave={() => {
                            if (conversionTimers.current.has('hover')) {
                                clearTimeout(conversionTimers.current.get('hover'));
                                conversionTimers.current.delete('hover');
                            }
                            // Start close timer for texture preview (like Paint.js/Port.js)
                            if (!textureCloseTimerRef.current) {
                                scheduleTextureHoverClose('shared-texture-hover-preview', 500);
                                textureCloseTimerRef.current = null;
                            }
                        }}
                        style={{
                            width: '24px',
                            height: '24px',
                            flexShrink: 0,
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '4px',
                            color: 'var(--accent, #3b82f6)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            transition: 'all 0.15s ease'
                        }}
                        title="Preview texture"
                    >
                        <CropOriginalIcon sx={{ fontSize: 16 }} />
                    </button>
                )}
            </div>
        );
    };

    const renderSystem = (system) => {
        const isExpanded = expandedSystems.has(system.name);
        const selectedCount = system.emitters.filter(e =>
            selectedEmitters.has(createEmitterKey(system.name, e.name))
        ).length;

        return (
            <div key={system.name} style={{ marginBottom: '8px' }}>
                {/* System Header */}
                <div
                    className={`bin-editor-item ${selectedCount > 0 ? 'selected' : ''}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: selectedCount > 0 ? 'rgba(157, 140, 217, 0.2)' : 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        overflow: 'hidden',
                        height: '42px',
                        outline: 'none'
                    }}
                >
                    {/* Expand Zone (approx 20% width) */}
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleSystemExpanded(system.name);
                        }}
                        style={{
                            width: '40px',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: '1px solid rgba(255,255,255,0.04)',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        <span style={{ fontSize: '14px' }}>
                            {isExpanded ? ICONS.expand : ICONS.collapse}
                        </span>
                    </div>

                    {/* Activation Zone (The rest) */}
                    <div
                        onClick={() => selectAllInSystem(system.name)}
                        style={{
                            flex: 1,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 12px',
                            gap: '8px',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title={`Click to select all emitters in ${system.name}`}
                    >
                        <span style={{ flex: 1, fontWeight: 600, color: '#9d8cd9', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {system.displayName}
                            {selectedCount > 0 && <span style={{ color: '#ecb96a' }}>✓</span>}
                        </span>

                        <span
                            style={{
                                padding: '1px 7px',
                                background: 'rgba(157, 140, 217, 0.15)',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: '#9d8cd9',
                                border: '1px solid rgba(157, 140, 217, 0.2)',
                                fontWeight: '600'
                            }}
                        >
                            {selectedCount > 0 ? `${selectedCount}/` : ''}{system.emitters.length}
                        </span>
                    </div>
                </div>

                {/* Emitters List */}
                {isExpanded && (
                    <div style={{ marginTop: '4px' }}>
                        {system.emitters.map(e => renderEmitter(e, system.name))}
                    </div>
                )}
            </div>
        );
    };

    const renderPropertyEditor = () => {
        if (!selectedEmitter) {
            return (
                <div style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                    {selectedEmitters.size === 0
                        ? 'Select an emitter to edit properties'
                        : `${selectedEmitters.size} emitters selected - use bulk actions above`
                    }
                </div>
            );
        }

        const Vec3Editor = ({ label, value, property, color }) => (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color, marginBottom: '8px' }}>{label}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['x', 'y', 'z'].map(axis => (
                        <div key={axis} style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', color: '#888' }}>{axis.toUpperCase()}</label>
                            <input
                                type="text"
                                key={`${selectedEmitter?.name}-${property}-${axis}`}
                                defaultValue={value[axis]}
                                onBlur={(e) => handlePropertyChange(property, axis, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.target.blur();
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '4px',
                                    color: '#e8e6e3',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '13px'
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );

        return (
            <div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '16px', color: '#ecb96a' }}>
                    {selectedEmitter.name}
                </div>

                {selectedEmitter.birthScale0?.constantValue && (
                    <Vec3Editor
                        label="Birth Scale"
                        value={selectedEmitter.birthScale0.constantValue}
                        property="birthScale0"
                        color="#6cb6ff"
                    />
                )}

                {selectedEmitter.scale0?.constantValue && (
                    <Vec3Editor
                        label="Scale"
                        value={selectedEmitter.scale0.constantValue}
                        property="scale0"
                        color="#7ee787"
                    />
                )}

                {selectedEmitter.translationOverride?.constantValue && (
                    <Vec3Editor
                        label="Translation Override"
                        value={selectedEmitter.translationOverride.constantValue}
                        property="translationOverride"
                        color="#d29922"
                    />
                )}

                {selectedEmitter.bindWeight && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#9d8cd9', marginBottom: '8px' }}>Bind Weight</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-bindWeight`}
                            defaultValue={selectedEmitter.bindWeight.constantValue}
                            onBlur={(e) => handlePropertyChange('bindWeight', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '4px',
                                color: '#e8e6e3',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}

                {selectedEmitter.particleLifetime?.constantValue != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#f97316', marginBottom: '8px' }}>Particle Lifetime</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-particleLifetime`}
                            defaultValue={selectedEmitter.particleLifetime.constantValue}
                            onBlur={(e) => handlePropertyChange('particleLifetime', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                borderRadius: '4px',
                                color: '#f97316',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}

                {selectedEmitter.lifetime?.value != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: '8px' }}>Emitter Lifetime</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-lifetime`}
                            defaultValue={selectedEmitter.lifetime.value}
                            onBlur={(e) => handlePropertyChange('lifetime', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '4px',
                                color: '#22c55e',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}

                {selectedEmitter.particleLinger?.value != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#a855f7', marginBottom: '8px' }}>Particle Linger</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-particleLinger`}
                            defaultValue={selectedEmitter.particleLinger.value}
                            onBlur={(e) => handlePropertyChange('particleLinger', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                borderRadius: '4px',
                                color: '#a855f7',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}
                {selectedEmitter.rate?.constantValue != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#06b6d4', marginBottom: '8px' }}>Emission Rate</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-rate`}
                            defaultValue={selectedEmitter.rate.constantValue}
                            onBlur={(e) => handlePropertyChange('rate', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(6, 182, 212, 0.3)',
                                borderRadius: '4px',
                                color: '#06b6d4',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}

                {selectedEmitter.miscRenderFlags != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>Misc Render Flags</div>
                        <input
                            type="text"
                            key={`${selectedEmitter.name}-miscRenderFlags`}
                            defaultValue={selectedEmitter.miscRenderFlags}
                            onBlur={(e) => handlePropertyChange('miscRenderFlags', null, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '4px',
                                color: '#ef4444',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                )}

                {!selectedEmitter.birthScale0 && !selectedEmitter.scale0 &&
                    !selectedEmitter.bindWeight && !selectedEmitter.translationOverride &&
                    !selectedEmitter.particleLifetime && !selectedEmitter.lifetime &&
                    !selectedEmitter.particleLinger && !selectedEmitter.rate &&
                    selectedEmitter.miscRenderFlags == null && (
                        <div style={{ color: '#666', fontStyle: 'italic' }}>
                            No editable properties found
                        </div>
                    )}
            </div>
        );
    };

    // ============ MAIN RENDER ============

    return (
        <div className="bin-editor-container" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontFamily: 'var(--app-font-family), -apple-system, sans-serif',
            overflow: 'hidden'
        }}>
            {isLoading && <GlowingSpinner text={loadingText} />}

            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)'
            }}>
                {/* Title Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                        VFX Bin Editor {binPath ? `- ${window.require?.('path').basename(binPath)}` : ''}
                    </h1>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={loadBinFile} style={buttonStyle('#22c55e')}>
                            {ICONS.folder} Load .bin
                        </button>
                        <button
                            onClick={undoLastChange}
                            disabled={undoHistory.length === 0}
                            style={buttonStyle('#6cb6ff', undoHistory.length === 0)}
                            title={`Undo (${undoHistory.length} steps available)`}
                        >
                            {ICONS.undo} Undo{undoHistory.length > 0 ? ` (${undoHistory.length})` : ''}
                        </button>
                        <button
                            onClick={restoreOriginal}
                            disabled={!initialContent}
                            style={buttonStyle('#9d8cd9', !initialContent)}
                            title="Restore to original state when file was first loaded"
                        >
                            ↺ Restore
                        </button>
                        <button
                            onClick={saveFile}
                            disabled={!hasUnsavedChanges}
                            style={buttonStyle('#ecb96a', !hasUnsavedChanges)}
                        >
                            {ICONS.save} Save
                        </button>
                    </div>
                </div>

                {/* Status */}
                <div style={{ fontSize: '12px', color: '#888' }}>{statusMessage}</div>


            </div>

            {/* Toolbar */}
            {data && (
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    background: 'rgba(0,0,0,0.1)',
                    overflowX: 'auto'
                }}>
                    {/* Tool Selector */}
                    <div style={{ marginRight: '16px', display: 'flex', alignItems: 'center' }}>
                        <select
                            value={toolbarTab}
                            onChange={(e) => setToolbarTab(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                background: 'var(--surface)',
                                border: '1px solid var(--surface-2)',
                                borderRadius: '6px',
                                color: 'var(--text)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="scale">Scale Controls</option>
                            <option value="bindWeight">Bind Weight</option>
                            <option value="misc">Misc Flags</option>
                            <option value="to">Translation</option>
                        </select>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', marginRight: '16px' }} />

                    {/* Scale Controls */}
                    {toolbarTab === 'scale' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#888' }}>Multiplier:</span>
                            <input
                                type="text"
                                defaultValue={scaleMultiplier}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setScaleMultiplier(isNaN(val) || val <= 0 ? 1 : val);
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                style={{
                                    width: '60px',
                                    padding: '4px 8px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '4px',
                                    color: '#e8e6e3',
                                    fontSize: '12px'
                                }}
                            />
                            <button onClick={applyScaleBirthScale} style={smallButtonStyle('#6cb6ff')} title="Scale Birth Scale">
                                BS ×{scaleMultiplier}
                            </button>
                            <button onClick={applyScaleScale0} style={smallButtonStyle('#7ee787')} title="Scale Scale">
                                S ×{scaleMultiplier}
                            </button>
                            <button onClick={handleScaleParticleLifetime} style={smallButtonStyle('#f97316')} title="Scale Particle Lifetime">
                                PL ×{scaleMultiplier}
                            </button>
                            <button onClick={handleScaleLifetime} style={smallButtonStyle('#22c55e')} title="Scale Emitter Lifetime">
                                LT ×{scaleMultiplier}
                            </button>
                        </div>
                    )}

                    {/* BindWeight */}
                    {toolbarTab === 'bindWeight' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleAddBindWeight} style={smallButtonStyle('#9d8cd9')} title="Add Bind Weight property">
                                + BindWeight
                            </button>
                            <button onClick={handleSetBindWeightZero} style={smallButtonStyle('#9d8cd9')} title="Set Bind Weight to 0">
                                BW=0
                            </button>
                            <button onClick={handleSetBindWeightOne} style={smallButtonStyle('#9d8cd9')} title="Set Bind Weight to 1">
                                BW=1
                            </button>
                        </div>
                    )}

                    {/* MiscRenderFlags */}
                    {toolbarTab === 'misc' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleAddMiscRenderFlags} style={smallButtonStyle('#ef4444')} title="Add Misc Render Flags property">
                                + MR
                            </button>
                            <button onClick={handleSetMiscRenderFlagsZero} style={smallButtonStyle('#ef4444')} title="Set Misc Render Flags to 0">
                                MR=0
                            </button>
                            <button onClick={handleSetMiscRenderFlagsOne} style={smallButtonStyle('#ef4444')} title="Set Misc Render Flags to 1">
                                MR=1
                            </button>
                        </div>
                    )}

                    {/* TranslationOverride */}
                    {toolbarTab === 'to' && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button onClick={handleAddTranslationOverride} style={smallButtonStyle('#d29922')} title="Add Translation Override property">
                                + TO
                            </button>
                            <input
                                type="text"
                                defaultValue={toX}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToX(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                placeholder="X"
                                title="Translation Override X value"
                                style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(210, 153, 34, 0.3)',
                                    borderRadius: '4px',
                                    color: '#d29922',
                                    fontSize: '11px',
                                    textAlign: 'center'
                                }}
                            />
                            <input
                                type="text"
                                defaultValue={toY}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToY(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                placeholder="Y"
                                title="Translation Override Y value"
                                style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(210, 153, 34, 0.3)',
                                    borderRadius: '4px',
                                    color: '#d29922',
                                    fontSize: '11px',
                                    textAlign: 'center'
                                }}
                            />
                            <input
                                type="text"
                                defaultValue={toZ}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToZ(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                placeholder="Z"
                                title="Translation Override Z value"
                                style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(210, 153, 34, 0.3)',
                                    borderRadius: '4px',
                                    color: '#d29922',
                                    fontSize: '11px',
                                    textAlign: 'center'
                                }}
                            />
                            <button onClick={handleSetTranslationOverride} style={smallButtonStyle('#d29922')} title="Set Translation Override values for selected emitters">
                                Set
                            </button>
                        </div>
                    )}

                    {/* Search */}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        <input
                            type="text"
                            placeholder="Search emitters..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '200px',
                                padding: '6px 12px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 'var(--border-radius, 4px)',
                                color: '#e8e6e3',
                                fontSize: '12px'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - Systems List */}
                <div className="bin-editor-list" style={{
                    width: '50%',
                    borderRight: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'auto',
                    padding: '12px'
                }}>
                    {!data ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: '#666'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
                            <div>Load a .bin file to start editing</div>
                        </div>
                    ) : filteredSystems.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
                            No systems match your search
                        </div>
                    ) : (
                        filteredSystems.map(renderSystem)
                    )}
                </div>

                {/* Right Panel - Property Editor */}
                <div className="bin-editor-props" style={{
                    width: '50%',
                    overflow: 'auto',
                    padding: '16px 20px'
                }}>
                    {data && renderPropertyEditor()}
                </div>
            </div>

            {/* Ritobin Warning Modal */}
            <RitobinWarningModal
                open={showRitobinWarning}
                onClose={() => {
                    setShowRitobinWarning(false);
                    setRitobinWarningContent(null);
                }}
                navigate={null}
                content={ritobinWarningContent}
                onContinueAnyway={() => {
                    setShowRitobinWarning(false);
                    setRitobinWarningContent(null);
                    // File is already loaded, just update status message
                    if (data) {
                        const parseStats = getParseStats(data);
                        setStatusMessage(`Loaded: ${parseStats.systemCount} systems, ${parseStats.emitterCount} emitters`);
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

            <UnsavedChangesModal
                open={unsavedGuard.showUnsavedDialog}
                onCancel={unsavedGuard.handleUnsavedCancel}
                onSave={unsavedGuard.handleUnsavedSave}
                onDiscard={unsavedGuard.handleUnsavedDiscard}
                fileName={binPath || ''}
            />
        </div>
    );
}

// ============ STYLES ============

const buttonStyle = (color, disabled = false) => ({
    padding: '8px 14px',
    background: disabled ? 'rgba(100,100,100,0.2)' : `rgba(${hexToRgb(color)}, 0.15)`,
    border: `1px solid ${disabled ? 'rgba(100,100,100,0.3)' : color}`,
    borderRadius: 'var(--border-radius, 6px)',
    color: disabled ? '#666' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease'
});

const smallButtonStyle = (color, disabled = false) => ({
    padding: '4px 10px',
    background: disabled ? 'rgba(100,100,100,0.2)' : `rgba(${hexToRgb(color)}, 0.15)`,
    border: `1px solid ${disabled ? 'rgba(100,100,100,0.3)' : color}`,
    borderRadius: 'var(--border-radius, 4px)',
    color: disabled ? '#666' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease'
});

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '255, 255, 255';
}


