import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

export default function VfxSystemNamePromptModal({
  open,
  value,
  onChange,
  onClose,
  onInsert,
  placeholder = 'Enter a unique name (e.g., testname)',
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          borderRadius: 3,
          overflow: 'hidden',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
          '@keyframes shimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />
      <DialogTitle
        sx={{
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          pb: 1.5,
          pt: 2.5,
          px: 3,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(139, 92, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <WarningIcon sx={{ color: 'var(--accent)', fontSize: 24 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
          Name New VFX System
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', mb: 1 }}>
              System Name
            </Typography>
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'var(--accent)',
                fontSize: '0.95rem',
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
            This will be used for the VfxSystemDefinitionData key, particleName, and particlePath, and linked in ResourceResolver.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1.5 }}>
        <Button
          onClick={onClose}
          sx={{
            color: '#ddd',
            border: '1px solid rgba(255,255,255,0.18)',
            '&:hover': {
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.25)',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onInsert}
          variant="contained"
          sx={{
            background: 'var(--accent-green, #22c55e)',
            color: '#0b131a',
            fontWeight: 600,
            '&:hover': {
              background: 'color-mix(in srgb, var(--accent-green, #22c55e), black 10%)',
            },
          }}
        >
          Insert
        </Button>
      </DialogActions>
    </Dialog>
  );
}
