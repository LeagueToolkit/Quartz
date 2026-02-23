import React from 'react';

export default function PortAllModeModal({
  open,
  onClose,
  onSelectMode,
  donorCount = 0,
}) {
  if (!open) return null;

  const btnBase = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.10)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.76rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.22s ease',
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 540,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
            flexShrink: 0,
          }}
        />

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.95rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Port All VFX Systems
          </h2>
          <button
            onClick={onClose}
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
              outline: 'none',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.78rem',
              lineHeight: 1.6,
            }}
          >
            Donor systems detected: <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>{donorCount}</span>
          </div>

          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
              Choose Mode
            </div>
            <button
              onClick={() => onSelectMode('normal')}
              style={{
                ...btnBase,
                background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                color: 'var(--accent2)',
              }}
            >
              Port All Normally
            </button>
            <button
              onClick={() => onSelectMode('replace-target')}
              style={{
                ...btnBase,
                background: 'rgba(239,68,68,0.14)',
                border: '1px solid rgba(239,68,68,0.32)',
                color: '#ff7f7f',
              }}
            >
              Replace Target Then Port All
            </button>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', lineHeight: 1.5 }}>
              Replace mode removes existing target VFX systems and matching ResourceResolver particle entries first.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
