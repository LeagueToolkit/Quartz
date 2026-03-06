import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

function shortName(filePath = '') {
  try {
    const parts = String(filePath).replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  } catch {
    return filePath;
  }
}

export default function ExternalFileChangeModal({
  open,
  filePath = '',
  sourceLabel = 'Jade',
  onClose,
  onReload,
  onKeepLocal,
  onOverwrite,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
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
          animation: 'externalChangeModalPopIn 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          '@keyframes externalChangeModalPopIn': {
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
          animation: 'externalChangeShimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes externalChangeShimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />
      <Box sx={{ px: 2.4, py: 2.2, borderBottom: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)', position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minHeight: 34 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffffff',
              textShadow: '0 5px 5px rgba(0,0,0,0.35)',
              fontWeight: 900,
              fontSize: 20,
              lineHeight: 1,
              border: '1px solid rgba(0,0,0,0.38)',
              boxShadow: '0 0 16px rgba(139, 92, 246, 0.55), inset 0 0 0 1px rgba(255,255,255,0.15), 0 6px 16px rgba(79, 70, 229, 0.35)',
              animation: 'externalChangeWarningBounce 1.8s ease-in-out infinite',
              '@keyframes externalChangeWarningBounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-4px)' },
              },
            }}
          >
            !
          </Box>
          <Box>
            <Typography sx={{ color: 'var(--text)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              External File Change Detected
            </Typography>
            <Typography sx={{ color: 'var(--text-2)', fontSize: 12, mt: 0.4 }}>
              `{shortName(filePath)}` was changed by {sourceLabel} while you have unsaved local edits.
            </Typography>
          </Box>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
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
        <Typography sx={{ color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500 }}>
          Choose what to do:
        </Typography>
        <Typography sx={{ color: 'color-mix(in srgb, var(--text, #ffffff), transparent 10%)', fontSize: '0.87rem', fontWeight: 500, lineHeight: 1.6, mt: 1.1 }}>
          `Use {sourceLabel} Version` discards local unsaved edits and reloads disk content.
          `Overwrite with Local` keeps your local edits and writes them to disk.
          `Keep Local` keeps editing without changing anything right now.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, display: 'flex', justifyContent: 'flex-end', gap: 1.2, background: 'transparent', position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
        <Button
          onClick={onKeepLocal}
          sx={{
            textTransform: 'none',
            minWidth: 150,
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.32)',
            borderRadius: '10px',
            py: 1,
            px: 2.2,
          }}
        >
          Keep Local
        </Button>
        <Button
          onClick={onReload}
          sx={{
            textTransform: 'none',
            minWidth: 190,
            color: '#fff',
            border: '1px solid rgba(34,197,94,0.75)',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.45), rgba(16,185,129,0.35))',
            borderRadius: '10px',
            py: 1,
            px: 2.2,
          }}
        >
          Use {sourceLabel} Version
        </Button>
        <Button
          onClick={onOverwrite}
          sx={{
            textTransform: 'none',
            minWidth: 190,
            color: '#fff',
            border: '1px solid rgba(245,158,11,0.75)',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.45), rgba(249,115,22,0.35))',
            borderRadius: '10px',
            py: 1,
            px: 2.2,
          }}
        >
          Overwrite with Local
        </Button>
      </DialogActions>
    </Dialog>
  );
}
