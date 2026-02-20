import React from 'react';

export default function CollectionItem({
  system,
  index,
  isProcessing,
  onDownload,
  onPreview,
}) {
  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    padding: '0.55rem',
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
    boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
  };

  return (
    <div
      key={`${system.collection}-${system.name}-${index}`}
      draggable
      onDragStart={(e) => {
        try {
          const payload = {
            name: system.displayName || (system.name || '').split('/').pop() || system.name,
            fullContent: system.fullContent || system.rawContent || '',
          };
          e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
        } catch (_) {}
      }}
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 14px 26px rgba(0,0,0,0.45)';
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 55%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = cardStyle.boxShadow;
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
      }}
    >
      <div
        className="vfx-preview-container"
        style={{
          height: '120px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '0.5rem',
          overflow: 'hidden',
          position: 'relative',
          cursor: system.previewUrl ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (system.previewUrl) onPreview(system.previewUrl);
        }}
      >
        {system.previewUrl ? (
          <>
            <img
              src={system.previewUrl}
              alt={system.displayName || system.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextSibling) {
                  e.target.nextSibling.style.display = 'flex';
                }
              }}
            />
            <div
              className="vfx-preview-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.46)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'rgba(10,12,15,0.88)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: 'var(--text)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                🔍
              </div>
            </div>
          </>
        ) : null}
        <div style={{ fontSize: '2rem', display: system.previewUrl ? 'none' : 'flex' }}>
          {system.demoVideo ? '🎬' : '✨'}
        </div>
      </div>
      <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text)' }}>
        {system.displayName || system.name}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
        {system.emitterCount || 0} emitters • {system.category || 'general'}
      </div>
      {system.description && (
        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-2)',
            marginBottom: '0',
            height: '2.4rem',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {system.description.replace(
            new RegExp(
              `^${(system.displayName || system.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:]?\\s*`,
              'i'
            ),
            ''
          )}
        </div>
      )}
      <button
        onClick={() => onDownload(system)}
        disabled={isProcessing}
        onMouseEnter={(e) => {
          if (isProcessing) return;
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 18%, transparent)';
          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 60%, transparent)';
          e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.34)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.background = isProcessing
            ? 'rgba(160,160,160,0.12)'
            : 'color-mix(in srgb, var(--accent) 11%, transparent)';
          e.currentTarget.style.border = isProcessing
            ? '1px solid rgba(200,200,200,0.2)'
            : '1px solid color-mix(in srgb, var(--accent) 42%, transparent)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        }}
        style={{
          width: '100%',
          padding: '0.42rem',
          marginTop: '0',
          background: isProcessing
            ? 'rgba(160,160,160,0.12)'
            : 'color-mix(in srgb, var(--accent) 11%, transparent)',
          border: isProcessing
            ? '1px solid rgba(200,200,200,0.2)'
            : '1px solid color-mix(in srgb, var(--accent) 42%, transparent)',
          color: isProcessing ? '#ccc' : 'var(--accent)',
          borderRadius: '9px',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
        }}
      >
        {isProcessing ? 'Loading...' : 'Download'}
      </button>
    </div>
  );
}
