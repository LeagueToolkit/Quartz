import { Slider } from '@mui/material';

interface Props {
    open: boolean;
    onClose: () => void;
    gainTargetNodeId: string | null;
    gainDb: string;
    setGainDb: (v: string) => void;
    onApply: () => void;
}

export default function BnkGainModal({
    open,
    onClose,
    gainTargetNodeId,
    gainDb,
    setGainDb,
    onApply,
}: Props) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Adjust Volume</h2>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Applies to <strong style={{ color: 'var(--text-primary)' }}>{gainTargetNodeId ? 'selected node and all audio below it' : 'selection'}</strong>.<br />
                        Requires WEM to WAV to WEM re-encode (minor quality loss).
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                        <input
                            className="dl-input"
                            value={gainDb}
                            onChange={(e) => setGainDb(e.target.value)}
                            style={{ width: 60, textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 20 }}>dB</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {['-12', '-6', '-3', '+3', '+6', '+12'].map((v) => {
                            const active = parseFloat(gainDb) === parseFloat(v);
                            return (
                                <button
                                    key={v}
                                    className={`dl-btn dl-btn--sm ${active ? 'dl-btn--primary' : 'dl-btn--secondary'}`}
                                    onClick={() => setGainDb(v.replace('+', ''))}
                                    style={{ minWidth: 44 }}
                                >
                                    <span>{v} dB</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>
                        <span>Cancel</span>
                    </button>
                    <button className="dl-btn dl-btn--primary" onClick={onApply}>
                        <span>Apply</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
