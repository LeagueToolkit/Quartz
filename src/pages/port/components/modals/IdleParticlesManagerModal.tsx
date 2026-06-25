import React, { useEffect, useMemo, useState } from 'react';
import { BONE_NAMES, extractExistingIdleParticles, type ExistingIdleEntry } from '../../utils/idleParticlesManager';
import type { VfxSystemMap } from '../../utils/vfxEmitterParser';
import type { BoneConfig } from '../../utils/idleParticlesManager';

const btn = (color: string): React.CSSProperties => ({
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
    background: `color-mix(in oklab, ${color} 12%, transparent)`,
    color,
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'JetBrains Mono, monospace',
});

interface ManagerBone {
    id: number;
    boneName: string;
    customBoneName: string;
}

const mkBone = (value = 'head', customValue = ''): ManagerBone => ({ id: Date.now() + Math.random(), boneName: value, customBoneName: customValue });

function parseResolverMap(pyContent: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!pyContent) return map;
    const lines = pyContent.split('\n');
    let inResourceMap = false;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] || '').trim();
        if (!inResourceMap && line.includes('resourceMap: map[hash,link] = {')) {
            inResourceMap = true;
            depth = 1;
            continue;
        }
        if (!inResourceMap) continue;
        const open = (line.match(/\{/g) || []).length;
        const close = (line.match(/\}/g) || []).length;
        depth += open - close;
        const m = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*"([^"]+)"/);
        if (m) {
            const key = m[1] || m[2];
            const value = m[3];
            if (key && value && !map.has(key)) map.set(key, value);
        }
        if (depth <= 0) break;
    }
    return map;
}

interface DropdownOption {
    value: string;
    label: string;
}

