import React from 'react';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { MemoizedInput } from '../common/Inputs';
import type { AvailableVfxSystem } from '../../model';

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: '0.85rem',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 34,
};

const btnBase: React.CSSProperties = {
    padding: '7px 18px',
    borderRadius: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.22s ease',
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid',
};

interface ChildParticleModalProps {
    open: boolean;
    onClose: () => void;
    isEdit?: boolean;
    targetSystem: { key: string; name: string } | null;
    selectedChildSystem: string;
    setSelectedChildSystem: (v: string) => void;
    emitterName: string;
    setEmitterName: (v: string) => void;
    rate: string;
    setRate: (v: string) => void;
    lifetime: string;
    setLifetime: (v: string) => void;
    bindWeight: string;
    setBindWeight: (v: string) => void;
    timeBeforeFirstEmission: string;
    setTimeBeforeFirstEmission: (v: string) => void;
    translationOverrideX: string;
    setTranslationOverrideX: (v: string) => void;
    translationOverrideY: string;
    setTranslationOverrideY: (v: string) => void;
    translationOverrideZ: string;
    setTranslationOverrideZ: (v: string) => void;
    isSingle: boolean;
    setIsSingle: (v: boolean) => void;
    availableSystems: AvailableVfxSystem[];
    onConfirm: () => void;
}

export default function ChildParticleModal(props: ChildParticleModalProps) {
    const {
        open,
        onClose,
        isEdit = false,
        targetSystem,
        selectedChildSystem,
        setSelectedChildSystem,
        emitterName,
        setEmitterName,
        rate,
        setRate,
        lifetime,
        setLifetime,
        bindWeight,
        setBindWeight,
        timeBeforeFirstEmission,
        setTimeBeforeFirstEmission,
        translationOverrideX,
        setTranslationOverrideX,
        translationOverrideY,
        setTranslationOverrideY,
        translationOverrideZ,
        setTranslationOverrideZ,
        isSingle,
        setIsSingle,
        availableSystems,
        onConfirm,
    } = props;
    if (!open) return null;

    const labelSx: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 540,
                    maxHeight: '90vh',
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
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isEdit ? <EditIcon sx={{ color: 'var(--accent-primary)', fontSize: 18 }} /> : <AddIcon sx={{ color: 'var(--accent-primary)', fontSize: 18 }} />}
                        </div>
                        <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isEdit ? 'Edit Child Particle' : 'Add Child Particle'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', outline: 'none' }}
                    >
                        {'✕'}
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Parent System: <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{targetSystem?.name || 'N/A'}</span>
                        </div>
                        {isEdit && (
                            <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Emitter: <span style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{emitterName}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={labelSx}>Child VFX System</label>
                        <select value={selectedChildSystem || ''} onChange={(e) => setSelectedChildSystem(e.target.value)} style={selectStyle}>
                            <option value="" style={{ background: 'var(--bg-primary)' }}>Select a VFX System...</option>
                            {availableSystems.map((sys) => (
                                <option key={sys.key} value={sys.key} style={{ background: 'var(--bg-primary)' }}>
                                    {sys.name} {sys.key.startsWith('0x') ? `(${sys.key})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!isEdit && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={labelSx}>Emitter Name</label>
                            <MemoizedInput value={emitterName} onChange={(e) => setEmitterName(e.target.value)} placeholder="Enter emitter name..." style={inputStyle} />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={labelSx}>Rate</label>
                            <MemoizedInput type="number" value={rate} onChange={(e) => setRate(e.target.value)} step="0.1" min="0" style={inputStyle} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={labelSx}>Lifetime</label>
                            <MemoizedInput type="number" value={lifetime} onChange={(e) => setLifetime(e.target.value)} min="0" style={inputStyle} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={labelSx}>Bind Weight</label>
                            <MemoizedInput type="number" value={bindWeight} onChange={(e) => setBindWeight(e.target.value)} step="0.1" min="0" style={inputStyle} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ ...labelSx, fontSize: '0.7rem', lineHeight: 1.1 }}>Time Before Emission</label>
                            <MemoizedInput type="number" value={timeBeforeFirstEmission} onChange={(e) => setTimeBeforeFirstEmission(e.target.value)} step="0.01" style={inputStyle} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={labelSx}>Translation Override</label>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {(['X', 'Y', 'Z'] as const).map((axis) => (
                                <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-primary)' }}>{axis}</span>
                                    <MemoizedInput
                                        type="number"
                                        value={axis === 'X' ? translationOverrideX : axis === 'Y' ? translationOverrideY : translationOverrideZ}
                                        onChange={(e) => {
                                            if (axis === 'X') setTranslationOverrideX(e.target.value);
                                            if (axis === 'Y') setTranslationOverrideY(e.target.value);
                                            if (axis === 'Z') setTranslationOverrideZ(e.target.value);
                                        }}
                                        step="0.1"
                                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.8rem' }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }} onClick={() => setIsSingle(!isSingle)}>
                        <div
                            style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4,
                                border: isSingle ? '1px solid var(--accent-primary)' : '1px solid var(--border-strong)',
                                background: isSingle ? 'var(--accent-primary)' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {isSingle && <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--bg-primary)' }} />}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: isSingle ? 'var(--text-primary)' : 'var(--text-muted)' }}>Is Single Particle</span>
                    </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <button
                        disabled={!selectedChildSystem || (!isEdit && !emitterName.trim())}
                        onClick={onConfirm}
                        style={{
                            ...btnBase,
                            background: 'color-mix(in oklab, var(--accent-secondary) 12%, transparent)',
                            borderColor: 'color-mix(in oklab, var(--accent-secondary) 45%, transparent)',
                            color: 'var(--accent-secondary)',
                            opacity: !selectedChildSystem || (!isEdit && !emitterName.trim()) ? 0.5 : 1,
                            cursor: !selectedChildSystem || (!isEdit && !emitterName.trim()) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isEdit ? 'Update' : 'Add Child Particle'}
                    </button>
                </div>
            </div>
        </div>
    );
}
