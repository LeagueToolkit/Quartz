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
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--accent-primary)',
                borderRadius: '4px',
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
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
    style?: React.CSSProperties;
    className?: string;
    /* Optional control rendered inside the input, pinned to the right edge
       (e.g. the trim-names scissor toggle). */
    trailing?: React.ReactNode;
}

export const SearchInput = React.memo(({ initialValue, placeholder, onChange, style = {}, className = '', trailing }: SearchInputProps) => {
    const [localValue, setLocalValue] = useState(initialValue || '');
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

    // Use the app-standard input chrome (.dl-input); callers may still pass a
    // className for layout tweaks. When a trailing control is present, wrap the
    // input so the control can sit inside the field on the right edge.
    const input = (
        <input
            type="text"
            className={`dl-input ${className}`.trim()}
            placeholder={placeholder}
            value={localValue}
            onChange={handleChange}
            onFocus={() => { isFocusedRef.current = true; }}
            onBlur={() => {
                isFocusedRef.current = false;
                lastSyncedValueRef.current = localValue;
            }}
            style={{ flex: 1, minWidth: 0, ...(trailing ? { paddingRight: 34 } : {}), ...style }}
        />
    );

    if (!trailing) return input;

    return (
        <div className="port-search-wrap" style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
            {input}
            <div className="port-search-trailing">{trailing}</div>
        </div>
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
