import React, { useEffect, useMemo, useState } from 'react';
import { MemoizedInput } from '../common/Inputs';

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const clampFinite = (v: number) => (Number.isFinite(v) ? v : 0);

interface MatrixEditorModalProps {
    open: boolean;
    initialMatrix?: number[] | null;
    onApply: (mat: number[]) => void;
    onClose: () => void;
}

export default function MatrixEditorModal({ open, initialMatrix, onApply, onClose }: MatrixEditorModalProps) {
    const init = useMemo(() => (Array.isArray(initialMatrix) && initialMatrix.length >= 16 ? initialMatrix.slice(0, 16) : identityMatrix.slice()), [initialMatrix]);
    const [values, setValues] = useState<number[]>(init);

    useEffect(() => {
        if (open) setValues(init);
    }, [open, init]);

    if (!open) return null;

    const setPreset = (arr: number[]) => setValues(arr.slice(0, 16));
    const handleChange = (idx: number, v: string) => {
        const next = values.slice();
        next[idx] = clampFinite(parseFloat(v));
        setValues(next);
    };
    const scalePreset = (s: number) => {
        const next = values.slice();
        next[0] = s;
        next[5] = s;
        next[10] = s;
        setValues(next);
    };
    const mirrorXZ = () => {
        const m = values.slice();
        m[0] = -Math.abs(m[0]);
        m[10] = -Math.abs(m[10]);
        setValues(m);
    };

    const btnBase: React.CSSProperties = {
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        outline: 'none',
        userSelect: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
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
                <div
                    style={{
                        height: 3,
                        flexShrink: 0,
                        background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s linear infinite',
                    }}
                />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Matrix Editor
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
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            4×4 Transform Matrix
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Row-Major Order</div>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 10,
                            padding: 16,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                        }}
                    >
                        {values.map((val, i) => (
                            <MemoizedInput
                                key={i}
                                type="number"
                                step="0.001"
                                value={val}
                                onChange={(e) => handleChange(i, e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '34px',
                                    padding: 0,
                                    background: 'var(--bg-primary)',
                                    color: 'var(--accent-primary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                    fontSize: '0.82rem',
                                    fontFamily: 'var(--font-mono)',
                                    textAlign: 'center',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {[
                            { label: 'Identity', onClick: () => setPreset(identityMatrix) },
                            { label: 'Scale 2×', onClick: () => scalePreset(2) },
                            { label: 'Scale 0.5×', onClick: () => scalePreset(0.5) },
                            { label: 'Mirror XZ', onClick: mirrorXZ },
                        ].map((p) => (
                            <button
                                key={p.label}
                                onClick={p.onClick}
                                style={{ ...btnBase, background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '6px 12px' }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button
                        onClick={() => onApply(values.slice(0, 16))}
                        style={{
                            ...btnBase,
                            background: 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                            borderColor: 'color-mix(in oklab, var(--accent-secondary) 45%, transparent)',
                            color: 'var(--accent-secondary)',
                            padding: '10px 24px',
                        }}
                    >
                        Apply Matrix
                    </button>
                </div>
            </div>
        </div>
    );
}
