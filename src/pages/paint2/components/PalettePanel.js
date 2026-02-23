/**
 * PalettePanel Component
 * Right sidebar with palette colors, mode selection, and recolor button
 */

import React from 'react';
import { Box, Typography, Button, Checkbox, FormControlLabel, Slider, Select, MenuItem, TextField } from '@mui/material';
import ColorHandler from '../../../utils/colors/ColorHandler.js';

const buttonStyle = {
    background: 'var(--bg-2)',
    border: '1px solid var(--accent-muted)',
    color: 'var(--text)',
    borderRadius: '5px',
    textTransform: 'none',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.85rem',
    padding: '6px 16px',
    '&:hover': {
        background: 'var(--surface-2)',
        borderColor: 'var(--accent)'
    },
    '&:disabled': {
        opacity: 0.5,
        color: 'var(--text-2)'
    }
};

const primaryButtonStyle = {
    ...buttonStyle,
    background: 'var(--accent)',
    color: 'var(--bg-1)',
    borderColor: 'var(--accent)',
    fontWeight: 600,
    '&:hover': {
        background: 'var(--accent-hover)',
        borderColor: 'var(--accent-hover)'
    }
};

const sectionStyle = {
    padding: '12px',
    borderBottom: '1px solid var(--border)'
};

const labelStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    color: 'var(--text-2)',
    marginBottom: '4px'
};

