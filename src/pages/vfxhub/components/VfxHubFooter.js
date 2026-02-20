import React from 'react';
import { Button } from '@mui/material';

export default function VfxHubFooter({
  statusMessage,
  trimTargetNames,
  trimDonorNames,
  setTrimTargetNames,
  setTrimDonorNames,
  handleUndo,
  undoHistory,
  handleSave,
  isProcessing,
  hasChangesToSave,
}) {
  return (
    <>
      <div
        style={{
          padding: '6px 20px',
          background: 'transparent',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <span style={{ flex: 1 }}>{statusMessage}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={trimTargetNames} onChange={(e) => setTrimTargetNames(e.target.checked)} />
            <span>Trim Target Names</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={trimDonorNames} onChange={(e) => setTrimDonorNames(e.target.checked)} />
            <span>Trim Donor Names</span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', padding: '12px 20px', background: 'transparent' }}>
        <Button
          onClick={handleUndo}
          disabled={undoHistory.length === 0}
          sx={{
            flex: 1,
            padding: '0 16px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            fontWeight: 700,
            height: '36px',
            background: 'color-mix(in srgb, #9ca3af, var(--bg) 85%)',
            border: '1px solid rgba(156, 163, 175, 0.3)',
            color: '#9ca3af',
            borderRadius: '4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
          title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action}` : 'Nothing to undo'}
        >
          Undo ({undoHistory.length})
        </Button>
        <Button
          onClick={handleSave}
          disabled={isProcessing || !hasChangesToSave()}
          sx={{
            flex: 1,
            padding: '0 16px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            fontWeight: 700,
            height: '36px',
            background: 'color-mix(in srgb, #22c55e, var(--bg) 85%)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#22c55e',
            borderRadius: '4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
          title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
        >
          Save
        </Button>
      </div>
    </>
  );
}
