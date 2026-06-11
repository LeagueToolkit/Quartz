import React, { useEffect, useRef, useState } from 'react';
import { TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

interface DebouncedTextFieldProps extends Omit<TextFieldProps, 'value' | 'onChange'> {
    value: string;
    onValueChange: (value: string) => void;
    debounceMs?: number;
    onEnter?: () => void;
}

const DebouncedTextField = React.memo(function DebouncedTextField({
    value,
    onValueChange,
    debounceMs = 150,
    onEnter,
    ...textFieldProps
}: DebouncedTextFieldProps) {
    const [localValue, setLocalValue] = useState(value || '');
    const valueRef = useRef(value || '');
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /* Tracks the most recent value we emitted upward. Used to filter out
       prop "echoes" — when our own onValueChange triggers a parent re-render
       and the same value comes back through `value`, we must NOT overwrite
       localValue, or we erase characters the user typed in the meantime. */
    const lastEmittedRef = useRef(value || '');

    useEffect(() => {
        const incoming = value || '';
        // Skip echoes of our own commits.
        if (incoming === lastEmittedRef.current) return;
        /* Skip while the user is mid-edit (debounce pending) — flushing later
           will reconcile, and accepting the prop now would clobber typing. */
        if (debounceTimeoutRef.current) return;
        setLocalValue(incoming);
        valueRef.current = incoming;
        lastEmittedRef.current = incoming;
    }, [value]);

    const emit = (next: string) => {
        lastEmittedRef.current = next;
        onValueChange(next);
    };

    const flush = () => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }
        if (valueRef.current !== lastEmittedRef.current) {
            emit(valueRef.current);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        setLocalValue(nextValue);
        valueRef.current = nextValue;

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            debounceTimeoutRef.current = null;
            emit(valueRef.current);
        }, debounceMs);
    };

    const handleBlur = () => {
        flush();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            flush();
            if (onEnter) onEnter();
        }
    };

    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    return (
        <TextField
            size="small"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            {...textFieldProps}
        />
    );
});

export default DebouncedTextField;
