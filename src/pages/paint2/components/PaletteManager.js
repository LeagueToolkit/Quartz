import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Slider,
    Tooltip,
    Button,
    IconButton
} from '@mui/material';
import ColorHandler from '../../../utils/colors/ColorHandler.js';
import { CreatePicker } from '../../../utils/colors/colorUtils.js';
import { savePalette, deletePalette, getPaletteDirectoryPath } from '../utils/paletteManager.js';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import BookmarkIcon from '@mui/icons-material/Bookmark';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const parseImportedPalette = (raw) => {
    const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
    const mode = typeof raw?.mode === 'string' ? raw.mode : null;

    const sourceColors = Array.isArray(raw?.colors)
        ? raw.colors
        : (Array.isArray(raw?.palette) ? raw.palette : null);
    if (!sourceColors || sourceColors.length === 0) {
        throw new Error('No palette colors found in JSON');
    }

    const colors = sourceColors.map((item, idx) => {
        const ch = new ColorHandler();
        if (typeof item?.hex === 'string') {
            ch.InputHex(item.hex);
        } else if (Array.isArray(item?.rgba) && item.rgba.length >= 3) {
            ch.vec4 = [
                Number(item.rgba[0]) || 0,
                Number(item.rgba[1]) || 0,
                Number(item.rgba[2]) || 0,
                item.rgba.length > 3 ? (Number(item.rgba[3]) || 1) : 1
            ];
        } else if (item && (item.r !== undefined) && (item.g !== undefined) && (item.b !== undefined)) {
            ch.vec4 = [
                Number(item.r) || 0,
                Number(item.g) || 0,
                Number(item.b) || 0,
                item.a !== undefined ? (Number(item.a) || 1) : 1
            ];
        } else {
            throw new Error(`Invalid color at index ${idx}`);
        }
        ch.time = typeof item?.time === 'number' ? item.time : (sourceColors.length === 1 ? 0 : idx / (sourceColors.length - 1));
        return ch;
    });

    return { name, mode, colors };
};

/* ── shared styles matching CustomPrefixModal ────────────────────────── */
const modalStyles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
    },
    backdrop: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        height: 720,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16,
        boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
        overflow: 'hidden',
    },
    accentBar: {
        height: 3,
        background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3s linear infinite',
    },
    body: {
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        gap: 0,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    title: {
        fontSize: '0.95rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 700,
        color: 'var(--text)',
        margin: 0,
        fontFamily: 'JetBrains Mono, monospace',
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        outline: 'none',
    },
    section: {
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: 14,
        marginBottom: 12,
    },
    sectionTitle: {
        color: 'var(--accent2)',
        fontSize: '0.76rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        margin: 0,
        marginBottom: 10,
        fontFamily: 'JetBrains Mono, monospace',
    },
    input: {
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        padding: '8px 12px',
        fontSize: '0.82rem',
        color: 'var(--text)',
        fontFamily: 'JetBrains Mono, monospace',
        outline: 'none',
        transition: 'all 0.2s ease',
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.08)',
    },
};

const btnBase = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
    color: 'var(--accent2)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    outline: 'none',
};

const btnGhost = {
    ...btnBase,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.18)',
};

const btnDanger = {
    ...btnBase,
    padding: '6px 12px',
    minWidth: 36,
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
};

const hoverBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 72%)';
    e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)';
    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 50%)';
};
const leaveBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
};
const hoverGhost = (e) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
    e.currentTarget.style.boxShadow = '0 0 12px rgba(255,255,255,0.12)';
};
const leaveGhost = (e) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    e.currentTarget.style.boxShadow = 'none';
};
const hoverDanger = (e) => {
    e.currentTarget.style.color = 'var(--error-color, #f87171)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
};
const leaveDanger = (e) => {
    e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
};
const focusInput = (e) => {
    e.currentTarget.style.borderColor = 'var(--accent)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent), transparent 75%)';
};
const blurInput = (e) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
    e.currentTarget.style.boxShadow = 'none';
};

const PaletteCountSlider = React.memo(function PaletteCountSlider({
    value,
    onCommit
}) {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    return (
        <>
            <Typography sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: 'var(--accent)', minWidth: '94px', fontWeight: 600 }}>
                Colors: {draft}
            </Typography>
            <Slider
                value={draft}
                onChange={(_, v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    setDraft(next);
                    setDraft(next);
                    onCommit(next);
                }}
                min={1}
                max={20}
                size="small"
                sx={{
                    flex: 1,
                    '& .MuiSlider-track': { background: 'var(--accent)' },
                    '& .MuiSlider-thumb': { background: 'var(--accent)', border: '2px solid var(--bg)' },
                    '& .MuiSlider-rail': { background: 'var(--border)' }
                }}
            />
        </>
    );
});

