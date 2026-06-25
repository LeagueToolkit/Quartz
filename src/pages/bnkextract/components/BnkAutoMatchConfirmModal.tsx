import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import { AutoFixHigh } from '@mui/icons-material';

interface Props {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export default function BnkAutoMatchConfirmModal({ open, onClose, onConfirm }: Props) {
    const paperSx = {
        background: 'linear-gradient(135deg, var(--bg-primary) 0%, color-mix(in oklab, var(--bg-secondary), var(--accent-secondary) 16%) 55%, color-mix(in oklab, var(--bg-secondary), var(--accent-primary) 22%) 100%)',
        border: '1px solid color-mix(in oklab, var(--accent-secondary) 55%, transparent)',
        borderRadius: '18px',
        boxShadow: '0 24px 80px color-mix(in oklab, var(--bg-primary) 70%, transparent)',
        minWidth: 420,
        maxWidth: 560,
        overflow: 'hidden',
        position: 'relative',
    };

    return (
        <Dialog open={open} onClose={onClose} PaperProps={{ sx: paperSx }}>
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                    backgroundSize: '200% 100%',
                    animation: 'bnkAutoMatchShimmer 3s linear infinite',
                    zIndex: 10,
                    '@keyframes bnkAutoMatchShimmer': {
                        '0%': { backgroundPosition: '200% 0' },
                        '100%': { backgroundPosition: '-200% 0' },
                    },
                }}
            />
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    borderBottom: '1px solid var(--border)',
                    background: 'color-mix(in oklab, var(--bg-primary) 80%, transparent)',
                    py: 2,
                    px: 2.4,
                }}
            >
                <Box
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px color-mix(in oklab, var(--accent-secondary) 25%, transparent)',
                        color: 'var(--text-primary)',
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
                <Typography sx={{ color: 'var(--text)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    Auto Match Event IDs
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ pt: 3, pb: 2 }}>
                <Typography sx={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, fontSize: '0.9rem' }}>
                    This will <Box component="span" sx={{ color: 'var(--accent-primary)', fontWeight: 600 }}>automatically replace</Box> left-side WEM data by matching WEM numeric ID prefixes from the right side.
                </Typography>
                <Typography sx={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6, fontSize: '0.9rem', mt: 1 }}>
                    It uses a 6-8 digit prefix match to handle ID shifts between patches.
                </Typography>
                <Box sx={{
                    mt: 2.5,
                    p: 2,
                    background: 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--accent-secondary) 30%, transparent)',
                    borderRadius: '8px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'var(--accent-secondary)' }} />
                    <Typography sx={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', ml: 1 }}>
                        Tip: Use Undo (Ctrl+Z) if you want to revert after applying.
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 2.2, pb: 2.1, pt: 0.4, gap: 1.5, borderTop: '1px solid var(--border)', p: 2 }}>
                <Button
                    onClick={onClose}
                    sx={{
                        color: 'var(--text-primary)',
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        border: '1px solid var(--border-strong)',
                        background: 'color-mix(in oklab, var(--bg-tertiary) 55%, transparent)',
                        borderRadius: '10px',
                        px: 2,
                        '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' }
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    variant="contained"
                    startIcon={<AutoFixHigh sx={{ fontSize: 18 }} />}
                    sx={{
                        background: 'linear-gradient(135deg, color-mix(in oklab, var(--color-success) 62%, transparent), color-mix(in oklab, var(--color-success) 50%, transparent))',
                        color: 'var(--text-primary)',
                        border: '1px solid color-mix(in oklab, var(--color-success) 80%, transparent)',
                        fontWeight: 700,
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        px: 3,
                        borderRadius: '10px',
                        transition: 'transform 160ms ease, box-shadow 220ms ease, background 220ms ease',
                        '&:hover': {
                            background: 'linear-gradient(135deg, color-mix(in oklab, var(--color-success) 82%, transparent), color-mix(in oklab, var(--color-success) 72%, transparent))',
                            transform: 'translateY(-2px) scale(1.035)',
                            boxShadow: '0 14px 30px color-mix(in oklab, var(--color-success) 42%, transparent)',
                        },
                        '&:active': {
                            transform: 'translateY(0) scale(1.01)',
                        },
                    }}
                >
                    Apply Auto Match
                </Button>
            </DialogActions>
        </Dialog>
    );
}
