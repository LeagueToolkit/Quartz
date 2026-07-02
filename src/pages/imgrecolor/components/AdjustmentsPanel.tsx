import { Box, Typography, Slider, Checkbox } from '@mui/material';
import { sliderSx } from './sliderSx';

interface AdjustSliderProps {
    label: string;
    value: number;
    display: string;
    min: number;
    max: number;
    disabled: boolean;
    onChange: (v: number) => void;
}

/* One labeled adjustment slider (label + value chip + track). Replaces the four
   near-identical copies the page used to inline. */
function AdjustSlider({ label, value, display, min, max, disabled, onChange }: AdjustSliderProps) {
    return (
        <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Typography sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    {label}
                </Typography>
                <Typography sx={{
                    color: 'var(--accent-primary)', fontWeight: 600, fontSize: '12px', fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '3px 7px',
                    borderRadius: 'var(--radius-sm)', minWidth: '46px', textAlign: 'center',
                }}>
                    {display}
                </Typography>
            </Box>
            <Slider value={value} onChange={(_, v) => onChange(v as number)} min={min} max={max} disabled={disabled} sx={sliderSx} />
        </Box>
    );
}

export interface AdjustmentsPanelProps {
    disabled: boolean;
    hueShift: number; setHueShift: (v: number) => void;
    saturationBoost: number; setSaturationBoost: (v: number) => void;
    lightnessAdjust: number; setLightnessAdjust: (v: number) => void;
    opacity: number; setOpacity: (v: number) => void;
    preserveOriginalColors: boolean; setPreserveOriginalColors: (v: boolean) => void;
}

/* Left-side Color Adjustments panel — Upscale-sidebar styling (blue uppercase
   header + divider). */
export function AdjustmentsPanel(props: AdjustmentsPanelProps) {
    const { disabled, preserveOriginalColors, setPreserveOriginalColors } = props;
    return (
        <>
            {/* Header — larger than the slider labels, accent-tinted, with a divider rule. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <span style={{
                    fontSize: '15px', fontWeight: 800, letterSpacing: '0.04em',
                    color: 'color-mix(in srgb, var(--accent-primary) 75%, white 22%)', whiteSpace: 'nowrap',
                }}>
                    Color Adjustments
                </span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <AdjustSlider label="Target Hue" value={props.hueShift} display={`${props.hueShift}°`} min={0} max={360} disabled={disabled} onChange={props.setHueShift} />
            <AdjustSlider label="Saturation" value={props.saturationBoost} display={`${props.saturationBoost}%`} min={0} max={100} disabled={disabled} onChange={props.setSaturationBoost} />
            <AdjustSlider label="Lightness" value={props.lightnessAdjust} display={`${props.lightnessAdjust}%`} min={-100} max={100} disabled={disabled} onChange={props.setLightnessAdjust} />
            <AdjustSlider label="Opacity" value={props.opacity} display={`${props.opacity}%`} min={0} max={100} disabled={disabled} onChange={props.setOpacity} />

            <Box sx={{ marginBottom: '20px', display: 'flex', alignItems: 'center', paddingLeft: '4px' }}>
                <Checkbox
                    checked={preserveOriginalColors}
                    onChange={(e) => setPreserveOriginalColors(e.target.checked)}
                    sx={{
                        color: 'var(--text-muted)', padding: '4px', marginRight: '4px',
                        '&.Mui-checked': { color: 'var(--accent-primary)' },
                        '&:hover': { background: 'var(--bg-hover)' },
                    }}
                />
                <Typography
                    sx={{ color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setPreserveOriginalColors(!preserveOriginalColors)}
                >
                    Preserve original colors
                </Typography>
            </Box>
        </>
    );
}
