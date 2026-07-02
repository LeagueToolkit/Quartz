import { Backdrop, Box, CircularProgress, Typography } from '@mui/material';

interface Props {
    open: boolean;
    convertStatus: string;
}

export default function BnkConvertOverlay({ open, convertStatus }: Props) {
    return (
        <Backdrop open={open} sx={{ zIndex: 1500, backdropFilter: 'blur(12px)', background: 'color-mix(in oklab, var(--bg-primary) 55%, transparent)', flexDirection: 'column', gap: '1.25rem' }}>
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
                <CircularProgress size={48} sx={{ color: 'var(--accent-primary)', animation: 'wwise-pulse 1.6s ease-in-out infinite' }} />
                <Typography sx={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', letterSpacing: '0.1em', fontWeight: 600 }}>
                    Synthesizing WEM from Audio Source...
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {convertStatus}
                </Typography>
            </Box>
        </Backdrop>
    );
}
