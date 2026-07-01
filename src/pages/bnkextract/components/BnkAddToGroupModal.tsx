import { useEffect, type CSSProperties } from 'react';
import type { BnkNode } from '../types';

const styles: Record<string, CSSProperties> = {
    list: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' },
    groupBtn: {
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s ease',
    },
    folderIcon: { fontSize: '0.9rem', opacity: 0.6, flexShrink: 0 },
    groupName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    childCount: { fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 },
};

interface Props {
    open: boolean;
    count: number;
    groups: BnkNode[];
    onConfirm: (groupId: string) => void;
    onCancel: () => void;
}

export default function BnkAddToGroupModal({ open, count, groups, onConfirm, onCancel }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onCancel}>
            <div className="dl-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">Add to Group</h2>
                    <button className="dl-modal__close" onClick={onCancel} aria-label="Close">✕</button>
                </div>
                <div className="dl-modal__body">
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {count} file{count !== 1 ? 's' : ''} — pick a group
                    </p>

                    <div style={styles.list}>
                        {groups.map((group) => (
                            <button
                                key={group.id}
                                style={styles.groupBtn}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'color-mix(in oklab, var(--accent-primary) 15%, transparent)';
                                    e.currentTarget.style.borderColor = 'color-mix(in oklab, var(--accent-primary) 40%, transparent)';
                                    e.currentTarget.style.color = 'var(--accent-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }}
                                onClick={() => onConfirm(group.id)}
                            >
                                <span style={styles.folderIcon}>📁</span>
                                <span style={styles.groupName}>{group.name}</span>
                                <span style={styles.childCount}>{group.children?.length ?? 0} files</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="dl-modal__foot">
                    <button className="dl-btn dl-btn--secondary" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
