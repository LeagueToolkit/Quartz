import React from 'react';
import { Backdrop, Box, Typography, IconButton, FormControlLabel, Checkbox } from '@mui/material';
import { Settings, Close } from '@mui/icons-material';

export default function BnkSettingsModal({
    showSettingsModal,
    setShowSettingsModal,
    extractFormats,
    setExtractFormats,
    mp3Bitrate,
    setMp3Bitrate,
    autoPlay,
    setAutoPlay,
    multiSelect,
    setMultiSelect,
}) {
    return (
        <Backdrop open={showSettingsModal} sx={{ zIndex: 1400, backdropFilter: 'blur(10px)', background: 'rgba(0,0,0,0.5)' }}>
            <Box sx={{
                width: 420,
                background: 'rgba(18, 18, 22, 0.97)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Settings sx={{ fontSize: 20, color: 'var(--accent)', opacity: 0.8 }} />
                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', fontFamily: 'JetBrains Mono' }}>
                            Extract Settings
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setShowSettingsModal(false)} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'rgba(255,255,255,0.8)' } }}>
                        <Close sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>

                <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', mb: 2 }} />

                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1.2, fontFamily: 'JetBrains Mono' }}>
                    Export Formats
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', mb: 2 }}>
                    {[
                        { key: 'wem', label: '.wem', desc: 'Raw Wwise audio' },
                        { key: 'ogg', label: '.ogg', desc: 'Vorbis (fast)' },
                        { key: 'wav', label: '.wav', desc: 'PCM lossless' },
                        { key: 'mp3', label: '.mp3', desc: `Lossy ${mp3Bitrate}kbps` },
                    ].map((fmt) => (
                        <Box
                            key={fmt.key}
                            onClick={() => {
                                setExtractFormats((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(fmt.key)) next.delete(fmt.key);
                                    else next.add(fmt.key);
                                    localStorage.setItem('bnk-extract-formats', JSON.stringify([...next]));
                                    return next;
                                });
                            }}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '0.75rem 0.5rem',
                                borderRadius: '10px',
                                border: extractFormats.has(fmt.key)
                                    ? '1px solid var(--accent)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                background: extractFormats.has(fmt.key)
                                    ? 'rgba(var(--accent-rgb), 0.12)'
                                    : 'rgba(255,255,255,0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    background: extractFormats.has(fmt.key)
                                        ? 'rgba(var(--accent-rgb), 0.18)'
                                        : 'rgba(255,255,255,0.05)',
                                    borderColor: extractFormats.has(fmt.key)
                                        ? 'var(--accent)'
                                        : 'rgba(255,255,255,0.15)',
                                },
                            }}
                        >
                            <Typography sx={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: extractFormats.has(fmt.key) ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
                                fontFamily: 'JetBrains Mono',
                                transition: 'color 0.2s ease',
                            }}>
                                {fmt.label}
                            </Typography>
                            <Typography sx={{
                                fontSize: '0.6rem',
                                color: extractFormats.has(fmt.key) ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
                                fontFamily: 'JetBrains Mono',
                                mt: 0.3,
                            }}>
                                {fmt.desc}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {extractFormats.has('mp3') && (
                    <Box sx={{ mb: 2 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 0.8, fontFamily: 'JetBrains Mono' }}>
                            MP3 Bitrate
                        </Typography>
                        <Box sx={{ display: 'flex', gap: '0.4rem' }}>
                            {[64, 128, 192, 256, 320].map((rate) => (
                                <Box
                                    key={rate}
                                    onClick={() => {
                                        setMp3Bitrate(rate);
                                        localStorage.setItem('bnk-extract-mp3-bitrate', rate.toString());
                                    }}
                                    sx={{
                                        flex: 1,
                                        textAlign: 'center',
                                        padding: '0.35rem 0',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        border: mp3Bitrate === rate
                                            ? '1px solid var(--accent)'
                                            : '1px solid rgba(255,255,255,0.06)',
                                        background: mp3Bitrate === rate
                                            ? 'rgba(var(--accent-rgb), 0.12)'
                                            : 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: 'rgba(255,255,255,0.2)' },
                                    }}
                                >
                                    <Typography sx={{
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        color: mp3Bitrate === rate ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                        fontFamily: 'JetBrains Mono',
                                    }}>
                                        {rate}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', mb: 2 }} />

                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1, fontFamily: 'JetBrains Mono' }}>
                    General
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={autoPlay}
                                onChange={(e) => setAutoPlay(e.target.checked)}
                                size="small"
                                sx={{ color: 'rgba(255,255,255,0.25)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '4px 8px' }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.65)' }}>Autoplay on click</Typography>}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={multiSelect}
                                onChange={(e) => setMultiSelect(e.target.checked)}
                                size="small"
                                sx={{ color: 'rgba(255,255,255,0.25)', '&.Mui-checked': { color: 'var(--accent)' }, padding: '4px 8px' }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.65)' }}>Multi-select enabled</Typography>}
                    />
                </Box>

                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono', textAlign: 'center' }}>
                        {extractFormats.size === 0 ? 'No formats selected â€” extraction disabled' : `Extracting as: ${[...extractFormats].map((f) => '.' + f).join(', ')}`}
                    </Typography>
                </Box>
            </Box>
        </Backdrop>
    );
}

