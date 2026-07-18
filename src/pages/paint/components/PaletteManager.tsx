/*
 * PaletteManager Component
 * Palette strip + color-count slider + a full palette library modal
 * (save / load / delete / import / export).
 * Ported from the Electron Quartz paint2 PaletteManager. File IO is adapted to
 * the Tauri surface: import uses the dialog + readFileBase64, export downloads
 * a JSON blob, and persistence lives in localStorage via paletteManager.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Slider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useFileExplorer } from '@/components/explorer';
import { readFileBase64 } from '@/lib/api';
import ColorHandler from '../utils/ColorHandler';
import { savePalette, deletePalette } from '../utils/paletteManager';
import { openColorPicker } from './ColorPicker';
import { useMinecraftStyle } from '../useMinecraftStyle';
import type { RecolorModeId as RecolorMode } from '@/lib/api';

export interface SavedPaletteItem {
    name: string;
    palette: { rgba: number[]; time: number }[];
    filename: string;
}

interface ImportedColor {
    hex?: string;
    rgba?: number[];
    r?: number;
    g?: number;
    b?: number;
    a?: number;
    time?: number;
}

interface ImportedPalette {
    name?: string;
    mode?: string;
    colors?: ImportedColor[];
    palette?: ImportedColor[];
}

const parseImportedPalette = (raw: ImportedPalette) => {
    const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
    const mode = typeof raw?.mode === 'string' ? raw.mode : null;

    const sourceColors = Array.isArray(raw?.colors) ? raw.colors : (Array.isArray(raw?.palette) ? raw.palette : null);
    if (!sourceColors || sourceColors.length === 0) {
        throw new Error('No palette colors found in JSON');
    }

    const colors = sourceColors.map((item, idx) => {
        const ch = new ColorHandler();
        if (typeof item?.hex === 'string') {
            ch.InputHex(item.hex);
        } else if (Array.isArray(item?.rgba) && item.rgba.length >= 3) {
            ch.vec4 = [Number(item.rgba[0]) || 0, Number(item.rgba[1]) || 0, Number(item.rgba[2]) || 0, item.rgba.length > 3 ? (Number(item.rgba[3]) || 1) : 1];
        } else if (item && item.r !== undefined && item.g !== undefined && item.b !== undefined) {
            ch.vec4 = [Number(item.r) || 0, Number(item.g) || 0, Number(item.b) || 0, item.a !== undefined ? (Number(item.a) || 1) : 1];
        } else {
            throw new Error(`Invalid color at index ${idx}`);
        }
        ch.time = typeof item?.time === 'number' ? item.time : (sourceColors.length === 1 ? 0 : idx / (sourceColors.length - 1));
        return ch;
    });

    return { name, mode, colors };
};

/* ── shared styles ──────────────────────────────────────────────────────── */
const modalStyles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' },
    backdrop: { position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 60%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
    modal: { position: 'relative', width: '100%', maxWidth: 860, height: 720, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--dl-shadow-lg)', overflow: 'hidden' },
    accentBar: { height: 3, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%' },
    body: { padding: 20, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 0 },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-mono)' },
    closeBtn: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all var(--motion-fast)', outline: 'none' },
    section: { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, marginBottom: 12 },
    sectionTitle: { color: 'var(--accent-primary)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, marginBottom: 10, fontFamily: 'var(--font-mono)' },
    input: { width: '100%', boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none', transition: 'all var(--motion-fast)' },
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' },
};


interface PaletteCountSliderProps { value: number; onCommit: (v: number) => void }
const PaletteCountSlider = React.memo(function PaletteCountSlider({ value, onCommit }: PaletteCountSliderProps) {
    const [draft, setDraft] = useState(value);
    const frameRef = useRef(0);
    useEffect(() => { setDraft(value); }, [value]);
    useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);
    const scheduleCommit = (next: number) => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        // Rebuild the palette at most once per frame during a drag; the thumb
        // (draft) still updates every tick so it never feels stuck.
        frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; onCommit(next); });
    };
    return (
        <>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-primary)', minWidth: '94px', fontWeight: 600 }}>
                Colors: {draft}
            </Typography>
            <Slider
                value={draft}
                onChange={(_, v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    if (next === draft) return;
                    setDraft(next);
                    scheduleCommit(next);
                }}
                onChangeCommitted={(_, v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
                    onCommit(next);
                }}
                min={1}
                max={20}
                size="small"
                sx={{ flex: 1, '& .MuiSlider-track': { background: 'var(--accent-primary)' }, '& .MuiSlider-thumb': { background: 'var(--accent-primary)', border: '2px solid var(--bg-primary)' }, '& .MuiSlider-rail': { background: 'var(--border)' } }}
            />
        </>
    );
});

interface PaletteManagerProps {
    mode: RecolorMode;
    palette: ColorHandler[];
    setPalette: React.Dispatch<React.SetStateAction<ColorHandler[]>>;
    colorCount: number;
    setColorCount: (n: number) => void;
    onLoadPalette: (item: SavedPaletteItem) => void;
    savedPalettesList?: SavedPaletteItem[];
    onPalettesChanged?: () => void;
    onStatus?: (msg: string) => void;
}

