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
import { open } from '@tauri-apps/plugin-dialog';
import {
    paintOpen, paintClose, paintRecolor, paintSetBlendMode, paintSetMaterialParam, paintUndo, paintSave,
    type VfxModel, type VfxEmitter, type ColorTargetId,
    type RecolorModeId, type PaletteStopInput, type RecolorOptionsInput,
} from '@/lib/api';
import { useNotificationStore } from '@/lib/stores';

import './paint/Paint.css';
import ColorHandler from './paint/utils/ColorHandler';
import { savePalette, loadAllPalettes, deletePalette } from './paint/utils/paletteManager';
import { getColorDescription } from './paint/utils/colorFilter';

import Toolbar from './paint/components/Toolbar';
import SystemList from './paint/components/SystemList';
import PaletteManager, { type SavedPaletteItem } from './paint/components/PaletteManager';
import { ColorPickerHost, openColorPicker, cleanupColorPickers } from './paint/components/ColorPicker';
import {
    cancelTextureHoverClose, removeTextureHoverPreview, scheduleTextureHoverClose, showTextureHoverPreview,
} from './paint/components/textureHoverPreview';
import { useMinecraftStyle } from './paint/useMinecraftStyle';

const controlLabelStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    color: 'var(--accent-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
} as const;

/* ── Hue / HSL / blend-chance sub-controls (committed sliders) ──────────── */

