import React from 'react';
import { Download, AlertTriangle, Check, RefreshCw, Upload, FolderOpen } from 'lucide-react';
import { FormGroup, StatusBadge, Button, ToggleSwitch, InputWithButton } from '../SettingsPrimitives';

const ToolsSection = ({
  settings,
  updateSetting,
  handleBrowseJadeExecutable,
  jadePathSectionRef,
  hashStatus,
  downloadingHashes,
  handleDownloadHashes,
  updateSectionRef,
  highlightUpdateSection,
  highlightJadePathSection,
  currentVersion,
  newVersion,
  updateStatus,
  updateProgress,
  updateError,
  handleCheckForUpdates,
  handleDownloadUpdate,
  handleInstallUpdate
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <FormGroup label="Jade Interop" description="Control whether Quartz communicates with Jade (open/reload handoffs)">
        <ToggleSwitch
          label="Communicate with Jade"
          checked={settings.communicateWithJade !== false}
          onChange={(checked) => updateSetting('communicateWithJade', checked)}
        />
      </FormGroup>

      <FormGroup label="Jade Executable Path" description="Optional override for Jade location (select Jade.exe)">
        <div
          ref={jadePathSectionRef}
          style={{
            background: highlightJadePathSection ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
            border: highlightJadePathSection ? '2px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '16px',
            transition: 'all 0.3s ease',
            boxShadow: highlightJadePathSection ? '0 0 20px rgba(139, 92, 246, 0.3)' : 'none'
          }}
        >
          <InputWithButton
            value={settings.jadeExecutablePath || ''}
            onChange={(e) => updateSetting('jadeExecutablePath', e.target.value)}
            placeholder="C:\\Users\\<user>\\AppData\\Local\\Jade\\Jade.exe"
            buttonIcon={<FolderOpen size={16} />}
            buttonText="Browse"
            onButtonClick={handleBrowseJadeExecutable}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-2)', opacity: 0.75, marginTop: '8px' }}>
            Leave empty to use auto-detection (PATH / standard install locations).
          </div>
        </div>
      </FormGroup>

      <FormGroup label="File Browser" description="Choose between custom or native Windows file browser">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={settings.useNativeFileBrowser}
            onChange={(e) => updateSetting('useNativeFileBrowser', e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text)' }}>
            Use native Windows file dialog instead of custom explorer
          </span>
        </label>
      </FormGroup>

      <FormGroup label="Hash Files" description="Manage hash file downloads and updates">
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '16px' }}>
          {hashStatus && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <StatusBadge
                status={hashStatus.allPresent ? 'success' : 'warning'}
                text={
                  hashStatus.allPresent
                    ? `All hash files present (${hashStatus.missing.length === 0 ? '6/6' : `${6 - hashStatus.missing.length}/6`})`
                    : `Missing ${hashStatus.missing.length} file(s): ${hashStatus.missing.slice(0, 2).join(', ')}${hashStatus.missing.length > 2 ? '...' : ''}`
                }
              />
            </div>
          )}
          <Button
            icon={<Download size={16} />}
            fullWidth
            variant="secondary"
            onClick={handleDownloadHashes}
            disabled={downloadingHashes}
          >
            {downloadingHashes ? 'Downloading...' : 'Download / Update Hashes'}
          </Button>
        </div>
      </FormGroup>

      <FormGroup label="Application Updates" description="Check for and install updates">
        <div
          ref={updateSectionRef}
          style={{
            background: highlightUpdateSection ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
            border: highlightUpdateSection ? '2px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '16px',
            transition: 'all 0.3s ease',
            boxShadow: highlightUpdateSection ? '0 0 20px rgba(139, 92, 246, 0.3)' : 'none'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: 'var(--accent2)' }}>
            <span>Current Version:</span>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{currentVersion || 'Unknown'}</span>
          </div>

          {newVersion && newVersion !== currentVersion && (
            <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '6px', fontSize: '12px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} />
              New Version Available: <strong>{newVersion}</strong>
            </div>
          )}

          {updateStatus === 'downloading' && (
            <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--accent2)' }}>
              Downloading update: {Math.round(updateProgress.percent)}%
              {updateProgress.total > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text)', opacity: 0.7, marginTop: '4px' }}>
                  {Math.round(updateProgress.transferred / 1024 / 1024)} MB / {Math.round(updateProgress.total / 1024 / 1024)} MB
                </div>
              )}
            </div>
          )}

          {updateError && (
            <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '12px', color: '#ef4444' }}>
              {updateError}
            </div>
          )}

          {updateStatus === 'not-available' && (
            <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: '6px', fontSize: '12px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} />
              You are using the latest version!
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {updateStatus !== 'downloading' && updateStatus !== 'downloaded' && (
              <Button
                icon={updateStatus === 'checking' ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking'}
                variant="secondary"
                style={{ flex: 1, minWidth: '150px' }}
              >
                {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
              </Button>
            )}

            {updateStatus === 'available' && (
              <Button
                icon={<Download size={16} />}
                onClick={handleDownloadUpdate}
                variant="secondary"
                style={{ flex: 1, minWidth: '150px' }}
              >
                Download Update
              </Button>
            )}

            {updateStatus === 'downloaded' && (
              <Button
                icon={<Check size={16} />}
                onClick={handleInstallUpdate}
                variant="secondary"
                style={{ flex: 1, minWidth: '150px' }}
              >
                Install Update
              </Button>
            )}
          </div>
        </div>
      </FormGroup>
    </div>
  );
};

export default ToolsSection;
