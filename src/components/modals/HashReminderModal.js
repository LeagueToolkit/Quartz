import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import electronPrefs from '../../utils/core/electronPrefs.js';

const HashReminderModal = () => {
  const [open, setOpen] = useState(false);
  const [hashStatus, setHashStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const handleDebugOpen = () => {
      setChecking(false);
      setHashStatus({
        allPresent: false,
        missing: ['hashes.bin', 'game.bin.hashes', 'lol.hashes'],
      });
      setOpen(true);
    };

    window.addEventListener('hashReminder:debug-open', handleDebugOpen);
    return () => window.removeEventListener('hashReminder:debug-open', handleDebugOpen);
  }, []);

  useEffect(() => {
    const checkHashesAndShowModal = async () => {
      try {
        // Check if user has dismissed this permanently
        await electronPrefs.initPromise;
        const dismissed = electronPrefs.obj.HashReminderDismissed === true;
        
        if (dismissed) {
          setChecking(false);
          return; // Don't show modal if dismissed
        }

        // Check hash status
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          const status = await ipcRenderer.invoke('hashes:check');
          setHashStatus(status);
          
            // Show modal if hashes are missing (only if not dismissed)
          if (!status.allPresent && status.missing.length > 0) {
            setOpen(true);
          } else {
            setHashStatus(status); // Store status even if not showing
          }
        }
      } catch (error) {
        console.error('Error checking hashes:', error);
      } finally {
        setChecking(false);
      }
    };

    // Small delay to ensure app is fully loaded
    const timer = setTimeout(() => {
      checkHashesAndShowModal();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('hashes:download');
        
        if (result.success) {
          // Refresh status
          const status = await ipcRenderer.invoke('hashes:check');
          setHashStatus(status);
          
          // Close modal if all hashes are now present
          if (status.allPresent) {
            if (dontShowAgain) {
              await electronPrefs.set('HashReminderDismissed', true);
            }
            setOpen(false);
          }
        } else {
          // Show error but keep modal open
          console.error('Hash download errors:', result.errors);
        }
      }
    } catch (error) {
      console.error('Error downloading hashes:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = async () => {
    if (dontShowAgain) {
      await electronPrefs.set('HashReminderDismissed', true);
    }
    setOpen(false);
  };

  const handleLater = async () => {
    if (dontShowAgain) {
      await electronPrefs.set('HashReminderDismissed', true);
    }
    setOpen(false);
  };

  if (checking) {
    return null; // Don't render anything while checking
  }

  if (!open || !hashStatus || hashStatus.allPresent) {
    return null; // Don't show if hashes are present or modal is closed
  }

  return (
    <Dialog
      open={open}
      onClose={handleLater}
      maxWidth="sm"
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
          animation: 'hashReminderShimmer 3s linear infinite',
          zIndex: 10,
          '@keyframes hashReminderShimmer': {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
        }}
      />

      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.14)',
        background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
        py: 2,
        px: 2.4,
        position: 'relative',
        zIndex: 1,
      }}>
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
              animation: 'warningBounce 1.8s ease-in-out infinite',
              '@keyframes warningBounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-4px)' },
              },
            }}
          >
            !
          </Box>
          <Typography sx={{
            color: 'var(--text, #fff)',
            fontSize: '1.1rem',
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace'
          }}>
            Hash Files Required
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={handleLater}
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
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3, pb: 2, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" sx={{
            color: 'var(--text, #fff)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.5
          }}>
            Hash files are required to process BIN files and extract game assets.
          </Typography>

          <Typography variant="body2" sx={{
            color: 'var(--text-2, #cbd5e1)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.875rem'
          }}>
            Missing: <strong style={{ color: 'var(--accent)' }}>{hashStatus.missing.length}</strong> of 6 files
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                sx={{
                  color: 'var(--accent)',
                  '&.Mui-checked': {
                    color: 'var(--accent)',
                  },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{
                color: 'var(--text-2, #cbd5e1)',
                fontSize: '0.875rem',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                Don't show again
              </Typography>
            }
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, flexDirection: 'column', gap: 1.1, position: 'relative', zIndex: 1 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={handleDownload}
          disabled={downloading}
          startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />}
          sx={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.62), rgba(16, 185, 129, 0.5))',
            color: '#ffffff',
            border: '1px solid rgba(167, 243, 208, 0.82)',
            borderRadius: '10px',
            py: 1.05,
            fontWeight: 700,
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            transition: 'transform 160ms ease, box-shadow 220ms ease, filter 220ms ease, background 220ms ease',
            '&:hover': {
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.82), rgba(16, 185, 129, 0.72))',
              transform: 'translateY(-2px) scale(1.035)',
              boxShadow: '0 14px 30px rgba(16, 185, 129, 0.42), 0 0 18px rgba(110, 231, 183, 0.35)',
              filter: 'brightness(1.08)',
            },
            '&:active': { transform: 'translateY(0) scale(1.01)' },
            '&:disabled': { opacity: 0.65, color: 'rgba(255,255,255,0.75)' },
          }}
        >
          {downloading ? 'Downloading...' : 'Download Hashes'}
        </Button>
        <Button
          fullWidth
          onClick={handleLater}
          sx={{
            color: '#f5f3ff',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            border: '1px solid rgba(168, 85, 247, 0.7)',
            borderRadius: '10px',
            background: 'rgba(17, 19, 26, 0.35)',
            transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
            '&:hover': {
              background: 'color-mix(in srgb, var(--accent), transparent 88%)',
              transform: 'translateY(-2px) scale(1.035)',
              boxShadow: '0 12px 24px color-mix(in srgb, var(--accent2), transparent 72%), 0 0 14px color-mix(in srgb, var(--accent2), transparent 60%)'
            },
            '&:active': { transform: 'translateY(0) scale(1.01)' },
          }}
        >
          Later
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HashReminderModal;
