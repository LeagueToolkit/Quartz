import React from 'react';

interface PortAllModeModalProps {
    open: boolean;
    onClose: () => void;
    onSelectMode: (mode: 'normal' | 'replace-target') => void;
    donorCount?: number;
}

export default function PortAllModeModal({ open, onClose, onSelectMode, donorCount = 0 }: PortAllModeModalProps) {
    if (!open) return null;

    const btnBase: React.CSSProperties = {
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.76rem',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        outline: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 540,
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
                        Port All VFX Systems
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
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: 1.6 }}>
                        Donor systems detected: <span style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{donorCount}</span>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ color: 'var(--accent-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Choose Mode</div>
                        <button onClick={() => onSelectMode('normal')} style={{ ...btnBase, background: 'color-mix(in oklab, var(--accent-secondary) 10%, transparent)', color: 'var(--accent-secondary)' }}>
                            Port All Normally
                        </button>
                        <button onClick={() => onSelectMode('replace-target')} style={{ ...btnBase, background: 'color-mix(in oklab, var(--color-danger) 14%, transparent)', border: '1px solid color-mix(in oklab, var(--color-danger) 32%, transparent)', color: 'var(--color-danger)' }}>
                            Replace Target Then Port All
                        </button>
                        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', lineHeight: 1.5 }}>
                            Replace mode removes existing target VFX systems and matching ResourceResolver particle entries first.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
