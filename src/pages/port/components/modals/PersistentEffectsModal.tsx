import React from 'react';
import { MemoizedInput } from '../common/Inputs';
import type { EffectKeyOption, PersistentPreset, PersistentVfxItem, PersistentCondition } from '../../utils/persistentEffectsManager';

interface TypeOption {
    value: string;
    label: string;
    description?: string;
}

interface PersistentEffectsModalProps {
    showPersistentModal: boolean;
    setShowPersistentModal: (v: boolean) => void;
    persistentPreset: PersistentPreset;
    setPersistentPreset: React.Dispatch<React.SetStateAction<PersistentPreset>>;
    typeOptions: TypeOption[];
    typeDropdownOpen: boolean;
    setTypeDropdownOpen: (v: boolean) => void;
    typeDropdownRef: React.RefObject<HTMLDivElement>;
    persistentShowSubmeshes: string[];
    setPersistentShowSubmeshes: React.Dispatch<React.SetStateAction<string[]>>;
    persistentHideSubmeshes: string[];
    setPersistentHideSubmeshes: React.Dispatch<React.SetStateAction<string[]>>;
    availableSubmeshes: string[];
    customShowSubmeshInput: string;
    setCustomShowSubmeshInput: (v: string) => void;
    handleAddCustomShowSubmesh: () => void;
    customHideSubmeshInput: string;
    setCustomHideSubmeshInput: (v: string) => void;
    handleAddCustomHideSubmesh: () => void;
    handleRemoveCustomSubmesh: (s: string, type: 'show' | 'hide') => void;
    persistentVfx: PersistentVfxItem[];
    setPersistentVfx: React.Dispatch<React.SetStateAction<PersistentVfxItem[]>>;
    effectKeyOptions: EffectKeyOption[];
    vfxSearchTerms: Record<number, string>;
    setVfxSearchTerms: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    vfxDropdownOpen: Record<number, boolean>;
    setVfxDropdownOpen: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
    existingConditions: PersistentCondition[];
    showExistingConditions: boolean;
    setShowExistingConditions: (v: boolean) => void;
    handleLoadExistingCondition: (c: PersistentCondition) => void;
    editingConditionIndex: number | null;
    handleApplyPersistent: () => void;
}

const fieldInputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    color: 'var(--accent)',
    fontSize: '0.9rem',
    fontFamily: 'JetBrains Mono, monospace',
};

