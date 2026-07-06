/*
 * BinEditor - VFX bin parameter editor.
 *
 * Faithful 1:1 port of the Electron Quartz BinEditorV2 page. Loads a real .bin
 * (ritobin .py text via readBin), shows the systems/emitters multi-select tree,
 * applies the same batch + per-emitter parameter operations against the parsed
 * data, and writes the serialized text back through writeBin.
 */

import {
    useState,
    useCallback,
    useMemo,
    useRef,
    useEffect,
    type CSSProperties,
    type ChangeEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react';
import { Select, MenuItem } from '@mui/material';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import { useFileExplorer } from '@/components/explorer';

import { readBin, writeBin } from '@/lib/api';
import { useNavigationStore, useNotificationStore } from '@/lib/stores';

import {
    parsePyFile,
    getParseStats,
} from './bineditor/utils/parser';
import {
    serializeToFile,
    updateBirthScale,
    updateScale0,
    updateBindWeight,
    updateTranslationOverride,
    updateParticleLifetime,
    updateLifetime,
    updateParticleLinger,
    updateRate,
    updatePass,
    updateMiscRenderFlags,
    updateIsGroundLayer,
    markSystemModified,
} from './bineditor/utils/serializer';
import {
    scaleBirthScale,
    scaleScale0,
    addBindWeight,
    setBindWeight,
    addTranslationOverride,
    setTranslationOverride,
    scaleParticleLifetime,
    scaleLifetime,
    scalePass,
    setPass,
    addPass,
    setMiscRenderFlags,
    addMiscRenderFlags,
    setIsGroundLayer,
    addIsGroundLayer,
    createEmitterKey,
} from './bineditor/utils/operations';
import type { ParsedData, VfxSystem, Emitter, Vec3 } from './bineditor/utils/types';
import {
    handleTextureMouseEnter as handleTextureMouseEnterPreview,
    handleTextureMouseLeave as handleTextureMouseLeavePreview,
    handleTextureContextMenu as handleTextureContextMenuPreview,
    closeTextureHoverPreview,
} from './bineditor/utils/textureHoverPreview';

import './bineditor/BinEditor.css';

const ICONS = {
    folder: '',
    save: '',
    undo: '',
    expand: '▼',
    collapse: '▶',
    search: '',
    scale: '',
    check: '✓',
};

// Semantic category colors used to color-code emitter property sections.
const UI_COLORS = {
    primary: 'var(--accent)',
    bs: 'var(--color-info)',
    scale: 'var(--color-success)',
    bw: 'var(--accent2)',
    pl: 'var(--color-warning)',
    lt: 'var(--color-info)',
    pass: 'var(--accent-hover)',
    to: 'var(--accent-hover)',
    ground: 'var(--color-success)',
};

// Parse numbers with both comma and period as decimal separators.
const parseLocaleFloat = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (!value || typeof value !== 'string') return NaN;
    const normalized = value.replace(',', '.');
    return parseFloat(normalized);
};

const toolbarSelectStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82rem',
    color: 'var(--text)',
    height: '34px',
    minWidth: '170px',
    borderRadius: '8px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    transition: 'all 160ms ease',
    '& .MuiSelect-select': {
        padding: '6px 10px',
        paddingRight: '28px !important',
    },
    '& .MuiSelect-icon': {
        color: 'var(--text-secondary)',
        fontSize: '1rem',
    },
    '&:hover': {
        background: 'var(--bg-hover)',
        borderColor: 'var(--border-strong)',
        boxShadow: '0 8px 18px rgba(0,0,0,0.28)',
    },
    '&.Mui-focused': {
        borderColor: 'color-mix(in oklab, var(--accent2) 65%, transparent)',
        boxShadow: '0 0 0 2px color-mix(in oklab, var(--accent2) 25%, transparent)',
    },
    '& fieldset': { border: 'none' },
    '&:hover fieldset': { border: 'none' },
    '&.Mui-focused fieldset': { border: 'none' },
};

const toolbarMenuPaperSx = {
    mt: 0.6,
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    boxShadow: 'var(--glass-shadow)',
    backdropFilter: 'saturate(180%) blur(12px)',
    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
    overflow: 'hidden',
    '& .MuiMenu-list': { py: 0.5 },
    '& .MuiMenuItem-root': {
        fontFamily: 'var(--font-mono)',
        fontSize: '0.82rem',
        color: 'var(--text-2)',
        mx: 0.6,
        borderRadius: '8px',
        minHeight: '34px',
        transition: 'all 140ms ease',
        '&:hover': {
            background: 'var(--bg-hover)',
            color: 'var(--text)',
        },
        '&.Mui-selected': {
            background: 'color-mix(in oklab, var(--accent) 15%, transparent)',
            color: 'var(--accent)',
            fontWeight: 700,
        },
        '&.Mui-selected:hover': {
            background: 'color-mix(in oklab, var(--accent) 20%, transparent)',
        },
    },
};

// Tint a dl-btn with a category color by overriding --accent-primary locally,
// so the shared primary variant adopts the emitter-property color coding.
const smallButtonStyle = (color: string): CSSProperties =>
    ({ '--accent-primary': color } as CSSProperties);

