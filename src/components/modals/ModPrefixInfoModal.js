/**
 * ModPrefixInfoModal — explains why every mod needs its own unique prefix.
 *
 * Shared by:
 *  - FrogChanger's CustomPrefixModal (repath)
 *  - Port2's PortDonorFromGameModal (load donor from game)
 *
 * Matches the dark dialog style used by RitobinWarningModal and friends.
 */

import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';

function ModPrefixInfoModal({ open, onClose, context = 'mod' }) {
    const paperSx = {
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 16%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 22%) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
        borderRadius: '18px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
        minWidth: 460,
        maxWidth: 620,
        overflow: 'hidden',
        position: 'relative',
    };

    return (
        <Dialog open={open} onClose={onClose} PaperProps={{ sx: paperSx }}>
            <Box
                sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                    background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
                    backgroundSize: '200% 100%',
                    animation: 'prefixShimmer 3s linear infinite',
                    zIndex: 10,
                    '@keyframes prefixShimmer': {
                        '0%': { backgroundPosition: '200% 0' },
                        '100%': { backgroundPosition: '-200% 0' },
                    },
                }}
            />

            <DialogTitle sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                borderBottom: '1px solid rgba(255,255,255,0.14)',
                background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 20%)',
                py: 2, px: 2.4,
            }}>
                <Box sx={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 16px rgba(139, 92, 246, 0.55)',
                    color: '#fff', fontWeight: 800, fontSize: '1.05rem',
                }}>
                    !
                </Box>
                <Typography sx={{
                    color: 'var(--text)', fontSize: '1.1rem', fontWeight: 600,
                    fontFamily: 'JetBrains Mono, monospace',
                }}>
                    Why your mod needs a prefix
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ pt: 3, pb: 2 }}>
                <Typography sx={{
                    color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
                    lineHeight: 1.6, fontSize: '0.9rem',
                }}>
                    A unique prefix stops Riot updates from breaking your mod and prevents assets from different mods conflicting with each other.
                </Typography>
            </DialogContent>

            <DialogActions sx={{
                px: 2.4, py: 1.6,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                background: 'color-mix(in srgb, var(--bg, #0b0d12), transparent 35%)',
            }}>
                <Button
                    onClick={onClose}
                    sx={{
                        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem',
                        color: 'var(--accent2)',
                        border: '1px solid color-mix(in srgb, var(--accent2), transparent 60%)',
                        background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
                        '&:hover': {
                            background: 'color-mix(in srgb, var(--accent2), transparent 72%)',
                            borderColor: 'var(--accent2)',
                        },
                    }}
                >
                    Got it
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default React.memo(ModPrefixInfoModal);
