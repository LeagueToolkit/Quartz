import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
  Box,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import electronPrefs from '../../utils/core/electronPrefs.js';

const WindowsIntegrationReminderModal = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkWindowsIntegration = async () => {
      try {
        await electronPrefs.initPromise;
        const dismissed = electronPrefs.obj.WindowsIntegrationReminderDismissed === true;
        if (dismissed) {
          setChecking(false);
          return;
        }

        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          const result = await ipcRenderer.invoke('contextMenu:isEnabled');
          if (!result?.enabled) {
            setOpen(true);
          }
        }
      } catch (error) {
        console.error('Error checking Windows integration status:', error);
      } finally {
        setChecking(false);
      }
    };

    const timer = setTimeout(checkWindowsIntegration, 1200);
    return () => clearTimeout(timer);
  }, []);

  const persistDismissChoice = async () => {
    if (!dontShowAgain) return;
    try {
      await electronPrefs.set('WindowsIntegrationReminderDismissed', true);
    } catch (error) {
      console.error('Failed to save Windows integration reminder preference:', error);
    }
  };

  const handleClose = async () => {
    await persistDismissChoice();
    setOpen(false);
  };

  const handleOpenSettings = async () => {
    await persistDismissChoice();
    localStorage.setItem('settings:open-section', 'windowsIntegration');
    localStorage.setItem('settings:highlight-windows-integration', 'true');
    setOpen(false);
    navigate('/settings');
  };

  if (checking || !open) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
          overflow: 'hidden',
          position: 'relative',
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
          animation: 'winIntShimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes winIntShimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />

      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
          py: 2,
          px: 2.4,
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
              fontSize: '1.05rem',
            }}
          >
            !
          </Box>
          <Typography sx={{ color: 'var(--text)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
            Windows Integration Disabled
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            width: 34,
            height: 34,
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.75)',
            '&:hover': {
              background: 'rgba(255,255,255,0.08)',
              borderColor: 'rgba(255,255,255,0.22)',
              color: '#ffffff',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 2 }}>
        <Typography
          sx={{
            color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.55,
            fontSize: '0.9rem',
            mb: 2,
          }}
        >
          Windows Integration lets Quartz add Explorer right-click actions for your workflow.
        </Typography>

        <Box sx={{ mb: 2, display: 'grid', gap: 1 }}>
          <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
            - Convert <Box component="span" sx={{ color: 'var(--accent)' }}>.bin</Box> and <Box component="span" sx={{ color: 'var(--accent)' }}>.py</Box> directly from Explorer
          </Typography>
          <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
            - Run VFX and WAD actions from right-click menus
          </Typography>
          <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
            - Add folder actions like batch conversions and pack to <Box component="span" sx={{ color: 'var(--accent)' }}>.wad.client</Box>
          </Typography>
        </Box>

        <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
          Open Settings and enable the Windows Integration toggle.
        </Typography>

        <Box sx={{ mt: 2, display: 'grid', gap: 1.25 }}>
          <Box
            sx={{
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <Box component="img" src="/explanation1.webp" alt="Windows integration example 1" sx={{ width: '100%', display: 'block' }} />
          </Box>
          <Box
            sx={{
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <Box component="img" src="/explanation2.webp" alt="Windows integration example 2" sx={{ width: '100%', display: 'block' }} />
          </Box>
        </Box>

        <FormControlLabel
          sx={{ mt: 1.5 }}
          control={
            <Checkbox
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              sx={{
                color: 'var(--accent)',
                '&.Mui-checked': { color: 'var(--accent)' },
              }}
            />
          }
          label={
            <Typography sx={{ color: 'var(--text-2)', fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
              Never show again
            </Typography>
          }
        />
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, gap: 1 }}>
        <Button
          onClick={handleClose}
          sx={{
            color: '#f5f3ff',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            border: '1px solid rgba(168, 85, 247, 0.7)',
            borderRadius: '10px',
            background: 'rgba(17, 19, 26, 0.35)',
            '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 88%)' },
          }}
        >
          Later
        </Button>
        <Button
          variant="contained"
          onClick={handleOpenSettings}
          startIcon={<SettingsIcon sx={{ color: 'var(--bg)', opacity: 0.9 }} />}
          sx={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.62), rgba(16, 185, 129, 0.5))',
            color: '#ffffff',
            border: '1px solid rgba(167, 243, 208, 0.82)',
            fontWeight: 700,
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            px: 3,
            '&:hover': {
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.82), rgba(16, 185, 129, 0.72))',
            },
            '& .MuiSvgIcon-root': { color: '#ffffff', opacity: 0.95 },
          }}
        >
          Open Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WindowsIntegrationReminderModal;
