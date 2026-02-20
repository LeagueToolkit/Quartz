import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export default function RitoBinErrorDialog({
  open,
  onClose,
  onRestoreBackup,
  celestialButtonStyle = {},
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      TransitionProps={{ timeout: 260 }}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
          minWidth: '450px',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
          overflow: 'hidden',
          position: 'relative',
          animation: 'modalPopIn 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          '@keyframes modalPopIn': {
            '0%': { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
            '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
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
          background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes shimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />
      <Box
        sx={{
          px: 2.4,
          py: 2.2,
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(139, 92, 246, 0.55)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.1rem',
              animation: 'warningBounce 1.8s ease-in-out infinite',
              '@keyframes warningBounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-4px)' },
              },
            }}
          >
            !
          </Box>
          <Typography
            sx={{
              margin: 0,
              color: 'var(--text)',
              fontSize: '1.1rem',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Conversion Failed
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            width: 34,
            height: 34,
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.75)',
            transition: 'all 0.18s ease',
            '&:hover': {
              background: 'rgba(255,255,255,0.08)',
              borderColor: 'rgba(255,255,255,0.22)',
              color: '#ffffff',
              transform: 'scale(1.06)',
            },
            '&:active': { transform: 'scale(1.02)' },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 2.5, background: 'transparent', position: 'relative', zIndex: 1 }}>
        <Typography
          sx={{
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.6,
            fontSize: '0.9rem',
            mb: 2,
          }}
        >
          RitoBin failed to convert the file. This usually means the App broke the code or the Python code was invalid before.
        </Typography>
        <Typography
          sx={{
            color: 'var(--text-2)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.6,
            fontSize: '0.9rem',
          }}
        >
          Would you like to restore the file to its previous state from the latest backup?
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 2.2, pt: 0.5, gap: 1, borderTop: '1px solid rgba(255, 255, 255, 0.06)', background: 'transparent', position: 'relative', zIndex: 1 }}>
        <Button
          onClick={onClose}
          sx={{
            ...celestialButtonStyle,
            color: 'var(--text-2)',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
            '&:hover': {
              background: 'rgba(255, 255, 255, 0.05)',
              transform: 'translateY(-2px) scale(1.03)',
              boxShadow: '0 10px 22px rgba(0,0,0,0.3), 0 0 10px rgba(255,255,255,0.12)',
              color: 'var(--text)',
            },
            '&:active': { transform: 'translateY(0) scale(1.01)' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onRestoreBackup}
          sx={{
            ...celestialButtonStyle,
            borderColor: 'rgba(239, 68, 68, 0.55)',
            color: '#fca5a5',
            background: 'rgba(239, 68, 68, 0.08)',
            transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
            '&:hover': {
              background: 'rgba(239, 68, 68, 0.16)',
              borderColor: '#ef4444',
              transform: 'translateY(-2px) scale(1.03)',
              boxShadow: '0 0 15px rgba(239, 68, 68, 0.25), 0 10px 22px rgba(0,0,0,0.32)',
            },
            '&:active': { transform: 'translateY(0) scale(1.01)' },
          }}
        >
          Restore Backup
        </Button>
      </DialogActions>
    </Dialog>
  );
}
