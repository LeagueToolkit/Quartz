import { useState } from 'react';
import type { EditorNode, JsonBinValue, NodePath } from '@/lib/api/bineditor';
import { encodeNumber, encodeVector, encodeVectorSet, vectorComponents } from '../model/nodes';
import { ColorWidget, NumInput } from './widgets';

/* Compact keyframe table (time -> value, plus add/remove), ported from
   bineditorV3/components/KeyframeEditor.js over the EditorNode dynamics lists. */

interface KeyframeEditorProps {
    times: EditorNode; // dynamics.times list node
    values: EditorNode; // dynamics.values list node
    onCommitLeaf: (path: NodePath, value: JsonBinValue) => void;
    onAddKeyframe: () => void;
    onRemoveKeyframe: (index: number) => void;
}

export default function KeyframeEditor({
    times,
    values,
    onCommitLeaf,
    onAddKeyframe,
    onRemoveKeyframe,
}: KeyframeEditorProps) {
    const [open, setOpen] = useState(false);
    const timeKids = times.children ?? [];
    const valueKids = values.children ?? [];
    const n = Math.max(timeKids.length, valueKids.length);

    const renderValue = (v: EditorNode | undefined) => {
        if (!v) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>;
        if (v.kind === 'vector') {
            if ((v.children ?? []).length === 4) {
                return (
                    <ColorWidget
                        node={v}
                        onCommit={(comps) => onCommitLeaf(v.path, encodeVector(v, comps))}
                    />
                );
            }
            return (
                <div style={{ display: 'flex', gap: 5 }}>
                    {vectorComponents(v).map((c, i) => (
                        <NumInput
                            key={i}
                            value={c}
                            width={60}
                            onCommit={(x) => onCommitLeaf(v.path, encodeVectorSet(v, i, x))}
                        />
                    ))}
                </div>
            );
        }
        return (
            <NumInput
                value={v.value}
                width={60}
                onCommit={(x) => onCommitLeaf(v.path, encodeNumber(v, x))}
            />
        );
    };

    return (
        <div
            style={{
                marginTop: 6,
                paddingLeft: 12,
                borderLeft: '2px solid color-mix(in srgb, var(--accent-secondary), transparent 60%)',
            }}
        >
            <div
                onClick={() => setOpen((o) => !o)}
                style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    color: 'var(--accent-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                }}
            >
                {open ? '▼' : '▶'} Keyframes ({n})
            </div>
            {open && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Array.from({ length: n }).map((_, i) => {
                        const t = timeKids[i];
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>t</span>
                                {t ? (
                                    <NumInput
                                        value={t.value}
                                        width={60}
                                        onCommit={(x) => onCommitLeaf(t.path, encodeNumber(t, x))}
                                    />
                                ) : (
                                    <span style={{ width: 60 }} />
                                )}
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
                                <div style={{ flex: 1, minWidth: 0 }}>{renderValue(valueKids[i])}</div>
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--ghost dl-btn--sm dl-btn--icon"
                                    title="Remove keyframe"
                                    onClick={() => onRemoveKeyframe(i)}
                                    style={{ color: 'var(--color-danger)' }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        className="dl-btn dl-btn--secondary dl-btn--sm"
                        onClick={onAddKeyframe}
                        style={{ alignSelf: 'flex-start', color: 'var(--accent-secondary)' }}
                    >
                        + keyframe
                    </button>
                </div>
            )}
        </div>
    );
}
