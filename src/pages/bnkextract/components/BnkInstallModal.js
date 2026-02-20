import React from 'react';
import { Backdrop, Box, Typography, LinearProgress, Button } from '@mui/material';

export default function BnkInstallModal({
    open,
    isInstalling,
    installProgress,
    buttonStyle,
    onCancel,
    onInstall,
}) {
    return (
        <Backdrop open={open} sx={{ zIndex: 1400, backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.6)' }}>
            <Box sx={{
                background: 'rgba(16,16,24,0.92)',
                border: '1px solid rgba(var(--accent-rgb),0.35)',
                borderRadius: '14px',
                boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
                padding: '2rem 2.5rem',
                maxWidth: 420,
                width: '90%',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                    Audio Conversion Tools
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                    Converting <strong style={{ color: 'var(--text)' }}>.wav / .mp3 / .ogg</strong> to WEM
                    requires the Wwise engine (~200 MB). Install it once to your AppData folder.
                </Typography>

                {isInstalling ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <LinearProgress sx={{ borderRadius: 4, height: 4, background: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{installProgress}</Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button onClick={onCancel} sx={{ ...buttonStyle, fontSize: '0.75rem' }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={onInstall}
                            variant="contained"
                            sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent)', '&:hover': { background: 'var(--accent)', filter: 'brightness(1.15)' } }}
                        >
                            Install Wwise Tools
                        </Button>
                    </Box>
                )}
            </Box>
        </Backdrop>
    );
}
