import React from 'react';

export default function NewVfxSystemModal({
  open,
  onClose,
  newSystemName,
  setNewSystemName,
  onCreate,
}) {
  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onCreate();
    if (e.key === 'Escape') onClose();
  };

  /* ── shared button tokens ── */
  const btnBase = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    display: 'inline-flex',
    alignItems: 'center',
    outline: 'none',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
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
        onClick={(e) => e.stopPropagation()}
      >
        {/* shimmer accent bar */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
          flexShrink: 0,
        }} />

        {/* header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--text)',
          }}>New VFX System</h2>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer', transition: 'all 0.25s ease', outline: 'none',
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

        {/* body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* name field section */}
          <div style={{
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            padding: 14,
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent2)',
              marginBottom: 10,
            }}>System Name</div>
            <input
              autoFocus
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a unique name (e.g., testname)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.3)',
                color: 'var(--accent)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontFamily: 'JetBrains Mono, monospace',
                outline: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 40%)';
                e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--accent2), transparent 75%)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <div style={{
              marginTop: 10,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.35)',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}>
              Creates a minimal system with an empty emitters list and adds a resolver mapping.
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onCreate}
            style={{
              ...btnBase,
              background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--accent2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 72%)';
              e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 65%)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 50%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 90%)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
