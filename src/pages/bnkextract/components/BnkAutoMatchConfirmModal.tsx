import { AutoFixHigh } from '@mui/icons-material';

interface Props {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export default function BnkAutoMatchConfirmModal({ open, onClose, onConfirm }: Props) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                {/* decorative accent bar */}
                <div style={{
                    height: 3, flexShrink: 0,
                    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                }} />

                <div className="dl-modal__head">
                    <span className="dl-icon" style={{ color: 'var(--accent-secondary)' }}>⚠</span>
                    <h2 className="dl-modal__title">Auto Match Event IDs</h2>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                        This will <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>automatically replace</span> left-side WEM data by matching WEM numeric ID prefixes from the right side.
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                        It uses a 6-8 digit prefix match to handle ID shifts between patches.
                    </p>
                    <div style={{
                        padding: 16,
                        background: 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)',
                        border: '1px solid color-mix(in oklab, var(--accent-secondary) 30%, transparent)',
                        borderRadius: 8,
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'var(--accent-secondary)' }} />
                        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', marginLeft: 8 }}>
                            Tip: Use Undo (Ctrl+Z) if you want to revert after applying.
                        </span>
                    </div>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="dl-btn dl-btn--primary"
                        onClick={() => { onConfirm(); onClose(); }}
                    >
                        <span className="dl-icon"><AutoFixHigh style={{ fontSize: 18 }} /></span>
                        <span>Apply Auto Match</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