function CustomDropdown({ value, options, onChange, placeholder = 'Select system...' }: { value: string; options: DropdownOption[]; onChange: (v: string) => void; placeholder?: string }) {
    const [open, setOpen] = useState(false);
    const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

    useEffect(() => {
        if (!open) return undefined;
        const onDocClick = () => setOpen(false);
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, [open]);

    return (
        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'var(--bg-tertiary)',
                    border: `1px solid ${open ? 'color-mix(in oklab, var(--accent-secondary) 55%, transparent)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                    borderRadius: 8,
                    padding: '9px 11px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.18s ease',
                    fontFamily: 'JetBrains Mono, monospace',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>{selectedLabel}</span>
                <span style={{ opacity: 0.8 }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 'calc(100% + 6px)',
                        zIndex: 30,
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        maxHeight: 220,
                        overflow: 'auto',
                        boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    {options.map((opt) => {
                        const active = opt.value === value;
                        return (
                            <button
                                key={opt.value || '__none__'}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: active ? 'color-mix(in oklab, var(--accent-secondary) 16%, transparent)' : 'transparent',
                                    color: active ? 'var(--accent-secondary)' : 'var(--text-secondary)',
                                    padding: '8px 10px',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

interface IdleParticlesManagerModalProps {
    open: boolean;
    onClose: () => void;
    targetSystems: VfxSystemMap;
    targetPyContent: string;
    onUpsertSystem: (systemKey: string, systemName: string, boneConfigs: BoneConfig[]) => void;
    onRemoveEffectKey: (effectKey: string) => void;
}

export default function IdleParticlesManagerModal({ open, onClose, targetSystems, targetPyContent, onUpsertSystem, onRemoveEffectKey }: IdleParticlesManagerModalProps) {
    const [search, setSearch] = useState('');
    const [selectedSystemKey, setSelectedSystemKey] = useState('');
    const [boneList, setBoneList] = useState<ManagerBone[]>([mkBone('head')]);

    const existing = useMemo(() => (open ? extractExistingIdleParticles(targetPyContent || '') : []), [open, targetPyContent]);

    const systemOptions = useMemo(() => {
        if (!open) return [];
        return Object.entries(targetSystems || {})
            .map(([key, sys]) => {
                const label = (sys?.particleName || sys?.name || '').trim();
                if (!label || /^0x[0-9a-fA-F]+$/.test(label)) return null;
                return { value: key, label };
            })
            .filter((x): x is DropdownOption => x !== null);
    }, [open, targetSystems]);

    const systemsByKeyLower = useMemo(() => {
        const m = new Map<string, { systemKey: string; label: string }>();
        for (const [key, sys] of Object.entries(targetSystems || {})) {
            const label = (sys?.particleName || sys?.name || '').trim();
            if (!label || /^0x[0-9a-fA-F]+$/.test(label)) continue;
            m.set(String(key).toLowerCase(), { systemKey: key, label });
        }
        return m;
    }, [targetSystems]);

    const resolverMap = useMemo(() => (open ? parseResolverMap(targetPyContent || '') : new Map<string, string>()), [open, targetPyContent]);

    const effectKeyToSystem = useMemo(() => {
        const m = new Map<string, { systemKey: string; label: string }>();
        for (const entry of existing) {
            const effectKey = String(entry.effectKey || '');
            const lower = effectKey.toLowerCase();
            if (systemsByKeyLower.has(lower)) {
                m.set(effectKey, systemsByKeyLower.get(lower)!);
                continue;
            }
            const mappedSystemPath = resolverMap.get(effectKey);
            if (mappedSystemPath) {
                const mapped = systemsByKeyLower.get(String(mappedSystemPath).toLowerCase());
                if (mapped) m.set(effectKey, mapped);
            }
        }
        return m;
    }, [existing, systemsByKeyLower, resolverMap]);

    const filteredExisting = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return existing;
        return existing.filter(
            (e) => String(effectKeyToSystem.get(e.effectKey)?.label || '').toLowerCase().includes(term) || (e.bones || []).some((b) => String(b).toLowerCase().includes(term))
        );
    }, [existing, search, effectKeyToSystem]);

    useEffect(() => {
        if (!open) return;
        setSearch('');
        setSelectedSystemKey('');
        setBoneList([mkBone('head')]);
    }, [open]);

    const handleApply = () => {
        const selected = systemOptions.find((o) => o.value === selectedSystemKey);
        if (!selected) return;
        const configs = boneList.map((b) => ({ boneName: (b.customBoneName || '').trim() || b.boneName })).filter((b) => !!b.boneName);
        onUpsertSystem?.(selected.value, selected.label, configs);
    };

    const handleLoadExisting = (entry: ExistingIdleEntry) => {
        const mapped = effectKeyToSystem.get(entry.effectKey);
        if (mapped?.systemKey) setSelectedSystemKey(mapped.systemKey);
        const next = (entry.bones || []).map((b) => {
            const bone = String(b || '').trim();
            if (BONE_NAMES.includes(bone)) return mkBone(bone, '');
            return mkBone('head', bone);
        });
        setBoneList(next.length > 0 ? next : [mkBone('head')]);
    };

    if (!open) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in oklab, black 65%, transparent)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div
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
                    boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary))', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite', flexShrink: 0 }} />
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Idle Particles Manager
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer' }}
                    >
                        {'✕'}
                    </button>
                </div>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ flex: '0 0 44%', borderRight: '1px solid var(--border)', overflow: 'auto', padding: 14 }}>
                        <div style={{ color: 'var(--accent-secondary)', fontWeight: 700, marginBottom: 10, fontSize: '0.84rem' }}>Existing Idle Entries ({existing.length})</div>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search particle name or bone..."
                            style={{ width: '100%', padding: '9px 11px', marginBottom: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {filteredExisting.length === 0 && (
                            <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                No idle particles found.
                            </div>
                        )}
                        {filteredExisting.map((e) => {
                            const mapped = effectKeyToSystem.get(e.effectKey);
                            const displayName = mapped?.label || 'Unknown Particle';
                            const canEdit = !!mapped?.systemKey;
                            return (
                                <div key={e.effectKey} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--bg-tertiary)' }}>
                                    <div style={{ color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700 }}>{displayName}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 4 }}>bones: {(e.bones || []).join(', ') || '(none)'}</div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button style={{ ...btn('var(--color-success)'), opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }} onClick={() => canEdit && handleLoadExisting(e)}>
                                            Edit
                                        </button>
                                        <button style={btn('var(--color-danger)')} onClick={() => onRemoveEffectKey?.(e.effectKey)}>
                                            Remove All
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
                        <div style={{ color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 10, fontSize: '0.84rem' }}>Add / Update Idle Particles</div>
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>VFX System</div>
                        <div style={{ marginBottom: 12 }}>
                            <CustomDropdown value={selectedSystemKey} onChange={setSelectedSystemKey} options={systemOptions} placeholder="Select system..." />
                        </div>
                        <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Bones</div>
                        {boneList.map((item) => (
                            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                                <CustomDropdown
                                    value={item.boneName}
                                    onChange={(value) => setBoneList((prev) => prev.map((b) => (b.id === item.id ? { ...b, boneName: value } : b)))}
                                    options={BONE_NAMES.map((b) => ({ value: b, label: b }))}
                                    placeholder="Select bone..."
                                />
                                <input
                                    value={item.customBoneName}
                                    onChange={(e) => setBoneList((prev) => prev.map((b) => (b.id === item.id ? { ...b, customBoneName: e.target.value } : b)))}
                                    placeholder="Custom bone (optional)"
                                    style={{ padding: '8px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', outline: 'none' }}
                                />
                                <button style={btn('var(--color-danger)')} onClick={() => setBoneList((prev) => prev.filter((b) => b.id !== item.id))}>
                                    Remove
                                </button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <button style={btn('var(--color-info)')} onClick={() => setBoneList((prev) => [...prev, mkBone('head')])}>
                                Add Bone
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...btn('var(--color-success)'), opacity: selectedSystemKey ? 1 : 0.5, cursor: selectedSystemKey ? 'pointer' : 'not-allowed' }} onClick={handleApply} disabled={!selectedSystemKey}>
                                Apply Idle Particles
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
