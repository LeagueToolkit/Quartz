import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export default function UnsavedChangesModal({
  open,
  onCancel,
  onSave,
  onDiscard,
  fileName = '',
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ timeout: 260 }}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minHeight: 34 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffffff',
              fontSize: '1.3rem',
              fontWeight: 800,
              textShadow: '0 5px 5px rgba(0,0,0,0.35)',

              animation: 'warningBounce 1.8s ease-in-out infinite',
              border: '1px solid rgba(0,0,0,0.38)',
              boxShadow: '0 0 16px rgba(139, 92, 246, 0.55), inset 0 0 0 1px rgba(255,255,255,0.15), 0 6px 16px rgba(79, 70, 229, 0.35)',
              '@keyframes warningBounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-4px)' },
              },
            }}
          >
            !
          </Box>
          <Typography sx={{
            fontWeight: 800,
            fontSize: '1rem',
            letterSpacing: '0.03em',
            color: 'var(--text, #ffffff)',
            textTransform: 'uppercase',
            animation: 'titleGlow 2.4s ease-in-out infinite',
            '@keyframes titleGlow': {
              '0%, 100%': { textShadow: '0 0 0 rgba(255,255,255,0)' },
              '50%': { textShadow: '0 0 10px rgba(255,255,255,0.3)' },
            },
          }}>
            Unsaved Changes
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onCancel}
          sx={{
            mr: 0.1,
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
            '&:active': {
              transform: 'scale(1.02)',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <DialogContent sx={{ p: 3.5, textAlign: 'left', background: 'transparent', position: 'relative', zIndex: 1 }}>
        <Typography sx={{ color: 'var(--text, #ffffff)', fontSize: '0.95rem', fontWeight: 500, mb: 1.5 }}>
          {fileName ? <>You have unsaved changes in <Box component="span" sx={{ color: 'var(--accent2, #8b5cf6)', fontWeight: 700 }}>{fileName}</Box>.</> : 'You have unsaved changes.'}
        </Typography>
        <Typography sx={{ color: 'color-mix(in srgb, var(--text, #ffffff), transparent 10%)', fontSize: '0.87rem', fontWeight: 500, lineHeight: 1.6 }}>
          What would you like to do before leaving?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 0, flexDirection: 'column', gap: 1.25, background: 'transparent', position: 'relative', zIndex: 1 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={onSave}
          sx={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.62), rgba(16, 185, 129, 0.5)) !important',
            color: '#ffffff !important',
            fontWeight: 800,
            textTransform: 'none',
            fontSize: '0.85rem',
            borderRadius: '12px',
            py: 1.25,
            border: '1px solid rgba(167, 243, 208, 0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.28), inset 0 1px 0 rgba(255,255,255,0.18)',
            transition: 'transform 150ms ease, box-shadow 200ms ease, background-color 200ms ease, filter 200ms ease',
            '&:hover': {
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.82), rgba(16, 185, 129, 0.72)) !important',
              transform: 'translateY(-2px) scale(1.02)',
              boxShadow: '0 14px 28px rgba(16, 185, 129, 0.45), 0 0 18px rgba(110, 231, 183, 0.35)',
              filter: 'brightness(1.12)',
            },
            '&:active': {
              transform: 'translateY(0) scale(1)',
            },
          }}
        >
          Save & Continue
        </Button>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', gap: 1.25 }}>
          <Button
            fullWidth
            onClick={onDiscard}
            sx={{
              background: 'rgba(17, 19, 26, 0.35)',
              color: '#f5f3ff',
              border: '1px solid rgba(168, 85, 247, 0.7)',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.75rem',
              borderRadius: '10px',
              py: 1,
              boxShadow: '0 0 10px rgba(168, 85, 247, 0.18)',
              transition: 'transform 150ms ease, background-color 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.14))',
                color: '#ffffff',
                transform: 'translateY(-2px) scale(1.02)',
                boxShadow: '0 12px 24px rgba(139, 92, 246, 0.3), 0 0 14px rgba(217, 70, 239, 0.35)',
                borderColor: 'rgba(216, 180, 254, 0.95)',
              },
              '&:active': {
                transform: 'translateY(0) scale(1)',
              },
            }}
          >
            Discard Changes
          </Button>
          <Button
            fullWidth
            onClick={onCancel}
            sx={{
              background: 'rgba(18, 20, 28, 0.55)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.32)',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.75rem',
              borderRadius: '10px',
              py: 1,
              transition: 'transform 150ms ease, background-color 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
              '&:hover': {
                background: 'rgba(34, 38, 52, 0.62)',
                transform: 'translateY(-2px) scale(1.02)',
                boxShadow: '0 10px 22px rgba(0,0,0,0.35), 0 0 10px rgba(255,255,255,0.12)',
                borderColor: 'rgba(255, 255, 255, 0.52)',
              },
              '&:active': {
                transform: 'translateY(0) scale(1)',
              },
            }}
          >
            <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Stay Here</span>
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
