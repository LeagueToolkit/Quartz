import { useState, useEffect, useRef, type CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
    subtitle: { fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    section: { borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: '12px 14px' },
    sectionTitle: { color: 'var(--accent-secondary)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 8px 0', fontFamily: 'var(--font-mono)' },
    hint: { fontSize: '0.62rem', color: 'var(--text-muted)', margin: '6px 0 0 0', fontFamily: 'var(--font-mono)' },
};

interface Props {
    open: boolean;
    folderName: string;
    onConfirm: (skinId: string | null) => void;
    onCancel: () => void;
}

export default function BnkModDropModal({ open, folderName, onConfirm, onCancel }: Props) {
    const [skinId, setSkinId] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setSkinId('');
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(skinId.trim() || null); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, skinId, onConfirm, onCancel]);

    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onCancel}>
            <div className="dl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Mod Folder</h2>
                    <button className="dl-modal__close" onClick={onCancel} aria-label="Close">✕</button>
                </div>
                <div className="dl-modal__body">
                    <p style={styles.subtitle} title={folderName}>{folderName}</p>

                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Skin ID</h3>
                        <input
                            ref={inputRef}
                            className="dl-input"
                            type="text"
                            value={skinId}
                            onChange={(e) => setSkinId(e.target.value)}
                            placeholder="e.g. 0, 1, 2 …"
                        />
                        <p style={styles.hint}>Leave blank to load all skins · Enter to confirm · Esc to cancel</p>
                    </div>
                </div>
                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>Cancel</button>
                    <button className="dl-btn dl-btn--secondary" onClick={() => onConfirm(null)}>Skip Skin</button>
                    <button className="dl-btn dl-btn--primary" onClick={() => onConfirm(skinId.trim() || null)}>Load</button>
                </div>
            </div>
        </div>
    );
}
