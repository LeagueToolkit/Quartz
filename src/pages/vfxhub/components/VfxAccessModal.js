import React, { useEffect } from 'react';

const font = 'JetBrains Mono, monospace';

export default function VfxAccessModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 440,
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
          fontFamily: font,
          overflow: 'hidden',
        }}
      >
        {/* Accent bar */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        <div style={{ padding: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 16px color-mix(in srgb, var(--accent2), transparent 55%)',
                fontSize: '1.05rem', fontWeight: 800, color: '#fff',
                animation: 'warningBounce 1.8s ease-in-out infinite',
              }}>!</div>
              <h2 style={{
                margin: 0, fontSize: '0.95rem',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontWeight: 700, color: 'var(--text)', fontFamily: font,
              }}>Access Required</h2>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)'; e.currentTarget.style.color = 'var(--accent2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
            >✕</button>
          </div>

          {/* Body */}
          <p style={{
            margin: '0 0 14px 0', fontSize: '0.88rem',
            color: 'var(--text)', fontFamily: font, lineHeight: 1.65,
          }}>
            Uploading to <span style={{ color: 'var(--accent)', fontWeight: 700 }}>VFX Hub</span> requires write access to the repository.
          </p>

          <div style={{
            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
            background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
            border: '1px solid color-mix(in srgb, var(--accent2), transparent 65%)',
          }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', fontFamily: font, lineHeight: 1.6 }}>
              To get access, contact <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>Frog</span> on Discord and ask to be added as a collaborator to the VFX Hub repo.
            </p>
          </div>

          <div style={{
            borderRadius: 10, padding: '10px 14px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontFamily: font, lineHeight: 1.55 }}>
              Once added, configure your GitHub credentials in{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Settings → External Tools</span>{' '}
              and the upload button will unlock.
            </p>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 20, paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 20px', borderRadius: 6, cursor: 'pointer',
                fontFamily: font, fontSize: '0.75rem', fontWeight: 600,
                transition: 'all 0.18s ease',
                background: 'color-mix(in srgb, var(--accent2), transparent 80%)',
                color: 'var(--accent2)',
                border: '1px solid color-mix(in srgb, var(--accent2), transparent 60%)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 60%)'; e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 55%)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 80%)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >Got it</button>
          </div>
        </div>

        <style>{`
          @keyframes warningBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
        `}</style>
      </div>
    </div>
  );
}
