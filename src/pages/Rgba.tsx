import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Box, Typography, Chip, TextField, Slider, IconButton, Tooltip, Grid, Paper, Button as MuiButton, Fade } from '@mui/material';
import {
    Palette as PaletteIcon,
    ContentCopy as CopyIcon,
    Refresh as RefreshIcon,
    Colorize as ColorizeIcon,
    Opacity as OpacityIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { ColorPickerHost, openColorPicker, cleanupColorPickers } from './paint/components/ColorPicker';

type Vec4 = [number, number, number, number];

function vec4ToHex(vec: Vec4): string {
    const r = Math.ceil(Math.max(0, Math.min(1, vec[0])) * 254.9);
    const g = Math.ceil(Math.max(0, Math.min(1, vec[1])) * 254.9);
    const b = Math.ceil(Math.max(0, Math.min(1, vec[2])) * 254.9);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const celestialButtonStyle = {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-sm)',
    transition: 'background 140ms var(--ease-out), border-color 140ms var(--ease-out), transform 140ms var(--ease-out)',
    textTransform: 'none' as const,
    fontFamily: 'var(--font-mono)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
    '&:hover': {
        background: 'var(--bg-hover)',
        borderColor: 'color-mix(in oklab, var(--accent-primary) 45%, var(--border))',
    },
    '&:active': { transform: 'translateY(1px)' },
};

function Rgba() {
    const [vec4, setVec4] = useState<Vec4>([1, 0, 0, 1]);
    const [alphaPercent, setAlphaPercent] = useState(100);
    const [alphaPreview, setAlphaPreview] = useState(1);
    const [showAlpha, setShowAlpha] = useState(true);
    const [rgbaInput, setRgbaInput] = useState('{ 1.000, 0.000, 0.000, 1.000 }');

    const rgbaInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hexColor = useMemo(() => vec4ToHex(vec4), [vec4]);

    const formatVec4 = useMemo(
        () => `{ ${vec4[0].toFixed(6)}, ${vec4[1].toFixed(6)}, ${vec4[2].toFixed(6)}, ${vec4[3].toFixed(6)} }`,
        [vec4],
    );
    const formatRGBA = useMemo(
        () => `{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`,
        [vec4],
    );
    const formatRGB = useMemo(
        () => `{${Math.ceil(vec4[0] * 254.9)}, ${Math.ceil(vec4[1] * 254.9)}, ${Math.ceil(vec4[2] * 254.9)}}`,
        [vec4],
    );

    useEffect(() => {
        setAlphaPercent(Math.round(vec4[3] * 100));
        setAlphaPreview(vec4[3]);
        setRgbaInput(`{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`);
    }, [vec4]);

    const parseRgbaInput = useCallback((input: string): Vec4 | null => {
        const clean = input.replace(/[{}]/g, '').replace(/\s/g, '');
        const values = clean.split(',');
        if (values.length === 4) {
            const [r, g, b, a] = values.map((v) => parseFloat(v));
            if ([r, g, b, a].every((n) => !isNaN(n) && n >= 0 && n <= 1)) {
                return [r, g, b, a];
            }
        }
        return null;
    }, []);

    // Picker commits a hex string; keep current alpha.
    const handleHexChange = useCallback((hex: string) => {
        const clean = hex.startsWith('#') ? hex.slice(1) : hex;
        if (/^[0-9a-fA-F]{6}$/.test(clean)) {
            const r = Number('0x' + clean.substring(0, 2)) / 255;
            const g = Number('0x' + clean.substring(2, 4)) / 255;
            const b = Number('0x' + clean.substring(4, 6)) / 255;
            setVec4((prev) => [r, g, b, prev[3]]);
        }
    }, []);

    const handleColorPickerClick = useCallback((event: MouseEvent) => {
        openColorPicker(event, hexColor, handleHexChange);
    }, [hexColor, handleHexChange]);

    const handleRgbaInputChange = useCallback((value: string) => {
        setRgbaInput(value);
        if (rgbaInputTimeoutRef.current) clearTimeout(rgbaInputTimeoutRef.current);
        rgbaInputTimeoutRef.current = setTimeout(() => {
            const parsed = parseRgbaInput(value);
            if (parsed) setVec4(parsed);
        }, 500);
    }, [parseRgbaInput]);

    const handleAlphaCommit = useCallback((value: number) => {
        setVec4((prev) => [prev[0], prev[1], prev[2], Math.max(0, Math.min(1, value))]);
    }, []);

    const handleReset = useCallback(() => setVec4([1, 0, 0, 1]), []);
    const handleCopyVec4 = useCallback(() => { navigator.clipboard.writeText(formatVec4).catch(() => {}); }, [formatVec4]);

    useEffect(() => () => {
        if (rgbaInputTimeoutRef.current) clearTimeout(rgbaInputTimeoutRef.current);
        cleanupColorPickers();
    }, []);

    return (
        <Box sx={{
            position: 'relative', height: '100%', width: '100%', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            p: { xs: 2, sm: 3 }, boxSizing: 'border-box',
        }}>
            <ColorPickerHost />

            <Box sx={{ flex: 1, display: 'flex', gap: 2, position: 'relative', zIndex: 1 }}>
                {/* Left — Color Selection */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <ColorizeIcon sx={{ color: 'var(--accent-primary)', mr: 1, fontSize: 20 }} />
                        <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                            Color Selection
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box sx={{ position: 'relative' }}>
                            <Box
                                onClick={handleColorPickerClick}
                                sx={{
                                    width: '50px', height: '50px',
                                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer', backgroundColor: hexColor,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                    '&:hover': { transform: 'scale(1.05)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
                                }}
                            />
                            <Box sx={{
                                position: 'absolute', top: -4, right: -4,
                                width: 16, height: 16, backgroundColor: 'var(--accent-primary)', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                            }}>
                                <PaletteIcon sx={{ fontSize: 10, color: '#fff' }} />
                            </Box>
                        </Box>

                        <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 0.5 }}>
                                Selected Color
                            </Typography>
                            <Chip
                                label={hexColor}
                                sx={{
                                    backgroundColor: hexColor, color: 'white',
                                    fontFamily: 'var(--font-mono)', fontWeight: 'bold',
                                    fontSize: '0.9rem', height: 28, px: 1,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                                }}
                            />
                        </Box>

                        <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 0.5 }}>
                                RGBA (0-1)
                            </Typography>
                            <TextField
                                value={rgbaInput}
                                onChange={(e) => handleRgbaInputChange(e.target.value)}
                                placeholder="{ 1.000, 0.000, 0.000, 1.000 }"
                                size="small"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        fontFamily: 'var(--font-mono)', fontSize: '0.9rem',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-sm)',
                                        '& fieldset': { border: 'none' },
                                        '&:hover': { borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, var(--border))' },
                                        '&.Mui-focused fieldset': { border: '1px solid var(--accent-primary)' },
                                    },
                                    '& .MuiInputBase-input': { color: 'var(--text-primary)', padding: '8px 12px' },
                                }}
                            />
                        </Box>

                        <Tooltip title={showAlpha ? 'Hide Alpha' : 'Show Alpha'}>
                            <IconButton
                                onClick={() => setShowAlpha((s) => !s)}
                                size="small"
                                sx={{
                                    color: showAlpha ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    backgroundColor: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                                    '&:hover': { backgroundColor: 'color-mix(in oklab, var(--accent-primary) 18%, transparent)' },
                                }}
                            >
                                {showAlpha ? <VisibilityIcon /> : <VisibilityOffIcon />}
                            </IconButton>
                        </Tooltip>
                    </Box>

                    {showAlpha && (
                        <Fade in={showAlpha}>
                            <Box sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                    <OpacityIcon sx={{ color: 'var(--accent-primary)', mr: 0.5, fontSize: 16 }} />
                                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                                        Alpha: {Math.round(alphaPreview * 100)}% ({alphaPreview.toFixed(3)})
                                    </Typography>
                                </Box>
                                <Slider
                                    value={alphaPreview}
                                    onChange={(_, value) => setAlphaPreview(Number(value))}
                                    onChangeCommitted={(_, value) => handleAlphaCommit(Number(value))}
                                    min={0} max={1} step={0.001}
                                    valueLabelDisplay="auto"
                                    valueLabelFormat={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                                    sx={{
                                        color: 'var(--accent-primary)', height: 6,
                                        '& .MuiSlider-thumb': {
                                            backgroundColor: '#fff', width: 16, height: 16,
                                            border: '2px solid var(--accent-primary)',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                                            '&:hover': { boxShadow: '0 2px 6px rgba(0,0,0,0.35), 0 0 0 6px color-mix(in oklab, var(--accent-primary) 22%, transparent)' },
                                        },
                                        '& .MuiSlider-track': { backgroundColor: 'var(--accent-primary)', height: 6, borderRadius: 999, border: 'none' },
                                        '& .MuiSlider-rail': { backgroundColor: 'var(--bg-tertiary)', height: 6, borderRadius: 999 },
                                    }}
                                />
                            </Box>
                        </Fade>
                    )}

                    <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                        <MuiButton
                            variant="contained" startIcon={<CopyIcon />} onClick={handleCopyVec4} size="small"
                            sx={{ ...celestialButtonStyle, flex: 1, minHeight: 36, fontWeight: 'bold' }}
                        >
                            Copy Vec4
                        </MuiButton>
                        <MuiButton
                            variant="contained" startIcon={<RefreshIcon />} onClick={handleReset} size="small"
                            sx={{ ...celestialButtonStyle, flex: 1, minHeight: 36, fontWeight: 'bold' }}
                        >
                            Reset
                        </MuiButton>
                    </Box>
                </Box>

                {/* Divider */}
                <Box sx={{ width: '1px', background: 'var(--border)', flexShrink: 0, margin: '0 1rem' }} />

                {/* Right — Color Information & Preview */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                    <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2, fontWeight: 'bold' }}>
                        Color Information
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        {[
                            { label: 'Hex Color', value: hexColor },
                            { label: 'RGB (0-255)', value: formatRGB },
                            { label: 'RGBA (0-1)', value: formatRGBA },
                            { label: 'Alpha', value: `${alphaPercent.toFixed(1)}%` },
                        ].map((item) => (
                            <Grid item xs={6} key={item.label}>
                                <Box sx={{ p: 1.5 }}>
                                    <Typography variant="caption" sx={{ color: 'var(--text-muted)', mb: 0.5, display: 'block' }}>
                                        {item.label}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                                        {item.value}
                                    </Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>

                    <Typography variant="h6" sx={{ color: 'var(--text-primary)', mb: 2, fontWeight: 'bold' }}>
                        Color Preview
                    </Typography>

                    <Grid container spacing={2} sx={{ flex: 1 }}>
                        <Grid item xs={6}>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1, fontWeight: 'bold' }}>
                                Solid Color
                            </Typography>
                            <Paper sx={{
                                height: 60, backgroundColor: hexColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 'bold', fontFamily: 'var(--font-mono)',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.35)', fontSize: '0.8rem',
                            }}>
                                {hexColor}
                            </Paper>
                        </Grid>

                        <Grid item xs={6}>
                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1, fontWeight: 'bold' }}>
                                With Alpha
                            </Typography>
                            <Paper sx={{
                                height: 60,
                                background: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                                backgroundSize: '20px 20px',
                                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.25)', position: 'relative', overflow: 'hidden',
                            }}>
                                <Box sx={{
                                    height: '100%', backgroundColor: hexColor, opacity: vec4[3],
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontWeight: 'bold', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                }}>
                                    {alphaPercent.toFixed(1)}%
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Box>
            </Box>
        </Box>
    );
}

export { Rgba };
export default Rgba;
