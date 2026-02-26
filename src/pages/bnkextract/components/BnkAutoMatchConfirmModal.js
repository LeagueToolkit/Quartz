import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import { AutoFixHigh } from '@mui/icons-material';

export default function BnkAutoMatchConfirmModal({
  open,
  onClose,
  onConfirm,
}) {
  const paperSx = {
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
    border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
    borderRadius: '18px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
    minWidth: 420,
    maxWidth: 560,
    overflow: 'hidden',
    position: 'relative',
  };

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: paperSx }}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
          backgroundSize: '200% 100%',
          animation: 'bnkAutoMatchShimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes bnkAutoMatchShimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
          py: 2,
          px: 2.4,
        }}
      >
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
            fontSize: '1.05rem',
            animation: 'warningBounce 1.8s ease-in-out infinite',
            '@keyframes warningBounce': {
              '0%, 100%': { transform: 'translateY(0)' },
              '50%': { transform: 'translateY(-4px)' },
            },
          }}
        >
          !
        </Box>
        <Typography sx={{ color: 'var(--text)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
          Auto Match Event IDs
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 2 }}>
        <Typography sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, fontSize: '0.9rem' }}>
          This will <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>automatically replace</Box> left-side WEM data by matching WEM numeric ID prefixes from the right side.
        </Typography>
        <Typography sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, fontSize: '0.9rem', mt: 1 }}>
          It uses a 6-8 digit prefix match to handle ID shifts between patches.
        </Typography>
        <Box sx={{
          mt: 2.5,
          p: 2,
          background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
          border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'var(--accent2)' }} />
          <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', ml: 1 }}>
            Tip: Use Undo (Ctrl+Z) if you want to revert after applying.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.2, pb: 2.1, pt: 0.4, gap: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)', p: 2 }}>
        <Button
          onClick={onClose}
          sx={{
            color: '#ffffff',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(18, 20, 28, 0.55)',
            borderRadius: '10px',
            px: 2,
            '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          variant="contained"
          startIcon={<AutoFixHigh sx={{ fontSize: 18 }} />}
          sx={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.62), rgba(16, 185, 129, 0.5))',
            color: '#ffffff',
            border: '1px solid rgba(167, 243, 208, 0.82)',
            fontWeight: 700,
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            px: 3,
            borderRadius: '10px',
            transition: 'transform 160ms ease, box-shadow 220ms ease, filter 220ms ease, background 220ms ease',
            '&:hover': {
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.82), rgba(16, 185, 129, 0.72))',
              transform: 'translateY(-2px) scale(1.035)',
              boxShadow: '0 14px 30px rgba(16, 185, 129, 0.42), 0 0 18px rgba(110, 231, 183, 0.35)',
              filter: 'brightness(1.08)',
            },
            '&:active': {
              transform: 'translateY(0) scale(1.01)',
            },
          }}
        >
          Apply Auto Match
        </Button>
      </DialogActions>
    </Dialog>
  );
}

