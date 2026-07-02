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
    if (!showSettingsModal) return null;

    const sectionLabel: React.CSSProperties = {
        fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
        letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0,
        fontFamily: 'var(--font-mono)',
    };

    return (
        <div className="dl-modal-backdrop" onClick={() => setShowSettingsModal(false)}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="dl-modal__head">
                    <span className="dl-icon" style={{ color: 'var(--accent-primary)' }}><Settings sx={{ fontSize: 20 }} /></span>
                    <h2 className="dl-modal__title">Extract Settings</h2>
                    <button className="dl-modal__close" onClick={() => setShowSettingsModal(false)} aria-label="Close">
                        <Close sx={{ fontSize: 18 }} />
                    </button>
                </div>

                <div className="dl-modal__body">
                    <p style={sectionLabel}>Export Formats</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {FORMATS.map((fmt) => {
                            const desc = fmt.key === 'mp3' ? `Lossy ${mp3Bitrate}kbps` : fmt.desc;
                            const checked = extractFormats.has(fmt.key);
                            return (
                                <div
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
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '0.75rem 0.5rem',
                                        borderRadius: '10px',
                                        border: checked ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                        background: checked ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: checked ? 'var(--accent-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', transition: 'color 0.2s ease' }}>
                                        {fmt.label}
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: checked ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                                        {desc}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {extractFormats.has('mp3') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <p style={sectionLabel}>MP3 Bitrate</p>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {[64, 128, 192, 256, 320].map((rate) => (
                                    <div
                                        key={rate}
                                        onClick={() => {
                                            setMp3Bitrate(rate);
                                            localStorage.setItem('bnk-extract-mp3-bitrate', rate.toString());
                                        }}
                                        style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            padding: '0.35rem 0',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            border: mp3Bitrate === rate ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                            background: mp3Bitrate === rate ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'color-mix(in oklab, var(--text-primary) 2%, transparent)',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: mp3Bitrate === rate ? 'var(--accent-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                            {rate}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <p style={sectionLabel}>General</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer', userSelect: 'none' }}>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Autoplay on click</span>
                            <span className="dl-toggle">
                                <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
                                <span className="dl-toggle__track" />
                                <span className="dl-toggle__thumb" />
                            </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer', userSelect: 'none' }}>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Multi-select enabled</span>
                            <span className="dl-toggle">
                                <input type="checkbox" checked={multiSelect} onChange={(e) => setMultiSelect(e.target.checked)} />
                                <span className="dl-toggle__track" />
                                <span className="dl-toggle__thumb" />
                            </span>
                        </label>
                    </div>
                </div>

                <div className="dl-modal__foot" style={{ justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                        {extractFormats.size === 0 ? 'No formats selected — extraction disabled' : `Extracting as: ${[...extractFormats].map((f) => '.' + f).join(', ')}`}
                    </span>
                </div>
            </div>
        </div>
    );
}
