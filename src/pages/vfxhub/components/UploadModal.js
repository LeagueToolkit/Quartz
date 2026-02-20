import React from 'react';
import githubApi from '../services/githubApi.js';

const collectionCategoryMap = {
  'missilevfxs.py': 'missiles',
  'auravfx.py': 'auras',
  'explosionvfxs.py': 'explosions',
  'targetvfx.py': 'target',
  'shieldvfx.py': 'shield',
  'bufvfx.py': 'buf',
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '10px',
          width: '90%',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          marginLeft: '80px',
          position: 'relative',
          zIndex: 1001,
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: 'color-mix(in srgb, var(--accent), white 14%)' }}>Upload to VFX Hub</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handleSelectAndAttachPreview}>Add Preview</button>
            <button onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>VFX Systems from Target Bin (Will be uploaded):</h3>
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '1rem', minHeight: '150px', maxHeight: '200px', overflowY: 'auto' }}>
              {targetSystemEntries.length === 0 ? (
                <div style={{ color: 'var(--text)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>Open a target bin file to upload its VFX systems</div>
              ) : (
                targetSystemEntries.map(([key, system]) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      borderRadius: '0.3rem',
                      marginBottom: '0.25rem',
                      background: selectedTargetSystems.has(key) ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTargetSystems.has(key)}
                      onChange={(e) => onTargetSystemSelection(key, e.target.checked)}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{system.name || key}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-muted)' }}>{system.emitters?.length || 0} emitters</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Target Collection:</h3>
            <select
              value={selectedTargetCollection}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTargetCollection(val);
                setUploadMetadata((prev) => ({ ...prev, category: collectionCategoryMap[val] || prev.category }));
              }}
            >
              <option value="missilevfxs.py">missilevfxs.py (Missiles)</option>
              <option value="auravfx.py">auravfx.py (Auras)</option>
              <option value="explosionvfxs.py">explosionvfxs.py (Explosions)</option>
              <option value="targetvfx.py">targetvfx.py (Target)</option>
              <option value="shieldvfx.py">shieldvfx.py (Shield)</option>
              <option value="bufvfx.py">bufvfx.py (Buf)</option>
            </select>

            <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem', marginTop: '1rem' }}>Effect Details:</h3>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>Effect Name:</label>
            <input
              type="text"
              placeholder="MyCustomVFX"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => setUploadMetadata((prev) => ({ ...prev, name: localName }))}
            />

            <label style={{ display: 'block', marginTop: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)' }}>Category:</label>
            <select
              value={uploadMetadata.category}
              onChange={(e) => setUploadMetadata((prev) => ({ ...prev, category: e.target.value }))}
            >
              <option value="auras">auras</option>
              <option value="missiles">missiles</option>
              <option value="explosions">explosions</option>
              <option value="target">target</option>
              <option value="shield">shield</option>
              <option value="buf">buf</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>Description:</label>
            <textarea
              placeholder="Custom VFX effect with particles"
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => setUploadMetadata((prev) => ({ ...prev, description: localDescription }))}
              style={{ width: '100%', height: '80px' }}
            />
            {uploadAssets.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Assets: {uploadAssets.length} file(s)</h3>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          {!uploadPreparation && selectedTargetSystems.size > 0 && uploadMetadata.name && (
            <button onClick={onPrepareUpload} disabled={isProcessing}>
              {isProcessing ? 'Analyzing...' : 'Analyze & Prepare Upload'}
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
          {uploadPreparation && (
            <button onClick={onExecuteUpload} disabled={isProcessing}>
              {isProcessing ? 'Uploading...' : 'Upload to VFX Hub'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
