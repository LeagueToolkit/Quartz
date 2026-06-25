import React from 'react';

interface NewVfxSystemModalProps {
    open: boolean;
    onClose: () => void;
    newSystemName: string;
    setNewSystemName: (v: string) => void;
    onCreate: () => void;
}

export default function NewVfxSystemModal({ open, onClose, newSystemName, setNewSystemName, onCreate }: NewVfxSystemModalProps) {
    if (!open) return null;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') onCreate();
        if (e.key === 'Escape') onClose();
    };

    const btnBase: React.CSSProperties = {
        padding: '6px 14px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'inline-flex',
        alignItems: 'center',
        outline: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 440,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(180%) blur(16px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    borderRadius: 16,
                    boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        height: 3,
                        background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite',
                        flexShrink: 0,
                    }}
                />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                        New VFX System
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-tertiary)',
                            cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        {'✕'}
                    </button>
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-secondary)', marginBottom: 10 }}>
                            System Name
                        </div>
                        <input
                            autoFocus
                            value={newSystemName}
                            onChange={(e) => setNewSystemName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter a unique name (e.g., testname)"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '8px 12px',
                                background: 'var(--bg-primary)',
                                color: 'var(--accent-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                fontSize: '0.85rem',
                                fontFamily: 'var(--font-mono)',
                                outline: 'none',
                            }}
                        />
                        <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                            Creates a minimal system with an empty emitters list and adds a resolver mapping.
                        </div>
                    </div>
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        onClick={onCreate}
                        style={{ ...btnBase, background: 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-secondary) 35%, transparent)', color: 'var(--accent-secondary)' }}
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
