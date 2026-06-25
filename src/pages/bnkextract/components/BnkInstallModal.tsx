import { Backdrop, Box, Typography, LinearProgress, Button } from '@mui/material';

interface Props {
    open: boolean;
    isInstalling: boolean;
    installProgress: string;
    buttonStyle: Record<string, unknown>;
    onCancel: () => void;
    onInstall: () => void;
}

export default function BnkInstallModal({
    open,
    isInstalling,
    installProgress,
    buttonStyle,
    onCancel,
    onInstall,
}: Props) {
    return (
        <Backdrop open={open} sx={{ zIndex: 1400, backdropFilter: 'blur(8px)', background: 'color-mix(in oklab, var(--bg-primary) 60%, transparent)' }}>
            <Box sx={{
                background: 'var(--bg-secondary)',
                border: '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)',
                borderRadius: '14px',
                boxShadow: '0 8px 48px color-mix(in oklab, var(--bg-primary) 70%, transparent)',
                padding: '2rem 2.5rem',
                maxWidth: 420,
                width: '90%',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.08em' }}>
                    Audio Conversion Tools
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Converting <strong style={{ color: 'var(--text-primary)' }}>.wav / .mp3 / .ogg</strong> to WEM
                    requires the Wwise engine (~200 MB). Install it once to your AppData folder.
                </Typography>

                {isInstalling ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <LinearProgress sx={{ borderRadius: 4, height: 4, background: 'var(--border)', '& .MuiLinearProgress-bar': { background: 'var(--accent-primary)' } }} />
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{installProgress}</Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button onClick={onCancel} sx={{ ...buttonStyle, fontSize: '0.75rem' }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={onInstall}
                            variant="contained"
                            sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent-primary)', '&:hover': { background: 'var(--accent-hover)' } }}
                        >
                            Install Wwise Tools
                        </Button>
                    </Box>
                )}
            </Box>
        </Backdrop>
    );
}
