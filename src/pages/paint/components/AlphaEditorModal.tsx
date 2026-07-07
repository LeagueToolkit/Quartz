import React, { useEffect, useMemo, useState } from 'react';

/* Per-keyframe alpha editor (styled like Port's Matrix Editor). Opens on
   right-click of an emitter color block; lists every keyframe of that color
   with its swatch, time, and an editable alpha (slider + number). Applying
   commits the full alpha array to the bin (RGB is preserved). */

export interface AlphaKeyframe {
    rgba: number[]; // [r,g,b,a] 0..1
    time: number;
}

interface Props {
    open: boolean;
    title: string;
    keyframes: AlphaKeyframe[];
    onApply: (alphas: number[]) => void;
    onClose: () => void;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export default function AlphaEditorModal({ open, title, keyframes, onApply, onClose }: Props) {
    const initial = useMemo(
        () => keyframes.map((k) => clamp01(k.rgba[3] !== undefined ? k.rgba[3] : 1)),
        [keyframes],
    );
    const [alphas, setAlphas] = useState<number[]>(initial);

    useEffect(() => { if (open) setAlphas(initial); }, [open, initial]);

    if (!open) return null;

    const setAt = (i: number, v: number) => {
        setAlphas((prev) => { const next = prev.slice(); next[i] = clamp01(v); return next; });
    };
    const setAll = (v: number) => setAlphas(keyframes.map(() => clamp01(v)));

    const swatch = (rgba: number[], a: number): string => {
        const to = (x: number) => Math.round(clamp01(x) * 255);
        return `rgba(${to(rgba[0])}, ${to(rgba[1])}, ${to(rgba[2])}, ${clamp01(a)})`;
    };

    const btnBase: React.CSSProperties = {
        padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.25s ease', display: 'inline-flex',
        alignItems: 'center', gap: 8, outline: 'none', userSelect: 'none',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column',
                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    borderRadius: 16, boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)', overflow: 'hidden',
                }}
            >
                <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {title} · Alpha
                    </h2>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', outline: 'none' }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh' }}>
                    {keyframes.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>No editable color keyframes.</div>
                    )}
                    {keyframes.map((kf, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Live swatch reflecting the edited alpha over a checkerboard. */}
                            <div style={{ position: 'relative', width: 34, height: 26, borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, backgroundColor: '#888', backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.3) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.3) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.3) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.3) 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0,0 4px,4px -4px,-4px 0' }}>
                                <div style={{ position: 'absolute', inset: 0, background: swatch(kf.rgba, alphas[i] ?? 1) }} />
                            </div>
                            <span style={{ width: 44, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                {keyframes.length > 1 ? `t=${kf.time.toFixed(2)}` : 'const'}
                            </span>
                            <input
                                type="range" min={0} max={1} step={0.01}
                                value={alphas[i] ?? 1}
                                onChange={(e) => setAt(i, parseFloat(e.target.value))}
                                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
                            />
                            <input
                                type="number" min={0} max={1} step={0.01}
                                value={Number((alphas[i] ?? 1).toFixed(2))}
                                onChange={(e) => setAt(i, parseFloat(e.target.value))}
                                style={{ width: 60, height: 28, textAlign: 'center', background: 'var(--bg-primary)', color: 'var(--accent-primary)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', outline: 'none', flexShrink: 0 }}
                            />
                        </div>
                    ))}

                    {keyframes.length > 1 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {[
                                { label: 'All 1.0', v: 1 },
                                { label: 'All 0.5', v: 0.5 },
                                { label: 'All 0.0', v: 0 },
                            ].map((p) => (
                                <button key={p.label} onClick={() => setAll(p.v)} style={{ ...btnBase, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '6px 12px' }}>{p.label}</button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button
                        onClick={() => onApply(alphas.map(clamp01))}
                        disabled={keyframes.length === 0}
                        style={{ ...btnBase, background: 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-secondary) 45%, transparent)', color: 'var(--accent-secondary)', padding: '10px 24px', opacity: keyframes.length === 0 ? 0.5 : 1 }}
                    >
                        Apply Alpha
                    </button>
                </div>
            </div>
        </div>
    );
}
