import React from 'react';
import { Box, IconButton, Typography, Alert } from '@mui/material';
import { CheckCircle as CheckCircleIcon, Close as CloseIcon } from '@mui/icons-material';

const BumpathStatusOverlays = React.memo(function BumpathStatusOverlays({ error, success, setSuccess }) {
  return (
    <>
      {error && (
        <Alert
          severity="error"
          sx={{
            position: 'fixed',
            top: 80,
            right: 20,
            zIndex: 1000,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            '& .MuiAlert-message': { color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }
          }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Box
          sx={{
            position: 'fixed',
            top: 80,
            right: 20,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.95)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            transition: 'all 0.3s ease-out'
          }}
        >
          <CheckCircleIcon sx={{ color: '#ffffff', fontSize: '1.2rem' }} />
          <Typography
            variant="body2"
            sx={{
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '500',
              fontFamily: 'JetBrains Mono, monospace',
              flex: 1
            }}
          >
            {success}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setSuccess(null)}
            sx={{
              color: '#ffffff',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            <CloseIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        </Box>
      )}
    </>
  );
});

export default BumpathStatusOverlays;
