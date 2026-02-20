import React from 'react';
import { Backdrop, Box, CircularProgress, Typography } from '@mui/material';

export default function BnkConvertOverlay({ open, convertStatus }) {
    return (
        <Backdrop open={open} sx={{ zIndex: 1500, backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.55)', flexDirection: 'column', gap: '1.25rem' }}>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                '@keyframes wwise-pulse': {
                    '0%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.55, transform: 'scale(0.92)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                },
            }}>
                <CircularProgress size={48} sx={{ color: 'var(--accent)', animation: 'wwise-pulse 1.6s ease-in-out infinite' }} />
                <Typography sx={{ fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', letterSpacing: '0.1em', fontWeight: 600 }}>
                    Synthesizing WEM from Audio Source...
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.4)' }}>
                    {convertStatus}
                </Typography>
            </Box>
        </Backdrop>
    );
}
