/*
 * Paint — VFX Color Editor.
 *
 * Faithful 1:1 port of the Electron Quartz paint2 page to Tauri + React + TS.
 * Opens a real .bin, parses it with the ported line-indexed parser, lists real
 * systems / emitters / static materials, and recolors the parsed ritobin text
 * (palette / random / linear gradient / HSL shift / shift-hue / materials) before
 * saving back through write_bin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Typography, Button, TextField, Checkbox, Slider, IconButton,
    Select, MenuItem, Menu, Dialog, DialogTitle, DialogContent, DialogActions,
    type SelectChangeEvent,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import TuneIcon from '@mui/icons-material/Tune';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { FolderOpen as FolderOpenIcon, Undo2 as UndoIcon, Redo2 as RedoIcon, X as CloseIcon } from 'lucide-react';
import { useFileExplorer } from '@/components/explorer';
import {
    paintOpen, paintClose, paintReloadIfChanged, paintRecolor, paintSetBlendMode, paintSetMaterialParam, paintSetTexture, paintSetColorAlpha, paintUndo, paintRedo, paintSave,
    isStaleFileError,
    type VfxEmitter, type ColorTargetId,
    type PaletteStopInput, type RecolorOptionsInput,
} from '@/lib/api';
import { useNotificationStore, usePaintStore, useUiPrefsStore, type HslValues, type PaintState as PaintStoreState } from '@/lib/stores';
import { useFileDrop } from '@/lib/util/useFileDrop';
import { DropOverlay } from '@/components/ui';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
import { useSessionFileWatcher } from '@/lib/util/useSessionFileWatcher';

import './paint/Paint.css';
import ColorHandler from './paint/utils/ColorHandler';
import { savePalette, loadAllPalettes, deletePalette } from './paint/utils/paletteManager';
import { getColorDescription } from './paint/utils/colorFilter';

import SystemList, { type ColorSlotKey } from './paint/components/SystemList';
import PaletteManager, { type SavedPaletteItem } from './paint/components/PaletteManager';
import { ColorPickerHost, openColorPicker, cleanupColorPickers } from './paint/components/ColorPicker';
import AlphaEditorModal from './paint/components/AlphaEditorModal';
import {
    closeTexturePreview, scheduleTexturePreviewClose, showTexturePreview,
} from '@/lib/util/texturePreview';
import { useMinecraftStyle } from './paint/useMinecraftStyle';
import { useJadeBin } from '@/lib/jade/jadeInterop';

const controlLabelStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
} as const;

/* Dark dropdown-menu paper shared by every Paint <Select> so the popup matches
   the Design Lab surface instead of the default light MUI menu. */
const ddMenuPaperSx = {
    mt: 0.6,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--dl-shadow-md)',
    overflow: 'hidden',
    '& .MuiMenu-list': { py: 0.5 },
    '& .MuiMenuItem-root': {
        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)',
        mx: 0.6, borderRadius: 'var(--radius-sm)', minHeight: '32px', transition: 'all var(--motion-fast)',
        '&:hover': { background: 'var(--bg-hover)', color: 'var(--text-primary)' },
        '&.Mui-selected': { background: 'color-mix(in oklab, var(--accent-primary) 16%, transparent)', color: 'var(--accent-primary)', fontWeight: 700 },
        '&.Mui-selected:hover': { background: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)' },
    },
} as const;

/* Shared trigger styling for the small Paint selects (BM / variant). */
const ddTriggerSx = {
    fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)', height: '28px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', transition: 'all var(--motion-fast)',
    '& .MuiSelect-select': { padding: '4px 10px', paddingRight: '28px !important', display: 'flex', alignItems: 'center' },
    '& .MuiSelect-icon': { color: 'var(--text-secondary)', fontSize: '1rem' },
    '&:hover': { background: 'var(--bg-hover)', borderColor: 'color-mix(in oklab, var(--accent-primary) 35%, var(--border))' },
    '&.Mui-focused': { borderColor: 'var(--accent-primary)', boxShadow: '0 0 0 2px color-mix(in oklab, var(--accent-primary) 55%, transparent)' },
    '& fieldset': { border: 'none' }, '&:hover fieldset': { border: 'none' }, '&.Mui-focused fieldset': { border: 'none' },
} as const;

/* "3m ago" / "2h ago" / "5d ago" style stamp for the recent bins list. */
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

/* Mode picker — lives in the sub-toolbar so it's reachable from every mode
   (it used to sit inside PaletteManager, which unmounts in HSL/Shift modes and
   trapped the user there). */
function ModeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mode</Typography>
            <Select
                value={value}
                onChange={(e: SelectChangeEvent) => onChange(e.target.value)}
                size="small"
                className="paint2-mode-select"
                sx={{ ...ddTriggerSx, minWidth: '148px' }}
                MenuProps={{ PaperProps: { sx: ddMenuPaperSx } }}
            >
                <MenuItem value="random">Normal</MenuItem>
                <MenuItem value="random-keyframe">Random Gradient</MenuItem>
                <MenuItem value="linear">Linear Gradient</MenuItem>
                <MenuItem value="shift">HSL Shift</MenuItem>
                <MenuItem value="shift-hue">Shift Hue</MenuItem>
                <MenuItem value="materials">Materials Only</MenuItem>
            </Select>
        </Box>
    );
}

/* ── Hue / HSL / blend-chance sub-controls (committed sliders) ──────────── */

