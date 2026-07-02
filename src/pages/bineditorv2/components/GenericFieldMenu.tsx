import { useEffect, useRef, useState } from 'react';
import {
    GENERIC_TYPES,
    makeGenericEntry,
    type SchemaEntry,
    type SchemaFieldType,
} from '../model/emitterSchema';

/* "+ field" on any struct: pick a name + type, build a valid default field.
   For arbitrary nested structs (e.g. VfxProbabilityTableData) with no fixed
   schema. Ported from bineditorV3/components/GenericFieldMenu.js. */

interface GenericFieldMenuProps {
    onAdd: (entry: SchemaEntry) => void;
}

export default function GenericFieldMenu({ onAdd }: GenericFieldMenuProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<SchemaFieldType>('f32');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const submit = () => {
        const n = name.trim();
        if (!n) return;
        onAdd(makeGenericEntry(n, type));
        setName('');
        setOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="dl-btn dl-btn--secondary dl-btn--sm"
                onClick={() => setOpen((o) => !o)}
            >
                + field
            </button>
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 1000,
                        width: 220,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 8,
                        boxShadow: 'var(--dl-shadow-lg)',
                    }}
                >
                    <input
                        autoFocus
                        className="dl-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="field name"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit();
                        }}
                        style={{ height: 28, fontSize: 12 }}
                    />
                    <select
                        className="dl-select"
                        value={type}
                        onChange={(e) => setType(e.target.value as SchemaFieldType)}
                        style={{ height: 28, fontSize: 12 }}
                    >
                        {GENERIC_TYPES.map(([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="dl-btn dl-btn--primary dl-btn--sm" onClick={submit}>
                        Add
                    </button>
                </div>
            )}
        </div>
    );
}