export default function PersistentEffectsModal(props: PersistentEffectsModalProps) {
    const {
        showPersistentModal,
        setShowPersistentModal,
        persistentPreset,
        setPersistentPreset,
        typeOptions,
        typeDropdownOpen,
        setTypeDropdownOpen,
        typeDropdownRef,
        persistentShowSubmeshes,
        setPersistentShowSubmeshes,
        persistentHideSubmeshes,
        setPersistentHideSubmeshes,
        availableSubmeshes,
        customShowSubmeshInput,
        setCustomShowSubmeshInput,
        handleAddCustomShowSubmesh,
        customHideSubmeshInput,
        setCustomHideSubmeshInput,
        handleAddCustomHideSubmesh,
        handleRemoveCustomSubmesh,
        persistentVfx,
        setPersistentVfx,
        effectKeyOptions,
        vfxSearchTerms,
        setVfxSearchTerms,
        vfxDropdownOpen,
        setVfxDropdownOpen,
        existingConditions,
        showExistingConditions,
        setShowExistingConditions,
        handleLoadExistingCondition,
        editingConditionIndex,
        handleApplyPersistent,
    } = props;

    if (!showPersistentModal) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={() => setShowPersistentModal(false)} />
            <div
                className="persistent-modal"
                style={{
                    position: 'relative',
                    width: '90%',
                    maxWidth: 1000,
                    height: '80%',
                    maxHeight: 700,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(180%) blur(16px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                    borderRadius: 16,
                    boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite', flexShrink: 0 }} />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)' }}>Persistent Effects</h2>
                    <button
                        onClick={() => setShowPersistentModal(false)}
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', outline: 'none' }}
                    >
                        {'✕'}
                    </button>
                </div>

                <div
                    style={{ display: 'flex', flex: 1, overflow: 'hidden' }}
                    onClick={() => {
                        setVfxDropdownOpen({});
                        setShowExistingConditions(false);
                    }}
                >
                    {/* Left Panel - Condition */}
                    <div style={{ flex: '0 0 380px', padding: '1.5rem', borderRight: '1px solid rgba(255,255,255,0.08)', overflow: 'auto' }}>
                        <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Condition</div>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Type:</span>
                                <div style={{ position: 'relative' }} ref={typeDropdownRef}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTypeDropdownOpen(!typeDropdownOpen);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: 8,
                                            color: 'var(--accent)',
                                            fontSize: '0.9rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span>{typeOptions.find((opt) => opt.value === persistentPreset.type)?.label || persistentPreset.type}</span>
                                        <span style={{ transform: typeDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', fontSize: '0.8rem' }}>▼</span>
                                    </button>
                                    {typeDropdownOpen && (
                                        <div
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                background: 'linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.75))',
                                                border: '1px solid rgba(255,255,255,0.3)',
                                                borderRadius: 8,
                                                marginTop: 4,
                                                zIndex: 5000,
                                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {typeOptions.map((option) => (
                                                <div
                                                    key={option.value}
                                                    onClick={() => {
                                                        setPersistentPreset((p) => ({ ...p, type: option.value }));
                                                        setTypeDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        padding: '12px 16px',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                                                        color: persistentPreset.type === option.value ? '#ffffff' : 'rgba(255,255,255,0.9)',
                                                        background: persistentPreset.type === option.value ? 'rgba(255,255,255,0.15)' : 'transparent',
                                                    }}
                                                >
                                                    <div style={{ fontWeight: persistentPreset.type === option.value ? 600 : 400 }}>{option.label}</div>
                                                    {option.description && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{option.description}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {persistentPreset.type === 'IsAnimationPlaying' && (
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Animation:</span>
                                    <MemoizedInput value={persistentPreset.animationName || ''} onChange={(e) => setPersistentPreset((p) => ({ ...p, animationName: e.target.value }))} style={fieldInputStyle} />
                                </label>
                            )}

                            {persistentPreset.type === 'HasBuffScript' && (
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell / Script:</span>
                                    <MemoizedInput
                                        value={persistentPreset.spellHash || persistentPreset.scriptName || ''}
                                        onChange={(e) => setPersistentPreset((p) => (p.spellHash ? { ...p, spellHash: e.target.value } : { ...p, scriptName: e.target.value }))}
                                        style={fieldInputStyle}
                                    />
                                </label>
                            )}

                            {persistentPreset.type === 'LearnedSpell' && (
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Slot (0-3):</span>
                                    <MemoizedInput type="number" min={0} max={3} value={persistentPreset.slot ?? 3} onChange={(e) => setPersistentPreset((p) => ({ ...p, slot: Number(e.target.value) }))} style={fieldInputStyle} />
                                </label>
                            )}

                            {persistentPreset.type === 'HasGear' && (
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Index:</span>
                                    <MemoizedInput type="number" min={0} value={persistentPreset.index ?? 0} onChange={(e) => setPersistentPreset((p) => ({ ...p, index: Number(e.target.value) }))} style={fieldInputStyle} />
                                </label>
                            )}

                            {persistentPreset.type === 'FloatComparison' && (
                                <>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell Slot:</span>
                                        <MemoizedInput type="number" min={0} max={3} value={persistentPreset.slot ?? 3} onChange={(e) => setPersistentPreset((p) => ({ ...p, slot: Number(e.target.value) }))} style={fieldInputStyle} />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Operator:</span>
                                        <MemoizedInput type="number" value={persistentPreset.operator ?? 3} onChange={(e) => setPersistentPreset((p) => ({ ...p, operator: Number(e.target.value) }))} style={fieldInputStyle} />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Value:</span>
                                        <MemoizedInput type="number" value={persistentPreset.value ?? 1} onChange={(e) => setPersistentPreset((p) => ({ ...p, value: Number(e.target.value) }))} style={fieldInputStyle} />
                                    </label>
                                </>
                            )}

                            {persistentPreset.type === 'BuffCounterFloatComparison' && (
                                <>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell Hash:</span>
                                        <MemoizedInput
                                            type="text"
                                            placeholder="Characters/Ezreal/Spells/EzrealPassiveAbility/EzrealPassiveStacks"
                                            value={persistentPreset.spellHash ?? ''}
                                            onChange={(e) => setPersistentPreset((p) => ({ ...p, spellHash: e.target.value }))}
                                            style={fieldInputStyle}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Operator:</span>
                                        <MemoizedInput type="number" value={persistentPreset.operator ?? 2} onChange={(e) => setPersistentPreset((p) => ({ ...p, operator: Number(e.target.value) }))} style={fieldInputStyle} />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Value:</span>
                                        <MemoizedInput type="number" value={persistentPreset.value ?? 5} onChange={(e) => setPersistentPreset((p) => ({ ...p, value: Number(e.target.value) }))} style={fieldInputStyle} />
                                    </label>
                                </>
                            )}

                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay On:</span>
                                <MemoizedInput
                                    type="number"
                                    min={0}
                                    value={persistentPreset.delay?.on ?? 0}
                                    onChange={(e) => setPersistentPreset((p) => ({ ...p, delay: { ...(p.delay || { on: 0, off: 0 }), on: Number(e.target.value) } }))}
                                    style={fieldInputStyle}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay Off:</span>
                                <MemoizedInput
                                    type="number"
                                    min={0}
                                    value={persistentPreset.delay?.off ?? 0}
                                    onChange={(e) => setPersistentPreset((p) => ({ ...p, delay: { ...(p.delay || { on: 0, off: 0 }), off: Number(e.target.value) } }))}
                                    style={fieldInputStyle}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Right Panel - Effects */}
                    <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Effects</div>

                        {(['show', 'hide'] as const).map((kind) => {
                            const list = kind === 'show' ? persistentShowSubmeshes : persistentHideSubmeshes;
                            const setList = kind === 'show' ? setPersistentShowSubmeshes : setPersistentHideSubmeshes;
                            const customInput = kind === 'show' ? customShowSubmeshInput : customHideSubmeshInput;
                            const setCustomInput = kind === 'show' ? setCustomShowSubmeshInput : setCustomHideSubmeshInput;
                            const handleAdd = kind === 'show' ? handleAddCustomShowSubmesh : handleAddCustomHideSubmesh;
                            const accent = kind === 'show' ? '34,197,94' : '239,68,68';
                            return (
                                <div key={kind}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To {kind === 'show' ? 'Show' : 'Hide'}</div>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                        <MemoizedInput
                                            type="text"
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                                            placeholder={`Type custom submesh name to ${kind}...`}
                                            style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: 'var(--accent)', fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}
                                        />
                                        <button
                                            onClick={handleAdd}
                                            disabled={!customInput.trim()}
                                            style={{
                                                padding: '6px 12px',
                                                background: customInput.trim() ? `rgba(${accent},0.2)` : 'rgba(255,255,255,0.05)',
                                                border: '1px solid ' + (customInput.trim() ? `rgba(${accent},0.4)` : 'rgba(255,255,255,0.1)'),
                                                borderRadius: 4,
                                                color: customInput.trim() ? `rgba(${accent},1)` : 'rgba(255,255,255,0.4)',
                                                fontSize: '0.85rem',
                                                cursor: customInput.trim() ? 'pointer' : 'not-allowed',
                                            }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflow: 'auto', padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                                        {availableSubmeshes.map((s) => (
                                            <label
                                                key={`${kind}-${s}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    padding: '4px 8px',
                                                    background: list.includes(s) ? `rgba(${accent},0.15)` : 'rgba(255,255,255,0.05)',
                                                    borderRadius: 4,
                                                    border: '1px solid ' + (list.includes(s) ? `rgba(${accent},0.3)` : 'rgba(255,255,255,0.1)'),
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <input type="checkbox" checked={list.includes(s)} onChange={(e) => setList((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))} style={{ margin: 0 }} />
                                                <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                                            </label>
                                        ))}
                                        {list
                                            .filter((s) => !availableSubmeshes.includes(s))
                                            .map((s) => (
                                                <div key={`custom-${kind}-${s}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: `rgba(${accent},0.15)`, borderRadius: 4, border: `1px solid rgba(${accent},0.3)`, fontSize: '0.85rem' }}>
                                                    <span style={{ color: `rgba(${accent},1)` }}>✓</span>
                                                    <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                                                    <button onClick={() => handleRemoveCustomSubmesh(s, kind)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.8)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.8rem', borderRadius: 2 }}>
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Persistent VFX */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Persistent VFX</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'auto', padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                                {persistentVfx.map((v, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'start', padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Effect Key:</span>
                                            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    placeholder="Search or select effect key..."
                                                    value={vfxSearchTerms[idx] || (v.id ? (effectKeyOptions.find((o) => o.id === v.id)?.label || '').split(' → ')[0].split(' - ')[0] || '' : '')}
                                                    onChange={(e) => {
                                                        const newValue = e.target.value;
                                                        setVfxSearchTerms((prev) => ({ ...prev, [idx]: newValue }));
                                                        setVfxDropdownOpen((prev) => ({ ...prev, [idx]: true }));
                                                    }}
                                                    onFocus={() => setVfxDropdownOpen((prev) => ({ ...prev, [idx]: true }))}
                                                    style={{ padding: '8px 12px', paddingRight: 32, background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 4, color: 'var(--accent)', fontSize: '0.85rem', width: '100%', fontFamily: 'JetBrains Mono, monospace' }}
                                                />
                                                <button
                                                    onClick={() => setVfxDropdownOpen((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12 }}
                                                >
                                                    {vfxDropdownOpen[idx] ? '▲' : '▼'}
                                                </button>
                                                {vfxDropdownOpen[idx] && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(20,20,20,0.98)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, maxHeight: 120, overflow: 'auto', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                                                        {effectKeyOptions
                                                            .filter((o) => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase()))
                                                            .slice(0, 50)
                                                            .map((o) => (
                                                                <div
                                                                    key={o.id}
                                                                    onClick={() => {
                                                                        setPersistentVfx((list) => list.map((x, i) => (i === idx ? { ...x, id: o.id, key: o.key, value: o.value } : x)));
                                                                        setVfxSearchTerms((prev) => ({ ...prev, [idx]: o.label.split(' → ')[0].split(' - ')[0] }));
                                                                        setVfxDropdownOpen((prev) => ({ ...prev, [idx]: false }));
                                                                    }}
                                                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', color: 'rgba(255,255,255,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                                                >
                                                                    {o.label.split(' → ')[0].split(' - ')[0]}
                                                                </div>
                                                            ))}
                                                        {effectKeyOptions.filter((o) => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase())).length === 0 && (
                                                            <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>No effects found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Bone Name:</span>
                                            <input
                                                placeholder="C_Buffbone_Glb_Layout_Loc"
                                                value={v.boneName || ''}
                                                onChange={(e) => setPersistentVfx((list) => list.map((x, i) => (i === idx ? { ...x, boneName: e.target.value } : x)))}
                                                style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: 'var(--accent)', fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}
                                            />
                                        </div>

                                        <button
                                            onClick={() => setPersistentVfx((list) => list.filter((_, i) => i !== idx))}
                                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#ff6b6b', cursor: 'pointer', padding: 8, fontSize: 16, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            🗑
                                        </button>

                                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                                <input type="checkbox" checked={!!v.ownerOnly} onChange={(e) => setPersistentVfx((list) => list.map((x, i) => (i === idx ? { ...x, ownerOnly: e.target.checked } : x)))} />
                                                <span style={{ color: 'rgba(255,255,255,0.8)' }}>Owner Only</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                                <input type="checkbox" checked={!!v.attachToCamera} onChange={(e) => setPersistentVfx((list) => list.map((x, i) => (i === idx ? { ...x, attachToCamera: e.target.checked } : x)))} />
                                                <span style={{ color: 'rgba(255,255,255,0.8)' }}>Attach to Camera</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                                <input type="checkbox" checked={!!v.forceRenderVfx} onChange={(e) => setPersistentVfx((list) => list.map((x, i) => (i === idx ? { ...x, forceRenderVfx: e.target.checked } : x)))} />
                                                <span style={{ color: 'rgba(255,255,255,0.8)' }}>Force Render VFX</span>
                                            </label>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={() => setPersistentVfx((list) => [...list, {}])}
                                    style={{ padding: 12, background: 'rgba(34,197,94,0.15)', border: '2px dashed rgba(34,197,94,0.3)', borderRadius: 6, color: '#4ade80', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                >
                                    <span style={{ fontSize: 18 }}>＋</span>
                                    Add VFX
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowExistingConditions(!showExistingConditions);
                            }}
                            style={{ padding: '6px 14px', background: 'color-mix(in srgb, var(--accent2), transparent 90%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--accent2)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, outline: 'none' }}
                        >
                            📂 Load Existing ({existingConditions.length})
                        </button>
                        {showExistingConditions && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--glass-bg, rgba(20, 20, 24, 0.94))', border: '1px solid var(--glass-border, rgba(255,255,255,0.12))', borderRadius: 12, minWidth: 300, maxHeight: 200, overflow: 'auto', zIndex: 10000, backdropFilter: 'saturate(180%) blur(12px)', WebkitBackdropFilter: 'saturate(180%) blur(12px)', boxShadow: '0 20px 48px rgba(0,0,0,0.5)' }}
                            >
                                {existingConditions.length === 0 ? (
                                    <div style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>No existing conditions found</div>
                                ) : (
                                    existingConditions.map((condition, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => handleLoadExistingCondition(condition)}
                                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: idx < existingConditions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
                                        >
                                            <div style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.84rem', fontWeight: 500 }}>{condition.label}</div>
                                            <div style={{ color: 'var(--text-2)', fontSize: '0.76rem', marginTop: 3 }}>
                                                {condition.vfx.length} VFX · {condition.submeshesShow.length} Show · {condition.submeshesHide.length} Hide
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {editingConditionIndex !== null && (
                            <div style={{ padding: '6px 12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                ✏️ Editing Condition {editingConditionIndex + 1}
                            </div>
                        )}
                        <button
                            onClick={handleApplyPersistent}
                            style={{ padding: '6px 14px', background: 'color-mix(in srgb, var(--accent2), transparent 90%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--accent2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', outline: 'none' }}
                        >
                            {editingConditionIndex !== null ? 'Update' : 'Apply'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