function PalettePanel({
    palette,
    setPalette,
    mode,
    setMode,
    colorCount,
    setColorCount,
    useRandomGradient,
    setUseRandomGradient,
    ignoreBlackWhite,
    setIgnoreBlackWhite,
    hslValues,
    setHslValues,
    hueTarget,
    setHueTarget,
    onRecolor,
    selectionCount,
    showBirthColor,
    setShowBirthColor,
    showOC,
    setShowOC,
    showLingerColor,
    setShowLingerColor
}) {
    // Convert palette color to CSS
    const colorToCSS = (color) => {
        if (!color) return 'transparent';
        const rgba = color.vec4 || [color.r || 0, color.g || 0, color.b || 0, 1];
        const toInt = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        return `rgb(${toInt(rgba[0])}, ${toInt(rgba[1])}, ${toInt(rgba[2])})`;
    };

    // Add a random color to palette
    const addRandomColor = () => {
        const newColor = new ColorHandler([Math.random(), Math.random(), Math.random(), 1]);
        newColor.time = palette.length / Math.max(1, palette.length);
        setPalette([...palette, newColor]);
    };

    // Remove color from palette
    const removeColor = (index) => {
        const newPalette = palette.filter((_, i) => i !== index);
        setPalette(newPalette);
    };

    return (
        <Box sx={{
            width: 280,
            background: 'var(--bg-2)',
            borderLeft: '1px solid var(--border)',
            overflow: 'auto',
            flexShrink: 0
        }}>
            {/* Mode Selection */}
            <Box sx={sectionStyle}>
                <Typography sx={labelStyle}>Mode</Typography>
                <Select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    size="small"
                    fullWidth
                    sx={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.85rem',
                        '& .MuiSelect-select': {
                            padding: '6px 12px'
                        }
                    }}
                >
                    <MenuItem value="random">Normal</MenuItem>
                    <MenuItem value="random-keyframe">Random Gradient</MenuItem>
                    <MenuItem value="linear">Linear Gradient</MenuItem>
                    <MenuItem value="shift">HSL Shift</MenuItem>
                    <MenuItem value="shift-hue">Hue Target</MenuItem>
                </Select>
            </Box>

            {/* HSL Shift Controls (when mode is shift) */}
            {mode === 'shift' && (
                <Box sx={sectionStyle}>
                    <Typography sx={labelStyle}>Hue Shift</Typography>
                    <Slider
                        value={hslValues.h}
                        onChange={(_, v) => setHslValues({ ...hslValues, h: v })}
                        min={-180}
                        max={180}
                        size="small"
                    />
                    <Typography sx={labelStyle}>Saturation</Typography>
                    <Slider
                        value={hslValues.s}
                        onChange={(_, v) => setHslValues({ ...hslValues, s: v })}
                        min={-100}
                        max={100}
                        size="small"
                    />
                    <Typography sx={labelStyle}>Lightness</Typography>
                    <Slider
                        value={hslValues.l}
                        onChange={(_, v) => setHslValues({ ...hslValues, l: v })}
                        min={-100}
                        max={100}
                        size="small"
                    />
                </Box>
            )}

            {/* Hue Target Control (when mode is shift-hue) */}
            {mode === 'shift-hue' && (
                <Box sx={sectionStyle}>
                    <Typography sx={labelStyle}>Target Hue</Typography>
                    <Slider
                        value={hueTarget}
                        onChange={(_, v) => setHueTarget(v)}
                        min={0}
                        max={360}
                        size="small"
                        sx={{
                            '& .MuiSlider-track': {
                                background: `linear-gradient(90deg, 
                  hsl(0, 100%, 50%), 
                  hsl(60, 100%, 50%), 
                  hsl(120, 100%, 50%), 
                  hsl(180, 100%, 50%), 
                  hsl(240, 100%, 50%), 
                  hsl(300, 100%, 50%), 
                  hsl(360, 100%, 50%)
                )`
                            }
                        }}
                    />
                    <Typography sx={{ ...labelStyle, textAlign: 'center' }}>
                        {hueTarget}°
                    </Typography>
                </Box>
            )}

            {/* Palette Colors */}
            {(mode === 'random' || mode === 'random-keyframe' || mode === 'linear') && (
                <Box sx={sectionStyle}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <Typography sx={labelStyle}>Palette</Typography>
                        <Button onClick={addRandomColor} size="small" sx={{ ...buttonStyle, padding: '2px 8px', fontSize: '0.75rem' }}>
                            + Add
                        </Button>
                    </Box>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {palette.map((color, index) => (
                            <Box
                                key={index}
                                onClick={() => removeColor(index)}
                                sx={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '4px',
                                    background: colorToCSS(color),
                                    border: '1px solid var(--border)',
                                    cursor: 'pointer',
                                    '&:hover': {
                                        boxShadow: '0 0 0 2px var(--error-color)',
                                        opacity: 0.7
                                    }
                                }}
                                title="Click to remove"
                            />
                        ))}
                    </Box>

                    {palette.length === 0 && (
                        <Typography sx={{ ...labelStyle, fontStyle: 'italic' }}>
                            Click a color block to import
                        </Typography>
                    )}
                </Box>
            )}

            {/* Options */}
            <Box sx={sectionStyle}>
                <Typography sx={labelStyle}>Options</Typography>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={useRandomGradient}
                            onChange={(e) => setUseRandomGradient(e.target.checked)}
                            size="small"
                            sx={{ padding: '4px' }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.8rem' }}>Random Gradient</Typography>}
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={ignoreBlackWhite}
                            onChange={(e) => setIgnoreBlackWhite(e.target.checked)}
                            size="small"
                            sx={{ padding: '4px' }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.8rem' }}>Ignore B/W</Typography>}
                />
            </Box>

            {/* Show/Hide Color Types */}
            <Box sx={sectionStyle}>
                <Typography sx={labelStyle}>Show Colors</Typography>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={showBirthColor}
                            onChange={(e) => setShowBirthColor(e.target.checked)}
                            size="small"
                            sx={{ padding: '4px' }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.8rem' }}>Birth Color</Typography>}
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={showOC}
                            onChange={(e) => setShowOC(e.target.checked)}
                            size="small"
                            sx={{ padding: '4px' }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.8rem' }}>OC/Fresnel</Typography>}
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={showLingerColor}
                            onChange={(e) => setShowLingerColor(e.target.checked)}
                            size="small"
                            sx={{ padding: '4px' }}
                        />
                    }
                    label={<Typography sx={{ fontSize: '0.8rem' }}>Linger Color</Typography>}
                />
            </Box>

            {/* Recolor Button */}
            <Box sx={{ padding: '16px' }}>
                <Button
                    onClick={onRecolor}
                    disabled={selectionCount === 0 || (mode !== 'shift' && mode !== 'shift-hue' && palette.length === 0)}
                    fullWidth
                    sx={primaryButtonStyle}
                >
                    Recolor {selectionCount > 0 ? `(${selectionCount})` : ''}
                </Button>
            </Box>
        </Box>
    );
}

export default React.memo(PalettePanel);