const PaletteManager: React.FC<PaletteManagerProps> = ({
    mode, palette, setPalette, colorCount, setColorCount, onLoadPalette,
    savedPalettesList = [], onPalettesChanged, onStatus,
}) => {
    const pick = useFileExplorer();
    const isMinecraftStyle = useMinecraftStyle();
    const [managerOpen, setManagerOpen] = useState(false);
    const [paletteName, setPaletteName] = useState('');

    const defaultPaletteName = useMemo(
        () => `Palette_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [managerOpen]
    );

    useEffect(() => {
        if (managerOpen && !paletteName) setPaletteName(defaultPaletteName);
    }, [managerOpen, paletteName, defaultPaletteName]);

    const setStatus = (msg: string) => { if (typeof onStatus === 'function') onStatus(msg); };
    const refreshPalettes = () => { if (typeof onPalettesChanged === 'function') onPalettesChanged(); };

    const handleColorCountChange = useCallback((count: number) => {
        setColorCount(count);
        setPalette(prev => {
            // Deterministic growth: each new stop steps a fixed hue offset from the
            // previous one. No Math.random, so dragging the slider shows stable,
            // live-updating stops instead of flickering different colors per step.
            const next = prev.map(c => {
                const copy = new ColorHandler(c.vec4 ? [...c.vec4] : [0.5, 0.5, 0.5, 1]);
                copy.time = c.time;
                return copy;
            });
            if (next.length < count) {
                for (let i = next.length; i < count; i++) {
                    const newColor = new ColorHandler();
                    if (next.length > 0) {
                        const base = next[next.length - 1];
                        const [h, s, l] = base.ToHSL();
                        newColor.InputHSL([(h + 0.12) % 1, Math.max(0.4, Math.min(1, s)), Math.max(0.3, Math.min(0.8, l))]);
                    } else {
                        newColor.InputHex('#ecb96a');
                    }
                    next.push(newColor);
                }
            } else {
                next.splice(count);
            }
            next.forEach((c, i) => { c.time = next.length === 1 ? 0 : i / (next.length - 1); });
            return next;
        });
    }, [setColorCount, setPalette]);

    useEffect(() => {
        if (palette.length === 0) {
            const def = new ColorHandler();
            def.InputHex('#ecb96a');
            def.time = 0;
            setPalette([def]);
            setColorCount(1);
        }
    }, [palette, setPalette, setColorCount]);

    const handleSaveCurrent = () => {
        const name = (paletteName || '').trim() || defaultPaletteName;
        try {
            savePalette(palette, name, mode);
            refreshPalettes();
            setStatus(`Saved palette: ${name}`);
        } catch (error) {
            setStatus(`Error saving palette: ${(error as Error).message}`);
        }
    };

    const handleDeletePalette = (item: SavedPaletteItem) => {
        if (!item?.filename) return;
        try {
            deletePalette(item.filename);
            refreshPalettes();
            setStatus(`Deleted palette: ${item.name}`);
        } catch (error) {
            setStatus(`Error deleting palette: ${(error as Error).message}`);
        }
    };

    const handleExportSavedPalette = (item: SavedPaletteItem) => {
        try {
            const payload = {
                name: item.name,
                colors: item.palette.map(c => ({ rgba: c.rgba, time: c.time })),
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(item.name || 'palette').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatus(`Exported palette: ${item.name}`);
        } catch (error) {
            setStatus(`Export failed: ${(error as Error).message}`);
        }
    };

    const handleImportJson = async () => {
        try {
            const selected = await pick({ mode: 'file', filters: [{ name: 'JSON Files', extensions: ['json'] }] });
            if (!selected || typeof selected !== 'string') return;
            const b64 = await readFileBase64(selected);
            const text = atob(b64);
            const raw = JSON.parse(text) as ImportedPalette;
            const parsed = parseImportedPalette(raw);
            const baseName = selected.split(/[\\/]/).pop() || 'palette.json';
            const importName = parsed.name || baseName.replace(/\.json$/i, '');
            savePalette(parsed.colors, importName, parsed.mode || mode);
            refreshPalettes();
            setStatus(`Imported palette: ${importName}`);
        } catch (error) {
            setStatus(`Import failed: ${(error as Error).message}`);
        }
    };

    if (mode !== 'random' && mode !== 'random-keyframe' && mode !== 'linear' && mode !== 'materials') return null;

    return (
        <Box
            className="paint-palette-manager"
            sx={{ background: isMinecraftStyle ? '#2f2f2f' : 'var(--bg-secondary)', borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)' }}
        >
            <Box className="paint-palette-strip" sx={{ padding: '6px 16px 2px 16px', display: 'flex', gap: 1, height: '30px', alignItems: 'stretch', background: isMinecraftStyle ? '#353535' : 'transparent' }}>
                {palette.map((color, idx) => (
                    <Box
                        key={idx}
                        title={`Stop: ${Math.round(color.time * 100)}%`}
                        sx={{
                            flex: 1, background: color.ToHEX(), border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', transition: 'all 0.2s',
                            '&:hover': { border: '1px solid var(--accent-primary)', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(0,0,0,.3)' },
                        }}
                        onClick={(event) => {
                            const startAlpha = color.vec4?.[3] ?? 1;
                            // Both the hex commit and the alpha slider mutate stop `idx`.
                            const patchStop = (mutate: (h: ColorHandler) => void) => {
                                setPalette((prev) => {
                                    if (!Array.isArray(prev) || !prev[idx]) return prev;
                                    const current = prev[idx];
                                    const next = [...prev];
                                    const updated = new ColorHandler(current?.ToVec4?.() || current?.vec4 || [0.5, 0.5, 0.5, 1]);
                                    mutate(updated);
                                    updated.time = current?.time ?? (prev.length === 1 ? 0 : idx / (prev.length - 1));
                                    next[idx] = updated;
                                    return next;
                                });
                            };
                            openColorPicker(
                                event,
                                color.ToHEX(),
                                (hex) => patchStop((h) => h.InputHex(hex)),
                                { alpha: startAlpha, onAlpha: (a) => patchStop((h) => { h.vec4[3] = a; }) },
                            );
                        }}
                    />
                ))}
            </Box>

            <Box className="paint-palette-controls" sx={{ padding: '2px 16px 6px 16px', display: 'flex', alignItems: 'center', gap: 3, background: isMinecraftStyle ? '#353535' : 'transparent' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <PaletteCountSlider value={colorCount} onCommit={handleColorCountChange} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, ml: 'auto' }}>
                    <button onClick={() => setManagerOpen(true)} className="dl-btn dl-btn--primary dl-btn--sm">
                        Palette Manager
                    </button>
                </Box>
            </Box>

            {managerOpen && (
                <div style={modalStyles.overlay}>
                    <div style={modalStyles.backdrop} onClick={() => setManagerOpen(false)} />
                    <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={modalStyles.accentBar} />
                        <div style={modalStyles.body}>
                            <div style={modalStyles.header}>
                                <h2 style={modalStyles.title}>Palette Manager</h2>
                                <button onClick={() => setManagerOpen(false)} style={modalStyles.closeBtn}>{'✕'}</button>
                            </div>

                            <div style={modalStyles.section}>
                                <h3 style={modalStyles.sectionTitle}>Save Current</h3>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input type="text" value={paletteName} onChange={(e) => setPaletteName(e.target.value)} placeholder="Palette name…" style={modalStyles.input} />
                                    <button onClick={handleSaveCurrent} className="dl-btn dl-btn--primary dl-btn--sm" style={{ whiteSpace: 'nowrap' }}>
                                        <span className="dl-icon"><SaveIcon style={{ fontSize: 14 }} /></span> Save Current
                                    </button>
                                </div>
                            </div>

                            <div style={modalStyles.section}>
                                <h3 style={modalStyles.sectionTitle}>Library Actions</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handleImportJson} className="dl-btn dl-btn--primary dl-btn--sm">
                                        <span className="dl-icon"><UploadFileIcon style={{ fontSize: 14 }} /></span> Import JSON
                                    </button>
                                </div>
                            </div>

                            <div style={{ ...modalStyles.section, marginBottom: 0, padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-strong) transparent' }}>
                                    {savedPalettesList.length === 0 && (
                                        <div style={{ padding: '18px 16px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>No saved palettes found.</span>
                                        </div>
                                    )}
                                    {savedPalettesList.map((item, idx) => (
                                        <div key={`${item.filename || item.name}-${idx}`} style={{ padding: '10px 14px', borderBottom: idx < savedPalettesList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent-primary)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: 'var(--text-primary)', fontSize: '0.84rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                <div style={{ display: 'flex', gap: 2, height: 5, marginTop: 5 }}>
                                                    {item.palette.slice(0, 12).map((c, i) => (
                                                        <div key={i} style={{ flex: 1, background: `rgba(${c.rgba[0] * 255}, ${c.rgba[1] * 255}, ${c.rgba[2] * 255}, 1)`, borderRadius: 2 }} />
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={() => onLoadPalette(item)} className="dl-btn dl-btn--primary dl-btn--sm">
                                                <span className="dl-icon"><FileOpenIcon style={{ fontSize: 14 }} /></span> Load
                                            </button>
                                            <button onClick={() => handleExportSavedPalette(item)} className="dl-btn dl-btn--secondary dl-btn--sm">
                                                <span className="dl-icon"><DownloadIcon style={{ fontSize: 14 }} /></span> Export
                                            </button>
                                            <button onClick={() => handleDeletePalette(item)} className="dl-btn dl-btn--danger dl-btn--sm dl-btn--icon">
                                                <span className="dl-icon"><DeleteIcon style={{ fontSize: 14 }} /></span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={modalStyles.footer}>
                                <button onClick={() => setManagerOpen(false)} className="dl-btn dl-btn--secondary dl-btn--sm">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Box>
    );
};

export default PaletteManager;
