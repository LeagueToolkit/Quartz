import React from 'react';

const CustomPrefixModal = ({
  open,
  pendingRepathData,
  currentSkinIndex,
  customPrefix,
  setCustomPrefix,
  applyToAll,
  setApplyToAll,
  onCancel,
  onPrevious,
  onNextOrStart,
}) => {
  if (!open || !pendingRepathData) {
    return null;
  }

  const total = pendingRepathData.allSkins.length;
  const current = pendingRepathData.allSkins[currentSkinIndex];
  const isLast = currentSkinIndex === total - 1;

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
    },
    backdrop: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    },
    modal: {
      position: 'relative',
      width: '100%',
      maxWidth: 680,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      backdropFilter: 'saturate(180%) blur(16px)',
      WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderRadius: 16,
      boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
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
    sectionTitle: {
      color: 'var(--accent2)',
      fontSize: '0.76rem',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      margin: 0,
      marginBottom: 10,
    },
    pathInput: {
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.03)',
      padding: '8px 12px',
      fontSize: '0.74rem',
      color: 'var(--text)',
      fontFamily: 'inherit',
      outline: 'none',
      transition: 'all 0.2s ease',
      marginTop: 8,
    },
  };

  const btnBase = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
    color: 'var(--accent2)',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    textTransform: 'none',
  };

  const hoverBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 72%)';
    e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)';
    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 50%)';
  };

  const leaveBtn = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
  };

  const focusInput = (e) => {
    e.currentTarget.style.borderColor = 'var(--accent)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent), transparent 75%)';
  };

  const blurInput = (e) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onCancel} />
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.accentBar} />
        <div style={styles.body}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={styles.title}>Prefix Selection ({currentSkinIndex + 1}/{total})</h2>
            <button
              onClick={onCancel}
              style={{
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
                transition: 'all 0.25s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
                e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)';
                e.currentTarget.style.color = 'var(--accent2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              }}
            >
              {'\u2715'}
            </button>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Current Skin</h3>
            <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
              <div style={{ fontWeight: 700 }}>{current?.championName}</div>
              <div style={{ color: 'rgba(255,255,255,0.8)' }}>{current?.skinName}</div>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Entry Prefix</h3>
            <div>
              <input
                type="text"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                placeholder="Enter custom prefix (e.g., custom, mymod)"
                style={styles.pathInput}
                onFocus={focusInput}
                onBlur={blurInput}
                maxLength={20}
              />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
                Current prefix:{' '}
                <span style={{ color: 'var(--accent2)', fontFamily: 'monospace', fontWeight: 700 }}>
                  {customPrefix || 'bum'}
                </span>
              </div>
            </div>
          </div>

          {total > 1 && (
            <div style={styles.section}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="applyToAll"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: 'var(--accent2)',
                    cursor: 'pointer',
                  }}
                />
                <label htmlFor="applyToAll" style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                  Apply this prefix to all remaining skins
                </label>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={onCancel}
              style={{
                ...btnBase,
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(255,255,255,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentSkinIndex > 0 && (
                <button
                  onClick={onPrevious}
                  style={btnBase}
                  onMouseEnter={hoverBtn}
                  onMouseLeave={leaveBtn}
                >
                  Previous
                </button>
              )}
              <button
                onClick={onNextOrStart}
                style={btnBase}
                onMouseEnter={hoverBtn}
                onMouseLeave={leaveBtn}
              >
                {isLast ? 'Start Repath' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomPrefixModal;
