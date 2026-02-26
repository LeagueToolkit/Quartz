import React, { useState, useEffect, useRef } from 'react';

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
    input: {
        width: '100%', boxSizing: 'border-box',
        borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(0,0,0,0.3)', padding: '8px 12px',
        fontSize: '0.85rem', color: 'var(--text)',
        fontFamily: 'JetBrains Mono, monospace', outline: 'none',
        transition: 'border-color 0.2s',
    },
    hint: {
        fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)',
        margin: '6px 0 0 0', fontFamily: 'JetBrains Mono, monospace',
    },
    footer: {
        display: 'flex', justifyContent: 'flex-end',
        gap: 8, marginTop: 18, paddingTop: 14,
        borderTop: '1px solid rgba(255,255,255,0.07)',
    },
};

const btnGhost = {
    padding: '7px 16px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.2s ease',
};

const btnPrimary = {
    ...btnGhost,
    background: 'color-mix(in srgb, var(--accent), transparent 80%)',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 60%)',
};

export default function BnkGroupNameModal({ open, count, onConfirm, onCancel }) {
    const [name, setName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (open) {
            setName('');
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) onConfirm(name.trim()); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, name, onConfirm, onCancel]);

    if (!open) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.backdrop} onClick={onCancel} />
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.accentBar} />
                <div style={styles.body}>
                    <div style={styles.header}>
                        <h2 style={styles.title}>Create Group</h2>
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
                    <p style={styles.subtitle}>{count} file{count !== 1 ? 's' : ''} selected</p>
                    <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Group name…"
                        style={styles.input}
                        onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    />
                    <p style={styles.hint}>Enter to confirm · Esc to cancel</p>
                    <div style={styles.footer}>
                        <button
                            style={btnGhost}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onClick={onCancel}
                        >Cancel</button>
                        <button
                            style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.45, cursor: name.trim() ? 'pointer' : 'default' }}
                            onMouseEnter={(e) => { if (name.trim()) { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 60%)'; e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--accent), transparent 55%)'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 80%)'; e.currentTarget.style.boxShadow = 'none'; }}
                            onClick={() => { if (name.trim()) onConfirm(name.trim()); }}
                        >Create</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
