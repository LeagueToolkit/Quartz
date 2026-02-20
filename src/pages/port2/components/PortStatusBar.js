import React from 'react';

export default function PortStatusBar({
  statusMessage,
  targetPyContent,
  trimTargetNames,
  setTrimTargetNames,
  trimDonorNames,
  setTrimDonorNames,
}) {
  return (
    <div
      style={{
        padding: '6px 20px',
        background: 'rgba(255,255,255,0.06)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
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
      {targetPyContent && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={trimTargetNames}
              onChange={(e) => setTrimTargetNames(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Trim Target Names</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={trimDonorNames}
              onChange={(e) => setTrimDonorNames(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Trim Donor Names</span>
          </label>
        </div>
      )}
    </div>
  );
}
