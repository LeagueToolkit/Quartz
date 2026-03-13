import React, { useState, useEffect, useRef } from 'react';

// Separate component for rename input to prevent full re-renders on typing
export const RenameInput = React.memo(({ initialValue, onConfirm, onCancel, onClick }) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm(localValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    const handleBlur = () => {
        if (localValue && localValue.trim() !== '' && localValue !== initialValue) {
            onConfirm(localValue);
        } else {
            onCancel();
        }
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
                fontWeight: '600',
                outline: 'none'
            }}
        />
    );
});

// Separate component for search input to prevent full re-renders on typing
export const SearchInput = React.memo(({
    initialValue,
    placeholder,
    onChange,
    accentVar = 'var(--accent)',
    style = {},
    className = "",
    showIcon = false
}) => {
    const [localValue, setLocalValue] = useState(initialValue || '');
    const [isFocused, setIsFocused] = useState(false);
    const isFocusedRef = useRef(false);
    const lastSyncedValueRef = useRef(initialValue || '');

    // Sync with external value changes (like clearing) but only when not focused
    // This prevents overwriting user input during typing
    useEffect(() => {
        const propValue = initialValue || '';
        if (propValue !== lastSyncedValueRef.current && !isFocusedRef.current) {
            setLocalValue(propValue);
            lastSyncedValueRef.current = propValue;
        }
    }, [initialValue]);

    const handleChange = (e) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        onChange(newValue);
    };

    const handleFocus = () => {
        isFocusedRef.current = true;
        setIsFocused(true);
    };

    const handleBlur = () => {
        isFocusedRef.current = false;
        setIsFocused(false);
        lastSyncedValueRef.current = localValue;
    };

    const resolvedPlaceholder = showIcon ? `🔍 ${placeholder}` : placeholder;

    return (
        <input
            type="text"
            className={className}
            placeholder={resolvedPlaceholder}
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '10px 18px',
                background: isFocused
                    ? `color-mix(in srgb, ${accentVar} 18%, transparent)`
                    : `color-mix(in srgb, ${accentVar} 10%, transparent)`,
                border: isFocused
                    ? `1px solid color-mix(in srgb, ${accentVar} 75%, transparent)`
                    : `1px solid color-mix(in srgb, ${accentVar} 35%, transparent)`,
                borderRadius: '10px',
                color: accentVar,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isFocused
                    ? `0 0 15px color-mix(in srgb, ${accentVar} 28%, transparent), inset 0 1px 2px rgba(0,0,0,0.16)`
                    : 'inset 0 1px 2px rgba(0,0,0,0.12)',
                ...style
            }}
        />
    );
});

// Simple memoized input component for preventing re-renders on typing
export const MemoizedInput = React.memo(({
    value,
    onChange,
    type = 'text',
    placeholder = '',
    min,
    max,
    style = {},
    onKeyPress,
    autoFocus = false
}) => {
    const [localValue, setLocalValue] = useState(value || '');
    const valueRef = useRef(value || '');
    const inputRef = useRef(null);
    const isFocusedRef = useRef(false);

    // Only sync with prop value when it actually changes AND input is not focused
    // This prevents overwriting user input during typing
    useEffect(() => {
        const propValue = value || '';
        const currentValue = valueRef.current;

        // Only update if:
        // 1. The prop value actually changed
        // 2. AND the input is not currently focused (user is not typing)
        // 3. AND the prop value is different from what we have locally
        if (propValue !== currentValue && !isFocusedRef.current) {
            setLocalValue(propValue);
            valueRef.current = propValue;
        }
    }, [value]);

    const handleChange = (e) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        valueRef.current = newValue;
        // Don't call onChange immediately - only update local state
        // Parent will get the value on blur or when needed
    };

    const handleFocus = () => {
        isFocusedRef.current = true;
    };

    const handleBlur = () => {
        isFocusedRef.current = false;
        // Sync with parent on blur
        if (valueRef.current !== value) {
            const syntheticEvent = {
                target: { value: valueRef.current }
            };
            onChange(syntheticEvent);
        }
    };

    const handleKeyPress = (e) => {
        if (onKeyPress) {
            onKeyPress(e);
        }
        // Also sync on Enter
        if (e.key === 'Enter') {
            handleBlur();
        }
    };

    return (
        <input
            ref={inputRef}
            type={type}
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            min={min}
            max={max}
            autoFocus={autoFocus}
            style={style}
        />
    );
});
