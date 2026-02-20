import React from 'react';
import CollectionItem from './CollectionItem';

const categories = ['All', 'Missiles', 'Auras', 'Explosions', 'Target', 'Shield', 'Buf'];

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
    background: 'linear-gradient(180deg, rgba(9, 11, 14, 0.96), rgba(5, 7, 10, 0.98))',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    width: `${modalSize.width}px`,
    height: `${modalSize.height}px`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 32px 72px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.03) inset',
    position: 'relative',
    minWidth: '420px',
    minHeight: '340px',
    maxWidth: '1200px',
    maxHeight: '800px',
    backdropFilter: 'blur(10px)',
  };

  const secondaryButton = {
    padding: '0.52rem 0.95rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 700,
    fontFamily: 'JetBrains Mono, monospace',
    transition: 'all 0.18s ease',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(12,14,20,0.62) 0%, rgba(2,3,5,0.85) 100%)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div data-modal="vfx-hub-collections" style={panelStyle}>
        <div
          style={{
            padding: '0.85rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.05rem', letterSpacing: '0.02em' }}>VFX Hub Collections</h2>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
              GitHub browser • {filteredSystems.length} results
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={onRefresh}
              disabled={isProcessing || isLoadingCollections}
              style={{
                ...secondaryButton,
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                color: 'var(--accent)',
                opacity: isProcessing || isLoadingCollections ? 0.5 : 1,
                cursor: isProcessing || isLoadingCollections ? 'not-allowed' : 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
              }}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.75)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              aria-label="Close collections modal"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', gap: '0.7rem', marginBottom: '0.8rem' }}>
            <input
              type="text"
              placeholder="Search by name, category, description..."
              value={searchTerm}
              onChange={(e) => {
                saveScrollPos();
                onSearchTerm(e.target.value);
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                color: 'var(--text)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {categories.map((category) => {
              const active = category === selectedCategory;
              return (
                <button
                  key={category}
                  onClick={() => {
                    saveScrollPos();
                    onSelectedCategory(category);
                  }}
                  onMouseEnter={(e) => {
                    if (active) return;
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.92)';
                  }}
                  onMouseLeave={(e) => {
                    if (active) return;
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                  }}
                  style={{
                    padding: '0.42rem 0.72rem',
                    background: active ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'rgba(255,255,255,0.03)',
                    color: active ? 'var(--accent)' : 'rgba(255,255,255,0.7)',
                    border: active
                      ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
                      : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.73rem',
                    fontWeight: active ? 700 : 600,
                    transition: 'all 0.18s ease',
                  }}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={contentRef}
          style={{
            flex: 1,
            padding: '0.95rem',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '0.75rem',
            alignContent: 'start',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00))',
          }}
        >
          {isLoadingCollections ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.55)' }}>
              Loading VFX collections from GitHub...
            </div>
          ) : !githubConnected ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#f87171' }}>
              Failed to connect to GitHub
            </div>
          ) : filteredSystems.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.5)' }}>
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

        {totalPages > 1 && (
          <div
            style={{
              padding: '0.8rem 1rem',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            <button
              onClick={() => {
                saveScrollPos();
                onPage(Math.max(1, currentPage - 1));
              }}
              disabled={currentPage === 1}
              onMouseEnter={(e) => {
                if (currentPage === 1) return;
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              style={{ ...secondaryButton, opacity: currentPage === 1 ? 0.45 : 1 }}
            >
              Previous
            </button>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                const active = page === currentPage;
                return (
                  <button
                    key={page}
                    onClick={() => {
                      saveScrollPos();
                      onPage(page);
                    }}
                    onMouseEnter={(e) => {
                      if (active) return;
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      if (active) return;
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.72)';
                    }}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.75rem',
                      border: active
                        ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)'
                        : '1px solid rgba(255,255,255,0.12)',
                      background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.02)',
                      color: active ? 'var(--accent)' : 'rgba(255,255,255,0.72)',
                      cursor: 'pointer',
                    }}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                saveScrollPos();
                onPage(Math.min(totalPages, currentPage + 1));
              }}
              disabled={currentPage === totalPages}
              onMouseEnter={(e) => {
                if (currentPage === totalPages) return;
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              style={{ ...secondaryButton, opacity: currentPage === totalPages ? 0.45 : 1 }}
            >
              Next
            </button>
          </div>
        )}

        {hoveredPreview && (
          <>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.72)',
                zIndex: 1999,
              }}
              onClick={() => onSetHoveredPreview(null)}
            />
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 2000,
                background: 'linear-gradient(180deg, rgba(12, 14, 18, 0.98), rgba(7, 9, 12, 0.99))',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '14px',
                padding: '14px',
                maxWidth: '84vw',
                maxHeight: '84vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
              }}
            >
              <button
                onClick={() => onSetHoveredPreview(null)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                }}
                style={{
                  alignSelf: 'flex-end',
                  marginBottom: '8px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                </svg>
              </button>
              <img
                src={hoveredPreview}
                alt="Full preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}
                onError={() => onSetHoveredPreview(null)}
              />
            </div>
          </>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '14px',
            height: '14px',
            cursor: 'nw-resize',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.02))',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            borderLeft: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '0 0 14px 0',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 'se')}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 0,
            width: '5px',
            height: '44px',
            cursor: 'ew-resize',
            background: 'rgba(255,255,255,0.16)',
            transform: 'translateY(-50%)',
            borderRadius: '3px 0 0 3px',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 'e')}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            width: '44px',
            height: '5px',
            cursor: 'ns-resize',
            background: 'rgba(255,255,255,0.16)',
            transform: 'translateX(-50%)',
            borderRadius: '3px 3px 0 0',
          }}
          onMouseDown={(e) => onMouseDownResize(e, 's')}
        />
      </div>
    </div>
  );
}
