import { Backdrop, Box, Typography, Slider, TextField, Button } from '@mui/material';

interface Props {
    open: boolean;
    onClose: () => void;
    gainTargetNodeId: string | null;
    gainDb: string;
    setGainDb: (v: string) => void;
    compactButtonStyle: Record<string, unknown>;
    buttonStyle: Record<string, unknown>;
    onApply: () => void;
}

export default function BnkGainModal({
    open,
    onClose,
    gainTargetNodeId,
    gainDb,
    setGainDb,
    compactButtonStyle,
    buttonStyle,
    onApply,
}: Props) {
    return (
        <Backdrop open={open} onClick={onClose} sx={{ zIndex: 1400, backdropFilter: 'blur(6px)', background: 'color-mix(in oklab, var(--bg-primary) 55%, transparent)' }}>
            <Box onClick={(e) => e.stopPropagation()} sx={{
                background: 'var(--bg-secondary)',
                border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)',
                borderRadius: '12px',
                boxShadow: '0 8px 40px color-mix(in oklab, var(--bg-primary) 70%, transparent)',
                padding: '1.5rem 2rem',
                width: 320,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.08em' }}>
                    Adjust Volume
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Applies to <strong style={{ color: 'var(--text-primary)' }}>{gainTargetNodeId ? 'selected node and all audio below it' : 'selection'}</strong>.<br />
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
                            color: 'var(--accent-primary)',
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
                                background: 'var(--bg-tertiary)',
                                '& fieldset': { borderColor: 'var(--border)' },
                                '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
                            },
                            '& .MuiInputBase-input': { color: 'var(--text-primary)' },
                        }}
                    />
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 20 }}>dB</Typography>
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
                                color: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                borderColor: parseFloat(gainDb) === parseFloat(v) ? 'var(--accent-primary)' : 'var(--border)',
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
                        sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', background: 'var(--accent-primary)', '&:hover': { background: 'var(--accent-hover)' } }}
                    >
                        Apply
                    </Button>
                </Box>
            </Box>
        </Backdrop>
    );
}
