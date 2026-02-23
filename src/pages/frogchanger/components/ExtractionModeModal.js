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
const ExtractionModeModal = ({ open, skins = [], onDecide, onCancel }) => {
  const [phase, setPhase] = useState('initial'); // 'initial' | 'per-skin'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState([]);
  const [extractVoiceover, setExtractVoiceover] = useState(false);
  const [preserveHudIcons2D, setPreserveHudIcons2D] = useState(true);

  // Reset state whenever modal opens
  useEffect(() => {
    if (open) {
      setPhase('initial');
      setCurrentIndex(0);
      setDecisions([]);
      setExtractVoiceover(false);
      setPreserveHudIcons2D(true);
    }
  }, [open]);

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
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNoAll = () => {
    onDecide(resolvePayload(skins.map(s => ({ skinKey: skinKey(s), clean: false }))));
  };

  const handleYesAll = () => {
    onDecide(resolvePayload(skins.map(s => ({ skinKey: skinKey(s), clean: true }))));
  };

  const handleYesPerSkin = () => {
    setDecisions([]);
    setCurrentIndex(0);
    setPhase('per-skin');
  };

  const handlePerSkinDecision = (clean) => {
    const next = [...decisions, { skinKey: skinKey(current), clean }];
    if (currentIndex + 1 >= total) {
      onDecide(resolvePayload(next));
    } else {
      setDecisions(next);
      setCurrentIndex(i => i + 1);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const styles = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    },
    backdrop: {
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
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

  // ── Initial phase ─────────────────────────────────────────────────────────

  if (phase === 'initial') {
    return (
      <div style={styles.overlay}>
        <div style={styles.backdrop} onClick={onCancel} />
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={styles.accentBar} />
          <div style={styles.body}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={styles.title}>Extraction Mode</h2>
              {closeBtn}
            </div>
            <p style={styles.subtitle}>
              {multiSkin ? `${total} skins queued` : `${skins[0].championName} — ${skins[0].skinName}`}
            </p>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Skin Files Only</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                Extracts only the files referenced by the selected skin's BIN — meshes, textures,
                animations, particles. Linked BINs are merged into one. Original paths are kept.
                Unreferenced files are discarded.
              </p>
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Whole WAD</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                Extracts all files from the WAD client as-is. No filtering or merging.
              </p>
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Options</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    checked={preserveHudIcons2D}
                    onChange={(e) => setPreserveHudIcons2D(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                  />
                  Preserve HUD Icons2D (clean-after-extract)
                </label>
              </div>
            </div>

            <div style={{ ...styles.divider, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btnGhost} onMouseEnter={hoverGhost} onMouseLeave={leaveGhost} onClick={handleNoAll}>
                {multiSkin ? 'No — Whole WAD' : 'Whole WAD'}
              </button>
              {multiSkin && (
                <button style={btnBase} onMouseEnter={hoverAccent2} onMouseLeave={leaveAccent2} onClick={handleYesPerSkin}>
                  Yes — Ask Each
                </button>
              )}
              <button style={btnPrimary} onMouseEnter={hoverPrimary} onMouseLeave={leavePrimary} onClick={handleYesAll}>
                {multiSkin ? 'Yes to All' : 'Skin Files Only'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Per-skin phase ────────────────────────────────────────────────────────

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onCancel} />
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.accentBar} />
        <div style={styles.body}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={styles.title}>Skin {currentIndex + 1} of {total}</h2>
            {closeBtn}
          </div>

          <div style={{ ...styles.section, marginTop: 16 }}>
            <h3 style={styles.sectionTitle}>Current Skin</h3>
            <div style={styles.skinName}>{current.championName}</div>
            <div style={styles.skinSub}>{current.skinName}</div>
          </div>

          <div style={{ ...styles.section }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
              Extract skin files only (filtered + BINs merged) or the whole WAD for this skin?
            </p>
          </div>

          <div style={{ ...styles.section }}>
            <h3 style={styles.sectionTitle}>Options</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  checked={preserveHudIcons2D}
                  onChange={(e) => setPreserveHudIcons2D(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent2)', cursor: 'pointer' }}
                />
                Preserve HUD Icons2D (clean-after-extract)
              </label>
            </div>
          </div>

          <div style={{ ...styles.divider, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={btnGhost} onMouseEnter={hoverGhost} onMouseLeave={leaveGhost} onClick={() => handlePerSkinDecision(false)}>
              Whole WAD
            </button>
            <button style={btnPrimary} onMouseEnter={hoverPrimary} onMouseLeave={leavePrimary} onClick={() => handlePerSkinDecision(true)}>
              {currentIndex + 1 < total ? 'Skin Files — Next' : 'Skin Files — Start'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionModeModal;