function ShiftHueControl({ value, onCommit, onStatus }: { value: number; onCommit: (v: number) => void; onStatus: (s: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    return (
        <Box sx={{ padding: '8px 40px', background: 'var(--glass-bg, rgba(18, 18, 24, 0.55))', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.1))', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography sx={{ ...controlLabelStyle, width: 80 }}>Target: {draft}°</Typography>
                <Slider
                    value={draft}
                    onChange={(_, v) => setDraft(Array.isArray(v) ? v[0] : v)}
                    onChangeCommitted={(_, v) => { const next = Array.isArray(v) ? v[0] : v; setDraft(next); onCommit(next); onStatus(`Hue Target Ready: ${next}° (Press Recolor to apply)`); }}
                    min={0} max={360} size="small"
                    sx={{
                        '& .MuiSlider-track': { background: 'transparent', border: 'none' },
                        '& .MuiSlider-rail': { height: '5px', opacity: 1, background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' },
                        '& .MuiSlider-thumb': { width: 14, height: 14, background: 'var(--accent)', border: '2px solid rgba(255,255,255,0.75)', boxShadow: '0 2px 10px rgba(0,0,0,0.35)', transition: 'all 0.16s ease', '&:hover': { boxShadow: '0 0 0 6px color-mix(in srgb, var(--accent), transparent 84%)' }, '&.Mui-active': { boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent), transparent 80%)' } },
                    }}
                />
            </Box>
        </Box>
    );
}

interface HslValues { h: number; s: number; l: number }
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
        <Box sx={{ padding: '8px 40px', background: 'var(--glass-bg, rgba(18, 18, 24, 0.55))', borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.1))', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                sx={{ width: 80, color: 'var(--accent)' }}
            />
            <Typography sx={{ ...controlLabelStyle, opacity: 0.5, minWidth: '35px' }}>{draft}%</Typography>
        </Box>
    );
}

/* ── page ───────────────────────────────────────────────────────────────── */

function Paint() {
    const notify = useNotificationStore((s) => s.push);
    const isMinecraftStyle = useMinecraftStyle();

    // === FILE STATE ===
    const [filePath, setFilePath] = useState('');
    const [, setFileName] = useState('');
    const [fileSaved, setFileSaved] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Ready');

    // === RESIDENT MODEL ===
    const [model, setModel] = useState<VfxModel | null>(null);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [canUndo, setCanUndo] = useState(false);
    const [paletteNameDialogOpen, setPaletteNameDialogOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [paletteToDelete, setPaletteToDelete] = useState<number | null>(null);
    const [newPaletteName, setNewPaletteName] = useState('');

    // === SELECTION ===
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [lockedSystems, setLockedSystems] = useState<Set<string>>(new Set());

    // === SEARCH/FILTER ===
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
    const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
    const [autoExpand, setAutoExpand] = useState(true);
    const autoExpandRef = useRef(true);
    const setAutoExpandWithRef = (val: boolean) => { setAutoExpand(val); autoExpandRef.current = val; };
    const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);
    const [variantFilter, setVariantFilter] = useState<'all' | 'v1' | 'v2'>('all');
    const [searchByTexture, setSearchByTexture] = useState(false);

    // === MODE & VALUES ===
    const [mode, setMode] = useState<RecolorModeId>('random');

    const [palette, setPalette] = useState<ColorHandler[]>(() => {
        const def = new ColorHandler();
        def.InputHex('#ecb96a');
        def.time = 0;
        return [def];
    });
    const [colorCount, setColorCount] = useState(1);
    const [savedPalettesList, setSavedPalettesList] = useState<SavedPaletteItem[]>([]);
    const [ignoreBlackWhite, setIgnoreBlackWhite] = useState(true);
    const [hslValues, setHslValues] = useState<HslValues>({ h: 0, s: 0, l: 0 });
    const [hueTarget, setHueTarget] = useState(60);

    // === COLOR FILTER STATE ===
    const [colorFilterEnabled, setColorFilterEnabled] = useState(false);
    const [targetColors, setTargetColors] = useState<number[][]>([]);
    const [colorTolerance, setColorTolerance] = useState(30);
    const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);

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

    const sessionRef = useRef<number | null>(null);

    const loadBinFile = useCallback(async (selectedPath: string) => {
        if (!selectedPath) return;
        setIsLoading(true);
        setStatusMessage('Loading...');
        try {
            const baseName = (selectedPath.split(/[\\/]/).pop() || selectedPath).replace(/\.(bin|py)$/i, '');
            setStatusMessage('Opening bin...');

            // Free the previous resident tree before opening a new one.
            if (sessionRef.current !== null) {
                const prev = sessionRef.current;
                sessionRef.current = null;
                void paintClose(prev).catch(() => undefined);
            }

            const { sessionId: newSession, model: newModel } = await paintOpen(selectedPath);
            sessionRef.current = newSession;
            setSessionId(newSession);
            setModel(newModel);

            setFilePath(selectedPath);
            setFileName(baseName);
            setFileSaved(true);
            setSelection(new Set());
            setCanUndo(false);

            if (autoExpandRef.current) {
                setExpandedSystems(new Set(newModel.systemOrder));
                setExpandedMaterials(new Set(newModel.materialOrder || []));
            } else {
                setExpandedSystems(new Set());
                setExpandedMaterials(new Set());
            }

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
            const selected = await open({ multiple: false, filters: [{ name: 'Bin Files', extensions: ['bin', 'py'] }] });
            if (selected && typeof selected === 'string') {
                await loadBinFile(selected);
            }
        } catch (error) {
            setStatusMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [loadBinFile]);

    const handleSave = useCallback(async () => {
        if (sessionId === null) return;
        setIsLoading(true);
        setStatusMessage('Saving...');
        try {
            const savedPath = await paintSave(sessionId);
            setFileSaved(true);
            setStatusMessage('Saved successfully');
            notify('success', `Saved ${savedPath.split(/[\\/]/).pop()}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Save error: ${msg}`);
            notify('error', `Save failed: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, notify]);

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
                        (searchByTexture && emitter.textures.some(t => t.path.toLowerCase().includes(searchLower)));
                    if (!emitterMatches) continue;
                }
            }
            count++;
        }
        return count;
    }, [model, emitterMap, systemMap, selection, searchQuery, variantFilter, searchByTexture]);

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
                            (searchByTexture && emitter.textures.some(t => t.path.toLowerCase().includes(searchLower)));
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
        };

        try {
            let changed = 0;
            let nextModel = model;

            if (emitterKeys.length > 0) {
                const result = await paintRecolor(sessionId, emitterKeys, colorTargets, paletteData, options);
                changed += result.changed;
                nextModel = result.model;
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
            setFileSaved(false);
            setStatusMessage(`Recolored ${changed} properties`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setStatusMessage(`Recolor error: ${msg}`);
            notify('error', `Recolor failed: ${msg}`);
        }
    }, [model, sessionId, emitterMap, systemMap, selection, palette, mode, ignoreBlackWhite, hslValues, hueTarget, searchQuery, variantFilter, searchByTexture, targetBaseColor, targetBC, targetOC, targetLC, computeMaterialColor, notify]);

    const handleUndo = useCallback(async () => {
        if (sessionId === null) return;
        try {
            const restored = await paintUndo(sessionId);
            if (restored) {
                setModel(restored);
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

    // Free the resident tree when leaving the page.
    useEffect(() => () => {
        if (sessionRef.current !== null) {
            void paintClose(sessionRef.current).catch(() => undefined);
            sessionRef.current = null;
        }
    }, []);

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

    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTextureHover = useCallback((event: React.MouseEvent, emitter: VfxEmitter) => {
        const buttonElement = event.currentTarget as HTMLElement;
        if (!buttonElement) return;
        cancelTextureHoverClose();
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            const textures = (emitter.textures || []).map(t => ({ label: t.label, path: t.path }));
            void showTextureHoverPreview(textures, [], buttonElement, filePath);
        }, 200);
    }, [filePath]);

    const handleTextureLeave = useCallback(() => {
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        scheduleTextureHoverClose(500);
    }, []);

    const handleTextureClick = useCallback(() => {
        removeTextureHoverPreview();
    }, []);

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
                background: isMinecraftStyle ? '#2a2a2a' : 'var(--bg)',
                color: 'var(--accent)',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <ColorPickerHost />

            <Toolbar filePath={filePath} isLoading={isLoading} onFileOpen={handleFileOpen} mode={mode} onModeChange={setMode} />

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
            />

            {/* Sub-Toolbar Row 1: BM & Color Targets (hidden in materials mode) */}
            {mode !== 'materials' && (
                <Box className="paint2-subtoolbar-main" sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px', gap: 2,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid rgba(255,255,255,0.03)',
                    background: isMinecraftStyle ? '#353535' : 'var(--surface)', flexShrink: 0,
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ ...controlLabelStyle, opacity: 0.6 }}>BM:</Typography>
                            <Select
                                value={blendModeSelect}
                                onChange={(e: SelectChangeEvent<number>) => setBlendModeSelect(Number(e.target.value))}
                                size="small"
                                className="paint2-bm-select"
                                sx={{
                                    fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', color: 'var(--text)', height: '26px', minWidth: '60px', borderRadius: '8px',
                                    background: 'rgba(18, 20, 28, 0.55)', border: '1px solid rgba(255, 255, 255, 0.24)', transition: 'all 160ms ease',
                                    '& .MuiSelect-select': { padding: '3px 10px', paddingRight: '28px !important' },
                                    '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.78)', fontSize: '1rem' },
                                    '&:hover': { background: 'rgba(34, 38, 52, 0.62)', borderColor: 'rgba(255,255,255,0.52)', boxShadow: '0 8px 18px rgba(0,0,0,0.28)' },
                                    '&.Mui-focused': { borderColor: 'color-mix(in srgb, var(--accent2), transparent 35%)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent2), transparent 75%)' },
                                    '& fieldset': { border: 'none' }, '&:hover fieldset': { border: 'none' }, '&.Mui-focused fieldset': { border: 'none' },
                                }}
                            >
                                {[0, 1, 2, 3, 4].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                            </Select>
                        </Box>

                        <Button
                            size="small"
                            onClick={handleSelectByBlendMode}
                            sx={{
                                background: 'color-mix(in srgb, var(--accent), transparent 95%)', border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                                color: 'var(--accent)', borderRadius: '4px', textTransform: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem',
                                padding: '1px 10px', minWidth: 'auto', height: '26px',
                                '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent)' },
                            }}
                        >
                            Select BM{blendModeSelect}
                        </Button>

                        <BlendModeChanceSlider value={blendModeChance} onCommit={setBlendModeChance} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetLC} onChange={e => setTargetLC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} /> LC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetOC} onChange={e => setTargetOC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} /> OC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBC} onChange={e => setTargetBC(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} /> BC
                        </Box>
                        <Box sx={{ ...controlLabelStyle }}>
                            <Checkbox size="small" checked={targetBaseColor} onChange={e => setTargetBaseColor(e.target.checked)} sx={{ color: 'var(--accent-muted)', padding: '2px' }} /> Color
                        </Box>
                    </Box>
                </Box>
            )}

            {/* Materials Mode Info Bar */}
            {mode === 'materials' && (
                <Box className="paint2-materials-info" sx={{
                    display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 2,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid color-mix(in srgb, var(--accent), transparent 85%)',
                    background: isMinecraftStyle ? '#353535' : 'linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 92%), transparent)', flexShrink: 0,
                }}>
                    <PaletteIcon sx={{ color: 'var(--accent)', fontSize: 18 }} />
                    <Typography sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 500 }}>
                        Materials Only Mode — VFX systems hidden
                    </Typography>
                </Box>
            )}

            {/* Color Filter Controls */}
            {colorFilterEnabled && (
                <Box className="paint2-color-filter" sx={{
                    display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 1.5,
                    borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid rgba(255,255,255,0.05)',
                    background: isMinecraftStyle ? '#353535' : 'color-mix(in srgb, var(--surface-2), black 10%)', flexShrink: 0,
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
                                        backgroundColor: isDelete ? '#ff4444' : `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
                                        border: `1px solid ${isDelete ? '#ff6666' : '#333'}`, borderRadius: '4px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'white',
                                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)', '&:hover': { border: '1px solid var(--accent)' },
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
                                        const ch = new ColorHandler([color[0], color[1], color[2], 1]);
                                        openColorPicker(e, ch.ToHEX(), (hex) => {
                                            const h = new ColorHandler();
                                            h.InputHex(hex);
                                            const newColors = [...targetColors];
                                            newColors[index] = [h.vec4[0], h.vec4[1], h.vec4[2], 1];
                                            setTargetColors(newColors);
                                        });
                                    }}
                                    title={isDelete ? 'Click again to delete' : `${getColorDescription(color)} - Click to select for deletion, Double-click to edit`}
                                >
                                    {isDelete ? '-' : ''}
                                </Box>
                            );
                        })}
                        <Box
                            sx={{
                                width: '24px', height: '24px', border: '2px dashed var(--accent)', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)', fontSize: '14px', fontWeight: 'bold',
                                '&:hover': { border: '2px solid var(--accent)', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
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
                borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid rgba(255,255,255,0.05)',
                background: isMinecraftStyle ? '#353535' : 'color-mix(in srgb, var(--bg), black 15%)', flexShrink: 0,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        size="small"
                        indeterminate={isIndeterminate}
                        checked={allSelected}
                        onChange={() => { if (allSelected || isIndeterminate) selectNone(); else selectAllVisible(); }}
                        sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '2px' }}
                    />
                </Box>

                <TextField
                    className="paint2-search-field"
                    size="small"
                    placeholder="Filter systems..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    variant="standard"
                    InputProps={{ disableUnderline: true, sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: 'var(--text-2)', opacity: 0.8, padding: '0 8px', flex: 1 } }}
                    sx={{ flex: 1 }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1, gap: 1 }}>
                    <Select
                        value={variantFilter}
                        onChange={(e: SelectChangeEvent) => setVariantFilter(e.target.value as 'all' | 'v1' | 'v2')}
                        size="small"
                        variant="outlined"
                        className="paint2-variant-select"
                        sx={{
                            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem',
                            color: variantFilter === 'all' ? 'rgba(255,255,255,0.4)' : 'var(--accent)', minWidth: '85px',
                            '& .MuiSelect-select': { py: 0, display: 'flex', alignItems: 'center' },
                            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.2)', fontSize: '1rem' },
                        }}
                    >
                        <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Vars</MenuItem>
                        <MenuItem value="v1" sx={{ fontSize: '0.75rem' }}>Variant 1</MenuItem>
                        <MenuItem value="v2" sx={{ fontSize: '0.75rem' }}>Variant 2</MenuItem>
                    </Select>
                </Box>

                <IconButton size="small" onClick={toggleLockAll} sx={{ color: 'var(--text-2)', opacity: 0.6, mr: 0.5 }}>
                    {lockedSystems.size > 0 ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </IconButton>

                <IconButton size="small" onClick={(e) => setFilterAnchor(e.currentTarget)} sx={{ color: 'var(--text-2)', opacity: 0.6 }}>
                    <TuneIcon fontSize="small" />
                </IconButton>

                <Menu
                    anchorEl={filterAnchor}
                    open={Boolean(filterAnchor)}
                    onClose={() => setFilterAnchor(null)}
                    PaperProps={{ className: 'paint2-filter-menu', sx: { minWidth: '200px' } }}
                >
                    <Box className="paint2-filter-section-title" sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, opacity: 0.6 }}>SETTINGS</Typography>
                    </Box>
                    <MenuItem onClick={() => { const next = !autoExpand; setAutoExpandWithRef(next); applyAutoExpand(next); }}>
                        <Checkbox size="small" checked={autoExpand} sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }} />
                        Auto-expand on load
                    </MenuItem>
                    <MenuItem onClick={() => setIgnoreBlackWhite(!ignoreBlackWhite)}>
                        <Checkbox size="small" checked={ignoreBlackWhite} sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }} />
                        Ignore B/W
                    </MenuItem>
                    <MenuItem onClick={() => setColorFilterEnabled(!colorFilterEnabled)}>
                        <Checkbox size="small" checked={colorFilterEnabled} sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }} />
                        Color Filter
                    </MenuItem>
                    <MenuItem onClick={() => setSearchByTexture(!searchByTexture)}>
                        <Checkbox size="small" checked={searchByTexture} sx={{ color: 'var(--accent)', p: 0, mr: 1, '&.Mui-checked': { color: 'var(--accent)' } }} />
                        Search Textures
                    </MenuItem>
                    <Box className="paint2-filter-section-title" sx={{ px: 2, py: 1, mt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-2)', opacity: 0.4 }}>VIEW</Typography>
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
                        searchByTexture={searchByTexture}
                        variantFilter={variantFilter}
                        viewMode={mode}
                        showBirthColor
                        showOC
                        showLingerColor
                        showBaseColor
                        onToggleEmitter={toggleEmitterSelection}
                        onToggleSystem={selectSystem}
                        onSetBlendMode={handleSingleBlendModeChange}
                        onToggleLock={(k) => setLockedSystems(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; })}
                        onToggleExpand={(k) => setExpandedSystems(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; })}
                        onToggleMaterialExpand={toggleMaterialExpand}
                        onToggleMaterialParam={toggleMaterialParam}
                        onMaterialParamValueChange={handleMaterialParamValueChange}
                        onTextureHover={handleTextureHover}
                        onTextureLeave={handleTextureLeave}
                        onTextureClick={handleTextureClick}
                        onColorClick={importColorsToPalette}
                    />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                        <Typography variant="h6">Open a .bin file to start</Typography>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box className="paint2-footer" sx={{
                padding: '12px 24px', background: isMinecraftStyle ? '#2f2f2f' : 'var(--bg)',
                borderTop: isMinecraftStyle ? '1px solid #000000' : '1px solid rgba(255,255,255,0.05)',
                display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0,
            }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--accent-muted)', opacity: 0.8 }}>{statusMessage}</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <button onClick={handleUndo} disabled={!canUndo} className="paint2-footer-btn is-undo">
                        Undo
                    </button>
                    <button onClick={handleRecolor} disabled={selection.size === 0} className="paint2-footer-btn is-recolor">
                        Recolor Selected ({visibleSelectionCount})
                    </button>
                    <button onClick={handleSave} disabled={isLoading || fileSaved} className="paint2-footer-btn is-save">
                        Save Bin
                    </button>
                </Box>
            </Box>

            {/* Save Palette Dialog */}
            <Dialog
                open={paletteNameDialogOpen}
                onClose={() => setPaletteNameDialogOpen(false)}
                PaperProps={{ sx: { background: 'var(--surface-2)', border: '1px solid color-mix(in srgb, var(--accent), transparent 80%)', minWidth: '320px' } }}
            >
                <DialogTitle sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem' }}>Save Palette</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus fullWidth size="small" label="Palette Name"
                        value={newPaletteName}
                        onChange={(e) => setNewPaletteName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && confirmSavePalette()}
                        sx={{
                            mt: 1,
                            '& .MuiOutlinedInput-root': { color: 'white', fontFamily: 'JetBrains Mono, monospace', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: 'var(--accent)' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent)' } },
                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }, '& .MuiInputLabel-root.Mui-focused': { color: 'var(--accent)' },
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setPaletteNameDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={confirmSavePalette} variant="contained" sx={{ background: 'var(--accent)', color: '#0b0a0f', fontWeight: 700, textTransform: 'none', '&:hover': { background: '#d4a35d' } }}>Save Palette</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                PaperProps={{ sx: { background: 'var(--surface-2)', border: '1px solid rgba(239, 68, 68, 0.2)', minWidth: '300px' } }}
            >
                <DialogTitle sx={{ color: '#ef4444', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem' }}>Delete Palette?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                        Are you sure you want to delete "{paletteToDelete !== null && savedPalettesList[paletteToDelete]?.name}"? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ padding: '16px 24px' }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={confirmDeletePalette} variant="contained" sx={{ background: '#ef4444', color: 'white', fontWeight: 700, textTransform: 'none', '&:hover': { background: '#dc2626' } }}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export { Paint };
export default Paint;
