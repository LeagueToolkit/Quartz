import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';

export default function WadExplorerDialog({
  open,
  title,
  message,
  detail = '',
  actions = [],
  onClose,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 14%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 18%) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
          minWidth: 430,
          maxWidth: 560,
          overflow: 'hidden',
          position: 'relative',
        },
      }}
    >
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
      }} />
      <DialogTitle sx={{ color: 'var(--text)', borderBottom: '1px solid rgba(255,255,255,0.12)', fontWeight: 700 }}>
        {title}
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5, pb: 1.5 }}>
        <Typography sx={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.55 }}>
          {message}
        </Typography>
        {detail ? (
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', lineHeight: 1.5, mt: 1.5 }}>
            {detail}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.08)', gap: 1 }}>
        {actions.map((a) => (
          <Button
            key={a.id}
            onClick={a.onClick}
            variant={a.primary ? 'contained' : 'outlined'}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: '10px',
              color: '#fff',
              borderColor: a.primary ? 'color-mix(in srgb, var(--accent2), transparent 35%)' : 'rgba(255,255,255,0.26)',
              background: a.primary
                ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 22%), color-mix(in srgb, var(--accent2), transparent 22%))'
                : 'rgba(17, 20, 28, 0.35)',
              '&:hover': {
                borderColor: a.primary ? 'color-mix(in srgb, var(--accent2), transparent 20%)' : 'rgba(255,255,255,0.38)',
                background: a.primary
                  ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 8%), color-mix(in srgb, var(--accent2), transparent 8%))'
                  : 'rgba(255,255,255,0.08)',
              },
            }}
          >
            {a.label}
          </Button>
        ))}
      </DialogActions>
    </Dialog>
  );
}
