import { Slider } from '@mui/material';
import { Switch as DlSwitch } from '@/components/settings/primitives';
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

/* One labeled adjustment slider (label + value chip + track), Design Lab styled
   via .imgrecolor-adjust__* classes. Replaces the four inlined MUI copies. */
function AdjustSlider({ label, value, display, min, max, disabled, onChange }: AdjustSliderProps) {
    return (
        <div className="imgrecolor-adjust__row">
            <div className="imgrecolor-adjust__row-top">
                <span className="imgrecolor-adjust__label">{label}</span>
                <span className="imgrecolor-adjust__value">{display}</span>
            </div>
            <Slider value={value} onChange={(_, v) => onChange(v as number)} min={min} max={max} disabled={disabled} sx={sliderSx} />
        </div>
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

/* Left-side Color Adjustments panel — Design Lab sidebar styling (uppercase
   tracked section header + hairline rule, chip'd value readouts, DlSwitch). */
export function AdjustmentsPanel(props: AdjustmentsPanelProps) {
    const { disabled, preserveOriginalColors, setPreserveOriginalColors } = props;
    return (
        <>
            <div className="imgrecolor-adjust__head">
                <span>Color Adjustments</span>
                <div className="rule" />
            </div>

            <AdjustSlider label="Target Hue" value={props.hueShift} display={`${props.hueShift}°`} min={0} max={360} disabled={disabled} onChange={props.setHueShift} />
            <AdjustSlider label="Saturation" value={props.saturationBoost} display={`${props.saturationBoost}%`} min={0} max={100} disabled={disabled} onChange={props.setSaturationBoost} />
            <AdjustSlider label="Lightness" value={props.lightnessAdjust} display={`${props.lightnessAdjust}%`} min={-100} max={100} disabled={disabled} onChange={props.setLightnessAdjust} />
            <AdjustSlider label="Opacity" value={props.opacity} display={`${props.opacity}%`} min={0} max={100} disabled={disabled} onChange={props.setOpacity} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                <DlSwitch checked={preserveOriginalColors} onChange={setPreserveOriginalColors} disabled={disabled} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, userSelect: 'none' }}>
                    Preserve original colors
                </span>
            </label>
        </>
    );
}