/* ── component ───────────────────────────────────────────────────────── */
const PaletteManager = ({
    mode,
    palette,
    setPalette,
    colorCount,
    setColorCount,
    onLoadPalette,
    savedPalettesList = [],
    onPalettesChanged,
    onStatus
}) => {
    const [managerOpen, setManagerOpen] = useState(false);
    const [paletteName, setPaletteName] = useState('');

    const defaultPaletteName = useMemo(
        () => `Palette_${new Date().toLocaleDateString().replace(/\//g, '-')}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
        [managerOpen]
    );

    useEffect(() => {
        if (managerOpen && !paletteName) {
            setPaletteName(defaultPaletteName);
        }
    }, [managerOpen, paletteName, defaultPaletteName]);

    const setStatus = (msg) => {
        if (typeof onStatus === 'function') onStatus(msg);
    };

    const refreshPalettes = () => {
        if (typeof onPalettesChanged === 'function') onPalettesChanged();
    };

    const handleColorCountChange = useCallback((count) => {
        setColorCount(count);
        setPalette(prev => {
            const next = [...prev];
            if (next.length < count) {
                for (let i = next.length; i < count; i++) {
                    let newColor;
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
            next.forEach((c, i) => {
                c.time = next.length === 1 ? 0 : i / (next.length - 1);
            });
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
            setStatus(`Error saving palette: ${error.message}`);
        }
    };

    const handleDeletePalette = (item) => {
        if (!item?.filename) return;
        try {
            deletePalette(item.filename);
            refreshPalettes();
            setStatus(`Deleted palette: ${item.name}`);
        } catch (error) {
            setStatus(`Error deleting palette: ${error.message}`);
        }
    };

    const handleExportSavedPalette = async (item) => {
        try {
            if (!window.require || !item?.filename || !fs || !path) return;
            const srcDir = getPaletteDirectoryPath();
            const srcPath = path.join(srcDir, item.filename);
            if (!fs.existsSync(srcPath)) {
                setStatus('Palette file not found on disk');
                return;
            }
            const { ipcRenderer } = window.require('electron');
            const saveResult = await ipcRenderer.invoke('dialog:saveFile', {
                title: 'Export Palette JSON',
                defaultPath: `${(item.name || 'palette').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
                filters: [{ name: 'JSON Files', extensions: ['json'] }]
            });
            if (!saveResult || saveResult.canceled || !saveResult.filePath) return;
            fs.copyFileSync(srcPath, saveResult.filePath);
            setStatus(`Exported palette: ${item.name}`);
        } catch (error) {
            setStatus(`Export failed: ${error.message}`);
        }
    };

    const handleImportJson = async () => {
        try {
            if (!window.require) return;
            const { ipcRenderer } = window.require('electron');
            const openResult = await ipcRenderer.invoke('dialog:openFile', {
                title: 'Import Palette JSON',
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                properties: ['openFile']
            });
            if (!openResult || openResult.canceled || !openResult.filePaths?.length) return;
            const filePath = openResult.filePaths[0];
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const parsed = parseImportedPalette(raw);
            const importName = parsed.name || path.basename(filePath, '.json');
            savePalette(parsed.colors, importName, parsed.mode || mode);
            refreshPalettes();
            setStatus(`Imported palette: ${importName}`);
        } catch (error) {
            setStatus(`Import failed: ${error.message}`);
        }
    };

    const handleOpenPaletteFolder = async () => {
        try {
            if (!window.require) return;
            const { shell } = window.require('electron');
            const dir = getPaletteDirectoryPath();
            if (!dir || !fs) return;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            await shell.openPath(dir);
        } catch (error) {
            setStatus(`Open folder failed: ${error.message}`);
        }
    };

    if (mode !== 'random' && mode !== 'random-keyframe' && mode !== 'linear' && mode !== 'materials') return null;

    return (
        <Box sx={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <Box sx={{ padding: '8px 16px', display: 'flex', gap: 1, height: '42px', alignItems: 'stretch' }}>
                {palette.map((color, idx) => (
                    <Tooltip key={idx} title={`Stop: ${Math.round(color.time * 100)}%`}>
                        <Box
                            sx={{
                                flex: 1,
                                background: color.ToHEX(),
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.05)',
                                '&:hover': {
                                    border: '1px solid var(--accent)',
                                    transform: 'translateY(-1px)',
                                    boxShadow: `0 4px 12px ${color.ToHEX()}44`
                                }
                            }}
                            onClick={(event) => {
                                CreatePicker(idx, event, palette, setPalette, mode, null, null, event.currentTarget);
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>

            <Box sx={{ padding: '4px 16px 8px 16px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <PaletteCountSlider
                        value={colorCount}
                        onCommit={handleColorCountChange}
                    />
                </Box>

                <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                    <Button
                        size="small"
                        onClick={() => setManagerOpen(true)}
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
                        Palette Manager
                    </Button>
                </Box>
            </Box>

            {/* ── Modal ─────────────────────────────────────────────────────── */}
            {managerOpen && (
                <div style={modalStyles.overlay}>
                    <div style={modalStyles.backdrop} onClick={() => setManagerOpen(false)} />
                    <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                        {/* shimmer accent bar */}
                        <div style={modalStyles.accentBar} />

                        <div style={modalStyles.body}>
                            {/* header */}
                            <div style={modalStyles.header}>
                                <h2 style={modalStyles.title}>Palette Manager</h2>
                                <button
                                    onClick={() => setManagerOpen(false)}
                                    style={modalStyles.closeBtn}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
                                        e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)';
                                        e.currentTarget.style.color = 'var(--accent2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        e.currentTarget.style.boxShadow = 'none';
                                        e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                                    }}
                                >
                                    {'\u2715'}
                                </button>
                            </div>

                            {/* save current section */}
                            <div style={modalStyles.section}>
                                <h3 style={modalStyles.sectionTitle}>Save Current</h3>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        value={paletteName}
                                        onChange={(e) => setPaletteName(e.target.value)}
                                        placeholder="Palette name…"
                                        style={modalStyles.input}
                                        onFocus={focusInput}
                                        onBlur={blurInput}
                                    />
                                    <button
                                        onClick={handleSaveCurrent}
                                        style={{ ...btnBase, whiteSpace: 'nowrap' }}
                                        onMouseEnter={hoverBtn}
                                        onMouseLeave={leaveBtn}
                                    >
                                        <SaveIcon style={{ fontSize: 15 }} /> Save Current
                                    </button>
                                </div>
                            </div>

                            {/* library actions section */}
                            <div style={modalStyles.section}>
                                <h3 style={modalStyles.sectionTitle}>Library Actions</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={handleImportJson}
                                        style={btnBase}
                                        onMouseEnter={hoverBtn}
                                        onMouseLeave={leaveBtn}
                                    >
                                        <UploadFileIcon style={{ fontSize: 15 }} /> Import JSON
                                    </button>
                                    <button
                                        onClick={handleOpenPaletteFolder}
                                        style={btnBase}
                                        onMouseEnter={hoverBtn}
                                        onMouseLeave={leaveBtn}
                                    >
                                        <FolderOpenIcon style={{ fontSize: 15 }} /> Open Folder
                                    </button>
                                </div>
                            </div>

                            {/* saved palettes list */}
                            <div style={{ ...modalStyles.section, marginBottom: 0, padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <div
                                    style={{
                                        flex: 1,
                                        minHeight: 0,
                                        overflowY: 'auto',
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: 'rgba(255,255,255,0.12) transparent',
                                    }}
                                >
                                    {savedPalettesList.length === 0 && (
                                        <div style={{ padding: '18px 16px' }}>
                                            <span style={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>
                                                No saved palettes found.
                                            </span>
                                        </div>
                                    )}
                                    {savedPalettesList.map((item, idx) => (
                                        <div
                                            key={`${item.filename || item.name}-${idx}`}
                                            style={{
                                                padding: '10px 14px',
                                                borderBottom: idx < savedPalettesList.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                            }}
                                        >
                                            <BookmarkIcon style={{ fontSize: 16, color: 'var(--accent-muted)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.name}
                                                </div>
                                                <div style={{ display: 'flex', gap: 2, height: 5, marginTop: 5 }}>
                                                    {item.palette.slice(0, 12).map((c, i) => (
                                                        <div key={i} style={{ flex: 1, background: `rgba(${c.rgba[0] * 255}, ${c.rgba[1] * 255}, ${c.rgba[2] * 255}, 1)`, borderRadius: 2 }} />
                                                    ))}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onLoadPalette(item)}
                                                style={{ ...btnBase, minWidth: 66 }}
                                                onMouseEnter={hoverBtn}
                                                onMouseLeave={leaveBtn}
                                            >
                                                <FileOpenIcon style={{ fontSize: 14 }} /> Load
                                            </button>
                                            <button
                                                onClick={() => handleExportSavedPalette(item)}
                                                style={{ ...btnGhost, minWidth: 74 }}
                                                onMouseEnter={hoverGhost}
                                                onMouseLeave={leaveGhost}
                                            >
                                                <DownloadIcon style={{ fontSize: 14 }} /> Export
                                            </button>
                                            <button
                                                onClick={() => handleDeletePalette(item)}
                                                style={btnDanger}
                                                onMouseEnter={hoverDanger}
                                                onMouseLeave={leaveDanger}
                                            >
                                                <DeleteIcon style={{ fontSize: 14 }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* footer */}
                            <div style={modalStyles.footer}>
                                <button
                                    onClick={() => setManagerOpen(false)}
                                    style={btnGhost}
                                    onMouseEnter={hoverGhost}
                                    onMouseLeave={leaveGhost}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Box>
    );
};

export default PaletteManager;