function ShiftHueControl({ value, onCommit, onStatus }: { value: number; onCommit: (v: number) => void; onStatus: (s: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    return (
        <Box sx={{ padding: '8px 40px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Target: {draft}°</Typography>
                <Slider
                    value={draft}
                    onChange={(_, v) => setDraft(Array.isArray(v) ? v[0] : v)}
                    onChangeCommitted={(_, v) => { const next = Array.isArray(v) ? v[0] : v; setDraft(next); onCommit(next); onStatus(`Hue Target Ready: ${next}° (Press Recolor to apply)`); }}
                    min={0} max={360} size="small"
                    sx={{
                        '& .MuiSlider-track': { background: 'transparent', border: 'none' },
                        // Rainbow rail is the hue spectrum (data), not theme chrome.
                        '& .MuiSlider-rail': { height: '5px', opacity: 1, background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' },
                        '& .MuiSlider-thumb': { width: 14, height: 14, background: 'var(--accent-primary)', border: '2px solid var(--text-primary)', boxShadow: '0 2px 8px rgba(0,0,0,.3)', transition: 'all 0.16s ease', '&:hover': { boxShadow: '0 0 0 6px color-mix(in oklab, var(--accent-primary) 22%, transparent)' }, '&.Mui-active': { boxShadow: '0 0 0 8px color-mix(in oklab, var(--accent-primary) 28%, transparent)' } },
                    }}
                />
            </Box>
        </Box>
    );
}

function HslShiftControls({ values, onCommit, onStatus }: { values: HslValues; onCommit: (v: HslValues) => void; onStatus: (s: string) => void }) {
    const [draft, setDraft] = useState(values);
    useEffect(() => { setDraft(values); }, [values.h, values.s, values.l]);
    const commitPart = (part: keyof HslValues, value: number | number[]) => {
        const nextValue = Array.isArray(value) ? value[0] : value;
        const next = { ...draft, [part]: nextValue };
        setDraft(next);
        onCommit(next);
        onStatus(`HSL Shift Ready: H:${next.h}° S:${next.s}% L:${next.l}%`);
    };
    return (
        <Box sx={{ padding: '8px 40px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Hue: {draft.h}°</Typography>
                <Slider value={draft.h} onChange={(_, v) => setDraft(p => ({ ...p, h: Array.isArray(v) ? v[0] : v }))} onChangeCommitted={(_, v) => commitPart('h', v)} min={-180} max={180} size="small" />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Sat: {draft.s}%</Typography>
                <Slider value={draft.s} onChange={(_, v) => setDraft(p => ({ ...p, s: Array.isArray(v) ? v[0] : v }))} onChangeCommitted={(_, v) => commitPart('s', v)} min={-100} max={100} size="small" />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Lig: {draft.l}%</Typography>
                <Slider value={draft.l} onChange={(_, v) => setDraft(p => ({ ...p, l: Array.isArray(v) ? v[0] : v }))} onChangeCommitted={(_, v) => commitPart('l', v)} min={-100} max={100} size="small" />
            </Box>
        </Box>
    );
}

function BlendModeChanceSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Slider
                size="small"
                value={draft}
                onChange={(_, v) => setDraft(Array.isArray(v) ? v[0] : v)}
                onChangeCommitted={(_, v) => { const next = Array.isArray(v) ? v[0] : v; setDraft(next); onCommit(next); }}
                sx={{ width: 80, color: 'var(--accent-primary)' }}
            />
            <Typography sx={{ ...controlLabelStyle, opacity: 0.5, minWidth: '35px' }}>{draft}%</Typography>
        </Box>
    );
}

/* ── page ───────────────────────────────────────────────────────────────── */

/* Build a setX shim over the store that accepts both a value and a functional
   updater, matching React's setState signature so the existing handlers below
   don't have to change. */
type Updater<T> = T | ((prev: T) => T);
function makeSetter<K extends keyof PaintStoreState>(key: K) {
    return (value: Updater<PaintStoreState[K]>) => {
        const s = usePaintStore.getState();
        const next = typeof value === 'function'
            ? (value as (prev: PaintStoreState[K]) => PaintStoreState[K])(s[key])
            : value;
        s.set(key, next);
    };
}

function Paint() {
    const pick = useFileExplorer();
    const notify = useNotificationStore((s) => s.push);
    const isMinecraftStyle = useMinecraftStyle();

    // === RESIDENT STATE (persists across page swaps via the store) ===
    const filePath = usePaintStore((s) => s.filePath);
    useJadeBin(filePath);
    const fileSaved = usePaintStore((s) => s.fileSaved);
    const statusMessage = usePaintStore((s) => s.statusMessage);
    const model = usePaintStore((s) => s.model);
    const sessionId = usePaintStore((s) => s.sessionId);
    const canUndo = usePaintStore((s) => s.canUndo);
    const canRedo = usePaintStore((s) => s.canRedo);
    const selection = usePaintStore((s) => s.selection);
    const lockedSystems = usePaintStore((s) => s.lockedSystems);
    const searchQuery = usePaintStore((s) => s.searchQuery);
    const expandedSystems = usePaintStore((s) => s.expandedSystems);
    const expandedMaterials = usePaintStore((s) => s.expandedMaterials);
    const autoExpand = usePaintStore((s) => s.autoExpand);
    const variantFilter = usePaintStore((s) => s.variantFilter);
    const mode = usePaintStore((s) => s.mode);
    const palette = usePaintStore((s) => s.palette);
    const colorCount = usePaintStore((s) => s.colorCount);
    const ignoreBlackWhite = usePaintStore((s) => s.ignoreBlackWhite);
    const hslValues = usePaintStore((s) => s.hslValues);
    const hueTarget = usePaintStore((s) => s.hueTarget);
    const colorFilterEnabled = usePaintStore((s) => s.colorFilterEnabled);
    const targetColors = usePaintStore((s) => s.targetColors);
    const colorTolerance = usePaintStore((s) => s.colorTolerance);
    const targetBC = usePaintStore((s) => s.targetBC);
    const targetOC = usePaintStore((s) => s.targetOC);
    const targetLC = usePaintStore((s) => s.targetLC);
    const targetBaseColor = usePaintStore((s) => s.targetBaseColor);
    const blendModeSelect = usePaintStore((s) => s.blendModeSelect);
    const blendModeChance = usePaintStore((s) => s.blendModeChance);

    const setFilePath = useMemo(() => makeSetter('filePath'), []);
    const setFileName = useMemo(() => makeSetter('fileName'), []);
    const setFileSaved = useMemo(() => makeSetter('fileSaved'), []);
    const setStatusMessage = useMemo(() => makeSetter('statusMessage'), []);
    const setModel = useMemo(() => makeSetter('model'), []);
    const setSessionId = useMemo(() => makeSetter('sessionId'), []);
    const setCanUndo = useMemo(() => makeSetter('canUndo'), []);
    const setCanRedo = useMemo(() => makeSetter('canRedo'), []);
    const setSelection = useMemo(() => makeSetter('selection'), []);
    const setLockedSystems = useMemo(() => makeSetter('lockedSystems'), []);
    const setSearchQuery = useMemo(() => makeSetter('searchQuery'), []);
    const setExpandedSystems = useMemo(() => makeSetter('expandedSystems'), []);
    const setExpandedMaterials = useMemo(() => makeSetter('expandedMaterials'), []);
    const setAutoExpand = useMemo(() => makeSetter('autoExpand'), []);
    const setVariantFilter = useMemo(() => makeSetter('variantFilter'), []);
    const setMode = useMemo(() => makeSetter('mode'), []);
    const setPalette = useMemo(() => makeSetter('palette'), []);
    const setColorCount = useMemo(() => makeSetter('colorCount'), []);
    const setIgnoreBlackWhite = useMemo(() => makeSetter('ignoreBlackWhite'), []);
    const setHslValues = useMemo(() => makeSetter('hslValues'), []);
    const setHueTarget = useMemo(() => makeSetter('hueTarget'), []);
    const setColorFilterEnabled = useMemo(() => makeSetter('colorFilterEnabled'), []);
    const setTargetColors = useMemo(() => makeSetter('targetColors'), []);
    const setColorTolerance = useMemo(() => makeSetter('colorTolerance'), []);
    const setTargetBC = useMemo(() => makeSetter('targetBC'), []);
    const setTargetOC = useMemo(() => makeSetter('targetOC'), []);
    const setTargetLC = useMemo(() => makeSetter('targetLC'), []);
    const setTargetBaseColor = useMemo(() => makeSetter('targetBaseColor'), []);
    const setBlendModeSelect = useMemo(() => makeSetter('blendModeSelect'), []);
    const setBlendModeChance = useMemo(() => makeSetter('blendModeChance'), []);

    // autoExpand mirrors into a ref for use inside the load callback.
    const autoExpandRef = useRef(autoExpand);
    autoExpandRef.current = autoExpand;
    const setAutoExpandWithRef = (val: boolean) => { setAutoExpand(val); autoExpandRef.current = val; };

    // === TRANSIENT UI STATE (fine to reset on remount) ===
    const [isLoading, setIsLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const storedRecentBins = useUiPrefsStore((s) => s.recentBins);
    const removeRecentBin = useUiPrefsStore((s) => s.removeRecentBin);
    // Only show recent bins whose file still exists; prune vanished ones.
    const recentBins = useExistingRecentBins(storedRecentBins, removeRecentBin);
    const [paletteNameDialogOpen, setPaletteNameDialogOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [paletteToDelete, setPaletteToDelete] = useState<number | null>(null);
    const [newPaletteName, setNewPaletteName] = useState('');
    const [savedPalettesList, setSavedPalettesList] = useState<SavedPaletteItem[]>([]);
    const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);
    const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);

    const handleExternalReload = useCallback((nextModel: NonNullable<typeof model>) => {
        setModel(nextModel);
        setFileSaved(true);
        setCanUndo(false);
        setCanRedo(false);
        setSelection(new Set());
        setStatusMessage(`BIN changed externally and was reloaded (${nextModel.stats.systemCount} systems)`);
    }, []);

    useSessionFileWatcher({
        sessionId,
        reload: paintReloadIfChanged,
        onReload: handleExternalReload,
        paused: isLoading,
    });

    // ============================================================
    // FILE OPERATIONS
    // ============================================================

    const loadBinFile = useCallback(async (selectedPath: string) => {
        if (!selectedPath) return;
        setIsLoading(true);
        setStatusMessage('Loading...');
        try {
            const baseName = (selectedPath.split(/[\\/]/).pop() || selectedPath).replace(/\.(bin|py)$/i, '');
            setStatusMessage('Opening bin...');

            // Free the previous resident tree before opening a new one. Read the
            // live session from the store (the ref is per-mount and resets on a
            // page swap, but the session persists in the store).
            const prev = usePaintStore.getState().sessionId;
            if (prev !== null) {
                void paintClose(prev).catch(() => undefined);
            }

            const { sessionId: newSession, model: newModel } = await paintOpen(selectedPath);
            setSessionId(newSession);
            setModel(newModel);

            setFilePath(selectedPath);
            setFileName(baseName);
            setFileSaved(true);
            setSelection(new Set());
            setCanUndo(false);
            setCanRedo(false);

            if (autoExpandRef.current) {
                setExpandedSystems(new Set(newModel.systemOrder));
                setExpandedMaterials(new Set(newModel.materialOrder || []));
            } else {
                setExpandedSystems(new Set());
                setExpandedMaterials(new Set());
            }

            useUiPrefsStore.getState().pushRecentBin(selectedPath);

            setStatusMessage(`Loaded ${newModel.stats.systemCount} systems and ${newModel.stats.emitterCount} emitters`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Error: ${msg}`);
            notify('error', `Failed to load bin: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    }, [notify]);

    const handleFileOpen = useCallback(async () => {
        try {
            const selected = await pick({ mode: 'file', filters: [{ name: 'Bin Files', extensions: ['bin', 'py'] }], recentsKey: 'bin' });
            if (selected && typeof selected === 'string') {
                await loadBinFile(selected);
            }
        } catch (error) {
            setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [loadBinFile, pick]);

    /* OS drag-and-drop: accept a dropped .bin/.py and load it. */
    useFileDrop({
        onEnter: () => setIsDragOver(true),
        onOver: () => setIsDragOver(true),
        onLeave: () => setIsDragOver(false),
        onDrop: (paths) => {
            setIsDragOver(false);
            const file = paths.find(p => /\.(bin|py)$/i.test(p));
            if (file) void loadBinFile(file);
        },
    });

    const handleSave = useCallback(async (force = false) => {
        if (sessionId === null) return;
        setIsLoading(true);
        setStatusMessage('Saving...');
        try {
            const savedPaths = await paintSave(sessionId, undefined, force);
            setFileSaved(true);
            if (savedPaths.length === 0) {
                setStatusMessage('Nothing to save (no changes)');
                notify('info', 'No changes to save');
            } else {
                const names = savedPaths.map((p) => p.split(/[\\/]/).pop()).join(', ');
                setStatusMessage('Saved successfully');
                notify('success', savedPaths.length === 1 ? `Saved ${names}` : `Saved ${savedPaths.length} files: ${names}`);
            }
        } catch (error) {
            // Close the watcher race by reparsing immediately instead of
            // offering to overwrite the external edit.
            if (!force && isStaleFileError(error)) {
                try {
                    const reloaded = await paintReloadIfChanged(sessionId);
                    if (reloaded) handleExternalReload(reloaded);
                } catch (reloadError) {
                    setStatusMessage(`External change detected; reload deferred: ${(reloadError as Error).message}`);
                }
                return;
            }
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Save error: ${msg}`);
            notify('error', `Save failed: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, notify, handleExternalReload]);

    // ============================================================
    // MODEL LOOKUPS
    // ============================================================

    const systemMap = useMemo(() => new Map((model?.systems ?? []).map(s => [s.key, s])), [model]);
    const emitterMap = useMemo(() => new Map((model?.emitters ?? []).map(e => [e.key, e])), [model]);

    // ============================================================
    // RECOLOR
    // ============================================================

    const visibleSelectionCount = useMemo(() => {
        if (!model || selection.size === 0) return 0;
        if (!searchQuery && variantFilter === 'all') return selection.size;

        const searchLower = searchQuery.toLowerCase();
        let count = 0;
        for (const emitterKey of selection) {
            const emitter = emitterMap.get(emitterKey);
            if (!emitter) continue;
            if (variantFilter === 'v1' && !emitter.name.toLowerCase().endsWith('_variant1')) continue;
            if (variantFilter === 'v2' && !emitter.name.toLowerCase().endsWith('_variant2')) continue;
            if (searchQuery) {
                const system = systemMap.get(emitter.systemKey);
                const systemMatches = (system?.name || '').toLowerCase().includes(searchLower) || (emitter.systemKey || '').toLowerCase().includes(searchLower);
                if (!systemMatches) {
                    const emitterMatches = (emitter.name || '').toLowerCase().includes(searchLower) ||
                        emitter.textures.some(t => t.path.toLowerCase().includes(searchLower));
                    if (!emitterMatches) continue;
                }
            }
            count++;
        }
        return count;
    }, [model, emitterMap, systemMap, selection, searchQuery, variantFilter]);

    // Compute the replacement color for one material param the way the old
    // applyPaletteToMaterials did, given the param's current value.
    const computeMaterialColor = useCallback((current: number[], paletteData: PaletteStopInput[]): [number, number, number, number] => {
        switch (mode) {
            case 'shift':
            case 'shift-hue': {
                const handler = new ColorHandler(current);
                if (mode === 'shift') {
                    handler.HSLShift(hslValues.h, hslValues.s, hslValues.l);
                } else if (hueTarget !== null) {
                    const [, s, l] = handler.ToHSL();
                    handler.InputHSL([hueTarget / 360, s, l]);
                }
                return handler.vec4;
            }
            case 'random':
            case 'random-keyframe':
            case 'materials': {
                const pick = paletteData[Math.floor(Math.random() * paletteData.length)];
                return pick.vec4;
            }
            case 'linear':
            default:
                return paletteData[0].vec4;
        }
    }, [mode, hslValues, hueTarget]);

    const handleRecolor = useCallback(async () => {
        if (!model || sessionId === null || selection.size === 0) {
            setStatusMessage('Select emitters first');
            return;
        }

        let effectiveSelection = selection;
        if (searchQuery || variantFilter !== 'all') {
            effectiveSelection = new Set();
            const searchLower = searchQuery.toLowerCase();
            for (const emitterKey of selection) {
                const emitter = emitterMap.get(emitterKey);
                if (!emitter) {
                    // material keys (mat::...) survive search/variant filtering
                    if (emitterKey.startsWith('mat::')) effectiveSelection.add(emitterKey);
                    continue;
                }
                if (variantFilter === 'v1' && !emitter.name.toLowerCase().endsWith('_variant1')) continue;
                if (variantFilter === 'v2' && !emitter.name.toLowerCase().endsWith('_variant2')) continue;

                let isVisible = true;
                if (searchQuery) {
                    const system = systemMap.get(emitter.systemKey);
                    const systemMatches = (system?.name || '').toLowerCase().includes(searchLower) || (emitter.systemKey || '').toLowerCase().includes(searchLower);
                    if (!systemMatches) {
                        const emitterMatches = (emitter.name || '').toLowerCase().includes(searchLower) ||
                            emitter.textures.some(t => t.path.toLowerCase().includes(searchLower));
                        if (!emitterMatches) isVisible = false;
                    }
                }
                if (isVisible) effectiveSelection.add(emitterKey);
            }
            if (effectiveSelection.size === 0) {
                setStatusMessage('No visible emitters selected to recolor.');
                return;
            }
        }

        // Recolor never touches alpha — the game's original alpha is preserved.
        // (Alpha is edited directly per color, separate from recoloring.)
        const paletteData: PaletteStopInput[] = palette.map(c => ({
            vec4: c.vec4 ? [c.vec4[0], c.vec4[1], c.vec4[2], 1] : [0, 0, 0, 1],
            time: c.time || 0,
        }));

        const colorTargets: ColorTargetId[] = [];
        if (targetBaseColor) colorTargets.push('color');
        if (targetBC) colorTargets.push('birthColor');
        if (targetOC) colorTargets.push('fresnelColor');
        if (targetLC) colorTargets.push('lingerColor');

        if (colorTargets.length === 0) {
            setStatusMessage('Error: No color targets selected (BC, OC, etc)');
            return;
        }

        const emitterKeys: string[] = [];
        const materialSelectionKeys: string[] = [];
        for (const key of effectiveSelection) {
            if (key.startsWith('mat::')) materialSelectionKeys.push(key);
            else emitterKeys.push(key);
        }

        const options: RecolorOptionsInput = {
            mode,
            ignoreBlackWhite,
            hslShift: [hslValues.h, hslValues.s, hslValues.l],
            hueTarget,
            seed: Date.now() >>> 0,
            // Recolor always keeps the original alpha the game shipped.
            preserveAlpha: true,
        };

        try {
            let changed = 0;
            let nextModel = model;

            if (emitterKeys.length > 0) {
                const result = await paintRecolor(sessionId, emitterKeys, colorTargets, paletteData, options);
                changed += result.changed;
                // The command returns refreshed colors for just the touched
                // emitters — patch them into the resident model instead of
                // swallowing a whole-model reprojection.
                if (result.changed > 0) {
                    nextModel = {
                        ...nextModel,
                        emitters: nextModel.emitters.map((e) =>
                            result.colors[e.key] ? { ...e, colors: result.colors[e.key] } : e,
                        ),
                    };
                }
            }

            // Materials have no model-refetch command; patch the local model optimistically.
            if (materialSelectionKeys.length > 0) {
                const matEdits: { materialKey: string; paramName: string; color: [number, number, number, number] }[] = [];
                for (const selectionKey of materialSelectionKeys) {
                    const parts = selectionKey.split('::');
                    if (parts.length !== 3 || parts[0] !== 'mat') continue;
                    const [, materialKey, paramName] = parts;
                    const material = nextModel.materials.find(m => m.key === materialKey);
                    const param = material?.colorParams.find(p => p.name === paramName);
                    if (!material || !param || !param.isColor) continue;
                    const color = computeMaterialColor(param.values, paletteData);
                    await paintSetMaterialParam(sessionId, selectionKey, color, true);
                    matEdits.push({ materialKey, paramName, color });
                    changed += 1;
                }

                if (matEdits.length > 0) {
                    nextModel = {
                        ...nextModel,
                        materials: nextModel.materials.map(m => {
                            const edits = matEdits.filter(e => e.materialKey === m.key);
                            if (edits.length === 0) return m;
                            return {
                                ...m,
                                colorParams: m.colorParams.map(p => {
                                    const edit = edits.find(e => e.paramName === p.name);
                                    if (!edit) return p;
                                    // Preserve alpha — paintSetMaterialParam was called with preserveAlpha.
                                    return { ...p, values: [edit.color[0], edit.color[1], edit.color[2], p.values[3]] as [number, number, number, number] };
                                }),
                            };
                        }),
                    };
                }
            }

            setModel(nextModel);
            setCanUndo(true);
            setCanRedo(false);
            setFileSaved(false);
            setStatusMessage(`Recolored ${changed} properties`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Recolor error: ${msg}`);
            notify('error', `Recolor failed: ${msg}`);
        }
    }, [model, sessionId, emitterMap, systemMap, selection, palette, mode, ignoreBlackWhite, hslValues, hueTarget, searchQuery, variantFilter, targetBaseColor, targetBC, targetOC, targetLC, computeMaterialColor, notify]);

    const handleUndo = useCallback(async () => {
        if (sessionId === null) return;
        try {
            const restored = await paintUndo(sessionId);
            if (restored) {
                setModel(restored);
                setSelection(new Set());
                setCanRedo(true);
                setFileSaved(false);
                setStatusMessage('Restored previous state');
            } else {
                setCanUndo(false);
                setStatusMessage('Nothing to undo');
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Undo error: ${msg}`);
        }
    }, [sessionId]);

    const handleRedo = useCallback(async () => {
        if (sessionId === null) return;
        try {
            const restored = await paintRedo(sessionId);
            if (restored) {
                setModel(restored);
                setSelection(new Set());
                setCanUndo(true);
                setFileSaved(false);
                setStatusMessage('Redid last edit');
            } else {
                setCanRedo(false);
                setStatusMessage('Nothing to redo');
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Redo error: ${msg}`);
        }
    }, [sessionId]);

    // ============================================================
    // PALETTE MANAGEMENT
    // ============================================================

    const refreshSavedPalettes = useCallback(() => {
        const list = loadAllPalettes(ColorHandler);
        const formatted: SavedPaletteItem[] = list.map(item => ({
            name: item.name,
            palette: item.colors.map(c => ({ rgba: c.vec4 ? [c.vec4[0], c.vec4[1], c.vec4[2], 1] : [0, 0, 0, 1], time: c.time })),
            filename: item.filename,
        }));
        setSavedPalettesList(formatted);
    }, []);

    useEffect(() => { refreshSavedPalettes(); }, [refreshSavedPalettes]);

    /* Ctrl+Z undo, Ctrl+Alt+Z (or Ctrl+Shift+Z / Ctrl+Y) redo. Skip while typing
       in an input/textarea so text fields keep their native undo. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault();
                if (e.altKey || e.shiftKey) void handleRedo();
                else void handleUndo();
            } else if (key === 'y') {
                e.preventDefault();
                void handleRedo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleUndo, handleRedo]);

    /* The resident session deliberately outlives this component — swapping pages
       must not nuke the loaded bin. It's freed only when a different bin is
       opened (loadBinFile closes the previous one) or when the app exits. */

    const confirmSavePalette = useCallback(() => {
        if (!newPaletteName.trim()) return;
        try {
            savePalette(palette, newPaletteName.trim(), mode);
            setPaletteNameDialogOpen(false);
            refreshSavedPalettes();
            setStatusMessage(`Saved palette: ${newPaletteName.trim()}`);
        } catch (error) {
            setStatusMessage(`Error saving palette: ${(error as Error).message}`);
        }
    }, [palette, mode, newPaletteName, refreshSavedPalettes]);

    const handleLoadPalette = useCallback((savedItem: SavedPaletteItem) => {
        const newPalette = savedItem.palette.map(c => {
            const h = new ColorHandler(c.rgba);
            if (h.vec4) h.vec4[3] = 1;
            h.time = c.time;
            return h;
        });
        setPalette(newPalette);
        setColorCount(newPalette.length);
        setStatusMessage(`Loaded palette: ${savedItem.name}`);
    }, []);

    const confirmDeletePalette = useCallback(() => {
        const index = paletteToDelete;
        if (index === null) return;
        const item = savedPalettesList[index];
        if (!item || !item.filename) return;
        try {
            deletePalette(item.filename);
            setDeleteConfirmOpen(false);
            setPaletteToDelete(null);
            refreshSavedPalettes();
            setStatusMessage(`Deleted palette: ${item.name}`);
        } catch (error) {
            setStatusMessage(`Error deleting palette: ${(error as Error).message}`);
        }
    }, [paletteToDelete, savedPalettesList, refreshSavedPalettes]);

    // ============================================================
    // SELECTION HELPERS
    // ============================================================

    const selectAllVisible = useCallback(() => {
        if (!model) return;
        const newSelection = new Set<string>();
        for (const emitter of model.emitters) {
            if (lockedSystems.has(emitter.systemKey)) continue;
            if (searchQuery) {
                const system = systemMap.get(emitter.systemKey);
                const searchLower = searchQuery.toLowerCase();
                if (!emitter.name.toLowerCase().includes(searchLower) && !system?.name.toLowerCase().includes(searchLower)) continue;
            }
            newSelection.add(emitter.key);
        }
        setSelection(newSelection);
        setStatusMessage(`Selected ${newSelection.size} emitters`);
    }, [model, systemMap, lockedSystems, searchQuery]);

    const selectNone = useCallback(() => setSelection(new Set()), []);

    const toggleEmitterSelection = useCallback((emitterKey: string) => {
        setSelection(prev => {
            const next = new Set(prev);
            if (next.has(emitterKey)) next.delete(emitterKey);
            else next.add(emitterKey);
            return next;
        });
    }, []);

    const toggleMaterialExpand = useCallback((materialKey: string) => {
        setExpandedMaterials(prev => {
            const next = new Set(prev);
            if (next.has(materialKey)) next.delete(materialKey);
            else next.add(materialKey);
            return next;
        });
    }, []);

    /* Stable identities so React.memo(SystemList) can skip re-renders when only
       unrelated Paint state (e.g. the palette) changes. Inline arrows here would
       give SystemList new props every render and re-render the whole list. */
    const toggleSystemLock = useCallback((k: string) => {
        setLockedSystems(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
    }, []);
    const toggleSystemExpand = useCallback((k: string) => {
        setExpandedSystems(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
    }, []);

    const toggleMaterialParam = useCallback((selectionKey: string, selected: boolean) => {
        setSelection(prev => {
            const next = new Set(prev);
            if (selected) next.add(selectionKey);
            else next.delete(selectionKey);
            return next;
        });
    }, []);

    const handleMaterialParamValueChange = useCallback(async (materialKey: string, paramName: string, newValues: number[]) => {
        if (!model || sessionId === null) return;
        const material = model.materials.find(m => m.key === materialKey);
        const param = material?.colorParams.find(p => p.name === paramName);
        if (!material || !param) return;
        const values: [number, number, number, number] = [newValues[0], newValues[1], newValues[2], newValues[3]];
        try {
            await paintSetMaterialParam(sessionId, `mat::${materialKey}::${paramName}`, values, true);
            // Optimistic local patch — Rust owns the source of truth on save.
            setModel(prev => prev && ({
                ...prev,
                materials: prev.materials.map(m => m.key !== materialKey ? m : ({
                    ...m,
                    colorParams: m.colorParams.map(p => p.name === paramName ? { ...p, values } : p),
                })),
            }));
            setCanUndo(true);
            setCanRedo(false);
            setFileSaved(false);
            setStatusMessage(`Updated ${paramName}`);
        } catch (error) {
            setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [model, sessionId]);

    const selectSystem = useCallback((systemKey: string, selected: boolean) => {
        const system = systemMap.get(systemKey);
        if (!system || lockedSystems.has(systemKey)) return;
        setSelection(prev => {
            const next = new Set(prev);
            for (const emitterKey of system.emitterKeys) {
                if (selected) next.add(emitterKey);
                else next.delete(emitterKey);
            }
            return next;
        });
    }, [systemMap, lockedSystems]);

    // ============================================================
    // BLEND MODE LOGIC
    // ============================================================

    const handleSelectByBlendMode = useCallback(() => {
        if (!model) return;
        const newSelection = new Set<string>();
        let addedCount = 0;
        for (const emitter of model.emitters) {
            if (lockedSystems.has(emitter.systemKey)) continue;
            if (searchQuery) {
                const system = systemMap.get(emitter.systemKey);
                const searchLower = searchQuery.toLowerCase();
                if (!emitter.name.toLowerCase().includes(searchLower) && !system?.name.toLowerCase().includes(searchLower)) continue;
            }
            if (emitter.blendMode === blendModeSelect) {
                if (blendModeChance >= 100 || Math.random() * 100 < blendModeChance) {
                    newSelection.add(emitter.key);
                    addedCount++;
                }
            }
        }
        setSelection(newSelection);
        setStatusMessage(`Selected ${addedCount} emitters with BM ${blendModeSelect}`);
    }, [model, systemMap, blendModeSelect, blendModeChance, lockedSystems, searchQuery]);

    const handleSingleBlendModeChange = useCallback(async (emitterKey: string, newMode: number) => {
        if (!model || sessionId === null) return;
        const emitter = emitterMap.get(emitterKey);
        if (!emitter) return;
        try {
            await paintSetBlendMode(sessionId, emitterKey, newMode);
            // Optimistic local patch.
            setModel(prev => prev && ({
                ...prev,
                emitters: prev.emitters.map(e => e.key === emitterKey ? { ...e, blendMode: newMode } : e),
            }));
            setCanUndo(true);
            setCanRedo(false);
            setFileSaved(false);
            setStatusMessage(`Updated ${emitter.name} to BlendMode ${newMode}`);
        } catch (error) {
            setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [model, sessionId, emitterMap]);

    const toggleLockAll = useCallback(() => {
        if (!model) return;
        const visibleSystems: string[] = [];
        for (const sysKey of model.systemOrder) {
            const system = systemMap.get(sysKey);
            if (!system) continue;
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                const sysMatch = system.name.toLowerCase().includes(searchLower);
                const emitterMatch = system.emitterKeys.some(ek => {
                    const em = emitterMap.get(ek);
                    return em && em.name.toLowerCase().includes(searchLower);
                });
                if (!sysMatch && !emitterMatch) continue;
            }
            visibleSystems.push(sysKey);
        }
        if (visibleSystems.length === 0) return;
        const allLocked = visibleSystems.every(k => lockedSystems.has(k));
        const newLocked = new Set(lockedSystems);
        if (allLocked) {
            visibleSystems.forEach(k => newLocked.delete(k));
            setStatusMessage(`Unlocked ${visibleSystems.length} systems`);
        } else {
            visibleSystems.forEach(k => newLocked.add(k));
            setStatusMessage(`Locked ${visibleSystems.length} systems`);
        }
        setLockedSystems(newLocked);
    }, [model, systemMap, emitterMap, lockedSystems, searchQuery]);

    // ============================================================
    // TEXTURE PREVIEW
    // ============================================================

    const handleTextureHover = useCallback((event: React.MouseEvent, emitter: VfxEmitter) => {
        // The shared module owns the show-debounce, staleness guard, and now
        // decodes .tex/.dds (the old Paint util only inlined plain images).
        const textures = (emitter.textures || []).map((t) => ({ label: t.label, path: t.path }));
        showTexturePreview(textures, event.currentTarget as HTMLElement, filePath, {
            contextMenu: true,
            onEditPath: async (oldPath, newPath) => {
                if (sessionId === null) return;
                try {
                    const next = await paintSetTexture(sessionId, emitter.key, oldPath, newPath);
                    if (next) { setModel(next); notify('success', 'Texture path updated'); }
                } catch (e) {
                    notify('error', `Failed to update texture: ${e instanceof Error ? e.message : String(e)}`);
                }
            },
        });
    }, [filePath, sessionId, setModel, notify]);

    const handleTextureLeave = useCallback(() => {
        scheduleTexturePreviewClose(500);
    }, []);

    const handleTextureClick = useCallback(() => {
        closeTexturePreview();
    }, []);

    // Right-click a color block → edit that slot's per-keyframe alpha directly.
    const [alphaTarget, setAlphaTarget] = useState<{
        emitterKey: string; slot: ColorSlotKey; title: string; keyframes: { rgba: number[]; time: number }[];
    } | null>(null);
    const handleColorAlpha = useCallback((emitterKey: string, slot: ColorSlotKey, title: string, colors: { rgba: number[]; time: number }[]) => {
        setAlphaTarget({ emitterKey, slot, title, keyframes: colors });
    }, []);
    const handleApplyAlpha = useCallback(async (alphas: number[]) => {
        if (!alphaTarget || sessionId === null) { setAlphaTarget(null); return; }
        try {
            const next = await paintSetColorAlpha(sessionId, alphaTarget.emitterKey, alphaTarget.slot, alphas);
            if (next) { setModel(next); setCanUndo(true); setCanRedo(false); setFileSaved(false); notify('success', 'Alpha updated'); }
        } catch (e) {
            notify('error', `Failed to update alpha: ${e instanceof Error ? e.message : String(e)}`);
        }
        setAlphaTarget(null);
    }, [alphaTarget, sessionId, setModel, setCanUndo, setCanRedo, setFileSaved, notify]);

    const importColorsToPalette = useCallback((colors: { rgba: number[]; time: number }[]) => {
        cleanupColorPickers();
        const newPalette = colors.map(c => {
            const h = new ColorHandler(c.rgba);
            if (h.vec4) h.vec4[3] = 1;
            h.time = c.time;
            return h;
        });
        setPalette(newPalette);
        setColorCount(newPalette.length);
    }, []);

    const applyAutoExpand = useCallback((next: boolean) => {
        if (!model) return;
        if (next) {
            setExpandedSystems(new Set(model.systemOrder));
            setExpandedMaterials(new Set(model.materialOrder || []));
        } else {
            setExpandedSystems(new Set());
            setExpandedMaterials(new Set());
        }
    }, [model]);

    const allSelected = !!(model && selection.size > 0 && selection.size === model.emitters.length);
    const isIndeterminate = !!(model && selection.size > 0 && selection.size < model.emitters.length);

    return (
        <Box
            className="paint2-container"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                // Transparent so the app background (atmosphere/wallpaper) shows through.
                // Minecraft skin keeps its own opaque backdrop.
                background: isMinecraftStyle ? '#2a2a2a' : 'transparent',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {isDragOver && <DropOverlay label="Drop .bin or .py to load" />}

            <ColorPickerHost />

            {/* Recolor chrome renders always so the page reads as the full editor;
               when no bin is loaded it's dimmed + non-interactive (the canvas below
               shows the drop card). */}
            <div style={model ? undefined : { opacity: 0.4, pointerEvents: 'none', userSelect: 'none' }} aria-disabled={!model}>
            {(<>
            {/* Mode lives on the right of the Palette Manager row, but that row
               unmounts in shift / shift-hue modes — surface Mode here too so the
               user is never trapped in those modes. */}
            {(mode === 'shift' || mode === 'shift-hue') && (
                <Box sx={{
                    display: 'flex', justifyContent: 'flex-end', padding: '6px 16px',
                    background: isMinecraftStyle ? '#353535' : 'var(--bg-secondary)',
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)', flexShrink: 0,
                }}>
                    <ModeSelect value={mode} onChange={(v) => setMode(v as typeof mode)} />
                </Box>
            )}
            {mode === 'shift-hue' && (
                <ShiftHueControl value={hueTarget} onCommit={setHueTarget} onStatus={setStatusMessage} />
            )}
            {mode === 'shift' && (
                <HslShiftControls values={hslValues} onCommit={setHslValues} onStatus={setStatusMessage} />
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
                rightSlot={<ModeSelect value={mode} onChange={(v) => setMode(v as typeof mode)} />}
            />

            {/* Sub-Toolbar Row 1: BM & Color Targets — collapses via the toggle in
               the search row. Hidden entirely in materials mode. The wrapper
               animates grid-template-rows 0fr→1fr for the slide-down. */}
            {mode !== 'materials' && (
                <Box className="paint2-subtoolbar-main" sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', gap: 2,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)',
                    background: isMinecraftStyle ? '#353535' : 'var(--bg-secondary)', flexShrink: 0,
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ ...controlLabelStyle, opacity: 0.6 }}>BM:</Typography>
                            <Select
                                value={blendModeSelect}
                                onChange={(e: SelectChangeEvent<number>) => setBlendModeSelect(Number(e.target.value))}
                                size="small"
                                className="paint2-bm-select"
                                sx={{ ...ddTriggerSx, minWidth: '60px' }}
                                MenuProps={{ PaperProps: { sx: ddMenuPaperSx } }}
                            >
                                {[0, 1, 2, 3, 4].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                            </Select>
                        </Box>

                        <button onClick={handleSelectByBlendMode} className="dl-btn dl-btn--primary dl-btn--sm">
                            Select BM {blendModeSelect}
                        </button>

                        <BlendModeChanceSlider value={blendModeChance} onCommit={setBlendModeChance} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetLC} onChange={e => setTargetLC(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '2px' }} /> LC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetOC} onChange={e => setTargetOC(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '2px' }} /> OC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBC} onChange={e => setTargetBC(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '2px' }} /> BC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBaseColor} onChange={e => setTargetBaseColor(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '2px' }} /> Color
                        </Box>

                    </Box>
                </Box>
            )}

            {/* Materials Mode Info Bar */}
            {mode === 'materials' && (
                <Box className="paint2-materials-info" sx={{
                    display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 2,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid color-mix(in oklab, var(--accent-primary) 20%, var(--border))',
                    background: isMinecraftStyle ? '#353535' : 'color-mix(in oklab, var(--accent-primary) 8%, var(--bg-secondary))', flexShrink: 0,
                }}>
                    <PaletteIcon sx={{ color: 'var(--accent-primary)', fontSize: 18 }} />
                    <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                        Materials Only Mode / VFX systems hidden
                    </Typography>
                </Box>
            )}

            {/* Color Filter Controls */}
            {colorFilterEnabled && (
                <Box className="paint2-color-filter" sx={{
                    display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 1.5,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)',
                    background: isMinecraftStyle ? '#353535' : 'var(--bg-tertiary)', flexShrink: 0,
                }}>
                    <Typography sx={{ ...controlLabelStyle, minWidth: '80px' }}>Filter ({targetColors.length}):</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: 1, alignItems: 'center' }}>
                        {targetColors.map((color, index) => {
                            const isDelete = deleteTargetIndex === index;
                            return (
                                <Box
                                    key={index}
                                    sx={{
                                        width: '24px', height: '24px',
                                        // Swatch shows the user's actual target color; flips to a danger tint when marked for delete.
                                        backgroundColor: isDelete ? 'var(--color-danger)' : `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
                                        border: `1px solid ${isDelete ? 'color-mix(in oklab, var(--color-danger) 60%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)',
                                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)', '&:hover': { border: '1px solid var(--accent-primary)' },
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (deleteTargetIndex === index) {
                                            setTargetColors(targetColors.filter((_, i) => i !== index));
                                            setDeleteTargetIndex(null);
                                            return;
                                        }
                                        setDeleteTargetIndex(index);
                                    }}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDeleteTargetIndex(null);
                                        const startA = color[3] ?? 1;
                                        const ch = new ColorHandler([color[0], color[1], color[2], startA]);
                                        // Keep the latest picked RGB + alpha so either control updates the same slot.
                                        let curRGB: [number, number, number] = [color[0], color[1], color[2]];
                                        let curA = startA;
                                        const applyTarget = () => {
                                            const newColors = [...targetColors];
                                            newColors[index] = [curRGB[0], curRGB[1], curRGB[2], curA];
                                            setTargetColors(newColors);
                                        };
                                        openColorPicker(e, ch.ToHEX(), (hex) => {
                                            const h = new ColorHandler();
                                            h.InputHex(hex);
                                            curRGB = [h.vec4[0], h.vec4[1], h.vec4[2]];
                                            applyTarget();
                                        }, { alpha: startA, onAlpha: (a) => { curA = a; applyTarget(); } });
                                    }}
                                    title={isDelete ? 'Click again to delete' : `${getColorDescription(color)} - Click to select for deletion, Double-click to edit`}
                                >
                                    {isDelete ? '-' : ''}
                                </Box>
                            );
                        })}
                        <Box
                            sx={{
                                width: '24px', height: '24px', border: '2px dashed var(--accent-primary)', borderRadius: 'var(--radius-sm)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '14px', fontWeight: 'bold',
                                '&:hover': { border: '2px solid var(--accent-primary)', backgroundColor: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' },
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetIndex(null);
                                openColorPicker(e, '#808080', (hex) => {
                                    const h = new ColorHandler();
                                    h.InputHex(hex);
                                    setTargetColors(prev => [...prev, [h.vec4[0], h.vec4[1], h.vec4[2], 1]]);
                                });
                            }}
                            title="Add target color"
                        >
                            +
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: '200px' }}>
                        <Typography sx={{ ...controlLabelStyle, minWidth: '60px', fontSize: '0.7rem' }}>Tol: {colorTolerance}</Typography>
                        <Slider value={colorTolerance} onChange={(_, v) => setColorTolerance(Array.isArray(v) ? v[0] : v)} min={0} max={100} size="small" sx={{ flex: 1 }} />
                    </Box>
                </Box>
            )}

            {/* Sub-Toolbar Row 2: Search */}
            <Box className="paint2-subtoolbar-search" sx={{
                display: 'flex', alignItems: 'center', padding: '4px 16px', gap: 1.5,
                borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)',
                background: isMinecraftStyle ? '#353535' : 'var(--bg-primary)', flexShrink: 0,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        size="small"
                        indeterminate={isIndeterminate}
                        checked={allSelected}
                        onChange={() => { if (allSelected || isIndeterminate) selectNone(); else selectAllVisible(); }}
                        sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, '&.MuiCheckbox-indeterminate': { color: 'var(--accent-primary)' }, padding: '2px' }}
                    />
                </Box>

                <TextField
                    className="paint2-search-field"
                    size="small"
                    placeholder="Filter systems..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    variant="standard"
                    InputProps={{ disableUnderline: true, sx: { fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0 8px', flex: 1 } }}
                    sx={{ flex: 1 }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, gap: 1 }}>
                    <Select
                        value={variantFilter}
                        onChange={(e: SelectChangeEvent) => setVariantFilter(e.target.value as 'all' | 'v1' | 'v2')}
                        size="small"
                        variant="outlined"
                        className="paint2-variant-select"
                        sx={{ ...ddTriggerSx, minWidth: '100px', fontSize: '0.75rem', color: variantFilter === 'all' ? 'var(--text-secondary)' : 'var(--accent-primary)' }}
                        MenuProps={{ PaperProps: { sx: ddMenuPaperSx } }}
                    >
                        <MenuItem value="all">All Vars</MenuItem>
                        <MenuItem value="v1">Variant 1</MenuItem>
                        <MenuItem value="v2">Variant 2</MenuItem>
                    </Select>
                </Box>

                <IconButton size="small" onClick={toggleLockAll} sx={{ color: 'var(--text-secondary)', opacity: 0.6, mr: 0.5 }}>
                    {lockedSystems.size > 0 ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>

                <IconButton size="small" onClick={(e) => setFilterAnchor(e.currentTarget)} sx={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    <TuneIcon fontSize="small" />
                </IconButton>

                <Menu
                    anchorEl={filterAnchor}
                    open={Boolean(filterAnchor)}
                    onClose={() => setFilterAnchor(null)}
                    PaperProps={{ className: 'paint2-filter-menu', sx: {
                        minWidth: '200px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)', boxShadow: 'var(--dl-shadow-md)',
                        '& .MuiMenuItem-root': { fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-secondary)', '&:hover': { background: 'var(--bg-hover)', color: 'var(--text-primary)' } },
                    } }}
                >
                    <Box className="paint2-filter-section-title" sx={{ px: 2, py: 1, borderBottom: '1px solid var(--border)', mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700, opacity: 0.6 }}>SETTINGS</Typography>
                    </Box>
                    <MenuItem onClick={() => { const next = !autoExpand; setAutoExpandWithRef(next); applyAutoExpand(next); }}>
                        <Checkbox size="small" checked={autoExpand} sx={{ color: 'var(--text-muted)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent-primary)' } }} />
                        Auto-expand on load
                    </MenuItem>
                    <MenuItem onClick={() => setIgnoreBlackWhite(!ignoreBlackWhite)}>
                        <Checkbox size="small" checked={ignoreBlackWhite} sx={{ color: 'var(--text-muted)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent-primary)' } }} />
                        Ignore B/W
                    </MenuItem>
                    <MenuItem onClick={() => setColorFilterEnabled(!colorFilterEnabled)}>
                        <Checkbox size="small" checked={colorFilterEnabled} sx={{ color: 'var(--text-muted)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent-primary)' } }} />
                        Color Filter
                    </MenuItem>
                    <Box className="paint2-filter-section-title" sx={{ px: 2, py: 1, mt: 1, borderTop: '1px solid var(--border)' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>VIEW</Typography>
                    </Box>
                    <MenuItem onClick={() => {
                        if (model) { setExpandedSystems(new Set(model.systemOrder)); setExpandedMaterials(new Set(model.materialOrder || [])); }
                        setFilterAnchor(null);
                    }}>
                        Expand All
                    </MenuItem>
                    <MenuItem onClick={() => { setExpandedSystems(new Set()); setExpandedMaterials(new Set()); setFilterAnchor(null); }}>
                        Collapse All
                    </MenuItem>
                </Menu>
            </Box>
            </>)}
            </div>

            {/* Main List */}
            <Box className="paint2-main-list-wrap" sx={{ flex: 1, overflow: 'hidden' }}>
                {model ? (
                    <SystemList
                        model={model}
                        selection={selection}
                        lockedSystems={lockedSystems}
                        expandedSystems={expandedSystems}
                        expandedMaterials={expandedMaterials}
                        searchQuery={searchQuery}
                        variantFilter={variantFilter}
                        viewMode={mode}
                        showBirthColor
                        showOC
                        showLingerColor
                        showBaseColor
                        onToggleEmitter={toggleEmitterSelection}
                        onToggleSystem={selectSystem}
                        onSetBlendMode={handleSingleBlendModeChange}
                        onToggleLock={toggleSystemLock}
                        onToggleExpand={toggleSystemExpand}
                        onToggleMaterialExpand={toggleMaterialExpand}
                        onToggleMaterialParam={toggleMaterialParam}
                        onMaterialParamValueChange={handleMaterialParamValueChange}
                        onTextureHover={handleTextureHover}
                        onTextureLeave={handleTextureLeave}
                        onTextureClick={handleTextureClick}
                        onColorClick={importColorsToPalette}
                        onColorAlpha={handleColorAlpha}
                    />
                ) : (
                    /* Empty state: the drop zone is centered in the available space
                       (the always-on toolbar sits above), with the recent-bins list
                       anchored below it. */
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', padding: 4, overflow: 'hidden', minHeight: 0 }}>
                        <Box
                            onClick={handleFileOpen}
                            sx={{
                                width: 'min(560px, 90%)',
                                flexShrink: 0,
                                margin: 'auto 0',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2.5,
                                padding: '44px 40px',
                                borderRadius: 'var(--radius-lg)',
                                background: isDragOver ? 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' : 'transparent',
                                cursor: 'pointer', transition: 'all var(--motion-base)',
                            }}
                        >
                            <FolderOpenIcon size={40} color="var(--accent-primary)" strokeWidth={1.5} />
                            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                Drag a <b style={{ color: 'var(--text-primary)' }}>.bin</b> here
                            </Typography>
                            <button onClick={(e) => { e.stopPropagation(); handleFileOpen(); }} disabled={isLoading} className="dl-btn dl-btn--primary">
                                <span className="dl-icon"><FolderOpenIcon size={14} /></span>
                                <span>Open Bin</span>
                            </button>
                        </Box>

                        {recentBins.length > 0 && (
                            <div className="paint2-recent">
                                <div className="paint2-recent__title">
                                    <span>Recent Bins</span>
                                </div>
                                <div className="paint2-recent__list">
                                    {recentBins.map((bin) => (
                                        <div
                                            key={bin.path}
                                            className="paint2-recent__item"
                                            onClick={() => loadBinFile(bin.path)}
                                            title={bin.path}
                                        >
                                            <div className="paint2-recent__info">
                                                <FolderOpenIcon size={15} className="paint2-recent__icon" />
                                                <span className="paint2-recent__name">{bin.name}</span>
                                            </div>
                                            <div className="paint2-recent__actions">
                                                <span className="paint2-recent__date">{relativeTime(bin.lastOpened)}</span>
                                                <button
                                                    className="paint2-recent__delete"
                                                    title="Remove from recent"
                                                    onClick={(e) => { e.stopPropagation(); removeRecentBin(bin.path); }}
                                                >
                                                    <CloseIcon size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Box>
                )}
            </Box>

            {/* Footer — bottom action bar, always shown so the page reads as the
               full editor. Its buttons already self-disable when there's nothing
               to act on (empty selection / unsaved), and Open Bin stays usable. */}
            <Box className="paint2-footer" sx={{
                height: '48px', padding: '0 16px', boxSizing: 'border-box',
                background: isMinecraftStyle ? '#2f2f2f' : 'var(--bg-primary)',
                borderTop: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
            }}>
                {/* Left: open a different bin — hidden when no bin is loaded (the empty
                    state shows the main Open Bin button instead). */}
                {model && (
                    <button onClick={handleFileOpen} disabled={isLoading} className="dl-btn dl-btn--primary dl-btn--sm dl-btn--icon" title="Open Bin">
                        <span className="dl-icon"><FolderOpenIcon size={15} /></span>
                    </button>
                )}

                {/* Compact status readout */}
                {statusMessage && (
                    <Typography sx={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto', minWidth: 0,
                    }}>
                        {statusMessage}
                    </Typography>
                )}

                {/* Right: edit actions */}
                <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                    <button onClick={handleUndo} disabled={!canUndo} className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon" title="Undo (Ctrl+Z)">
                        <span className="dl-icon"><UndoIcon size={15} /></span>
                    </button>
                    <button onClick={handleRedo} disabled={!canRedo} className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon" title="Redo (Ctrl+Alt+Z)">
                        <span className="dl-icon"><RedoIcon size={15} /></span>
                    </button>
                    <button onClick={handleRecolor} disabled={selection.size === 0} className="dl-btn dl-btn--primary dl-btn--sm paint2-recolor-btn">
                        Recolor Selected ({visibleSelectionCount})
                    </button>
                    <button onClick={() => void handleSave()} disabled={isLoading || fileSaved} className="dl-btn dl-btn--sm paint2-save-btn">
                        Save Bin
                    </button>
                </Box>
            </Box>

            {/* Save Palette Dialog */}
            <Dialog
                open={paletteNameDialogOpen}
                onClose={() => setPaletteNameDialogOpen(false)}
                PaperProps={{ sx: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', minWidth: '320px' } }}
            >
                <DialogTitle sx={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>Save Palette</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus fullWidth size="small" label="Palette Name"
                        value={newPaletteName}
                        onChange={(e) => setNewPaletteName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && confirmSavePalette()}
                        sx={{
                            mt: 1,
                            '& .MuiOutlinedInput-root': { color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', '& fieldset': { borderColor: 'var(--border)' }, '&:hover fieldset': { borderColor: 'var(--accent-primary)' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' } },
                            '& .MuiInputLabel-root': { color: 'var(--text-muted)' }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--accent-primary)' },
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setPaletteNameDialogOpen(false)} sx={{ color: 'var(--text-muted)', textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={confirmSavePalette} variant="contained" sx={{ background: 'var(--accent-primary)', color: 'var(--text-primary)', fontWeight: 700, textTransform: 'none', '&:hover': { background: 'var(--accent-hover)' } }}>Save Palette</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                PaperProps={{ sx: { background: 'var(--bg-secondary)', border: '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--border))', minWidth: '300px' } }}
            >
                <DialogTitle sx={{ color: 'var(--color-danger)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>Delete Palette?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Are you sure you want to delete "{paletteToDelete !== null && savedPalettesList[paletteToDelete]?.name}"? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: 'var(--text-muted)', textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={confirmDeletePalette} variant="contained" sx={{ background: 'var(--color-danger)', color: '#fff', fontWeight: 700, textTransform: 'none', '&:hover': { background: 'color-mix(in oklab, var(--color-danger) 85%, black)' } }}>Delete</Button>
                </DialogActions>
            </Dialog>

            <AlphaEditorModal
                open={alphaTarget !== null}
                title={alphaTarget?.title ?? ''}
                keyframes={alphaTarget?.keyframes ?? []}
                onApply={handleApplyAlpha}
                onClose={() => setAlphaTarget(null)}
            />
        </Box>
    );
}

export { Paint };
export default Paint;
