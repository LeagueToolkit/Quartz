import React, { useState, useEffect } from 'react';

/**
 * ExtractionModeModal
 *
 * Appears before extraction starts. Asks whether to extract the full WAD or
 * only skin-relevant files (BINs merged, assets filtered, original paths kept).
 *
 * Props:
 *   open        {boolean}
 *   skins       {Array<{ championName, skinId, skinName }>}
 *   onDecide    {(payload: { decisions: Array<{ skinKey, clean }>, options: { extractVoiceover, preserveHudIcons2D } }) => void}
 *   onCancel    {() => void}
 */
const ExtractionModeModal = ({
  open,
  skins = [],
  defaultOutputPath = '',
  recentOutputPaths = [],
  onBrowseOutputPath,
  onDecide,
  onCancel,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState([]);
  const [extractVoiceover, setExtractVoiceover] = useState(false);
  const [preserveHudIcons2D, setPreserveHudIcons2D] = useState(true);
  const [splitVfx, setSplitVfx] = useState(false);
  const [splitAnm, setSplitAnm] = useState(false);
  const [consolidateAssets, setConsolidateAssets] = useState(true);
  const [outputOverrideEnabled, setOutputOverrideEnabled] = useState(false);
  const [outputKeepForAll, setOutputKeepForAll] = useState(true);
  const [outputPath, setOutputPath] = useState('');
  const [outputPathsBySkin, setOutputPathsBySkin] = useState({});
  const [applyToAll, setApplyToAll] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Reset state whenever modal opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setDecisions([]);
      setExtractVoiceover(false);
      setPreserveHudIcons2D(true);
      setSplitVfx(false);
      setSplitAnm(false);
      setConsolidateAssets(true);
      setOutputOverrideEnabled(false);
      setOutputKeepForAll(true);
      setOutputPath(String(defaultOutputPath || ''));
      setOutputPathsBySkin({});
      setApplyToAll(false);
      setInfoOpen(false);
    }
  }, [open, defaultOutputPath]);

  if (!open || skins.length === 0) return null;

  const total = skins.length;
  const multiSkin = total > 1;
  const current = skins[currentIndex];
  const skinKey = (s) => `${s.championName}_${s.skinId}`;

  const resolvePayload = (nextDecisions) => ({
    decisions: nextDecisions,
    options: {
      extractVoiceover,
      preserveHudIcons2D,
      splitVfx,
      splitAnm,
      consolidateAssets,
      outputOverride: {
        enabled: outputOverrideEnabled,
        keepForAll: outputKeepForAll,
        path: outputPath,
        perSkinPaths: outputPathsBySkin,
      },
    },
  });

  // --- Handlers -----------------------------------------------------------

  const handleDecision = (clean) => {
    const nextDecisions = [...decisions];
    const currentEntry = { skinKey: skinKey(current), clean };

    if (applyToAll) {
      // Apply the same mode to all remaining skins
      const remaining = skins.slice(currentIndex).map((s) => ({
        skinKey: skinKey(s),
        clean,
      }));
      const finalDecisions = [...decisions, ...remaining];

      // Handle path override if enabled
      const finalPathsBySkin = { ...outputPathsBySkin };
      if (outputOverrideEnabled) {
        skins.slice(currentIndex).forEach((s) => {
          finalPathsBySkin[skinKey(s)] = outputPath || defaultOutputPath;
        });
      }

      onDecide({
        decisions: finalDecisions,
        options: {
          extractVoiceover,
          preserveHudIcons2D,
          splitVfx,
          splitAnm,
          outputOverride: {
            enabled: outputOverrideEnabled,
            keepForAll: outputKeepForAll,
            path: outputPath,
            perSkinPaths: finalPathsBySkin,
          },
        },
      });
      return;
    }

    // Normal per-skin flow
    const mappedPaths = { ...outputPathsBySkin };
    if (outputOverrideEnabled) {
      mappedPaths[skinKey(current)] = outputPath || defaultOutputPath;
      setOutputPathsBySkin(mappedPaths);
    }

    const next = [...decisions, currentEntry];
    if (currentIndex + 1 >= total) {
      onDecide(resolvePayload(next));
    } else {
      setDecisions(next);
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (outputOverrideEnabled && !outputKeepForAll) {
        const nextSkinKey = skinKey(skins[nextIndex]);
        setOutputPath(mappedPaths[nextSkinKey] || outputPath || defaultOutputPath);
      }
    }
  };

  // --- Styles -------------------------------------------------------------

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
              <h2 style={styles.title}>{multiSkin ? `Extraction Skin ${currentIndex + 1} of ${total}` : 'Extraction Mode'}</h2>
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
                <strong style={{ color: 'var(--accent2)' }}>Whole WAD:</strong> Extracts everything as-is. Best for finding missing assets.
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--accent2)' }}>Skin Files Only:</strong> Only extracts models/skins and ignores sound effects (recommended).
              </div>
              <div>
                <strong style={{ color: 'var(--accent2)' }}>Preserve HUD:</strong> Preserves the ability icons in the folder.
              </div>
            </div>
          )}

          <p style={styles.subtitle}>
            {current.championName} — {current.skinName}
          </p>

          <div style={{ ...styles.section }}>
            <h3 style={styles.sectionTitle}>Options</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {multiSkin && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                  />
                  Apply mode to all remaining skins
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={extractVoiceover}
                  onChange={(e) => setExtractVoiceover(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Extract Voiceover
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

              {/* --- Bin Splitting (Skin Files Only) --- */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 8 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                  Bin Splitting
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label
                    title="Splits VfxSystemDefinitionData entries from each skin*.bin into a sibling DATA/<champ>_vfx_<stem>.bin and links it. Skin Files Only mode."
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={splitVfx}
                      onChange={(e) => setSplitVfx(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                    />
                    <span>Split VFX</span>
                    <span
                      title="Some Quartz tools (e.g. inline VFX inspection) may stop working on bins after they've been split. Use Combine VFX from the right-click menu to undo."
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'color-mix(in srgb, #ffaa33, transparent 80%)',
                        color: '#ffaa33', fontSize: '0.7rem', fontWeight: 700,
                        border: '1px solid color-mix(in srgb, #ffaa33, transparent 50%)',
                      }}
                    >!</span>
                  </label>
                  <label
                    title="Splits AnimationGraphData entries from each skin*.bin into a sibling DATA/<champ>_anm_<stem>.bin and links it. Skin Files Only mode."
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={splitAnm}
                      onChange={(e) => setSplitAnm(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                    />
                    Split Animations
                  </label>
                  <label
                    title="Moves every asset referenced by VfxSystemDefinitionData entries into a shared assets/<prefix>/skin<N>_particles/ folder per skin. Conflicting basenames get a _2/_3 suffix."
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={consolidateAssets}
                      onChange={(e) => setConsolidateAssets(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                    />
                    Consolidate Assets
                  </label>
                </div>
              </div>

              {/* --- Output --- */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 8 }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                  Output
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={outputOverrideEnabled}
                    onChange={(e) => setOutputOverrideEnabled(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                  />
                  Override Output Path
                </label>
              </div>
              {outputOverrideEnabled && multiSkin && (
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
                    list="recent-paths-datalist-extract"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder={defaultOutputPath || 'Select output path...'}
                    style={{
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                    }}
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
                    <datalist id="recent-paths-datalist-extract">
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
              onClick={() => handleDecision(false)}
            >
              Whole WAD
            </button>
            <button
              style={btnPrimary}
              onMouseEnter={hoverPrimary}
              onMouseLeave={leavePrimary}
              onClick={() => handleDecision(true)}
            >
              Skin Files Only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionModeModal;
