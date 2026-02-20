import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
} from '@mui/material';
import { AutoFixHigh as AutoFixHighIcon, Tune as TuneIcon } from '@mui/icons-material';
import { getActionButtonSx } from '../utils/styles';

const SourceAddModeModal = React.memo(function SourceAddModeModal({
  open,
  sourceDirLabel,
  onQuick,
  onNormal,
  onClose,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg), black 12%) 0%, color-mix(in srgb, var(--surface), var(--accent2) 10%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2), transparent 55%)',
          borderRadius: '14px',
        }
      }}
    >
      <DialogTitle sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
        Source Folder Added
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'var(--text-2)', mb: 1.5 }}>
          Choose your workflow for this source folder.
        </Typography>
        {sourceDirLabel && (
          <Box
            sx={{
              px: 1.25,
              py: 0.75,
              borderRadius: '8px',
              border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
              background: 'color-mix(in srgb, var(--accent2), transparent 92%)',
              mb: 1
            }}
          >
            <Typography sx={{ color: 'var(--text-2)', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {sourceDirLabel}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button startIcon={<AutoFixHighIcon />} onClick={onQuick} sx={getActionButtonSx('#8b5cf6', { prominent: true })}>
          Quick Repath (Recommended)
        </Button>
        <Button startIcon={<TuneIcon />} onClick={onNormal} sx={getActionButtonSx('#06b6d4')}>
          Normal Repath
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default SourceAddModeModal;
