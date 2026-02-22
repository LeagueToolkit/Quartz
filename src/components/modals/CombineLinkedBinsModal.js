import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, Checkbox, FormControlLabel,
} from '@mui/material';
import CallMergeIcon from '@mui/icons-material/CallMerge';

function CombineLinkedBinsModal({ open, linkCount = 0, onYes, onNo }) {
    const [dontAskAgain, setDontAskAgain] = useState(false);

    useEffect(() => {
        if (open) setDontAskAgain(false);
    }, [open]);

    const paperSx = {
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg, #0b0d12), black 8%) 0%, color-mix(in srgb, var(--surface, #11131a), var(--accent2, #8b5cf6) 14%) 55%, color-mix(in srgb, var(--surface, #11131a), var(--accent, #7c3aed) 18%) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent2, #8b5cf6), transparent 45%)',
        borderRadius: '18px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 24px color-mix(in srgb, var(--accent2, #8b5cf6), transparent 75%)',
        minWidth: 400,
        maxWidth: 500,
        overflow: 'hidden',
        position: 'relative',
    };

    return (
        <Dialog open={open} PaperProps={{ sx: paperSx }}>
            {/* Shimmer bar */}
            <Box sx={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                background: 'linear-gradient(90deg, var(--accent, #7c3aed), var(--accent2, #8b5cf6), var(--accent, #7c3aed))',
                backgroundSize: '200% 100%',
                animation: 'clbShimmer 3s linear infinite',
                zIndex: 10,
                '@keyframes clbShimmer': {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' },
                },
            }} />

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
                    color: '#fff',
                    animation: 'clbBounce 1.8s ease-in-out infinite',
                    '@keyframes clbBounce': {
                        '0%, 100%': { transform: 'translateY(0)' },
                        '50%': { transform: 'translateY(-4px)' },
                    },
                }}>
                    <CallMergeIcon sx={{ fontSize: 18 }} />
                </Box>
                <Typography sx={{
                    color: 'var(--text)',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono, monospace',
                }}>
                    Linked BINs Detected
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ pt: 3, pb: 2 }}>
                <Typography sx={{
                    color: 'var(--text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    lineHeight: 1.6,
                    fontSize: '0.9rem',
                    mb: 2,
                }}>
                    This BIN has{' '}
                    <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {linkCount} linked files
                    </Box>{' '}
                    that aren{"'"}t merged in.
                </Typography>

                <Box sx={{
                    p: 2,
                    background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
                    border: '1px solid color-mix(in srgb, var(--accent2), transparent 65%)',
                    borderRadius: '8px',
                    mb: 2,
                }}>
                    <Typography sx={{
                        color: 'var(--text)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.82rem',
                        lineHeight: 1.6,
                    }}>
                        Port, Paint, VFXHub and BinEditor work best with a single merged BIN.
                        Combining will merge all linked files into one and delete the originals.
                    </Typography>
                </Box>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={dontAskAgain}
                            onChange={e => setDontAskAgain(e.target.checked)}
                            size="small"
                            sx={{ color: 'rgba(255,255,255,0.4)', '&.Mui-checked': { color: 'var(--accent2)' } }}
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', fontFamily: 'JetBrains Mono, monospace' }}>
                            Don{"'"}t ask again for this file this session
                        </Typography>
                    }
                />
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <Button
                    onClick={() => onNo(dontAskAgain)}
                    sx={{
                        color: '#ffffff',
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        border: '1px solid rgba(255,255,255,0.25)',
                        background: 'rgba(18, 20, 28, 0.55)',
                        borderRadius: '10px',
                        px: 2,
                        '&:hover': { background: 'rgba(255,255,255,0.07)' },
                    }}
                >
                    Skip
                </Button>
                <Button
                    variant="contained"
                    onClick={() => onYes(dontAskAgain)}
                    sx={{
                        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 25%), color-mix(in srgb, var(--accent2), transparent 25%))',
                        color: '#ffffff',
                        border: '1px solid color-mix(in srgb, var(--accent2), transparent 40%)',
                        fontWeight: 700,
                        textTransform: 'none',
                        fontFamily: 'JetBrains Mono, monospace',
                        px: 3,
                        borderRadius: '10px',
                        transition: 'transform 160ms ease, box-shadow 220ms ease',
                        '&:hover': {
                            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), transparent 10%), color-mix(in srgb, var(--accent2), transparent 10%))',
                            transform: 'translateY(-2px) scale(1.03)',
                            boxShadow: '0 10px 26px color-mix(in srgb, var(--accent2), transparent 60%)',
                        },
                        '&:active': { transform: 'translateY(0) scale(1.01)' },
                    }}
                >
                    Combine
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default CombineLinkedBinsModal;
