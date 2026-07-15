import { useEffect, useState } from 'react';
import type { BinEditorChildParams, EditorSystem } from '@/lib/api/bineditor';

export type CreateIntent =
    | { kind: 'system' }
    | { kind: 'emitter'; system: EditorSystem }
    | { kind: 'child'; system: EditorSystem };

interface Props {
    intent: CreateIntent | null;
    busy?: boolean;
    onClose: () => void;
    onSystem: (name: string) => void;
    onEmitter: (system: EditorSystem, name: string) => void;
    onChild: (system: EditorSystem, params: BinEditorChildParams) => void;
}

export default function CreateVfxDialog({ intent, busy, onClose, onSystem, onEmitter, onChild }: Props) {
    const [name, setName] = useState('');
    const [effectKey, setEffectKey] = useState('');
    const [rate, setRate] = useState('1');
    const [lifetime, setLifetime] = useState('9999');
    const [bindWeight, setBindWeight] = useState('1');
    const [translation, setTranslation] = useState(['0', '0', '0']);
    const [delay, setDelay] = useState('0');
    const [single, setSingle] = useState(true);

    useEffect(() => {
        if (!intent) return;
        setName(intent.kind === 'system' ? '' : intent.kind === 'emitter' ? 'Emitter' : 'Child');
        setEffectKey(''); setRate('1'); setLifetime('9999'); setBindWeight('1');
        setTranslation(['0', '0', '0']); setDelay('0'); setSingle(true);
    }, [intent]);

    if (!intent) return null;
    const title = intent.kind === 'system' ? 'New VFX System' : intent.kind === 'emitter' ? 'New Emitter' : 'New Child Particle';
    const submit = () => {
        if (intent.kind === 'system') onSystem(name.trim());
        else if (intent.kind === 'emitter') onEmitter(intent.system, name.trim());
        else onChild(intent.system, {
            effectKey: effectKey.trim(), emitterName: name.trim() || null,
            rate: Number(rate), lifetime: Number(lifetime), bindWeight: Number(bindWeight),
            translation: translation.map(Number) as [number, number, number],
            isSingleParticle: single, timeBeforeFirstEmission: Number(delay),
        });
    };
    const invalid = intent.kind === 'child' ? !effectKey.trim() : !name.trim();

    return (
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dl-modal bev2-create" role="dialog" aria-modal="true" aria-label={title}>
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title">{title}</h2>
                    <button type="button" className="dl-modal__close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className="dl-modal__body bev2-create__body">
                    {intent.kind !== 'system' && <div className="bev2-create__target">Target · {intent.system.name}</div>}
                    <label className="bev2-create__field">
                        <span>{intent.kind === 'system' ? 'System path / name' : 'Emitter name'}</span>
                        <input autoFocus className="dl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={intent.kind === 'system' ? 'Characters/.../Particles/MyEffect' : 'Emitter'} />
                    </label>
                    {intent.kind === 'child' && (
                        <>
                            <label className="bev2-create__field"><span>Effect key</span><input className="dl-input" value={effectKey} onChange={(e) => setEffectKey(e.target.value)} placeholder="Resolver key or system path" /></label>
                            <div className="bev2-create__grid">
                                {[['Rate', rate, setRate], ['Lifetime', lifetime, setLifetime], ['Bind weight', bindWeight, setBindWeight], ['Emission delay', delay, setDelay]].map(([label, value, setter]) => (
                                    <label className="bev2-create__field" key={label as string}><span>{label as string}</span><input className="dl-input" type="number" step="any" value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} /></label>
                                ))}
                            </div>
                            <label className="bev2-create__field"><span>Translation override · X / Y / Z</span><div className="bev2-create__axes">{translation.map((v, i) => <input key={i} className="dl-input" type="number" step="any" value={v} onChange={(e) => setTranslation((old) => old.map((x, j) => j === i ? e.target.value : x))} />)}</div></label>
                            <label className="bev2-create__check"><input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} /><span>Single particle</span></label>
                        </>
                    )}
                </div>
                <div className="dl-modal__foot">
                    <button type="button" className="dl-btn dl-btn--secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="dl-btn dl-btn--primary" disabled={busy || invalid} onClick={submit}>Create</button>
                </div>
            </div>
        </div>
    );
}
