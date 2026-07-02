import React, { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, AlertTriangle, Eye, EyeOff, ChevronDown } from 'lucide-react';

/* Ported 1:1 from the original Quartz SettingsPrimitives — plain React +
   inline styles driven by the theme CSS variables. */

/* Shared card surface used by every settings section — matches the Design Lab
   toggle rows (--bg-tertiary + --border). */
export const cardSurface: CSSProperties = {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
};

/* Celestial-style grid: separate bordered cards, two per row (wraps to one on
   narrow widths). */
export const CardList = ({ children }: { children: ReactNode }) => (
    <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '10px',
    }}>{children}</div>
);

/* A single setting card — reuses the Design Lab's `.dl-toggle-row` chrome so
   settings match the rest of the app. Optional accent `icon`, label/description
   left, `control` right. `fullWidth` spans every column in a CardList grid.
   `onActivate` makes the whole row clickable (e.g. to toggle its switch); the
   control keeps its own click so tapping it directly doesn't double-fire. */
export const CardRow = ({ icon, label, description, control, fullWidth, onActivate }: {
    icon?: ReactNode; label: string; description?: string; control: ReactNode; fullWidth?: boolean;
    onActivate?: () => void;
}) => (
    <div
        className="dl-toggle-row"
        onClick={onActivate}
        style={{
            cursor: onActivate ? 'pointer' : undefined,
            ...(fullWidth ? { gridColumn: '1 / -1' } : {}),
        }}
    >
        {icon && (
            <span style={{ color: 'var(--accent-primary)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
        )}
        <div className="dl-toggle-row__text">
            <span className="dl-toggle-row__label">{label}</span>
            {description && <span className="dl-toggle-row__desc">{description}</span>}
        </div>
        <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>{control}</div>
    </div>
);

export const FormGroup = ({ label, icon, children }: {
    label: string; icon?: ReactNode; children: ReactNode;
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Celestial-style section header: optional accent-tinted icon tile +
           uppercase, letter-spaced label with a trailing divider rule. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {icon && (
                <span style={{
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                    width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
                    color: 'var(--accent-primary)',
                    background: 'color-mix(in srgb, var(--accent-primary) 16%, transparent)',
                }}>
                    {icon}
                </span>
            )}
            <span style={{
                fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--accent-primary) 70%, white 28%)', whiteSpace: 'nowrap',
            }}>
                {label}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>
        {children}
    </div>
);

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; wrapperStyle?: CSSProperties };

export const Input = ({ icon, wrapperStyle, className, style, ...props }: InputProps) => (
    <div className={icon ? 'dl-search' : undefined} style={{ position: 'relative', width: '100%', ...wrapperStyle }}>
        {icon && <span className="dl-icon">{icon}</span>}
        <input {...props} className={`dl-input ${className ?? ''}`} style={style} />
    </div>
);

export interface SelectOption { value: string; label?: string; fontFamily?: string; }

export const CustomSelect = ({ value, onChange, options, icon, disabled, placeholder = 'Select...' }: {
    value: string; onChange: (v: string) => void; options: SelectOption[]; icon?: ReactNode; disabled?: boolean; placeholder?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [isOpen]);

    const selected = options.find((o) => o.value === value);

    return (
        <div ref={containerRef} style={{ position: 'relative', opacity: disabled ? 0.6 : 1 }}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: icon ? '10px 32px 10px 36px' : '10px 32px 10px 12px',
                    background: 'var(--bg-tertiary)',
                    border: isOpen ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', textAlign: 'left', position: 'relative',
                }}
            >
                {icon && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                        {icon}
                    </div>
                )}
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selected ? (selected.label || selected.value) : placeholder}
                </span>
                <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', color: 'var(--text-muted)', pointerEvents: 'none', transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }} />
            </button>

            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: 'var(--dl-shadow-md)', zIndex: 1000, maxHeight: '250px', overflowY: 'auto' }}>
                    {options.map((option) => {
                        const isSel = value === option.value;
                        return (
                        <div
                            key={option.value}
                            onClick={() => { onChange(option.value); setIsOpen(false); }}
                            style={{
                                padding: '10px 12px', cursor: 'pointer', fontSize: '13px',
                                color: isSel ? 'var(--accent-primary)' : 'var(--text-primary)',
                                background: isSel ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                fontFamily: option.fontFamily || 'inherit', borderBottom: '1px solid color-mix(in oklab, var(--border) 60%, transparent)',
                            }}
                            onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span>{option.label || option.value}</span>
                            {isSel && <Check size={14} />}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode; variant?: 'primary' | 'secondary'; fullWidth?: boolean;
};

export const Button = ({ icon, children, variant = 'primary', fullWidth, className, style, disabled, ...props }: ButtonProps) => (
    <button
        {...props}
        disabled={disabled}
        className={`dl-btn ${variant === 'primary' ? 'dl-btn--primary' : 'dl-btn--secondary'} ${className ?? ''}`}
        style={{ width: fullWidth ? '100%' : undefined, ...style }}
    >
        {icon && <span className="dl-icon">{icon}</span>}
        {children && <span>{children}</span>}
    </button>
);

export const InputWithButton = ({ buttonIcon, buttonText, onButtonClick, ...props }: InputProps & {
    buttonIcon?: ReactNode; buttonText: string; onButtonClick: () => void;
}) => (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
        <Input {...props} wrapperStyle={{ flex: 1 }} />
        <Button icon={buttonIcon} variant="secondary" onClick={onButtonClick}>{buttonText}</Button>
    </div>
);

export const InputWithToggle = ({ showValue, onToggle, ...props }: InputProps & { showValue: boolean; onToggle: () => void }) => (
    <div style={{ position: 'relative' }}>
        <Input {...props} />
        <button
            onClick={onToggle}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--accent-2)', display: 'flex', alignItems: 'center' }}
        >
            {showValue ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
    </div>
);

/* Bare toggle switch — no text label/padding. Wrapped in a <label> so the whole
   control area toggles the input natively. Used as a CardRow control. */
export const Switch = ({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <label className="dl-toggle" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="dl-toggle__track" />
        <span className="dl-toggle__thumb" />
    </label>
);

export const ToggleSwitch = ({ label, checked, onChange, compact }: {
    label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean;
}) => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer', padding: compact ? '6px 0' : '10px 0', userSelect: 'none' }}>
        {label && <span style={{ fontSize: compact ? '12px' : '13px', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>}
        <Switch checked={checked} onChange={onChange} />
    </label>
);

export const StatusBadge = ({ status, text }: { status: 'success' | 'warning'; text: string }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: status === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${status === 'success' ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`, borderRadius: '6px', fontSize: '12px', color: status === 'success' ? '#4ade80' : '#fbbf24' }}>
        {status === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
        {text}
    </div>
);
