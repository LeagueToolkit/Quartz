/*
 * PaletteManager Component
 * Palette strip + color-count slider + a full palette library modal
 * (save / load / delete / import / export).
 * Ported from the Electron Quartz paint2 PaletteManager. File IO is adapted to
 * the Tauri surface: import uses the dialog + readFileBase64, export downloads
 * a JSON blob, and persistence lives in localStorage via paletteManager.ts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Typography, Slider, Tooltip, Button } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { open } from '@tauri-apps/plugin-dialog';
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
    backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
    modal: { position: 'relative', width: '100%', maxWidth: 860, height: 720, display: 'flex', flexDirection: 'column', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', borderRadius: 16, boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)', overflow: 'hidden' },
    accentBar: { height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))', backgroundSize: '200% 100%' },
    body: { padding: 20, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 0 },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'JetBrains Mono, monospace' },
    closeBtn: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'all 0.25s ease', outline: 'none' },
    section: { borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 14, marginBottom: 12 },
    sectionTitle: { color: 'var(--accent2)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, marginBottom: 10, fontFamily: 'JetBrains Mono, monospace' },
    input: { width: '100%', boxSizing: 'border-box', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', outline: 'none', transition: 'all 0.2s ease' },
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' },
};

const btnBase: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'color-mix(in srgb, var(--accent2), transparent 90%)', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s ease', display: 'inline-flex', alignItems: 'center', gap: 5, outline: 'none' };
const btnGhost: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.18)' };
const btnDanger: React.CSSProperties = { ...btnBase, padding: '6px 12px', minWidth: 36, justifyContent: 'center', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' };

interface PaletteCountSliderProps { value: number; onCommit: (v: number) => void }
const PaletteCountSlider = React.memo(function PaletteCountSlider({ value, onCommit }: PaletteCountSliderProps) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    return (
        <>
            <Typography sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: 'var(--accent)', minWidth: '94px', fontWeight: 600 }}>
                Colors: {draft}
            </Typography>
            <Slider
                value={draft}
                onChange={(_, v) => { const next = Array.isArray(v) ? v[0] : v; setDraft(next); onCommit(next); }}
                min={1}
                max={20}
                size="small"
                sx={{ flex: 1, '& .MuiSlider-track': { background: 'var(--accent)' }, '& .MuiSlider-thumb': { background: 'var(--accent)', border: '2px solid var(--bg)' }, '& .MuiSlider-rail': { background: 'var(--border)' } }}
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
            const next = [...prev];
            if (next.length < count) {
                for (let i = next.length; i < count; i++) {
                    let newColor: ColorHandler;
                    if (next.length > 0) {
                        const base = next[next.length - 1];
                        const [h, s, l] = base.ToHSL();
                        newColor = new ColorHandler();
                        const newH = (h + 0.1 + Math.random() * 0.1) % 1;
                        const newS = Math.max(0.4, Math.min(1, s + (Math.random() - 0.5) * 0.2));
                        const newL = Math.max(0.3, Math.min(0.8, l + (Math.random() - 0.5) * 0.1));
                        newColor.InputHSL([newH, newS, newL]);
                    } else {
                        newColor = new ColorHandler();
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
            const selected = await open({ multiple: false, filters: [{ name: 'JSON Files', extensions: ['json'] }] });
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
            sx={{ background: isMinecraftStyle ? '#2f2f2f' : 'var(--surface)', borderBottom: isMinecraftStyle ? '1px solid #000000' : '1px solid var(--border)' }}
        >
            <Box className="paint-palette-strip" sx={{ padding: '8px 16px', display: 'flex', gap: 1, height: '42px', alignItems: 'stretch', background: isMinecraftStyle ? '#353535' : 'transparent' }}>
                {palette.map((color, idx) => (
                    <Tooltip key={idx} title={`Stop: ${Math.round(color.time * 100)}%`}>
                        <Box
                            sx={{
                                flex: 1, background: color.ToHEX(), border: '1px solid var(--border)', borderRadius: '12px',
                                cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.05)',
                                '&:hover': { border: '1px solid var(--accent)', transform: 'translateY(-1px)', boxShadow: `0 4px 12px ${color.ToHEX()}44` },
                            }}
                            onClick={(event) => {
                                openColorPicker(event, color.ToHEX(), (hex) => {
                                    setPalette((prev) => {
                                        if (!Array.isArray(prev) || !prev[idx]) return prev;
                                        const current = prev[idx];
                                        const next = [...prev];
                                        const updated = new ColorHandler(current?.ToVec4?.() || current?.vec4 || [0.5, 0.5, 0.5, 1]);
                                        updated.InputHex(hex);
                                        updated.time = current?.time ?? (prev.length === 1 ? 0 : idx / (prev.length - 1));
                                        next[idx] = updated;
                                        return next;
                                    });
                                });
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>

            <Box className="paint-palette-controls" sx={{ padding: '4px 16px 8px 16px', display: 'flex', alignItems: 'center', gap: 3, background: isMinecraftStyle ? '#353535' : 'transparent' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <PaletteCountSlider value={colorCount} onCommit={handleColorCountChange} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                    <Button
                        size="small"
                        onClick={() => setManagerOpen(true)}
                        sx={{
                            background: 'color-mix(in srgb, var(--accent), transparent 95%)', border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
                            color: 'var(--accent)', borderRadius: '4px', textTransform: 'none', fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.78rem', padding: '1px 10px', minWidth: 'auto', height: '26px',
                            '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent)' },
                        }}
                    >
                        Palette Manager
                    </Button>
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
                                    <button onClick={handleSaveCurrent} style={{ ...btnBase, whiteSpace: 'nowrap' }}>
                                        <SaveIcon style={{ fontSize: 15 }} /> Save Current
                                    </button>
                                </div>
                            </div>

                            <div style={modalStyles.section}>
                                <h3 style={modalStyles.sectionTitle}>Library Actions</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handleImportJson} style={btnBase}>
                                        <UploadFileIcon style={{ fontSize: 15 }} /> Import JSON
                                    </button>
                                </div>
                            </div>

                            <div style={{ ...modalStyles.section, marginBottom: 0, padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
                                    {savedPalettesList.length === 0 && (
                                        <div style={{ padding: '18px 16px' }}>
                                            <span style={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>No saved palettes found.</span>
                                        </div>
                                    )}
                                    {savedPalettesList.map((item, idx) => (
                                        <div key={`${item.filename || item.name}-${idx}`} style={{ padding: '10px 14px', borderBottom: idx < savedPalettesList.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent-muted)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                <div style={{ display: 'flex', gap: 2, height: 5, marginTop: 5 }}>
                                                    {item.palette.slice(0, 12).map((c, i) => (
                                                        <div key={i} style={{ flex: 1, background: `rgba(${c.rgba[0] * 255}, ${c.rgba[1] * 255}, ${c.rgba[2] * 255}, 1)`, borderRadius: 2 }} />
                                                    ))}
                                                </div>
                                            </div>
                                            <button onClick={() => onLoadPalette(item)} style={{ ...btnBase, minWidth: 66 }}>
                                                <FileOpenIcon style={{ fontSize: 14 }} /> Load
                                            </button>
                                            <button onClick={() => handleExportSavedPalette(item)} style={{ ...btnGhost, minWidth: 74 }}>
                                                <DownloadIcon style={{ fontSize: 14 }} /> Export
                                            </button>
                                            <button onClick={() => handleDeletePalette(item)} style={btnDanger}>
                                                <DeleteIcon style={{ fontSize: 14 }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={modalStyles.footer}>
                                <button onClick={() => setManagerOpen(false)} style={btnGhost}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Box>
    );
};

export default PaletteManager;
