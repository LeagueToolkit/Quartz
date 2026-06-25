import { Backdrop, Box, Typography, IconButton, FormControlLabel, Checkbox } from '@mui/material';
import { Settings, Close } from '@mui/icons-material';
import type { ExtractFormat } from '../types';

interface Props {
    showSettingsModal: boolean;
    setShowSettingsModal: (v: boolean) => void;
    extractFormats: Set<ExtractFormat>;
    setExtractFormats: React.Dispatch<React.SetStateAction<Set<ExtractFormat>>>;
    mp3Bitrate: number;
    setMp3Bitrate: (v: number) => void;
    autoPlay: boolean;
    setAutoPlay: (v: boolean) => void;
    multiSelect: boolean;
    setMultiSelect: (v: boolean) => void;
}

const FORMATS: { key: ExtractFormat; label: string; desc: string }[] = [
    { key: 'wem', label: '.wem', desc: 'Raw Wwise audio' },
    { key: 'ogg', label: '.ogg', desc: 'Vorbis (fast)' },
    { key: 'wav', label: '.wav', desc: 'PCM lossless' },
    { key: 'mp3', label: '.mp3', desc: 'Lossy' },
];

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
}: Props) {
    return (
        <Backdrop open={showSettingsModal} sx={{ zIndex: 1400, backdropFilter: 'blur(10px)', background: 'color-mix(in oklab, var(--bg-primary) 50%, transparent)' }}>
            <Box sx={{
                width: 420,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 24px 80px color-mix(in oklab, var(--bg-primary) 60%, transparent)',
                fontFamily: 'JetBrains Mono, monospace',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Settings sx={{ fontSize: 20, color: 'var(--accent-primary)', opacity: 0.8 }} />
                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em', fontFamily: 'JetBrains Mono' }}>
                            Extract Settings
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setShowSettingsModal(false)} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-primary)' } }}>
                        <Close sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>

                <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border), transparent)', mb: 2 }} />

                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1.2, fontFamily: 'JetBrains Mono' }}>
                    Export Formats
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', mb: 2 }}>
                    {FORMATS.map((fmt) => {
                        const desc = fmt.key === 'mp3' ? `Lossy ${mp3Bitrate}kbps` : fmt.desc;
                        const checked = extractFormats.has(fmt.key);
                        return (
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
                                    border: checked ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                    background: checked ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        background: checked ? 'color-mix(in oklab, var(--accent-primary) 18%, transparent)' : 'color-mix(in oklab, var(--text-primary) 5%, transparent)',
                                        borderColor: checked ? 'var(--accent-primary)' : 'var(--border-strong)',
                                    },
                                }}
                            >
                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: checked ? 'var(--accent-primary)' : 'var(--text-secondary)', fontFamily: 'JetBrains Mono', transition: 'color 0.2s ease' }}>
                                    {fmt.label}
                                </Typography>
                                <Typography sx={{ fontSize: '0.6rem', color: checked ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono', mt: 0.3 }}>
                                    {desc}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                {extractFormats.has('mp3') && (
                    <Box sx={{ mb: 2 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 0.8, fontFamily: 'JetBrains Mono' }}>
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
                                        border: mp3Bitrate === rate ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                        background: mp3Bitrate === rate ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: 'var(--border-strong)' },
                                    }}
                                >
                                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: mp3Bitrate === rate ? 'var(--accent-primary)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                                        {rate}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                <Box sx={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border), transparent)', mb: 2 }} />

                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', mb: 1, fontFamily: 'JetBrains Mono' }}>
                    General
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={autoPlay}
                                onChange={(e) => setAutoPlay(e.target.checked)}
                                size="small"
                                sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '4px 8px' }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>Autoplay on click</Typography>}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={multiSelect}
                                onChange={(e) => setMultiSelect(e.target.checked)}
                                size="small"
                                sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, padding: '4px 8px' }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>Multi-select enabled</Typography>}
                    />
                </Box>

                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--border)' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textAlign: 'center' }}>
                        {extractFormats.size === 0 ? 'No formats selected — extraction disabled' : `Extracting as: ${[...extractFormats].map((f) => '.' + f).join(', ')}`}
                    </Typography>
                </Box>
            </Box>
        </Backdrop>
    );
}
