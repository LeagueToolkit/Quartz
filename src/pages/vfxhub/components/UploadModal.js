import React, { useState, useEffect } from 'react';
import githubApi from '../services/githubApi.js';

function CustomDropdown({ value, options, onChange, placeholder = '(None)', style }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = () => setOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div style={{ position: 'relative', ...style }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--accent2), transparent 45%)' : 'rgba(255,255,255,0.1)'}`,
          color: 'var(--text)', borderRadius: 8,
          padding: '8px 12px', fontSize: '0.8rem',
          fontFamily: 'JetBrains Mono, monospace',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          boxShadow: open ? '0 0 14px color-mix(in srgb, var(--accent2), transparent 75%)' : 'none',
          transition: 'all 0.18s ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
          {selectedLabel}
        </span>
        <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
          zIndex: 9999,
          background: 'rgba(20,18,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, overflow: 'auto', maxHeight: 220,
          boxShadow: '0 18px 40px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', border: 'none',
                  background: active ? 'color-mix(in srgb, var(--accent2), transparent 82%)' : 'transparent',
                  color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.88)',
                  padding: '9px 12px', fontSize: '0.78rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer', transition: 'background 0.12s ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const collectionCategoryMap = {
  'missilevfxs.py': 'missiles',
  'auravfx.py': 'auras',
  'explosionvfxs.py': 'explosions',
  'targetvfx.py': 'target',
  'shieldvfx.py': 'shield',
  'bufvfx.py': 'buf',
};

const font = 'JetBrains Mono, monospace';

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.3)', padding: '8px 12px',
  fontSize: '0.8rem', color: 'var(--text)', fontFamily: font,
  outline: 'none', transition: 'border-color 0.2s',
};

const labelStyle = {
  display: 'block', marginBottom: 6,
  fontSize: '0.68rem', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--accent2)', fontFamily: font,
};

const sectionStyle = {
  borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)', padding: '14px 16px',
};

const sectionTitleStyle = {
  fontSize: '0.68rem', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--accent2)', margin: '0 0 10px 0', fontFamily: font,
};

const btnBase = {
  padding: '7px 18px', borderRadius: 6, cursor: 'pointer',
  fontFamily: font, fontSize: '0.75rem', fontWeight: 600,
  transition: 'all 0.18s ease', transform: 'scale(1)',
};

const btnGhost = {
  ...btnBase,
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.75)',
  border: '1px solid rgba(255,255,255,0.12)',
};

const btnAccent2 = {
  ...btnBase,
  background: 'color-mix(in srgb, var(--accent2), transparent 80%)',
  color: 'var(--accent2)',
  border: '1px solid color-mix(in srgb, var(--accent2), transparent 60%)',
};

const btnPrimary = {
  ...btnBase,
  background: 'color-mix(in srgb, var(--accent), transparent 80%)',
  color: 'var(--accent)',
  border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
};

