import { useState, useEffect, useRef, type CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' },
    backdrop: { position: 'absolute', inset: 0, background: 'color-mix(in oklab, var(--bg-primary) 75%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' },
    modal: {
        position: 'relative', width: '100%', maxWidth: 360,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        borderRadius: 16, boxShadow: '0 30px 70px color-mix(in oklab, var(--bg-primary) 55%, transparent)',
        overflow: 'hidden', fontFamily: 'JetBrains Mono, monospace',
    },
    accentBar: { height: 3, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' },
    body: { padding: 24 },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    title: { fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'JetBrains Mono, monospace' },
    subtitle: { fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 14px 0', fontFamily: 'JetBrains Mono, monospace' },
    input: { width: '100%', boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', outline: 'none', transition: 'border-color 0.2s' },
    hint: { fontSize: '0.62rem', color: 'var(--text-muted)', margin: '6px 0 0 0', fontFamily: 'JetBrains Mono, monospace' },
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' },
};

const btnGhost: CSSProperties = {
    padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--text-primary) 5%, transparent)',
    color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
};
const btnPrimary: CSSProperties = {
    ...btnGhost, background: 'color-mix(in oklab, var(--accent-primary) 20%, transparent)', color: 'var(--accent-primary)', border: '1px solid color-mix(in oklab, var(--accent-primary) 40%, transparent)',
};

interface Props {
    open: boolean;
    count: number;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

export default function BnkGroupNameModal({ open, count, onConfirm, onCancel }: Props) {
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setName('');
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
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
                            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'color-mix(in oklab, var(--text-primary) 4%, transparent)', cursor: 'pointer' }}
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
                        onFocus={(e) => { e.target.style.borderColor = 'var(--accent-primary)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                    />
                    <p style={styles.hint}>Enter to confirm · Esc to cancel</p>
                    <div style={styles.footer}>
                        <button
                            style={btnGhost}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--text-primary) 10%, transparent)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--text-primary) 5%, transparent)'; }}
                            onClick={onCancel}
                        >Cancel</button>
                        <button
                            style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.45, cursor: name.trim() ? 'pointer' : 'default' }}
                            onMouseEnter={(e) => { if (name.trim()) { e.currentTarget.style.background = 'color-mix(in oklab, var(--accent-primary) 40%, transparent)'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--accent-primary) 20%, transparent)'; }}
                            onClick={() => { if (name.trim()) onConfirm(name.trim()); }}
                        >Create</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
