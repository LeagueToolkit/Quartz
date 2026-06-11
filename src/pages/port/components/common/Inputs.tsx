import React, { useEffect, useRef, useState } from 'react';

interface RenameInputProps {
    initialValue: string;
    onConfirm: (newName: string) => void;
    onCancel: () => void;
    onClick?: (e: React.MouseEvent) => void;
}

export const RenameInput = React.memo(({ initialValue, onConfirm, onCancel, onClick }: RenameInputProps) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm(localValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    const handleBlur = () => {
        if (localValue && localValue.trim() !== '' && localValue !== initialValue) onConfirm(localValue);
        else onCancel();
    };

    return (
        <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={onClick}
            style={{
                flex: 1,
                minWidth: 0,
                padding: '4px 8px',
                background: 'var(--surface-2)',
                border: '1px solid var(--accent)',
                borderRadius: '4px',
                color: 'var(--accent)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.95rem',
                fontWeight: 600,
                outline: 'none',
            }}
        />
    );
});

interface SearchInputProps {
    initialValue?: string;
    placeholder?: string;
    onChange: (v: string) => void;
    accentVar?: string;
    style?: React.CSSProperties;
    className?: string;
}

export const SearchInput = React.memo(({ initialValue, placeholder, onChange, accentVar = 'var(--accent)', style = {}, className = '' }: SearchInputProps) => {
    const [localValue, setLocalValue] = useState(initialValue || '');
    const [isFocused, setIsFocused] = useState(false);
    const isFocusedRef = useRef(false);
    const lastSyncedValueRef = useRef(initialValue || '');

    useEffect(() => {
        const propValue = initialValue || '';
        if (propValue !== lastSyncedValueRef.current && !isFocusedRef.current) {
            setLocalValue(propValue);
            lastSyncedValueRef.current = propValue;
        }
    }, [initialValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        onChange(newValue);
    };

    return (
        <input
            type="text"
            className={className}
            placeholder={placeholder}
            value={localValue}
            onChange={handleChange}
            onFocus={() => {
                isFocusedRef.current = true;
                setIsFocused(true);
            }}
            onBlur={() => {
                isFocusedRef.current = false;
                setIsFocused(false);
                lastSyncedValueRef.current = localValue;
            }}
            style={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '10px 18px',
                background: isFocused ? `color-mix(in srgb, ${accentVar} 18%, transparent)` : `color-mix(in srgb, ${accentVar} 10%, transparent)`,
                border: isFocused ? `1px solid color-mix(in srgb, ${accentVar} 75%, transparent)` : `1px solid color-mix(in srgb, ${accentVar} 35%, transparent)`,
                borderRadius: '10px',
                color: accentVar,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isFocused
                    ? `0 0 15px color-mix(in srgb, ${accentVar} 28%, transparent), inset 0 1px 2px rgba(0,0,0,0.16)`
                    : 'inset 0 1px 2px rgba(0,0,0,0.12)',
                ...style,
            }}
        />
    );
});

interface MemoizedInputProps {
    value: string | number;
    onChange: (e: { target: { value: string } }) => void;
    type?: string;
    placeholder?: string;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    style?: React.CSSProperties;
    onKeyPress?: (e: React.KeyboardEvent) => void;
    onFocusStyle?: boolean;
}

/* Defers onChange to blur to avoid re-renders while typing. */
export const MemoizedInput = React.memo(({ value, onChange, type = 'text', placeholder = '', min, max, step, style = {}, onKeyPress }: MemoizedInputProps) => {
    const [localValue, setLocalValue] = useState<string>(value !== undefined && value !== null ? String(value) : '');
    const valueRef = useRef(String(value ?? ''));
    const isFocusedRef = useRef(false);

    useEffect(() => {
        const propValue = value !== undefined && value !== null ? String(value) : '';
        if (propValue !== valueRef.current && !isFocusedRef.current) {
            setLocalValue(propValue);
            valueRef.current = propValue;
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setLocalValue(v);
        valueRef.current = v;
    };

    const handleBlur = () => {
        isFocusedRef.current = false;
        if (valueRef.current !== String(value ?? '')) onChange({ target: { value: valueRef.current } });
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (onKeyPress) onKeyPress(e);
        if (e.key === 'Enter') handleBlur();
    };

    return (
        <input
            type={type}
            value={localValue}
            onChange={handleChange}
            onFocus={() => {
                isFocusedRef.current = true;
            }}
            onBlur={handleBlur}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            style={style}
        />
    );
});
