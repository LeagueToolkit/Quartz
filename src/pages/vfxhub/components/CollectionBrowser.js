import React from 'react';
import CollectionItem from './CollectionItem';

const categories = ['All', 'Missiles', 'Auras', 'Explosions', 'Target', 'Shield', 'Buf'];

const font = 'JetBrains Mono, monospace';

const sectionTitleStyle = {
  fontSize: '0.68rem', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--accent2)', margin: 0, fontFamily: font,
};

export default function CollectionBrowser({
  open,
  modalSize,
  isProcessing,
  isLoadingCollections,
  githubConnected,
  searchTerm,
  selectedCategory,
  currentPage,
  totalPages,
  filteredSystems,
  paginatedSystems,
  hoveredPreview,
  onSetHoveredPreview,
  onSearchTerm,
  onSelectedCategory,
  onPage,
  onDownload,
  onRefresh,
  onClose,
  onMouseDownResize,
  contentRef,
  saveScrollPos,
}) {
  if (!open) return null;

  const panelStyle = {
    position: 'relative',
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 16,
    width: `${modalSize.width}px`,
    height: `${modalSize.height}px`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 40px color-mix(in srgb, var(--accent2), transparent 82%)',
    minWidth: '420px',
    minHeight: '340px',
    maxWidth: '1200px',
    maxHeight: '800px',
    fontFamily: font,
  };

  const btnGhost = {
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
    fontFamily: font, fontSize: '0.75rem', fontWeight: 600,
    transition: 'all 0.18s ease',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(255,255,255,0.12)',
  };

  const btnAccent = {
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
    fontFamily: font, fontSize: '0.75rem', fontWeight: 600,
    transition: 'all 0.18s ease',
    background: 'color-mix(in srgb, var(--accent), transparent 85%)',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    }}>
      <div data-modal="vfx-hub-collections" style={panelStyle}>

        {/* Accent bar */}
        <div style={{
          height: 3, flexShrink: 0,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: '0.95rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontWeight: 700, color: 'var(--text)', fontFamily: font,
            }}>VFX Hub Collections</h2>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', marginTop: 4, fontFamily: font }}>
              {filteredSystems.length} effect{filteredSystems.length !== 1 ? 's' : ''} available
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onRefresh}
              disabled={isProcessing || isLoadingCollections}
              style={{
                ...btnAccent,
                opacity: isProcessing || isLoadingCollections ? 0.5 : 1,
                cursor: isProcessing || isLoadingCollections ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!isProcessing && !isLoadingCollections) { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 65%)'; e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent), transparent 55%)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 85%)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)'; e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)'; e.currentTarget.style.color = 'var(--accent2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="Search by name, category, description..."
            value={searchTerm}
            onChange={(e) => { saveScrollPos(); onSearchTerm(e.target.value); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', marginBottom: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: 'var(--text)',
              fontFamily: font, fontSize: '0.8rem', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent2)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map((category) => {
              const active = category === selectedCategory;
              return (
                <button
                  key={category}
                  onClick={() => { saveScrollPos(); onSelectedCategory(category); }}
                  style={{
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: font, fontSize: '0.72rem', fontWeight: active ? 700 : 600,
                    transition: 'all 0.15s ease',
                    background: active ? 'color-mix(in srgb, var(--accent2), transparent 82%)' : 'rgba(255,255,255,0.03)',
                    color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.65)',
                    border: active
                      ? '1px solid color-mix(in srgb, var(--accent2), transparent 50%)'
                      : '1px solid rgba(255,255,255,0.08)',
                  }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; } }}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; } }}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items grid */}
        <div
          ref={contentRef}
          style={{
            flex: 1, padding: '14px 20px', overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12, alignContent: 'start',
          }}
        >
          {isLoadingCollections ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', fontFamily: font, fontSize: '0.82rem' }}>
              Loading VFX collections from GitHub...
            </div>
          ) : !githubConnected ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#f87171', fontFamily: font, fontSize: '0.82rem' }}>
              Failed to connect to GitHub
            </div>
          ) : filteredSystems.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)', fontFamily: font, fontSize: '0.82rem' }}>
              No VFX effects found
            </div>
          ) : (
            paginatedSystems.map((system, index) => (
              <CollectionItem
                key={`${system.collection}-${system.name}-${index}`}
                system={system}
                index={index}
                isProcessing={isProcessing}
                onDownload={onDownload}
                onPreview={onSetHoveredPreview}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '10px 20px', flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <button
              onClick={() => { saveScrollPos(); onPage(Math.max(1, currentPage - 1)); }}
              disabled={currentPage === 1}
              style={{ ...btnGhost, opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'default' : 'pointer' }}
              onMouseEnter={(e) => { if (currentPage !== 1) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Previous
            </button>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                const active = page === currentPage;
                return (
                  <button
                    key={page}
                    onClick={() => { saveScrollPos(); onPage(page); }}
                    style={{
                      width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
                      fontFamily: font, fontSize: '0.75rem', fontWeight: active ? 700 : 400,
                      border: active
                        ? '1px solid color-mix(in srgb, var(--accent2), transparent 50%)'
                        : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'color-mix(in srgb, var(--accent2), transparent 80%)' : 'rgba(255,255,255,0.02)',
                      color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.65)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; } }}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { saveScrollPos(); onPage(Math.min(totalPages, currentPage + 1)); }}
              disabled={currentPage === totalPages}
              style={{ ...btnGhost, opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? 'default' : 'pointer' }}
              onMouseEnter={(e) => { if (currentPage !== totalPages) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Next
            </button>
          </div>
        )}

        {/* Preview lightbox */}
        {hoveredPreview && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1999 }}
              onClick={() => onSetHoveredPreview(null)}
            />
            <div style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', zIndex: 2000,
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 14, padding: 14,
              maxWidth: '84vw', maxHeight: '84vh',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              boxShadow: '0 30px 70px rgba(0,0,0,0.65), 0 0 30px color-mix(in srgb, var(--accent2), transparent 85%)',
              backdropFilter: 'saturate(180%) blur(16px)',
              WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            }}>
              <button
                onClick={() => onSetHoveredPreview(null)}
                style={{
                  alignSelf: 'flex-end', marginBottom: 8,
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)'; e.currentTarget.style.color = 'var(--accent2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >✕</button>
              <img
                src={hoveredPreview}
                alt="Full preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}
                onError={() => onSetHoveredPreview(null)}
              />
            </div>
          </>
        )}

        {/* Resize handles */}
        <div
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 14, height: 14, cursor: 'nw-resize',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderLeft: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0 0 14px 0',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 'se')}
        />
        <div
          style={{
            position: 'absolute', top: '50%', right: 0,
            width: 5, height: 44, cursor: 'ew-resize',
            background: 'rgba(255,255,255,0.12)',
            transform: 'translateY(-50%)', borderRadius: '3px 0 0 3px',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 'e')}
        />
        <div
          style={{
            position: 'absolute', bottom: 0, left: '50%',
            width: 44, height: 5, cursor: 'ns-resize',
            background: 'rgba(255,255,255,0.12)',
            transform: 'translateX(-50%)', borderRadius: '3px 3px 0 0',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 's')}
        />
      </div>
    </div>
  );
}
