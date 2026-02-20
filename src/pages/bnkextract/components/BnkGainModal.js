import React from 'react';
import { Backdrop, Box, Typography, Slider, TextField, Button } from '@mui/material';

export default function BnkGainModal({
    open,
    onClose,
    gainTargetNodeId,
    gainDb,
    setGainDb,
    compactButtonStyle,
    buttonStyle,
    onApply,
}) {
    return (
        <Backdrop open={open} onClick={onClose} sx={{ zIndex: 1400, backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.55)' }}>
            <Box onClick={(e) => e.stopPropagation()} sx={{
                background: 'rgba(16,16,24,0.95)',
                border: '1px solid rgba(var(--accent-rgb),0.3)',
                borderRadius: '12px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                padding: '1.5rem 2rem',
                width: 320,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                    Adjust Volume
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                    Applies to <strong style={{ color: 'var(--text)' }}>{gainTargetNodeId ? 'selected node and all audio below it' : 'selection'}</strong>.<br />
                    Requires WEM to WAV to WEM re-encode (minor quality loss).
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Slider
                        min={-24}
                        max={24}
                        step={0.5}
                        value={parseFloat(gainDb) || 0}
                        onChange={(_, v) => setGainDb(String(v))}
                        sx={{
                            flex: 1,
                            color: 'var(--accent)',
                            '& .MuiSlider-thumb': { width: 14, height: 14 },
                            '& .MuiSlider-rail': { opacity: 0.2 },
                        }}
                    />
                    <TextField
                        value={gainDb}
                        onChange={(e) => setGainDb(e.target.value)}
                        size="small"
                        inputProps={{ style: { textAlign: 'center', width: 52, fontFamily: 'JetBrains Mono', fontSize: '0.8rem', padding: '4px 6px' } }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                background: 'rgba(0,0,0,0.3)',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                '&:hover fieldset': { borderColor: 'var(--accent)' },
                            },
                            '& .MuiInputBase-input': { color: 'var(--text)' },
                        }}
                    />
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', minWidth: 20 }}>dB</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {['-12', '-6', '-3', '+3', '+6', '+12'].map((v) => (
                        <Button
                            key={v}
                            onClick={() => setGainDb(v.replace('+', ''))}
                            sx={{
                                ...compactButtonStyle,
                                fontSize: '0.65rem',
                                minWidth: 40,
                                color: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent)' : 'var(--text-2)',
                                borderColor: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                            }}
                        >
                            {v} dB
                        </Button>
                    ))}
                </Box>

                <Box sx={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose} sx={{ ...buttonStyle, fontSize: '0.75rem' }}>Cancel</Button>
                    <Button
                        onClick={onApply}
                        variant="contained"
                        sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent)', '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}
                    >
                        Apply
                    </Button>
                </Box>
            </Box>
        </Backdrop>
    );
}