export default function UploadModal({
  open,
  uploadMetadata,
  setUploadMetadata,
  targetSystemEntries,
  selectedTargetSystems,
  onTargetSystemSelection,
  selectedTargetCollection,
  setSelectedTargetCollection,
  uploadAssets,
  uploadPreparation,
  isProcessing,
  onPrepareUpload,
  onExecuteUpload,
  onClose,
  setStatusMessage,
}) {
  const [localName, setLocalName] = React.useState(uploadMetadata.name || '');
  const [localDescription, setLocalDescription] = React.useState(uploadMetadata.description || '');

  React.useEffect(() => {
    if (open) {
      setLocalName(uploadMetadata.name || '');
      setLocalDescription(uploadMetadata.description || '');
    }
  }, [open, uploadMetadata.description, uploadMetadata.name]);

  const handleSelectAndAttachPreview = React.useCallback(async () => {
    try {
      const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
      if (!ipcRenderer) return;
      const filePath = ipcRenderer.sendSync('FileSelect', ['Select Preview Image', 'Image']);
      if (!filePath || filePath === '') return;

      const cleanName = (uploadMetadata.name || 'preview').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const ext = filePath.split('.').pop().toLowerCase();
      const supported = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
      const finalExt = supported.includes(ext) ? ext : 'png';

      const fs = window.require('fs');
      const fileBuffer = fs.readFileSync(filePath);
      const content = fileBuffer.toString('base64');
      const pathInRepo = `collection/previews/${cleanName}.${finalExt}`;
      await githubApi.updateFile(pathInRepo, content, `Add preview for ${uploadMetadata.name}`, true);
      setStatusMessage(`Preview uploaded: ${pathInRepo}`);
    } catch (err) {
      setStatusMessage(`Failed to upload preview: ${err.message}`);
    }
  }, [setStatusMessage, uploadMetadata.name]);

  if (!open) return null;

  const canPrepare = !uploadPreparation && selectedTargetSystems.size > 0 && localName.trim();
  const canUpload = !!uploadPreparation;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }} />

      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 860,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16,
        boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 40px color-mix(in srgb, var(--accent2), transparent 82%)',
        fontFamily: font,
        marginLeft: 80,
        /* NO overflow:hidden — lets dropdowns escape */
      }}>
        {/* Accent bar — clipped separately so it respects top border-radius */}
        <div style={{ borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{
            margin: 0, fontSize: '0.95rem',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontWeight: 700, color: 'var(--text)', fontFamily: font,
          }}>Upload to VFX Hub</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={btnAccent2}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 60%)'; e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 55%)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 80%)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              onClick={handleSelectAndAttachPreview}
            >Add Preview</button>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        {/* Body — 2 columns: systems list | form */}
        <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>

          {/* Left — VFX Systems */}
          <div style={sectionStyle}>
            <h3 style={sectionTitleStyle}>VFX Systems</h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontFamily: font }}>
              Select from target bin
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {targetSystemEntries.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '2.5rem 0', fontFamily: font }}>
                  Open a target bin to see systems
                </div>
              ) : (
                targetSystemEntries.map(([key, system]) => (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid',
                    borderColor: selectedTargetSystems.has(key) ? 'color-mix(in srgb, var(--accent), transparent 55%)' : 'rgba(255,255,255,0.06)',
                    background: selectedTargetSystems.has(key) ? 'color-mix(in srgb, var(--accent), transparent 85%)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.15s ease',
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedTargetSystems.has(key)}
                      onChange={(e) => onTargetSystemSelection(key, e.target.checked)}
                      style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.78rem', fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{system.name || key}</div>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontFamily: font }}>{system.emitters?.length || 0} emitters</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Right — Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Row: Collection + Category side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>Collection</h3>
                <CustomDropdown
                  value={selectedTargetCollection}
                  options={[
                    { value: 'missilevfxs.py', label: 'Missiles' },
                    { value: 'auravfx.py', label: 'Auras' },
                    { value: 'explosionvfxs.py', label: 'Explosions' },
                    { value: 'targetvfx.py', label: 'Target' },
                    { value: 'shieldvfx.py', label: 'Shield' },
                    { value: 'bufvfx.py', label: 'Buf' },
                  ]}
                  onChange={(val) => {
                    setSelectedTargetCollection(val);
                    setUploadMetadata((prev) => ({ ...prev, category: collectionCategoryMap[val] || prev.category }));
                  }}
                />
              </div>
              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>Category</h3>
                <CustomDropdown
                  value={uploadMetadata.category}
                  options={[
                    { value: 'auras', label: 'Auras' },
                    { value: 'missiles', label: 'Missiles' },
                    { value: 'explosions', label: 'Explosions' },
                    { value: 'target', label: 'Target' },
                    { value: 'shield', label: 'Shield' },
                    { value: 'buf', label: 'Buf' },
                  ]}
                  onChange={(val) => setUploadMetadata((prev) => ({ ...prev, category: val }))}
                />
              </div>
            </div>

            {/* Effect Name */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Effect Name</h3>
              <input
                type="text"
                placeholder="MyCustomVFX"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={(e) => { setUploadMetadata((prev) => ({ ...prev, name: localName })); e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              />
            </div>

            {/* Description */}
            <div style={{ ...sectionStyle, flex: 1 }}>
              <h3 style={sectionTitleStyle}>Description</h3>
              <textarea
                placeholder="Custom VFX effect with particles…"
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={(e) => { setUploadMetadata((prev) => ({ ...prev, description: localDescription })); e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              />
            </div>

            {/* Status pills */}
            {(uploadAssets.length > 0 || uploadPreparation) && (
              <div style={{ display: 'flex', gap: 8 }}>
                {uploadAssets.length > 0 && (
                  <div style={{ ...sectionStyle, flex: 1, padding: '10px 14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontFamily: font }}>
                      {uploadAssets.length} asset{uploadAssets.length !== 1 ? 's' : ''} queued
                    </span>
                  </div>
                )}
                {uploadPreparation && (
                  <div style={{ ...sectionStyle, flex: 1, padding: '10px 14px', borderColor: 'color-mix(in srgb, var(--accent), transparent 60%)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontFamily: font, fontWeight: 700 }}>
                      ✓ Ready to upload
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
          borderRadius: '0 0 16px 16px',
        }}>
          <button
            style={btnGhost}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={onClose}
          >Cancel</button>

          {canPrepare && (
            <button
              style={{ ...btnAccent2, opacity: isProcessing ? 0.55 : 1 }}
              onMouseEnter={(e) => { if (!isProcessing) { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 60%)'; e.currentTarget.style.boxShadow = '0 0 14px color-mix(in srgb, var(--accent2), transparent 55%)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 80%)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              onClick={onPrepareUpload}
              disabled={isProcessing}
            >{isProcessing ? 'Analyzing…' : 'Analyze & Prepare'}</button>
          )}

          {canUpload && (
            <button
              style={{ ...btnPrimary, opacity: isProcessing ? 0.55 : 1 }}
              onMouseEnter={(e) => { if (!isProcessing) { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 60%)'; e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--accent), transparent 55%)'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 80%)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              onClick={onExecuteUpload}
              disabled={isProcessing}
            >{isProcessing ? 'Uploading…' : 'Upload to VFX Hub'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
