import React from 'react';
import { Button } from '@mui/material';

export default function VfxHubToolbar({
  isProcessing,
  isLoadingCollections,
  githubAuthenticated,
  onOpenTargetBin,
  onOpenHub,
  onUpload,
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 20px',
        background: 'transparent',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Button
        onClick={onOpenTargetBin}
        disabled={isProcessing}
        sx={{
          flex: 1,
          padding: '0 16px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
          fontWeight: 700,
          height: '36px',
          background: 'color-mix(in srgb, var(--accent), var(--bg) 85%)',
          border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
          color: 'var(--accent)',
          borderRadius: '4px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {isProcessing ? 'Processing...' : 'Open Target Bin'}
      </Button>

      <Button
        onClick={onOpenHub}
        disabled={isProcessing || isLoadingCollections}
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
      >
        VFX Hub
      </Button>

      <Button
        onClick={onUpload}
        disabled={isProcessing}
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
        title="Upload VFX system to VFX Hub"
      >
        Upload to VFX Hub
      </Button>
    </div>
  );
}
