import React from 'react';

interface VfxSystemNamePromptModalProps {
    open: boolean;
    value: string;
    onChange: (v: string) => void;
    onClose: () => void;
    onInsert: () => void;
    placeholder?: string;
}

export default function VfxSystemNamePromptModal({ open, value, onChange, onClose, onInsert, placeholder = 'Enter a unique name (e.g., testname)' }: VfxSystemNamePromptModalProps) {
    if (!open) return null;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') onInsert();
        if (e.key === 'Escape') onClose();
    };

    const btnBase: React.CSSProperties = {
        padding: '8px 18px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'inline-flex',
        alignItems: 'center',
        outline: 'none',
        userSelect: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div
                onClick={(e) => e.stopPropagation()}
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
                    boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: 3,
                        flexShrink: 0,
                        background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite',
                    }}
                />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)' }}>
                        Name VFX System
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
                            color: 'rgba(255,255,255,0.5)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)',
                            cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        {'✕'}
                    </button>
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 14 }}>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                            System Name
                        </div>
                        <input
                            autoFocus
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '10px 14px',
                                background: 'rgba(0,0,0,0.3)',
                                color: 'var(--accent)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8,
                                fontSize: '0.9rem',
                                fontFamily: 'JetBrains Mono, monospace',
                                outline: 'none',
                            }}
                        />
                        <div style={{ marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, fontStyle: 'italic' }}>
                            Configures the Definition Data key, particleName, and particlePath.
                        </div>
                    </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button
                        disabled={!value.trim()}
                        onClick={onInsert}
                        style={{
                            ...btnBase,
                            background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
                            borderColor: 'color-mix(in srgb, var(--accent2), transparent 55%)',
                            color: 'var(--accent2)',
                            opacity: !value.trim() ? 0.5 : 1,
                            cursor: !value.trim() ? 'not-allowed' : 'pointer',
                            padding: '10px 24px',
                        }}
                    >
                        Insert System
                    </button>
                </div>
            </div>
        </div>
    );
}