type ToolbarTab = 'scale' | 'bindWeight' | 'misc' | 'pass' | 'ground' | 'to';

// Texture field patterns used to detect whether an emitter has a previewable
// texture (mirrors the Electron extractAllTexturesFromEmitter detection).
const TEXTURE_PATTERNS = [
    'texture', 'particleColorTexture', 'erosionMapName', 'textureMult',
    'meshColorTexture', 'paletteTexture', 'normalMap', 'normalMapTexture',
    'particleColorLookupTexture', 'reflectionMapName', 'rimColorLookupTexture',
    'rimColorTexture', 'textureLookupTexture', 'distortionTexture',
    'emissiveTexture', 'glossIntensityTexture', 'fresnelTexture',
];

function emitterHasTexture(emitter: Emitter): boolean {
    if (!emitter || !emitter.rawContent) return false;
    const content = emitter.rawContent;
    for (const key of TEXTURE_PATTERNS) {
        const regex = new RegExp(`(?<![a-zA-Z])${key}:\\s*string\\s*=\\s*"([^"]+)"`, 'i');
        if (regex.test(content)) return true;
    }
    return /:\s*string\s*=\s*"([^"]+\.(?:tex|dds|tga|png|jpg|jpeg|bmp))"/i.test(content);
}

export function BinEditor() {
    const pick = useFileExplorer();
    const page = useNavigationStore((s) => s.page);
    const consumePendingFile = useNavigationStore((s) => s.consumePendingFile);
    const notify = useNotificationStore((s) => s.push);

    // ============ STATE ============
    const [data, setData] = useState<ParsedData | null>(null);
    const [originalContent, setOriginalContent] = useState('');
    const [initialContent, setInitialContent] = useState('');
    const [undoHistory, setUndoHistory] = useState<ParsedData[]>([]);
    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [binPath, setBinPath] = useState<string | null>(null);

    const [selectedEmitters, setSelectedEmitters] = useState<Set<string>>(new Set());
    const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [statusMessage, setStatusMessage] = useState('Load a .bin file to start');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const [scaleMultiplier, setScaleMultiplier] = useState(2);

    const [toX, setToX] = useState(0);
    const [toY, setToY] = useState(0);
    const [toZ, setToZ] = useState(0);
    const [passValue, setPassValue] = useState(0);
    const [passDeltaValue, setPassDeltaValue] = useState(0);

    const [toolbarTab, setToolbarTab] = useState<ToolbarTab>('scale');
    const toolbarTabOptions = useMemo(
        () => [
            { value: 'scale', label: 'Scale Controls' },
            { value: 'bindWeight', label: 'Bind Weight' },
            { value: 'misc', label: 'Misc Flags' },
            { value: 'pass', label: 'Pass' },
            { value: 'ground', label: 'Ground Layer' },
            { value: 'to', label: 'Translation' },
        ],
        [],
    );

    const MAX_UNDO_HISTORY = 20;
    const isOverRef = useRef(false);
    const [isOver, setIsOver] = useState(false);

    /* If the shell keeps this page alive between navigation changes, always
       return to BinEditor with the VFX tree collapsed instead of replaying a
       stale expanded system set. */
    const prevPageRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevPageRef.current;
        prevPageRef.current = page;
        if (page === 'bineditor' && prev !== 'bineditor') {
            setExpandedSystems(new Set());
            setSelectedEmitters(new Set());
        }
    }, [page]);

    // ============ COMPUTED VALUES ============
    const filteredSystems = useMemo<VfxSystem[]>(() => {
        if (!data) return [];

        const systems = Object.values(data.systems);

        if (!searchQuery.trim()) {
            return systems;
        }

        const query = searchQuery.toLowerCase();

        return systems.filter((system) => {
            if (system.name.toLowerCase().includes(query)) return true;
            if (system.displayName.toLowerCase().includes(query)) return true;
            return system.emitters.some((e) => e.name.toLowerCase().includes(query));
        });
    }, [data, searchQuery]);

    const selectedEmitter = useMemo<Emitter | null>(() => {
        if (!data || selectedEmitters.size !== 1) return null;

        const [key] = selectedEmitters;
        const [systemName, emitterName] = key.split(':');

        const system = data.systems[systemName];
        if (!system) return null;

        return system.emitters.find((e) => e.name === emitterName) || null;
    }, [data, selectedEmitters]);

    // ============ FILE OPERATIONS ============
    const processBinFile = useCallback(async (filePath: string) => {
        try {
            setBinPath(filePath);
            setIsLoading(true);
            setLoadingText('Processing .bin file...');

            setLoadingText('Parsing file...');
            const content = await readBin(filePath);

            const parsed = parsePyFile(content);

            setData(parsed);
            setOriginalContent(content);
            setInitialContent(content);
            setUndoHistory([]);
            setCurrentPath(filePath);
            setSelectedEmitters(new Set());
            setExpandedSystems(new Set());
            setHasUnsavedChanges(false);

            const parseStats = getParseStats(parsed);
            setStatusMessage(
                `Loaded: ${parseStats.systemCount} systems, ${parseStats.emitterCount} emitters`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${message}`);
            notify('error', `Failed to load bin: ${message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [notify]);

    const loadBinFile = useCallback(async () => {
        try {
            const picked = await pick({
                mode: 'file',
                filters: [
                    { name: 'Bin Files', extensions: ['bin', 'py'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                recentsKey: 'bin',
            });
            if (typeof picked === 'string') {
                await processBinFile(picked);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage('Error opening file dialog: ' + message);
        }
    }, [processBinFile, pick]);

    // Auto-load a file handed over from the explorer's "Open in Bin Editor".
    useEffect(() => {
        const path = consumePendingFile('bineditor');
        if (path) void processBinFile(path);
    }, [consumePendingFile, processBinFile]);

    const saveFile = useCallback(async () => {
        if (!data || !currentPath || !binPath) {
            setStatusMessage('Nothing to save');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Saving...');

            const content = serializeToFile(data);

            setLoadingText('Converting to .bin...');
            await writeBin(content, binPath);

            setOriginalContent(content);
            setUndoHistory([]);
            setHasUnsavedChanges(false);
            setStatusMessage('Saved successfully');
            notify('success', 'Saved successfully');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Save failed: ${message}`);
            notify('error', `Save failed: ${message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [data, currentPath, binPath, notify]);

    const restoreOriginal = useCallback(async () => {
        const contentToRestore = initialContent || originalContent;

        if (!contentToRestore || !currentPath || !binPath) {
            setStatusMessage('Nothing to restore');
            return;
        }

        try {
            setIsLoading(true);
            setLoadingText('Restoring to original...');

            const parsed = parsePyFile(contentToRestore);

            setLoadingText('Converting to .bin...');
            await writeBin(contentToRestore, binPath);

            setData(parsed);
            setOriginalContent(contentToRestore);
            setUndoHistory([]);
            setHasUnsavedChanges(false);
            setSelectedEmitters(new Set());
            setStatusMessage('Restored to original');
            notify('success', 'Restored to original');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Restore failed: ${message}`);
            notify('error', `Restore failed: ${message}`);
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [initialContent, originalContent, currentPath, binPath, notify]);

    const undoLastChange = useCallback(() => {
        if (undoHistory.length === 0) {
            setStatusMessage('Nothing to undo');
            return;
        }

        const previousData = undoHistory[undoHistory.length - 1];
        setUndoHistory((prev) => prev.slice(0, -1));

        setData(previousData);
        setStatusMessage(`Undo successful (${undoHistory.length - 1} more steps available)`);

        if (undoHistory.length <= 1) {
            const currentContent = serializeToFile(previousData);
            if (currentContent === originalContent) {
                setHasUnsavedChanges(false);
            }
        }
    }, [undoHistory, originalContent]);

    // ============ SELECTION ============
    const toggleEmitterSelection = useCallback(
        (systemName: string, emitterName: string, ctrlKey: boolean) => {
            const key = createEmitterKey(systemName, emitterName);

            setSelectedEmitters((prev) => {
                const next = new Set(ctrlKey ? prev : []);

                if (prev.has(key) && ctrlKey) {
                    next.delete(key);
                } else {
                    next.add(key);
                }

                return next;
            });
        },
        [],
    );

    const selectAllInSystem = useCallback(
        (systemName: string) => {
            const system = data?.systems[systemName];
            if (!system) return;

            setSelectedEmitters((prev) => {
                const next = new Set(prev);

                const allSelected = system.emitters.every((e) =>
                    next.has(createEmitterKey(systemName, e.name)),
                );

                if (allSelected) {
                    system.emitters.forEach((e) => {
                        next.delete(createEmitterKey(systemName, e.name));
                    });
                } else {
                    system.emitters.forEach((e) => {
                        next.add(createEmitterKey(systemName, e.name));
                    });
                }

                return next;
            });
        },
        [data],
    );

    const toggleSystemExpanded = useCallback((systemName: string) => {
        setExpandedSystems((prev) => {
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
    const saveToUndoHistory = useCallback(() => {
        if (!data) return;

        const clonedData = JSON.parse(JSON.stringify(data)) as ParsedData;

        setUndoHistory((prev) => {
            const newHistory = [...prev, clonedData];
            if (newHistory.length > MAX_UNDO_HISTORY) {
                return newHistory.slice(-MAX_UNDO_HISTORY);
            }
            return newHistory;
        });
    }, [data]);

    const markChanged = useCallback(() => {
        setHasUnsavedChanges(true);
    }, []);

    const applyScaleBirthScale = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = scaleBirthScale(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled birthScale for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with birthScale in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    const applyScaleScale0 = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
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

        saveToUndoHistory();
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

        saveToUndoHistory();
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

        saveToUndoHistory();
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

        saveToUndoHistory();
        const result = addTranslationOverride(data, selectedEmitters, { x: 0, y: 0, z: 0 });

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added translationOverride to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have translationOverride');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetTranslationOverride = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const newValue: Vec3 = { x: toX, y: toY, z: toZ };
        const result = setTranslationOverride(data, selectedEmitters, newValue);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set translationOverride to (${toX}, ${toY}, ${toZ}) for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with translationOverride in selection');
        }
    }, [data, selectedEmitters, toX, toY, toZ, markChanged, saveToUndoHistory]);

    const handleScaleParticleLifetime = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = scaleParticleLifetime(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled particleLifetime for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with particleLifetime in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    const handleScaleLifetime = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
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

        saveToUndoHistory();
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

        saveToUndoHistory();
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

        saveToUndoHistory();
        const result = addMiscRenderFlags(data, selectedEmitters, 1);

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added miscRenderFlags to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have miscRenderFlags');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleAddIsGroundLayer = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = addIsGroundLayer(data, selectedEmitters, false);

        if (result.added > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added isGroundLayer to ${result.added} emitter(s)`);
        } else {
            setStatusMessage('Selected emitters already have isGroundLayer');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetIsGroundLayerTrue = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = setIsGroundLayer(data, selectedEmitters, true);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set isGroundLayer to true for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with isGroundLayer in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleSetIsGroundLayerFalse = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = setIsGroundLayer(data, selectedEmitters, false);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set isGroundLayer to false for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with isGroundLayer in selection');
        }
    }, [data, selectedEmitters, markChanged, saveToUndoHistory]);

    const handleScalePass = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = scalePass(data, selectedEmitters, scaleMultiplier);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Scaled pass for ${result.modified} emitter(s) by ${scaleMultiplier}x`);
        } else {
            setStatusMessage('No emitters with pass in selection');
        }
    }, [data, selectedEmitters, scaleMultiplier, markChanged, saveToUndoHistory]);

    const handleSetPass = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = setPass(data, selectedEmitters, passValue);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Set pass to ${passValue} for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with pass in selection');
        }
    }, [data, selectedEmitters, passValue, markChanged, saveToUndoHistory]);

    const handleAddPass = useCallback(() => {
        if (!data || selectedEmitters.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        saveToUndoHistory();
        const result = addPass(data, selectedEmitters, passDeltaValue);

        if (result.modified > 0) {
            setData({ ...data });
            markChanged();
            setStatusMessage(`Added ${passDeltaValue} to pass for ${result.modified} emitter(s)`);
        } else {
            setStatusMessage('No emitters with pass in selection');
        }
    }, [data, selectedEmitters, passDeltaValue, markChanged, saveToUndoHistory]);

    // Single emitter property changes.
    const handlePropertyChange = useCallback(
        (property: string, axis: keyof Vec3 | null, value: string | boolean) => {
            if (!selectedEmitter || !data) return;

            if (property === 'isGroundLayer') {
                saveToUndoHistory();

                const systemName = [...selectedEmitters][0].split(':')[0];
                const system = data.systems[systemName];
                if (!system) return;

                const boolValue = value === true || value === 'true';
                const success = updateIsGroundLayer(selectedEmitter, boolValue);

                if (success) {
                    markSystemModified(data, systemName);
                    setData({ ...data });
                    markChanged();
                }
                return;
            }

            const numValue = parseLocaleFloat(value as string);
            if (isNaN(numValue)) return;

            saveToUndoHistory();

            const systemName = [...selectedEmitters][0].split(':')[0];
            const system = data.systems[systemName];
            if (!system) return;

            let success = false;

            if (property === 'birthScale0' && selectedEmitter.birthScale0?.constantValue && axis) {
                const newValue = { ...selectedEmitter.birthScale0.constantValue };
                newValue[axis] = numValue;
                success = updateBirthScale(selectedEmitter, newValue);
            } else if (property === 'scale0' && selectedEmitter.scale0?.constantValue && axis) {
                const newValue = { ...selectedEmitter.scale0.constantValue };
                newValue[axis] = numValue;
                success = updateScale0(selectedEmitter, newValue);
            } else if (property === 'translationOverride' && selectedEmitter.translationOverride?.constantValue && axis) {
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
            } else if (property === 'pass') {
                success = updatePass(selectedEmitter, numValue);
            } else if (property === 'miscRenderFlags') {
                success = updateMiscRenderFlags(selectedEmitter, numValue);
            }

            if (success) {
                markSystemModified(data, systemName);
                setData({ ...data });
                markChanged();
            }
        },
        [selectedEmitter, data, selectedEmitters, markChanged, saveToUndoHistory],
    );

    // Texture hover preview: resolve the emitter's texture (from its raw bin text)
    // to a disk file under the loaded bin's mod tree, decode it via the imgrecolor
    // backend, and float a thumbnail. Right-click opens a context menu (reveal /
    // open in ImgRecolor); click just dismisses any open preview.
    const handleTextureMouseEnter = useCallback((e: ReactMouseEvent, emitter: Emitter) => {
        handleTextureMouseEnterPreview(e, emitter.rawContent, binPath);
    }, [binPath]);
    const handleTextureMouseLeave = useCallback(() => handleTextureMouseLeavePreview(), []);
    const handleTextureClick = useCallback((e: ReactMouseEvent) => {
        e.stopPropagation();
        closeTextureHoverPreview();
    }, []);
    const handleTextureContextMenu = useCallback((e: ReactMouseEvent, emitter: Emitter) => {
        handleTextureContextMenuPreview(e, emitter.rawContent, binPath);
    }, [binPath]);

    // ============ RENDER HELPERS ============
    const renderEmitter = (emitter: Emitter, systemName: string) => {
        const key = createEmitterKey(systemName, emitter.name);
        const isSelected = selectedEmitters.has(key);
        const hasTexture = emitterHasTexture(emitter);

        return (
            <div
                key={key}
                className={`bin-editor-emitter ${isSelected ? 'selected' : ''}`}
                onClick={(e) => toggleEmitterSelection(systemName, emitter.name, e.ctrlKey || e.metaKey)}
                style={{
                    padding: '8px 12px',
                    marginLeft: '16px',
                    marginBottom: '4px',
                    background: isSelected ? 'color-mix(in oklab, var(--accent) 30%, transparent)' : 'color-mix(in oklab, var(--text-primary) 6%, transparent)',
                    border: isSelected ? '1px solid color-mix(in oklab, var(--accent) 50%, transparent)' : '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    outline: 'none',
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: isSelected ? UI_COLORS.primary : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {emitter.name}
                        {isSelected && <span>{ICONS.check}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {emitter.birthScale0?.constantValue && (
                            <span style={{ color: UI_COLORS.bs }} title="Birth Scale">BS: ({emitter.birthScale0.constantValue.x.toFixed(1)}, {emitter.birthScale0.constantValue.y.toFixed(1)}, {emitter.birthScale0.constantValue.z.toFixed(1)})</span>
                        )}
                        {emitter.scale0?.constantValue && (
                            <span style={{ color: UI_COLORS.scale }} title="Scale">S: ({emitter.scale0.constantValue.x.toFixed(1)}, {emitter.scale0.constantValue.y.toFixed(1)}, {emitter.scale0.constantValue.z.toFixed(1)})</span>
                        )}
                        {emitter.bindWeight && (
                            <span style={{ color: UI_COLORS.bw }} title="Bind Weight">BW: {emitter.bindWeight.constantValue}</span>
                        )}
                        {emitter.translationOverride && (
                            <span style={{ color: UI_COLORS.to }} title="Translation Override">TO: ({emitter.translationOverride.constantValue.x}, {emitter.translationOverride.constantValue.y}, {emitter.translationOverride.constantValue.z})</span>
                        )}
                        {emitter.particleLifetime?.constantValue != null && (
                            <span style={{ color: UI_COLORS.pl }} title="Particle Lifetime">PL: {emitter.particleLifetime.constantValue.toFixed(2)}</span>
                        )}
                        {emitter.lifetime?.value != null && (
                            <span style={{ color: UI_COLORS.lt }} title="Emitter Lifetime">LT: {emitter.lifetime.value.toFixed(2)}</span>
                        )}
                        {emitter.rate?.constantValue != null && (
                            <span style={{ color: 'var(--color-info)' }} title="Emission Rate">R: {emitter.rate.constantValue}</span>
                        )}
                        {emitter.pass != null && (
                            <span style={{ color: UI_COLORS.pass }} title="Render Pass">P: {emitter.pass}</span>
                        )}
                        {emitter.miscRenderFlags != null && (
                            <span style={{ color: 'var(--color-danger)' }} title="Misc Render Flags">MR: {emitter.miscRenderFlags}</span>
                        )}
                        {emitter.isGroundLayer != null && (
                            <span style={{ color: UI_COLORS.ground }} title="Ground Layer">GL: {emitter.isGroundLayer ? 'T' : 'F'}</span>
                        )}
                    </div>
                </div>
                {hasTexture && (
                    <button
                        onClick={handleTextureClick}
                        onMouseEnter={(e) => handleTextureMouseEnter(e, emitter)}
                        onMouseLeave={handleTextureMouseLeave}
                        onContextMenu={(e) => handleTextureContextMenu(e, emitter)}
                        className="dl-btn dl-btn--sm dl-btn--icon dl-btn--secondary"
                        style={{ width: '24px', height: '24px', flexShrink: 0 }}
                        title="Preview texture"
                    >
                        <CropOriginalIcon sx={{ fontSize: 16 }} />
                    </button>
                )}
            </div>
        );
    };

    const renderSystem = (system: VfxSystem) => {
        const isExpanded = expandedSystems.has(system.name);
        const selectedCount = system.emitters.filter((e) =>
            selectedEmitters.has(createEmitterKey(system.name, e.name)),
        ).length;

        return (
            <div key={system.name} style={{ marginBottom: '8px' }}>
                <div
                    className={`bin-editor-item ${selectedCount > 0 ? 'selected' : ''}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: selectedCount > 0
                            ? 'color-mix(in oklab, var(--accent) 16%, transparent)'
                            : 'color-mix(in oklab, var(--text-primary) 8%, transparent)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        overflow: 'hidden',
                        height: '42px',
                        outline: 'none',
                    }}
                >
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
                            borderRight: '1px solid var(--border)',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--text-primary) 5%, transparent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        <span style={{ fontSize: '14px' }}>
                            {isExpanded ? ICONS.expand : ICONS.collapse}
                        </span>
                    </div>

                    <div
                        onClick={() => selectAllInSystem(system.name)}
                        style={{
                            flex: 1,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 12px',
                            gap: '8px',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--text-primary) 3%, transparent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title={`Click to select all emitters in ${system.name}`}
                    >
                        <span style={{ flex: 1, fontWeight: 600, color: 'var(--accent)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {system.displayName}
                            {selectedCount > 0 && <span style={{ color: UI_COLORS.primary }}>{ICONS.check}</span>}
                        </span>

                        <span
                            style={{
                                padding: '1px 7px',
                                background: 'color-mix(in oklab, var(--accent) 15%, transparent)',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: 'var(--accent)',
                                border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)',
                                fontWeight: '600',
                            }}
                        >
                            {selectedCount > 0 ? `${selectedCount}/` : ''}{system.emitters.length}
                        </span>
                    </div>
                </div>

                {isExpanded && (
                    <div style={{ marginTop: '4px' }}>
                        {system.emitters.map((e) => renderEmitter(e, system.name))}
                    </div>
                )}
            </div>
        );
    };

    const Vec3Editor = ({ label, value, property, color }: {
        label: string;
        value: Vec3;
        property: string;
        color: string;
    }) => (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, color, marginBottom: '8px' }}>{label}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
                {(['x', 'y', 'z'] as (keyof Vec3)[]).map((axis) => (
                    <div key={axis} style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: 'var(--accent-muted)' }}>{axis.toUpperCase()}</label>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter?.name}-${property}-${axis}`}
                            defaultValue={value[axis]}
                            onBlur={(e) => handlePropertyChange(property, axis, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            style={{ fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

    const renderPropertyEditor = () => {
        if (!selectedEmitter) {
            return (
                <div style={{ color: 'var(--accent-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                    {selectedEmitters.size === 0
                        ? 'Select an emitter to edit properties'
                        : `${selectedEmitters.size} emitters selected - use bulk actions above`}
                </div>
            );
        }

        return (
            <div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '16px', color: UI_COLORS.primary }}>
                    {selectedEmitter.name}
                </div>

                {selectedEmitter.birthScale0?.constantValue && (
                    <Vec3Editor
                        label="Birth Scale"
                        value={selectedEmitter.birthScale0.constantValue}
                        property="birthScale0"
                        color={UI_COLORS.bs}
                    />
                )}

                {selectedEmitter.scale0?.constantValue && (
                    <Vec3Editor
                        label="Scale"
                        value={selectedEmitter.scale0.constantValue}
                        property="scale0"
                        color={UI_COLORS.scale}
                    />
                )}

                {selectedEmitter.translationOverride?.constantValue && (
                    <Vec3Editor
                        label="Translation Override"
                        value={selectedEmitter.translationOverride.constantValue}
                        property="translationOverride"
                        color={UI_COLORS.to}
                    />
                )}

                {selectedEmitter.bindWeight && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: UI_COLORS.bw, marginBottom: '8px' }}>Bind Weight</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-bindWeight`}
                            defaultValue={selectedEmitter.bindWeight.constantValue ?? ''}
                            onBlur={(e) => handlePropertyChange('bindWeight', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.particleLifetime?.constantValue != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: UI_COLORS.pl, marginBottom: '8px' }}>Particle Lifetime</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-particleLifetime`}
                            defaultValue={selectedEmitter.particleLifetime.constantValue}
                            onBlur={(e) => handlePropertyChange('particleLifetime', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: UI_COLORS.pl, fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.lifetime?.value != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: UI_COLORS.lt, marginBottom: '8px' }}>Emitter Lifetime</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-lifetime`}
                            defaultValue={selectedEmitter.lifetime.value}
                            onBlur={(e) => handlePropertyChange('lifetime', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: UI_COLORS.lt, fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.particleLinger?.value != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--accent2)', marginBottom: '8px' }}>Particle Linger</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-particleLinger`}
                            defaultValue={selectedEmitter.particleLinger.value}
                            onBlur={(e) => handlePropertyChange('particleLinger', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.rate?.constantValue != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-info)', marginBottom: '8px' }}>Emission Rate</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-rate`}
                            defaultValue={selectedEmitter.rate.constantValue}
                            onBlur={(e) => handlePropertyChange('rate', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: 'var(--color-info)', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.pass != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: UI_COLORS.pass, marginBottom: '8px' }}>Render Pass</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-pass`}
                            defaultValue={selectedEmitter.pass}
                            onBlur={(e) => handlePropertyChange('pass', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: UI_COLORS.pass, fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.miscRenderFlags != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-danger)', marginBottom: '8px' }}>Misc Render Flags</div>
                        <input
                            type="text"
                            className="dl-input"
                            key={`${selectedEmitter.name}-miscRenderFlags`}
                            defaultValue={selectedEmitter.miscRenderFlags}
                            onBlur={(e) => handlePropertyChange('miscRenderFlags', null, e.target.value)}
                            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}
                        />
                    </div>
                )}

                {selectedEmitter.isGroundLayer != null && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, color: UI_COLORS.ground, marginBottom: '8px' }}>Ground Layer</div>
                        <select
                            className="dl-select"
                            key={`${selectedEmitter.name}-isGroundLayer`}
                            defaultValue={selectedEmitter.isGroundLayer ? 'true' : 'false'}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePropertyChange('isGroundLayer', null, e.target.value)}
                            style={{ color: UI_COLORS.ground, fontFamily: 'var(--font-mono)' }}
                        >
                            <option value="false">false</option>
                            <option value="true">true</option>
                        </select>
                    </div>
                )}

                {!selectedEmitter.birthScale0 && !selectedEmitter.scale0 &&
                    !selectedEmitter.bindWeight && !selectedEmitter.translationOverride &&
                    !selectedEmitter.particleLifetime && !selectedEmitter.lifetime &&
                    !selectedEmitter.particleLinger && !selectedEmitter.rate &&
                    selectedEmitter.pass == null &&
                    selectedEmitter.miscRenderFlags == null &&
                    selectedEmitter.isGroundLayer == null && (
                        <div style={{ color: 'var(--accent-muted)', fontStyle: 'italic' }}>
                            No editable properties found
                        </div>
                    )}
            </div>
        );
    };

    // ============ DRAG & DROP ============
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!isOverRef.current) {
            isOverRef.current = true;
            setIsOver(true);
        }
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        isOverRef.current = false;
        setIsOver(false);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        isOverRef.current = false;
        setIsOver(false);
        const file = e.dataTransfer?.files?.[0] as (File & { path?: string }) | undefined;
        const dropped = file?.path;
        if (dropped && /\.(bin|py)$/i.test(dropped)) {
            void processBinFile(dropped);
        }
    }, [processBinFile]);

    // Warn on close with unsaved changes (browser-level guard).
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedChanges]);

    // ============ MAIN RENDER ============
    return (
        <div
            className="bin-editor-container"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontFamily: 'var(--app-font-family), -apple-system, sans-serif',
                overflow: 'hidden',
                position: 'relative',
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {isOver && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                    border: '2px dashed var(--accent)', borderRadius: '8px',
                    transition: 'all 0.15s ease-out',
                }}>
                    <div style={{
                        padding: '10px 16px', borderRadius: '6px',
                        border: '1px dashed var(--accent)', color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)', fontSize: '13px',
                        background: 'color-mix(in oklab, var(--accent) 20%, transparent)',
                    }}>
                        Drop .bin or .py to load
                    </div>
                </div>
            )}
            {isLoading && (
                <div className="glow-spinner-overlay">
                    <div className="glow-spinner-container">
                        <div className="glow-spinner-ring" />
                        <div className="glow-spinner-text">{loadingText || 'Loading...'}</div>
                    </div>
                </div>
            )}

            {/* Top Action Bar */}
            <div className="bin-editor-topbar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                flexShrink: 0,
            }}>
                <div
                    style={{
                        minWidth: 0,
                        flex: 1,
                        fontSize: '12px',
                        color: 'var(--accent-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                    title={statusMessage}
                >
                    {statusMessage}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={loadBinFile} className="dl-btn dl-btn--primary">
                        Load .bin
                    </button>
                    <button
                        onClick={undoLastChange}
                        disabled={undoHistory.length === 0}
                        className="dl-btn dl-btn--secondary"
                        title={`Undo (${undoHistory.length} steps available)`}
                    >
                        Undo{undoHistory.length > 0 ? ` (${undoHistory.length})` : ''}
                    </button>
                    <button
                        onClick={restoreOriginal}
                        disabled={!initialContent}
                        className="dl-btn dl-btn--secondary"
                        title="Restore to original state when file was first loaded"
                    >
                        Restore
                    </button>
                    <button
                        onClick={saveFile}
                        disabled={!hasUnsavedChanges}
                        className="dl-btn dl-btn--primary"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            {data && (
                <div className="bin-editor-toolbar" style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    overflowX: 'auto',
                }}>
                    {/* Tool Selector */}
                    <div style={{ marginRight: '16px', display: 'flex', alignItems: 'center' }}>
                        <Select
                            value={toolbarTab}
                            onChange={(e) => setToolbarTab(e.target.value as ToolbarTab)}
                            size="small"
                            className="bin-editor-toolbar-select"
                            sx={toolbarSelectStyle}
                            MenuProps={{
                                PaperProps: {
                                    className: 'bin-editor-toolbar-menu-paper',
                                    sx: toolbarMenuPaperSx,
                                },
                            }}
                        >
                            {toolbarTabOptions.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', marginRight: '16px' }} />

                    {/* Scale Controls */}
                    {toolbarTab === 'scale' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--accent-muted)' }}>Multiplier:</span>
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={scaleMultiplier}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setScaleMultiplier(isNaN(val) || val <= 0 ? 1 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                style={{ width: '60px', height: '28px' }}
                            />
                            <button onClick={applyScaleBirthScale} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.bs)} title="Scale Birth Scale">
                                BS x{scaleMultiplier}
                            </button>
                            <button onClick={applyScaleScale0} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.scale)} title="Scale Scale">
                                S x{scaleMultiplier}
                            </button>
                            <button onClick={handleScaleParticleLifetime} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.pl)} title="Scale Particle Lifetime">
                                PL x{scaleMultiplier}
                            </button>
                            <button onClick={handleScaleLifetime} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.lt)} title="Scale Emitter Lifetime">
                                LT x{scaleMultiplier}
                            </button>
                            <button onClick={handleScalePass} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.pass)} title="Scale pass">
                                P x{scaleMultiplier}
                            </button>
                        </div>
                    )}

                    {/* BindWeight */}
                    {toolbarTab === 'bindWeight' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleAddBindWeight} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.bw)} title="Add Bind Weight property">
                                + BindWeight
                            </button>
                            <button onClick={handleSetBindWeightZero} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.bw)} title="Set Bind Weight to 0">
                                BW=0
                            </button>
                            <button onClick={handleSetBindWeightOne} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.bw)} title="Set Bind Weight to 1">
                                BW=1
                            </button>
                        </div>
                    )}

                    {/* MiscRenderFlags */}
                    {toolbarTab === 'misc' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleAddMiscRenderFlags} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle('var(--color-danger)')} title="Add Misc Render Flags property">
                                + MR
                            </button>
                            <button onClick={handleSetMiscRenderFlagsZero} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle('var(--color-danger)')} title="Set Misc Render Flags to 0">
                                MR=0
                            </button>
                            <button onClick={handleSetMiscRenderFlagsOne} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle('var(--color-danger)')} title="Set Misc Render Flags to 1">
                                MR=1
                            </button>
                        </div>
                    )}

                    {/* Ground Layer */}
                    {toolbarTab === 'ground' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={handleAddIsGroundLayer} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.ground)} title="Add isGroundLayer property">
                                + Ground
                            </button>
                            <button onClick={handleSetIsGroundLayerTrue} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.ground)} title="Set isGroundLayer to true">
                                Ground=true
                            </button>
                            <button onClick={handleSetIsGroundLayerFalse} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.ground)} title="Set isGroundLayer to false">
                                Ground=false
                            </button>
                        </div>
                    )}

                    {/* Pass */}
                    {toolbarTab === 'pass' && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={passValue}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setPassValue(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="Pass"
                                title="Pass value (i16, can be negative)"
                                style={{ width: '60px', height: '28px', textAlign: 'center' }}
                            />
                            <button onClick={handleSetPass} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.pass)} title="Set pass for selected emitters">
                                P={passValue}
                            </button>
                            <span style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={passDeltaValue}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setPassDeltaValue(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="+/-"
                                title="Amount to add to current pass value"
                                style={{ width: '60px', height: '28px', textAlign: 'center' }}
                            />
                            <button onClick={handleAddPass} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.pass)} title="Add amount to pass for selected emitters">
                                P+={passDeltaValue}
                            </button>
                        </div>
                    )}

                    {/* TranslationOverride */}
                    {toolbarTab === 'to' && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button onClick={handleAddTranslationOverride} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.to)} title="Add Translation Override property">
                                + TO
                            </button>
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={toX}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToX(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="X"
                                title="Translation Override X value"
                                style={{ width: '50px', height: '28px', textAlign: 'center' }}
                            />
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={toY}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToY(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="Y"
                                title="Translation Override Y value"
                                style={{ width: '50px', height: '28px', textAlign: 'center' }}
                            />
                            <input
                                type="text"
                                className="dl-input"
                                defaultValue={toZ}
                                onBlur={(e) => {
                                    const val = parseLocaleFloat(e.target.value);
                                    setToZ(isNaN(val) ? 0 : val);
                                }}
                                onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="Z"
                                title="Translation Override Z value"
                                style={{ width: '50px', height: '28px', textAlign: 'center' }}
                            />
                            <button onClick={handleSetTranslationOverride} className="dl-btn dl-btn--sm dl-btn--primary" style={smallButtonStyle(UI_COLORS.to)} title="Set Translation Override values for selected emitters">
                                Set
                            </button>
                        </div>
                    )}

                    {/* Search */}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search emitters..."
                            className="dl-input"
                            style={{ width: '240px' }}
                        />
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="bin-editor-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - Systems List */}
                <div className="bin-editor-list" style={{
                    width: '50%',
                    borderRight: '1px solid var(--border)',
                    overflow: 'auto',
                    padding: '12px',
                }}>
                    {!data ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'var(--accent)',
                        }}>
                            <div>Load a .bin file to start editing</div>
                        </div>
                    ) : filteredSystems.length === 0 ? (
                        <div style={{ color: 'var(--accent)', textAlign: 'center', marginTop: '40px' }}>
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
                    padding: '16px 20px',
                }}>
                    {data && renderPropertyEditor()}
                </div>
            </div>
        </div>
    );
}

export default BinEditor;
