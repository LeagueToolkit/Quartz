import React from 'react';
import { Warning as WarningIcon, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';

/* ── shared button tokens ── */
const btnBase = {
  padding: '7px 18px',
  borderRadius: 6,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.22s ease',
  outline: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: '0.85rem',
  fontFamily: 'JetBrains Mono, monospace',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 34,
};

// Memoized input — defers onChange to blur to avoid re-renders while typing
const MemoizedInput = React.memo(({ value, onChange, type = 'text', placeholder = '', min, max, step, style = {} }) => {
  const [localValue, setLocalValue] = React.useState(value || '');
  const valueRef = React.useRef(value || '');
  const isFocusedRef = React.useRef(false);

  React.useEffect(() => {
    const propValue = value || '';
    if (propValue !== valueRef.current && !isFocusedRef.current) {
      setLocalValue(propValue);
      valueRef.current = propValue;
    }
  }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setLocalValue(v);
    valueRef.current = v;
  };

  const handleFocus = (e) => {
    isFocusedRef.current = true;
    e.target.style.borderColor = 'var(--accent2)';
    e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent2), transparent 80%)';
  };

  const handleBlur = (e) => {
    isFocusedRef.current = false;
    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
    e.target.style.boxShadow = 'none';
    if (valueRef.current !== value) onChange({ target: { value: valueRef.current } });
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      style={{ ...inputStyle, ...style }}
    />
  );
});

const ChildParticleModal = ({
  open,
  onClose,
  isEdit = false,
  targetSystem, // { key, name }
  selectedChildSystem,
  setSelectedChildSystem,
  emitterName,
  setEmitterName,
  rate,
  setRate,
  lifetime,
  setLifetime,
  bindWeight,
  setBindWeight,
  timeBeforeFirstEmission,
  setTimeBeforeFirstEmission,
  translationOverrideX,
  setTranslationOverrideX,
  translationOverrideY,
  setTranslationOverrideY,
  translationOverrideZ,
  setTranslationOverrideZ,
  isSingle,
  setIsSingle,
  availableSystems,
  onConfirm,
}) => {
  if (!open) return null;

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
          width: '100%', maxWidth: 540,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px rgba(var(--accent-rgb),0.08)',
          overflow: 'hidden',
        }}
      >
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
              background: 'rgba(var(--accent-rgb), 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isEdit ? <EditIcon sx={{ color: 'var(--accent)', fontSize: 18 }} /> : <AddIcon sx={{ color: 'var(--accent)', fontSize: 18 }} />}
            </div>
            <h2 style={{
              margin: 0,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.95rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 700,
              color: 'var(--text)',
            }}>
              {isEdit ? 'Edit Child Particle' : 'Add Child Particle'}
            </h2>
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
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
            }}
          >{'\u2715'}</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* info labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.45)',
            }}>
              Parent System: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{targetSystem?.name || 'N/A'}</span>
            </div>
            {isEdit && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.45)',
              }}>
                Emitter: <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>{emitterName}</span>
              </div>
            )}
          </div>

          {/* Child VFX System Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Child VFX System
            </label>
            <select
              value={selectedChildSystem || ''}
              onChange={(e) => setSelectedChildSystem(e.target.value)}
              style={selectStyle}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent2)';
                e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent2), transparent 80%)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                e.target.style.boxShadow = 'none';
              }}
            >
              <option value="" style={{ background: '#1a1825' }}>Select a VFX System...</option>
              {availableSystems.map(sys => (
                <option key={sys.key} value={sys.key} style={{ background: '#1a1825' }}>
                  {sys.name} {sys.key.startsWith('0x') ? `(${sys.key})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Emitter Name (Create mode only) */}
          {!isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Emitter Name
              </label>
              <MemoizedInput
                value={emitterName}
                onChange={(e) => setEmitterName(e.target.value)}
                placeholder="Enter emitter name..."
              />
            </div>
          )}

          {/* Rate & Lifetime */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                Rate
              </label>
              <MemoizedInput
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                step="0.1"
                min="0"
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                Lifetime
              </label>
              <MemoizedInput
                type="number"
                value={lifetime}
                onChange={(e) => setLifetime(e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* Bind Weight & First Emission */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                Bind Weight
              </label>
              <MemoizedInput
                type="number"
                value={bindWeight}
                onChange={(e) => setBindWeight(e.target.value)}
                step="0.1"
                min="0"
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', lineHeight: 1.1 }}>
                Time Before Emission
              </label>
              <MemoizedInput
                type="number"
                value={timeBeforeFirstEmission}
                onChange={(e) => setTimeBeforeFirstEmission(e.target.value)}
                step="0.01"
              />
            </div>
          </div>

          {/* Translation Override */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Translation Override
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['X', 'Y', 'Z'].map(axis => (
                <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--accent)' }}>{axis}</span>
                  <MemoizedInput
                    type="number"
                    value={axis === 'X' ? translationOverrideX : axis === 'Y' ? translationOverrideY : translationOverrideZ}
                    onChange={(e) => {
                      if (axis === 'X') setTranslationOverrideX(e.target.value);
                      if (axis === 'Y') setTranslationOverrideY(e.target.value);
                      if (axis === 'Z') setTranslationOverrideZ(e.target.value);
                    }}
                    step="0.1"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Is Single Checkbox */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setIsSingle(!isSingle)}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              border: isSingle ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
              background: isSingle ? 'var(--accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}>
              {isSingle && <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a1825' }} />}
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: isSingle ? 'var(--text)' : 'rgba(255,255,255,0.5)' }}>
              Is Single Particle
            </span>
          </div>

        </div>

        {/* footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          flexShrink: 0,
        }}>
          <button
            disabled={!selectedChildSystem || (!isEdit && !emitterName.trim())}
            onClick={onConfirm}
            style={{
              ...btnBase,
              background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
              borderColor: 'color-mix(in srgb, var(--accent2), transparent 55%)',
              color: 'var(--accent2)',
              opacity: (!selectedChildSystem || (!isEdit && !emitterName.trim())) ? 0.5 : 1,
              cursor: (!selectedChildSystem || (!isEdit && !emitterName.trim())) ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (e.currentTarget.disabled) return;
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
              e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--accent2), transparent 60%)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 35%)';
            }}
            onMouseLeave={(e) => {
              if (e.currentTarget.disabled) return;
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 88%)';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 55%)';
            }}
          >
            {isEdit ? 'Update' : 'Add Child Particle'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChildParticleModal;
