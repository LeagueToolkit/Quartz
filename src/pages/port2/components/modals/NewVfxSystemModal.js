import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

export default function NewVfxSystemModal({
  open,
  onClose,
  newSystemName,
  setNewSystemName,
  onCreate,
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
            backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <WarningIcon sx={{ color: 'var(--accent)', fontSize: '1.5rem' }} />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: 'var(--accent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1rem',
          }}
        >
          New VFX System
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'var(--accent2)', mb: 1, fontSize: '0.875rem' }}>
              System Name
            </Typography>
            <input
              autoFocus
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              placeholder="Enter a unique name (e.g., testname)"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'var(--accent-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
            This will create a minimal system with empty emitters list and add a resolver mapping.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.06)', gap: 1.5 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            color: 'var(--accent2)',
            borderColor: 'rgba(255, 255, 255, 0.06)',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.8rem',
            px: 2,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onCreate}
          variant="contained"
          sx={{
            backgroundColor: 'var(--accent)',
            color: 'var(--surface)',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.8rem',
            fontWeight: 600,
            px: 2.5,
          }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
