import React, { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, AlertTriangle, Eye, EyeOff, ChevronDown } from 'lucide-react';

/* Ported 1:1 from the original Quartz SettingsPrimitives — plain React +
   inline styles driven by the theme CSS variables. */

export const FormGroup = ({ label, description, children }: {
    label: string; description?: string; children: ReactNode;
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--settings-subtle-ink, var(--accent-2))', display: 'block' }}>
                {label}
            </label>
            {description && (
                <span style={{ fontSize: '11px', color: 'var(--settings-muted, var(--text))', display: 'block', marginTop: '2px' }}>
                    {description}
                </span>
            )}
        </div>
        {children}
    </div>
);

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; wrapperStyle?: CSSProperties };

export const Input = ({ icon, wrapperStyle, style, ...props }: InputProps) => (
    <div style={{ position: 'relative', ...wrapperStyle }}>
        {icon && (
            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-2)', pointerEvents: 'none' }}>
                {icon}
            </div>
        )}
        <input
            {...props}
            style={{
                width: '100%',
                padding: icon ? '10px 12px 10px 36px' : '10px 12px',
                background: 'var(--settings-control-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--settings-control-border, rgba(255, 255, 255, 0.1))',
                borderRadius: '6px',
                color: 'var(--settings-ink, var(--accent))',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'all 0.2s ease',
                ...style,
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--settings-control-border, rgba(255, 255, 255, 0.1))'; }}
        />
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
                    background: 'var(--settings-control-bg, rgba(255, 255, 255, 0.03))',
                    border: isOpen ? '1px solid var(--accent)' : '1px solid var(--settings-control-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '6px',
                    color: 'var(--settings-ink, var(--accent))',
                    fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', textAlign: 'left', position: 'relative',
                }}
            >
                {icon && (
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-2)', pointerEvents: 'none' }}>
                        {icon}
                    </div>
                )}
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selected ? (selected.label || selected.value) : placeholder}
                </span>
                <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', color: 'var(--accent-2)', pointerEvents: 'none', transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }} />
            </button>

            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#121212', border: '1px solid var(--accent)', borderRadius: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 1000, maxHeight: '250px', overflowY: 'auto' }}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            onClick={() => { onChange(option.value); setIsOpen(false); }}
                            style={{
                                padding: '10px 12px', cursor: 'pointer', fontSize: '13px',
                                color: value === option.value ? 'var(--accent)' : 'var(--text)',
                                background: value === option.value ? 'rgba(255,255,255,0.05)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                fontFamily: option.fontFamily || 'inherit', borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                            onMouseEnter={(e) => { if (value !== option.value) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                            onMouseLeave={(e) => { if (value !== option.value) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span>{option.label || option.value}</span>
                            {value === option.value && <Check size={14} />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode; variant?: 'primary' | 'secondary'; fullWidth?: boolean;
};

export const Button = ({ icon, children, variant = 'primary', fullWidth, style, disabled, ...props }: ButtonProps) => (
    <button
        {...props}
        disabled={disabled}
        style={{
            padding: '10px 16px',
            background: variant === 'primary' ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
            color: variant === 'primary' ? 'var(--bg)' : 'var(--settings-subtle-ink, var(--accent-2))',
            border: variant === 'primary' ? 'none' : '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.2s ease', width: fullWidth ? '100%' : 'auto', whiteSpace: 'nowrap',
            opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style,
        }}
        onMouseEnter={(e) => {
            if (variant === 'primary') e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 90%, black)';
            else { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--accent)'; }
        }}
        onMouseLeave={(e) => {
            if (variant === 'primary') e.currentTarget.style.background = 'var(--accent)';
            else { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }
        }}
    >
        {icon}{children}
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

export const ToggleSwitch = ({ label, checked, onChange, compact }: {
    label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean;
}) => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer', padding: compact ? '6px 0' : '10px 0', userSelect: 'none' }}>
        {label && <span style={{ fontSize: compact ? '12px' : '13px', color: 'var(--text)', flex: 1 }}>{label}</span>}
        <div
            onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
            style={{
                width: '44px', height: '24px',
                background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                borderRadius: '12px', position: 'relative', flexShrink: 0,
                transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                border: checked ? 'none' : '1px solid rgba(255,255,255,0.15)',
                boxShadow: checked ? '0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)' : 'inset 0 2px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
            }}
        >
            <div style={{ width: '18px', height: '18px', background: checked ? '#fff' : 'rgba(255,255,255,0.7)', borderRadius: '50%', position: 'absolute', top: '3px', left: checked ? '23px' : '3px', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
        </div>
    </label>
);

export const ThemeCard = ({ name, desc, selected, onClick }: {
    name: string; desc: string; selected: boolean; onClick: () => void;
}) => (
    <button
        onClick={onClick}
        style={{
            padding: '12px',
            background: selected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left', fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; } }}
        onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } }}
    >
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--settings-ink, var(--accent))', marginBottom: '4px' }}>{name}</div>
        <div style={{ fontSize: '11px', color: 'var(--settings-muted, var(--accent-2))' }}>{desc}</div>
    </button>
);

export const StatusBadge = ({ status, text }: { status: 'success' | 'warning'; text: string }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: status === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${status === 'success' ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`, borderRadius: '6px', fontSize: '12px', color: status === 'success' ? '#4ade80' : '#fbbf24' }}>
        {status === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
        {text}
    </div>
);
