import React, { useState, useEffect } from 'react';

function CustomDropdown({ value, options, onChange, placeholder = '(None)', style }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = () => setOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div style={{ position: 'relative', ...style }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--accent2), transparent 45%)' : 'rgba(255,255,255,0.1)'}`,
          color: 'var(--text)', borderRadius: 8,
          padding: '6px 12px', fontSize: '0.78rem',
          fontFamily: 'inherit',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          boxShadow: open ? '0 0 14px color-mix(in srgb, var(--accent2), transparent 75%)' : 'none',
          transition: 'all 0.18s ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
          {selectedLabel}
        </span>
        <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
          zIndex: 9999,
          background: 'rgba(20,18,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, overflow: 'auto', maxHeight: 220,
          boxShadow: '0 18px 40px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', border: 'none',
                  background: active ? 'color-mix(in srgb, var(--accent2), transparent 82%)' : 'transparent',
                  color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.88)',
                  padding: '9px 12px', fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer', transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WadExplorerSettingsModal({
  open,
  onClose,
  rowHeight,
  fontSize,
  panelWidth,
  symbolSize,
  onRowHeightChange,
  onFontSizeChange,
  onPanelWidthChange,
  onSymbolSizeChange,
}) {
  if (!open) return null;

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
    },
    backdrop: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.62)',
    },
    modal: {
      position: 'relative',
      width: '100%',
      maxWidth: 560,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      backdropFilter: 'saturate(180%) blur(24px)',
      WebkitBackdropFilter: 'saturate(180%) blur(24px)',
      borderRadius: 16,
      boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
    },
    accentBarWrapper: {
      borderRadius: '16px 16px 0 0',
      overflow: 'hidden',
    },
    accentBar: {
      height: 3,
      background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
      backgroundSize: '200% 100%',
      animation: 'shimmer 3s linear infinite',
    },
    body: {
      padding: 20,
    },
    title: {
      fontSize: '0.95rem',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontWeight: 700,
      color: 'var(--text)',
      margin: 0,
    },
    section: {
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)',
      padding: 14,
      marginBottom: 12,
    },
    row: {
      display: 'grid',
      gridTemplateColumns: '140px 1fr 48px',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    label: {
      fontSize: '0.78rem',
      color: 'var(--text)',
      opacity: 0.9,
    },
    value: {
      fontSize: '0.76rem',
      color: 'var(--accent2)',
      textAlign: 'right',
      fontWeight: 700,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      color: 'rgba(255,255,255,0.5)',
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.04)',
      cursor: 'pointer',
    },
    select: {
      width: '100%',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: 'var(--text)',
      borderRadius: 6,
      padding: '4px 8px',
      fontSize: '0.78rem',
      outline: 'none',
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.accentBarWrapper}>
          <div style={styles.accentBar} />
        </div>
        <div style={styles.body}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={styles.title}>WAD Explorer Settings</h2>
            <button style={styles.closeBtn} onClick={onClose}>×</button>
          </div>

          <div style={styles.section}>
            <div style={styles.row}>
              <span style={styles.label}>Row Height</span>
              <input type="range" min={20} max={34} step={1} value={rowHeight} onChange={(e) => onRowHeightChange(Number(e.target.value))} />
              <span style={styles.value}>{rowHeight}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Text Size</span>
              <input type="range" min={11} max={15} step={1} value={fontSize} onChange={(e) => onFontSizeChange(Number(e.target.value))} />
              <span style={styles.value}>{fontSize}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Panel Width</span>
              <input type="range" min={300} max={540} step={10} value={panelWidth} onChange={(e) => onPanelWidthChange(Number(e.target.value))} />
              <span style={styles.value}>{panelWidth}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Symbol Size</span>
              <input type="range" min={10} max={18} step={1} value={symbolSize} onChange={(e) => onSymbolSizeChange(Number(e.target.value))} />
              <span style={styles.value}>{symbolSize}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
