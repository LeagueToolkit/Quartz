import React from 'react';
import { RefreshCw } from 'lucide-react';
import { FormGroup, ToggleSwitch } from '../SettingsPrimitives';

const WindowsIntegrationSection = ({
  contextMenuEnabled,
  handleToggleContextMenu,
  contextMenuLoading
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                <li><strong>NoSkinLite:</strong> Right-click .bin files -> Quartz -> NoSkinLite (Auto-remove skin references)</li>
                <li><strong>Split VFX:</strong> Right-click .bin files -> Quartz -> Split VFX (Extracts all VFX systems into a separate _vfx.bin)</li>
                <li><strong>Combine Linked:</strong> Right-click .bin files -> Quartz -> Combine Linked (Merges linked bin files back into main bin)</li>
                <li><strong>Batch Split (LD):</strong> Right-click .bin files -> Quartz -> Batch Split VFX (Splits emitters for League Director recording)</li>
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
