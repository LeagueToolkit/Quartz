import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

/* Themed checkbox button (adapted from the Celestial Checkbox for Quartz tokens).
   Renders box + check + label + optional description. Two layouts:
   - "boxed": bordered square, check shown when checked
   - "filled": just the check glyph in the row, no surrounding box
   `accent` picks the check color: 'accent' (default), 'success', 'danger'. */

type CheckboxAccent = 'accent' | 'success' | 'danger';

interface CheckboxProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    accent?: CheckboxAccent;
    variant?: 'boxed' | 'filled';
    disabled?: boolean;
    title?: string;
    style?: CSSProperties;
}

const accentVar: Record<CheckboxAccent, string> = {
    accent: 'var(--accent-primary)',
    success: 'var(--color-success)',
    danger: 'var(--color-danger)',
};

export function Checkbox({
    label, description, checked, onChange,
    accent = 'accent', variant = 'boxed', disabled, title, style,
}: CheckboxProps) {
    const color = accentVar[accent];
    const box: CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, flexShrink: 0,
        borderRadius: 4,
        border: `1px solid ${checked ? color : 'var(--border-strong)'}`,
        background: checked ? `color-mix(in oklab, ${color} 16%, transparent)` : 'transparent',
        transition: 'border-color var(--motion-fast), background var(--motion-fast)',
    };

    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                textAlign: 'left', background: 'none', border: 'none', padding: 0,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                fontFamily: 'inherit',
                ...style,
            }}
        >
            {variant === 'boxed' ? (
                <span style={box}>{checked && <Check size={12} color={color} strokeWidth={3} />}</span>
            ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                    {checked
                        ? <Check size={14} color={color} strokeWidth={3} />
                        : <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--border-strong)' }} />}
                </span>
            )}
            {description ? (
                <span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{description}</span>
                </span>
            ) : (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
            )}
        </button>
    );
}
