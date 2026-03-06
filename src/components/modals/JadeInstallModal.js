import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogActions, Button, Box, Typography, IconButton } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Close as CloseIcon } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import { JADE_RELEASES_URL } from '../../utils/interop/jadeInterop';

function JadeInstallModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onMissing = () => setOpen(true);
    window.addEventListener('interop:jade-missing', onMissing);
    return () => window.removeEventListener('interop:jade-missing', onMissing);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const handleDownload = useCallback(async () => {
    try {
      if (window.require) {
        const { shell } = window.require('electron');
        if (shell?.openExternal) {
          await shell.openExternal(JADE_RELEASES_URL);
          return;
        }
      }
      window.open(JADE_RELEASES_URL, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(JADE_RELEASES_URL, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    try {
      localStorage.setItem('settings:open-section', 'tools');
      localStorage.setItem('settings:highlight-jade-path', 'true');
    } catch {}
    handleClose();
    try {
      window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
    } catch {
      window.location.hash = '#/settings';
    }
  }, [handleClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ timeout: 260 }}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
          overflow: 'hidden',
          position: 'relative',
          animation: 'jadeInstallModalPopIn 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          '@keyframes jadeInstallModalPopIn': {
            '0%': { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
            '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
        }
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
          animation: 'jadeInstallShimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes jadeInstallShimmer': {
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
              animation: 'jadeWarningBounce 1.8s ease-in-out infinite',
              border: '1px solid rgba(0,0,0,0.38)',
              boxShadow: '0 0 16px rgba(139, 92, 246, 0.55), inset 0 0 0 1px rgba(255,255,255,0.15), 0 6px 16px rgba(79, 70, 229, 0.35)',
              '@keyframes jadeWarningBounce': {
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
            animation: 'jadeInstallTitleGlow 2.4s ease-in-out infinite',
            '@keyframes jadeInstallTitleGlow': {
              '0%, 100%': { textShadow: '0 0 0 rgba(255,255,255,0)' },
              '50%': { textShadow: '0 0 10px rgba(255,255,255,0.3)' },
            },
          }}>
            Jade Is Not Installed
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={handleClose}
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

      <DialogContent sx={{ p: 3.5, pb: 1.5 }}>
        <Typography sx={{
          color: 'var(--text)',
          fontSize: '0.95rem',
          fontWeight: 500,
          lineHeight: 1.7,
          mb: 2
        }}>
          Jade is a seamless BIN editor built for fast, direct BIN editing without requiring VS Code.
          It is optimized for BIN workflows, lets you make quick changes, and does not require converting to .py.
        </Typography>

        <Typography sx={{
          color: 'var(--text-2)',
          fontSize: '0.87rem',
          fontWeight: 500,
          lineHeight: 1.7
        }}>
          You can also set Jade as the default Windows app for `.bin` files to open bins directly.
        </Typography>
      </DialogContent>

      <DialogActions sx={{
        px: 3,
        pb: 2.4,
        pt: 1.1,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 35%)',
        justifyContent: 'flex-end',
        gap: 1.2,
      }}>
        <Button
          onClick={handleOpenSettings}
          variant="outlined"
          startIcon={<SettingsIcon />}
          sx={{
            textTransform: 'none',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.32)',
            borderRadius: '10px',
            minWidth: 150,
            py: 1,
            px: 2,
          }}
        >
          Open Settings
        </Button>
        <Button
          onClick={handleClose}
          sx={{
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.32)',
            borderRadius: '10px',
            textTransform: 'none',
            minWidth: 120,
            py: 1,
            px: 2,
          }}
          variant="outlined"
        >
          Close
        </Button>
        <Button
          onClick={handleDownload}
          variant="contained"
          startIcon={<DownloadIcon />}
          endIcon={<OpenInNewIcon />}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: '10px',
            minWidth: 185,
            py: 1,
            px: 2.2,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            color: '#fff',
          }}
        >
          Download Jade
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default JadeInstallModal;
