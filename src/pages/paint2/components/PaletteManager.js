import React, { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Slider, Tooltip, Button, Menu, MenuItem, Checkbox, IconButton } from '@mui/material';
import ColorHandler from '../../../utils/colors/ColorHandler.js';
import { CreatePicker } from '../../../utils/colors/colorUtils.js';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import BookmarkIcon from '@mui/icons-material/Bookmark';

const controlLabelStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    color: 'var(--accent-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
};

const PaletteManager = ({
    mode,
    palette,
    setPalette,
    colorCount,
    setColorCount,
    onLoadPalette,
    onDeletePalette,
    onSavePalette,
    savedPalettesList = []
}) => {
    const [paletteAnchor, setPaletteAnchor] = useState(null);

    // Fix: Harmonious color generation (no more grey)
    const handleColorCountChange = useCallback((count) => {
        setColorCount(count);
        setPalette(prev => {
            const next = [...prev];
            if (next.length < count) {
                for (let i = next.length; i < count; i++) {
                    let newColor;
                    if (next.length > 0) {
                        // Variations of the last color instead of just grey
                        const base = next[next.length - 1];
                        const [h, s, l] = base.ToHSL();
                        newColor = new ColorHandler();
                        // Shift hue harmoniously (30-60 degrees)
                        const newH = (h + 0.1 + Math.random() * 0.1) % 1;
                        // Keep saturation/lightness similar but slightly randomized for "pop"
                        const newS = Math.max(0.4, Math.min(1, s + (Math.random() - 0.5) * 0.2));
                        const newL = Math.max(0.3, Math.min(0.8, l + (Math.random() - 0.5) * 0.1));
                        newColor.InputHSL([newH, newS, newL]);
                    } else {
                        // Default starting color (DivineLab Orange)
                        newColor = new ColorHandler();
                        newColor.InputHex('#ecb96a');
                    }
                    next.push(newColor);
                }
            } else {
                next.splice(count);
            }
            // Update time values
            next.forEach((c, i) => {
                c.time = next.length === 1 ? 0 : i / (next.length - 1);
            });
            return next;
        });
    }, [setColorCount, setPalette]);

    // Ensure we don't have empty palette
    useEffect(() => {
        if (palette.length === 0) {
            const def = new ColorHandler();
            def.InputHex('#ecb96a');
            def.time = 0;
            setPalette([def]);
            setColorCount(1);
        }
    }, [palette, setPalette, setColorCount]);

    // Only show for random, linear, and materials modes
    if (mode !== 'random' && mode !== 'linear' && mode !== 'materials') return null;

    return (
        <Box sx={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            {/* Row 1: Large Palette Blocks */}
            <Box sx={{
                padding: '8px 40px',
                display: 'flex',
                gap: 1,
                height: '42px',
                alignItems: 'stretch'
            }}>
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
                                CreatePicker(
                                    idx,
                                    event,
                                    palette,
                                    setPalette,
                                    mode,
                                    null, // savePaletteForMode removed
                                    null, // setColors not needed as we use the palette state
                                    event.currentTarget
                                );
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>

            {/* Row 2: Controls & Buttons */}
            <Box sx={{
                padding: '4px 40px 8px 40px',
                display: 'flex',
                alignItems: 'center',
                gap: 3
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <Typography sx={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.85rem',
                        color: 'var(--accent)',
                        minWidth: '94px',
                        fontWeight: 600
                    }}>
                        Colors: {colorCount}
                    </Typography>
                    <Slider
                        value={colorCount}
                        onChange={(_, v) => handleColorCountChange(v)}
                        min={1}
                        max={20}
                        size="small"
                        sx={{
                            flex: 1,
                            flex: 1,
                            '& .MuiSlider-track': { background: 'var(--accent)' },
                            '& .MuiSlider-thumb': {
                                background: 'var(--accent)',
                                border: '2px solid var(--bg)'
                            },
                            '& .MuiSlider-rail': { background: 'var(--border)' }
                        }}
                    />
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>

                    <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => setPaletteAnchor(e.currentTarget)}
                        sx={{
                            textTransform: 'none',
                            color: 'var(--accent-muted)',
                            borderColor: 'rgba(255,255,255,0.1)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '0.75rem',
                            height: '28px',
                            background: 'color-mix(in srgb, var(--accent), transparent 95%)',
                            '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent-muted)' }
                        }}
                    >
                        Palette ▼
                    </Button>

                    <Menu
                        anchorEl={paletteAnchor}
                        open={Boolean(paletteAnchor)}
                        onClose={() => setPaletteAnchor(null)}
                        PaperProps={{
                            sx: {
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                minWidth: '220px',
                                maxHeight: '400px',
                                '& .MuiMenuItem-root': {
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-2)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    '&:hover': { background: 'rgba(255,255,255,0.05)' }
                                }
                            }
                        }}
                    >
                        <MenuItem onClick={() => { onSavePalette(); setPaletteAnchor(null); }} sx={{ color: 'var(--accent) !important', fontWeight: 600 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SaveIcon fontSize="small" /> Save Current Palette
                            </Box>
                        </MenuItem>

                        {savedPalettesList.length > 0 && <Box sx={{ height: '1px', background: 'rgba(255,255,255,0.05)', my: 1 }} />}

                        {Array.isArray(savedPalettesList) && savedPalettesList.map((item, idx) => (
                            <MenuItem key={idx} onClick={() => { onLoadPalette(item); setPaletteAnchor(null); }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <BookmarkIcon fontSize="inherit" sx={{ opacity: 0.5 }} />
                                        {item.name}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: '2px', height: '4px' }}>
                                        {item.palette.slice(0, 10).map((c, i) => (
                                            <Box key={i} sx={{ flex: 1, background: `rgba(${c.rgba[0] * 255}, ${c.rgba[1] * 255}, ${c.rgba[2] * 255}, 1)` }} />
                                        ))}
                                    </Box>
                                </Box>
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeletePalette(idx);
                                    }}
                                    sx={{ ml: 1, color: 'rgba(255,255,255,0.2)', '&:hover': { color: 'var(--error-color)' } }}
                                >
                                    <DeleteIcon fontSize="inherit" />
                                </IconButton>
                            </MenuItem>
                        ))}
                    </Menu>
                </Box>
            </Box>
        </Box>
    );
};

export default PaletteManager;
