import { useState } from 'react';

interface PortDonorFromGameModalProps {
    open: boolean;
    loading: boolean;
    progressText: string;
    onClose: () => void;
    onConfirm: (args: { champion: { id: string; name: string }; skin: { id: number; name: string }; portingPrefix: string }) => void;
}

/* "Load donor from game" prep step. Extracts + consolidates a donor from a live
   skin WAD through the native pipeline, then loads the returned ritobin text as
   the donor bin. */
export default function PortDonorFromGameModal({ open, loading, progressText, onClose, onConfirm }: PortDonorFromGameModalProps) {
    const [championName, setChampionName] = useState('');
    const [skinId, setSkinId] = useState('0');
    const [portingPrefix, setPortingPrefix] = useState('');

    if (!open) return null;

    const inputStyle: React.CSSProperties = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 14px',
        background: 'var(--bg-primary)',
        color: 'var(--accent-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: '0.85rem',
        fontFamily: 'var(--font-mono)',
        outline: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => !loading && onClose()} />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 480,
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
                <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>Load Donor From Game</h2>
                    <button
                        onClick={() => !loading && onClose()}
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', outline: 'none' }}
                    >
                        {'✕'}
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Champion</span>
                        <input value={championName} onChange={(e) => setChampionName(e.target.value)} placeholder="e.g., Ahri" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Skin ID</span>
                        <input value={skinId} onChange={(e) => setSkinId(e.target.value)} placeholder="0" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Porting Prefix</span>
                        <input value={portingPrefix} onChange={(e) => setPortingPrefix(e.target.value)} placeholder="prefix" style={inputStyle} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        Extracts the skin from your live League install and loads it as the donor. The porting prefix folds VFX assets under one folder.
                    </div>
                    {progressText && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{progressText}</div>}
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        disabled={loading || !championName.trim() || !portingPrefix.trim()}
                        onClick={() => onConfirm({ champion: { id: championName, name: championName }, skin: { id: Number(skinId) || 0, name: `Skin${skinId}` }, portingPrefix })}
                        style={{
                            padding: '8px 18px',
                            borderRadius: 8,
                            border: '1px solid color-mix(in oklab, var(--accent-secondary) 45%, transparent)',
                            background: 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                            color: 'var(--accent-secondary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: loading || !championName.trim() || !portingPrefix.trim() ? 'not-allowed' : 'pointer',
                            opacity: loading || !championName.trim() || !portingPrefix.trim() ? 0.5 : 1,
                            outline: 'none',
                        }}
                    >
                        {loading ? 'Preparing…' : 'Prepare Donor'}
                    </button>
                </div>
            </div>
        </div>
    );
}
