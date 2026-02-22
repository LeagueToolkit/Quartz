import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';

const identityMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const clampFinite = (v) => (Number.isFinite(v) ? v : 0);

// Memoized input that defers onChange to blur to avoid re-renders while typing
const MemoizedInput = React.memo(({
  value,
  onChange,
  type = 'text',
  placeholder = '',
  step,
  style = {},
}) => {
  const [localValue, setLocalValue] = useState(value ?? '');
  const valueRef = useRef(value ?? '');
  const isFocusedRef = useRef(false);

  useEffect(() => {
    const propValue = value ?? '';
    if (propValue !== valueRef.current && !isFocusedRef.current) {
      setLocalValue(propValue);
      valueRef.current = propValue;
    }
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    valueRef.current = newValue;
  };

  const handleFocus = () => { isFocusedRef.current = true; };
  const handleBlur = () => {
    isFocusedRef.current = false;
    if (valueRef.current !== value) {
      onChange({ target: { value: valueRef.current } });
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      step={step}
      style={{
        width: '100%',
        height: '34px',
        padding: '0',
        background: 'rgba(0,0,0,0.35)',
        color: 'var(--accent)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        fontSize: '0.82rem',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center',
        outline: 'none',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        cursor: 'text',
        ...style
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
      }}
      onMouseLeave={(e) => {
        if (!isFocusedRef.current) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
        }
      }}
    />
  );
});

const MatrixEditorModal = ({ open, initialMatrix, onApply, onClose }) => {
  const init = useMemo(() => (Array.isArray(initialMatrix) && initialMatrix.length >= 16 ? initialMatrix.slice(0, 16) : identityMatrix.slice()), [initialMatrix]);
  const [values, setValues] = useState(init);

  useEffect(() => {
    if (open) setValues(init);
  }, [open, init]);

  if (!open) return null;

  const setPreset = (arr) => setValues(arr.slice(0, 16));

  const handleChange = (idx, v) => {
    const next = values.slice();
    next[idx] = clampFinite(parseFloat(v));
    setValues(next);
  };

  const scalePreset = (s) => {
    const next = values.slice();
    next[0] = s; // X
    next[5] = s; // Y
    next[10] = s; // Z
    setValues(next);
  };

  const mirrorXZ = () => {
    const m = values.slice();
    m[0] = -Math.abs(m[0]);
    m[10] = -Math.abs(m[10]);
    setValues(m);
  };

  /* ── shared button tokens ── */
  const btnBase = {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    outline: 'none',
    userSelect: 'none',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      {/* backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 480,
          display: 'flex', flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px rgba(var(--accent-rgb),0.08)',
          overflow: 'hidden',
          animation: 'modalEnter 0.3s ease-out',
        }}
      >
        <style>
          {`
            @keyframes modalEnter {
              from { opacity: 0; transform: scale(0.95) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            /* Hide number spinners */
            input[type=number]::-webkit-inner-spin-button,
            input[type=number]::-webkit-outer-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            input[type=number] {
              -moz-appearance: textfield;
            }
          `}
        </style>

        {/* shimmer bar */}
        <div style={{
          height: 3, flexShrink: 0,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(var(--accent-rgb), 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
              </svg>
            </div>
            <h2 style={{
              margin: 0,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.9rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 700,
              color: 'var(--text)',
            }}>Matrix Editor</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer', transition: 'all 0.22s ease', outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
              e.currentTarget.style.color = 'var(--accent2)';
              e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >{'\u2715'}</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--accent2)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>4×4 Transform Matrix</div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase'
            }}>Row-Major Order</div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            padding: 16,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
          }}>
            {values.map((val, i) => (
              <MemoizedInput
                key={i}
                type="number"
                step="0.001"
                value={val}
                onChange={(e) => handleChange(i, e.target.value)}
              />
            ))}
          </div>

          {/* Preset Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Identity', onClick: () => setPreset(identityMatrix) },
              { label: 'Scale 2×', onClick: () => scalePreset(2) },
              { label: 'Scale 0.5×', onClick: () => scalePreset(0.5) },
              { label: 'Mirror XZ', onClick: mirrorXZ },
            ].map(p => (
              <button
                key={p.label}
                onClick={p.onClick}
                style={{
                  ...btnBase,
                  background: 'rgba(255,255,255,0.04)',
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.7rem',
                  padding: '6px 12px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                }}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            onClick={() => onApply(values.slice(0, 16))}
            style={{
              ...btnBase,
              background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
              borderColor: 'color-mix(in srgb, var(--accent2), transparent 55%)',
              color: 'var(--accent2)',
              padding: '10px 24px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
              e.currentTarget.style.boxShadow = '0 0 20px color-mix(in srgb, var(--accent2), transparent 60%)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 35%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 88%)';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 55%)';
            }}
          >
            Apply Matrix
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatrixEditorModal;
