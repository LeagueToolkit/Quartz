import { useState, type CSSProperties } from 'react';
import { prettyName } from '../model/categories';
import type { SchemaEntry } from '../model/emitterSchema';
import AddFieldMenu from './AddFieldMenu';

/* Bulk-edit toolbar, ported from bineditorV3/components/BulkBar.js. Input state
   (multiplier / set values) lives here; applied ops leave as high-level
   callbacks that the page container turns into EditOp batches. */

const AXES = ['X', 'Y', 'Z', 'W'];

interface BulkBarProps {
    category: string; // 'all' or the active field key
    count: { fields: number; emitters: number };
    arity: number; // input count for Set (vector arity or 1)
    showFlag: boolean; // active category has boolean fields
    showAnimate: boolean; // active category is an animatable Value* struct
    onMultiply: (factor: number) => void;
    onSetVector: (vals: number[]) => void;
    onSetFlag: (v: boolean) => void;
    onAnimateBulk: (animate: boolean) => void;
    onDeleteBulk: () => void;
    onAddField: (entry: SchemaEntry) => void;
}

const numInput: CSSProperties = {
    width: 52,
    height: 32,
    padding: '0 8px',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
};

const divider = <span style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />;

const parseNum = (s: string): number => parseFloat(String(s).replace(',', '.'));

export default function BulkBar({
    category,
    count,
    arity,
    showFlag,
    showAnimate,
    onMultiply,
    onSetVector,
    onSetFlag,
    onAnimateBulk,
    onDeleteBulk,
    onAddField,
}: BulkBarProps) {
    const [multiplier, setMultiplier] = useState('2');
    const [setVals, setSetVals] = useState(['0', '0', '0', '0']);

    const label = category === 'all' ? 'all fields' : prettyName(category);
    const fieldChosen = category !== 'all';
    const n = Math.max(1, arity);

    const updateAxis = (i: number, v: string) =>
        setSetVals((prev) => {
            const next = [...prev];
            next[i] = v;
            return next;
        });

    const applyMultiply = () => {
        const m = parseNum(multiplier);
        if (!Number.isNaN(m)) onMultiply(m);
    };

    const applySet = () => {
        const values = setVals.slice(0, n).map(parseNum);
        if (!values.some(Number.isNaN)) onSetVector(values);
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                borderRadius: 'var(--dl-radius-sm)',
                flexWrap: 'wrap',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
            }}
        >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>×</span>
            <input
                type="text"
                className="dl-input"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                style={numInput}
            />
            <button type="button" className="dl-btn dl-btn--primary dl-btn--sm" onClick={applyMultiply}>
                Apply ×{multiplier} → {label}
            </button>

            {fieldChosen && (
                <>
                    {divider}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>set</span>
                    {Array.from({ length: n }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {n > 1 && (
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1 }}>
                                    {AXES[i]}
                                </span>
                            )}
                            <input
                                type="text"
                                className="dl-input"
                                value={setVals[i] ?? '0'}
                                onChange={(e) => updateAxis(i, e.target.value)}
                                style={numInput}
                            />
                        </div>
                    ))}
                    <button type="button" className="dl-btn dl-btn--secondary dl-btn--sm" onClick={applySet}>
                        Set
                    </button>
                </>
            )}

            {showFlag && (
                <>
                    {divider}
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={() => onSetFlag(true)}
                        style={{ color: 'var(--color-success)' }}
                    >
                        Set true
                    </button>
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={() => onSetFlag(false)}
                    >
                        Set false
                    </button>
                </>
            )}

            {fieldChosen && showAnimate && (
                <>
                    {divider}
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        title={`Animate ${label} on selected emitters`}
                        onClick={() => onAnimateBulk(true)}
                        style={{ color: 'var(--accent-secondary)' }}
                    >
                        Animate
                    </button>
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        title={`Make ${label} constant on selected emitters`}
                        onClick={() => onAnimateBulk(false)}
                    >
                        Constant
                    </button>
                </>
            )}

            {fieldChosen && (
                <button
                    type="button"
                    className="dl-btn dl-btn--danger dl-btn--sm"
                    title={`Delete ${label} from the selected emitters`}
                    onClick={onDeleteBulk}
                >
                    Delete
                </button>
            )}

            {divider}
            <AddFieldMenu onAdd={onAddField} />

            <span
                style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                }}
            >
                {count.fields} fields · {count.emitters} emitters
            </span>
        </div>
    );
}
