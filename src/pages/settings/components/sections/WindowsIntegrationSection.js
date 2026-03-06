import React from 'react';
import { RefreshCw } from 'lucide-react';
import { FormGroup, ToggleSwitch } from '../SettingsPrimitives';

const WindowsIntegrationSection = ({
  contextMenuEnabled,
  handleToggleContextMenu,
  contextMenuLoading,
  windowsIntegrationSectionRef,
  highlightWindowsIntegrationSection
}) => {
  return (
    <div
      ref={windowsIntegrationSectionRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        background: highlightWindowsIntegrationSection ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
        border: highlightWindowsIntegrationSection ? '2px solid rgba(139, 92, 246, 0.6)' : '2px solid transparent',
        borderRadius: '10px',
        boxShadow: highlightWindowsIntegrationSection ? '0 0 20px rgba(139, 92, 246, 0.3)' : 'none',
        transition: 'all 0.3s ease',
        padding: highlightWindowsIntegrationSection ? '12px' : '0px',
      }}
    >
      <FormGroup
        label="Windows Explorer Context Menu"
        description="Add Quartz to the right-click menu for .bin and .py files"
      >
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '600', marginBottom: '4px' }}>
                Explorer Integration
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', opacity: 0.7 }}>
                {contextMenuEnabled ? 'Right-click menu is active' : 'Right-click menu is disabled'}
              </div>
            </div>
            <ToggleSwitch
              label=""
              checked={contextMenuEnabled}
              onChange={handleToggleContextMenu}
            />
          </div>

          {contextMenuEnabled && (
            <div style={{ padding: '12px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent2)' }}>
              <div style={{ fontWeight: '600', marginBottom: '8px' }}>Available Actions:</div>
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
                <li><strong>BIN tools:</strong> Convert to .py, Separate VFX, Combine Linked, NoSkinLite, Batch Split VFX.</li>
                <li><strong>PY tools:</strong> Convert to .bin directly from Explorer.</li>
                <li><strong>Texture tools:</strong> .tex/.dds/.png conversions both single-file and folder batch.</li>
                <li><strong>WAD tools:</strong> Extract hashes, Unpack WAD, and Extract hashes + Unpack for .wad/.wad.client.</li>
                <li><strong>Folder ritobin:</strong> Convert all BIN to PY and all PY to BIN recursively.</li>
                <li><strong>Folder WAD:</strong> Pack folder to .wad.client from right-click.</li>
              </ul>
            </div>
          )}

          {contextMenuLoading && (
            <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', fontSize: '12px', color: 'var(--text-2)', textAlign: 'center' }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} />
              Updating registry...
            </div>
          )}
        </div>
      </FormGroup>

      <FormGroup label="About Windows Integration" description="How the context menu works">
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '16px', fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.6' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong style={{ color: 'var(--accent)' }}>What it does:</strong> Adds Quartz to your Windows Explorer right-click menu for quick access.
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong style={{ color: 'var(--accent)' }}>Privacy:</strong> Only modifies your user registry (HKCU). No admin rights required.
          </p>
          <p style={{ margin: '0' }}>
            <strong style={{ color: 'var(--accent)' }}>Uninstall:</strong> Simply toggle off to remove all registry entries.
          </p>
        </div>
      </FormGroup>
    </div>
  );
};

export default WindowsIntegrationSection;
