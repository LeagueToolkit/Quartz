import { useEffect, useRef, useState } from 'react';
import { Check, Layers, Image as ImageIcon } from 'lucide-react';
import type { HubVfxSystem } from '@/pages/vfxhub/lib/githubApi';

/* One VFX Hub system card: lazy preview image, name, emitter count, and a short
   description. Selectable (accent ring + check). Built from theme tokens only. */
export function HubSystemCard({ system, selected, onToggle }: {
    system: HubVfxSystem;
    selected: boolean;
    onToggle: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || visible) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
        }, { rootMargin: '200px', threshold: 0.01 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [visible]);

    return (
        <button
            ref={ref}
            type="button"
            className={`hub-card ${selected ? 'is-selected' : ''}`}
            onClick={onToggle}
            title={system.name}
        >
            <div className="hub-card__thumb">
                {visible && system.previewUrl
                    ? <img src={system.previewUrl} alt={system.displayName} loading="lazy" />
                    : <ImageIcon size={28} className="hub-card__thumb-icon" />}
                {selected && <span className="hub-card__check"><Check size={13} /></span>}
            </div>
            <div className="hub-card__body">
                <span className="hub-card__name">{system.displayName}</span>
                <span className="hub-card__meta">
                    <Layers size={11} />
                    {system.emitterCount} emitter{system.emitterCount === 1 ? '' : 's'}
                </span>
                {system.description && system.description.trim().toLowerCase() !== system.displayName.trim().toLowerCase() && (
                    <span className="hub-card__desc">{system.description}</span>
                )}
            </div>
        </button>
    );
}
