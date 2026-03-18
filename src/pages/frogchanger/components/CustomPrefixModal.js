import React, { useState } from 'react';

/**
 * CustomPrefixModal (Repath Modal)
 *
 * Appears when repathing skins. Allows setting custom prefix, VO extraction,
 * SFX skip, HUD icon preservation, and output path override.
 */
const CustomPrefixModal = ({
  open,
  pendingRepathData,
  currentSkinIndex,
  customPrefix,
  setCustomPrefix,
  applyToAll,
  setApplyToAll,
  skipSfxRepath,
  setSkipSfxRepath,
  extractVoiceover,
  setExtractVoiceover,
  preserveHudIcons2D,
  setPreserveHudIcons2D,
  outputOverrideEnabled,
  setOutputOverrideEnabled,
  outputKeepForAll,
  setOutputKeepForAll,
  outputPath,
  setOutputPath,
  recentOutputPaths = [],
  onBrowseOutputPath,
  onCancel,
  onPrevious,
  onNextOrStart,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);

  if (!open || !pendingRepathData) {
    return null;
  }

  const total = pendingRepathData.allSkins.length;
  const current = pendingRepathData.allSkins[currentSkinIndex];
  const isLast = currentSkinIndex === total - 1;

  const styles = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    },
    backdrop: {
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    },
    modal: {
      position: 'relative', width: '100%', maxWidth: 480,
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
    body: { padding: 24 },
    title: {
      fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase',
      fontWeight: 700, color: 'var(--text)', margin: 0,
    },
    subtitle: {
      fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)',
      marginTop: 4, marginBottom: 0,
    },
    section: {
      borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)', padding: 14, marginTop: 16,
    },
    sectionTitle: {
      color: 'var(--accent2)', fontSize: '0.72rem', fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      margin: 0, marginBottom: 8,
    },
    skinName: { fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' },
    skinSub: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', marginTop: 2 },
    divider: { borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 20, paddingTop: 16 },
    pathInput: {
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(255,255,255,0.03)',
      padding: '8px 10px',
      fontSize: '0.75rem',
      color: 'var(--text)',
      fontFamily: 'inherit',
      outline: 'none',
      transition: 'all 0.2s ease',
    },
    infoBtn: {
      width: 24, height: 24, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.75rem', fontWeight: 700,
      color: 'var(--accent2)', border: '1px solid color-mix(in srgb, var(--accent2), transparent 60%)',
      background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
      cursor: 'pointer', transition: 'all 0.2s ease',
      marginLeft: 8,
    },
    infoSection: {
      marginTop: 12, padding: 12, borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)',
      lineHeight: 1.4,
    },
  };

  const btnBase = {
    padding: '7px 16px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
    color: 'var(--accent2)', fontFamily: 'inherit',
    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.25s ease',
  };

  const btnGhost = {
    ...btnBase,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.15)',
  };

  const btnPrimary = {
    ...btnBase,
    background: 'color-mix(in srgb, var(--accent), transparent 80%)',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
  };

  const btnBrowse = {
    ...btnBase,
    minWidth: 72,
  };

  const hoverAccent2 = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 72%)';
    e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)';
    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 50%)';
  };
  const leaveAccent2 = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
  };
  const hoverGhost = (e) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
    e.currentTarget.style.boxShadow = '0 0 12px rgba(255,255,255,0.1)';
  };
  const leaveGhost = (e) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
    e.currentTarget.style.boxShadow = 'none';
  };
  const hoverPrimary = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 60%)';
    e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--accent), transparent 55%)';
  };
  const leavePrimary = (e) => {
    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 80%)';
    e.currentTarget.style.boxShadow = 'none';
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

  const closeBtn = (
    <button
      onClick={onCancel}
      style={{
        width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, color: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
        transition: 'all 0.25s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
        e.currentTarget.style.color = 'var(--accent2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
      }}
    >
      {'\u2715'}
    </button>
  );

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onCancel} />
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.accentBar} />
        <div style={styles.body}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h2 style={styles.title}>{total > 1 ? `Repath Skin ${currentSkinIndex + 1} of ${total}` : 'Repath Mode'}</h2>
              <button
                style={styles.infoBtn}
                onClick={() => setInfoOpen(!infoOpen)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)')}
                title="Help Info"
              >
                i
              </button>
            </div>
            {closeBtn}
          </div>

          {infoOpen && (
            <div style={styles.infoSection}>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--accent2)' }}>Entry Prefix:</strong> The prefix the repath takes (not the mod folder name).
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--accent2)' }}>Skip SFX:</strong> Doesn't extract sound effects (recommended).
              </div>
              <div>
                <strong style={{ color: 'var(--accent2)' }}>Preserve HUD:</strong> Preserves the HUD icons in the folder.
              </div>
            </div>
          )}
          <p style={styles.subtitle}>
            {current?.championName} — {current?.skinName}
          </p>

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
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                Current prefix:{' '}
                <span style={{ color: 'var(--accent2)', fontFamily: 'monospace', fontWeight: 700 }}>
                  {customPrefix || 'bum'}
                </span>
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Options</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {total > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                  />
                  Apply this prefix to all remaining skins
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={extractVoiceover}
                  onChange={(e) => setExtractVoiceover(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Extract Voiceover (VO)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={skipSfxRepath}
                  onChange={(e) => setSkipSfxRepath(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Skip SFX Repath
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={preserveHudIcons2D}
                  onChange={(e) => setPreserveHudIcons2D(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Preserve HUD Icons2D
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={outputOverrideEnabled}
                  onChange={(e) => setOutputOverrideEnabled(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Override Output Path
              </label>

              {outputOverrideEnabled && total > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', marginLeft: 20 }}>
                  <input
                    type="checkbox"
                    checked={outputKeepForAll}
                    onChange={(e) => setOutputKeepForAll(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                  />
                  Keep same output path for all selected skins
                </label>
              )}

              {outputOverrideEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 4 }}>
                  <input
                    list="recent-paths-datalist-repath"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder="Select repath output path..."
                    style={styles.pathInput}
                    onFocus={focusInput}
                    onBlur={blurInput}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    style={btnBrowse}
                    onMouseEnter={hoverAccent2}
                    onMouseLeave={leaveAccent2}
                    onClick={async () => {
                      const picked = await onBrowseOutputPath?.();
                      if (picked) setOutputPath(String(picked));
                    }}
                  >
                    Browse
                  </button>
                  {recentOutputPaths.length > 0 && (
                    <datalist id="recent-paths-datalist-repath">
                      {recentOutputPaths.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...styles.divider, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button 
              style={btnGhost} 
              onMouseEnter={hoverGhost} 
              onMouseLeave={leaveGhost} 
              onClick={onCancel}
            >
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentSkinIndex > 0 && (
                <button
                  style={btnBase}
                  onMouseEnter={hoverAccent2}
                  onMouseLeave={leaveAccent2}
                  onClick={onPrevious}
                >
                  Previous
                </button>
              )}
              <button
                style={btnPrimary}
                onMouseEnter={hoverPrimary}
                onMouseLeave={leavePrimary}
                onClick={onNextOrStart}
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
