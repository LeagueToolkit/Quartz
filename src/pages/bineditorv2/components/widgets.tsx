import { useRef, useState, type CSSProperties } from 'react';
import type { EditorNode } from '@/lib/api/bineditor';
import { enumLabelsFor } from '../model/widgets';

/* Field widgets, ported from bineditorV3/components/widgets/*. Controlled by the
   node's current value; edits flow out through onCommit / onLive callbacks and
   the caller encodes them into JsonBinValue EditOps. No API calls here. */

const AXES = ['X', 'Y', 'Z', 'W'];

const monoInput: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    height: 28,
    padding: '0 8px',
};

interface NumInputProps {
    value: number | string | boolean | undefined;
    onCommit: (v: number) => void;
    width?: number | string;
}

/** Text input that parses on blur/Enter (comma tolerated as decimal point). */
export function NumInput({ value, onCommit, width }: NumInputProps) {
    return (
        <input
            type="text"
            className="dl-input"
            defaultValue={String(value ?? '')}
            key={`v:${String(value)}`}
            onBlur={(e) => {
                const x = parseFloat(String(e.target.value).replace(',', '.'));
                if (!Number.isNaN(x)) onCommit(x);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            style={{ ...monoInput, width: width ?? '100%', textAlign: 'center' }}
        />
    );
}

interface NumberWidgetProps {
    node: EditorNode;
    onCommit: (v: number) => void;
    onLive?: (v: number) => void;
}

export function NumberWidget({ node, onCommit }: NumberWidgetProps) {
    const v = Number(node.value);
    // Aggressive range anchored at the mount-time value: scale up to ~10x with the slider.
    const rangeRef = useRef<{ min: number; max: number; step: number } | null>(null);
    if (!rangeRef.current) {
        const b = Number.isFinite(v) ? v : 0;
        const span = Math.max(Math.abs(b) * 10, 10);
        rangeRef.current = { min: b < 0 ? -span : 0, max: span, step: Math.max(span / 500, 0.001) };
    }
    const range = rangeRef.current;

    // While dragging, track the value locally so the thumb moves smoothly WITHOUT
    // committing on every tick (each commit re-renders the whole field tree).
    // Commit once on release. `drag === null` means "follow the node value".
    const [drag, setDrag] = useState<number | null>(null);
    const shown = drag ?? v;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <NumInput value={node.value} onCommit={onCommit} width={80} />
            {Number.isFinite(v) && (
                <input
                    type="range"
                    min={range.min}
                    max={Math.max(range.max, shown)}
                    step={range.step}
                    value={shown}
                    onChange={(e) => setDrag(parseFloat(e.target.value))}
                    onMouseUp={(e) => { onCommit(parseFloat((e.target as HTMLInputElement).value)); setDrag(null); }}
                    onKeyUp={(e) => { onCommit(parseFloat((e.target as HTMLInputElement).value)); setDrag(null); }}
                    style={{ flex: 1, accentColor: 'var(--accent-primary)', minWidth: 80 }}
                />
            )}
        </div>
    );
}

interface VecWidgetProps {
    node: EditorNode; // vector node; children are numeric leaves
    onCommitAxis: (index: number, v: number) => void;
}

export function VecWidget({ node, onCommitAxis }: VecWidgetProps) {
    const kids = node.children ?? [];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kids.length}, 1fr)`, gap: 8 }}>
            {kids.map((c, i) => (
                <div key={i}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {AXES[i] ?? i}
                    </div>
                    <NumInput value={c.value} onCommit={(v) => onCommitAxis(i, v)} />
                </div>
            ))}
        </div>
    );
}

interface CheckboxProps {
    checked: boolean;
    onChange: (v: boolean) => void;
    title?: string;
}

/** dl-check styled checkbox. */
export function Checkbox({ checked, onChange, title }: CheckboxProps) {
    return (
        <label className="dl-check" title={title} onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="dl-check__box">
                <span className="dl-check__tick">
                    <span className="dl-icon">
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6l3 3 5-6" />
                        </svg>
                    </span>
                </span>
            </span>
        </label>
    );
}

interface BoolWidgetProps {
    node: EditorNode;
    onCommit: (v: boolean) => void;
}

export function BoolWidget({ node, onCommit }: BoolWidgetProps) {
    return <Checkbox checked={!!node.value} onChange={onCommit} />;
}

interface ColorWidgetProps {
    node: EditorNode; // vec3/vec4 (0..1) or rgba (0..255) vector node
    onCommit: (comps: number[]) => void; // full component array, alpha preserved
}

export function ColorWidget({ node, onCommit }: ColorWidgetProps) {
    const comps = (node.children ?? []).map((c) => Number(c.value ?? 0));
    const scale = node.vecType === 'rgba' ? 255 : 1;
    const hasAlpha = comps.length >= 4;
    const hex = (() => {
        const h = (v: number) =>
            Math.round(Math.max(0, Math.min(1, (v ?? 0) / scale)) * 255)
                .toString(16)
                .padStart(2, '0');
        return `#${h(comps[0])}${h(comps[1])}${h(comps[2])}`;
    })();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
                type="color"
                value={hex}
                onChange={(e) => {
                    const s = e.target.value;
                    const r = (parseInt(s.slice(1, 3), 16) / 255) * scale;
                    const g = (parseInt(s.slice(3, 5), 16) / 255) * scale;
                    const b = (parseInt(s.slice(5, 7), 16) / 255) * scale;
                    onCommit(hasAlpha ? [r, g, b, comps[3]] : [r, g, b]);
                }}
                style={{
                    width: 40,
                    height: 28,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    padding: 2,
                }}
            />
            {hasAlpha && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    A
                    <NumInput
                        value={comps[3]}
                        onCommit={(a) => onCommit([comps[0], comps[1], comps[2], a])}
                        width={56}
                    />
                </label>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {comps.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(2))).join(', ')}
            </span>
        </div>
    );
}

interface StringWidgetProps {
    node: EditorNode;
    onCommit: (v: string) => void;
    isTexture?: boolean;
    onPreview?: (path: string) => void;
}

export function StringWidget({ node, onCommit, isTexture, onPreview }: StringWidgetProps) {
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
            <input
                type="text"
                className="dl-input"
                defaultValue={String(node.value ?? '')}
                key={`v:${String(node.value)}`}
                onBlur={(e) => onCommit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ ...monoInput, flex: 1, minWidth: 0 }}
            />
            {isTexture && onPreview && (
                <button
                    type="button"
                    className="dl-btn dl-btn--secondary dl-btn--sm"
                    title="Preview texture"
                    onClick={() => onPreview(String(node.value ?? ''))}
                >
                    👁
                </button>
            )}
        </div>
    );
}

interface EnumWidgetProps {
    node: EditorNode;
    onCommit: (v: number) => void;
}

export function EnumWidget({ node, onCommit }: EnumWidgetProps) {
    const labels = enumLabelsFor(node.key) ?? {};
    const current = Number(node.value ?? 0);
    const known = Object.keys(labels).map(Number);
    if (!known.includes(current)) known.push(current); // keep unknown value selectable
    return (
        <select
            className="dl-select"
            value={current}
            onChange={(e) => onCommit(Number(e.target.value))}
            style={{ maxWidth: 220, height: 28, fontSize: 13 }}
        >
            {known
                .sort((a, b) => a - b)
                .map((v) => (
                    <option key={v} value={v}>
                        {labels[v] ?? String(v)}
                    </option>
                ))}
        </select>
    );
}
