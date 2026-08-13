interface Props {
    open: boolean;
    /** How many files the operation will overwrite. */
    count: number;
    onClose: () => void;
    onConfirm: () => void;
}

/* Confirmation for Remove Black. The operation overwrites the selected textures in
   place with no undo, and it is not idempotent (running it twice fades everything
   roughly twice as far), so a misclick is worth one extra step to prevent. */
export default function RemoveBlackConfirmModal({ open, count, onClose, onConfirm }: Props) {
    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
                <div style={{
                    height: 3, flexShrink: 0,
                    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                }} />

                <div className="dl-modal__head">
                    <span className="dl-icon" style={{ color: 'var(--accent-secondary)' }}>⚠</span>
                    <h2 className="dl-modal__title">Remove Black</h2>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="dl-modal__body">
                    <p style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                        This fades black to transparent in{' '}
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {count} file{count !== 1 ? 's' : ''}
                        </span>
                        , overwriting them on disk. Colors are not changed.
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
                            There is no undo, and running it twice fades the textures twice as far. Keep a backup if you are unsure.
                        </span>
                    </div>
                </div>

                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onClose}>Cancel</button>
                    <button className="dl-btn dl-btn--primary" onClick={() => { onConfirm(); onClose(); }}>
                        Remove Black
                    </button>
                </div>
            </div>
        </div>
    );
}
