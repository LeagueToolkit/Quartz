import React, { useEffect, useRef, useState } from 'react';
import { TextField } from '@mui/material';

const DebouncedTextField = React.memo(function DebouncedTextField({
  value,
  onValueChange,
  debounceMs = 150,
  onEnter,
  ...textFieldProps
}) {
  const [localValue, setLocalValue] = useState(value || '');
  const valueRef = useRef(value || '');
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
    valueRef.current = value || '';
  }, [value]);

  const flush = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (valueRef.current !== value) {
      onValueChange(valueRef.current);
    }
  };

  const handleChange = (e) => {
    const nextValue = e.target.value;
    setLocalValue(nextValue);
    valueRef.current = nextValue;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      onValueChange(nextValue);
    }, debounceMs);
  };

  const handleBlur = () => {
    flush();
  };

  const handleKeyDown = (e) => {
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
