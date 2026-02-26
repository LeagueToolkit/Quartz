import React, { useEffect } from 'react';

const styles = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 1400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
    },
    backdrop: {
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
    },
    modal: {
        position: 'relative', width: '100%', maxWidth: 360,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16,
        boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
        overflow: 'hidden',
        fontFamily: 'JetBrains Mono, monospace',
    },
    accentBar: {
        height: 3,
        background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3s linear infinite',
    },
    body: { padding: 24 },
    header: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 6,
    },
    title: {
        fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase',
        fontWeight: 700, color: 'var(--text)', margin: 0,
        fontFamily: 'JetBrains Mono, monospace',
    },
    subtitle: {
        fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)',
        margin: '0 0 14px 0', fontFamily: 'JetBrains Mono, monospace',
    },
    list: {
        display: 'flex', flexDirection: 'column', gap: 6,
        maxHeight: 240, overflowY: 'auto',
    },
    groupBtn: {
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        padding: '9px 12px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)',
        color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.82rem', cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    folderIcon: {
        fontSize: '0.9rem', opacity: 0.6,
        flexShrink: 0,
    },
    groupName: {
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    childCount: {
        fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)',
        flexShrink: 0,
    },
    footer: {
        display: 'flex', justifyContent: 'flex-end',
        marginTop: 14, paddingTop: 14,
        borderTop: '1px solid rgba(255,255,255,0.07)',
    },
    cancelBtn: {
        padding: '7px 16px', borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.75)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
};

export default function BnkAddToGroupModal({ open, count, groups, onConfirm, onCancel }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.backdrop} onClick={onCancel} />
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.accentBar} />
                <div style={styles.body}>
                    <div style={styles.header}>
                        <h2 style={styles.title}>Add to Group</h2>
                        <button
                            onClick={onCancel}
                            style={{
                                width: 28, height: 28, borderRadius: 8, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 13,
                                color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                            }}
                        >✕</button>
                    </div>
                    <p style={styles.subtitle}>{count} file{count !== 1 ? 's' : ''} — pick a group</p>

                    <div style={styles.list}>
                        {groups.map((group) => (
                            <button
                                key={group.id}
                                style={styles.groupBtn}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 85%)';
                                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent), transparent 60%)';
                                    e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                    e.currentTarget.style.color = 'var(--text)';
                                }}
                                onClick={() => onConfirm(group.id)}
                            >
                                <span style={styles.folderIcon}>📁</span>
                                <span style={styles.groupName}>{group.name}</span>
                                <span style={styles.childCount}>{group.children?.length ?? 0} files</span>
                            </button>
                        ))}
                    </div>

                    <div style={styles.footer}>
                        <button
                            style={styles.cancelBtn}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onClick={onCancel}
                        >Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
