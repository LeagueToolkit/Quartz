import { type CSSProperties, type ReactNode } from 'react';
import type { EditorNode, JsonBinValue, NodePath } from '@/lib/api/bineditor';
import { prettyName, sameKey } from '../model/categories';
import { canAnimate, dynamicsLists, isAnimated } from '../model/dynamics';
import type { SchemaEntry } from '../model/emitterSchema';
import {
    childByKey,
    encodeBool,
    encodeNumber,
    encodeOption,
    encodeString,
    encodeVector,
    encodeVectorSet,
    pathKey,
} from '../model/nodes';
import { widgetFor } from '../model/widgets';
import KeyframeEditor from './KeyframeEditor';
import GenericFieldMenu from './GenericFieldMenu';
import { BoolWidget, ColorWidget, EnumWidget, NumberWidget, StringWidget, VecWidget } from './widgets';

/* One editable field row (recursive for structs/lists), ported from
   bineditorV3/components/FieldRow.js. All edits leave through callbacks; the
   page container owns the API session. */

export interface FieldRowCallbacks {
    expandedFields: Set<string>;
    onToggleField: (path: NodePath) => void;
    onCommitLeaf: (path: NodePath, value: JsonBinValue) => void;
    onLive?: (path: NodePath, value: JsonBinValue) => void;
    onAnimate?: (node: EditorNode) => void;
    onDeanimate?: (node: EditorNode) => void;
    onAddKeyframe?: (node: EditorNode) => void;
    onRemoveKeyframe?: (node: EditorNode, index: number) => void;
    onRemoveNode?: (node: EditorNode) => void;
    onAddNested?: (node: EditorNode, entry: SchemaEntry) => void;
    onAddListItem?: (node: EditorNode) => void;
    onPreviewTexture?: (path: string) => void;
}

interface FieldRowProps extends FieldRowCallbacks {
    node: EditorNode;
    advanced: boolean;
    depth?: number;
}

const LABEL_W = 150;

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '5px 0',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
    minHeight: 34,
};
const labelStyle: CSSProperties = {
    width: LABEL_W,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};
const badgeStyle: CSSProperties = {
    padding: '0 5px',
    borderRadius: 3,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
};
const mutedStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
    return (
        <button
            type="button"
            className="dl-btn dl-btn--ghost dl-btn--sm dl-btn--icon"
            title="Delete"
            onClick={(e) => {
                e.stopPropagation();
                onDelete();
            }}
            style={{ color: 'var(--color-danger)', flexShrink: 0 }}
        >
            ×
        </button>
    );
}

/** Type badge text for the advanced view. */
function typeBadge(node: EditorNode): string | null {
    if (node.kind === 'struct') return node.className ?? null;
    if (node.kind === 'vector') return node.vecType ?? null;
    if (node.kind === 'list') return `list[${node.itemType ?? '?'}]`;
    if (node.kind === 'option') return `option[${node.itemType ?? '?'}]`;
    if (node.kind === 'primitive') return node.numType ?? node.valueType ?? null;
    return null;
}

function FieldRowInner(props: FieldRowProps) {
    const {
        node,
        advanced,
        depth = 0,
        expandedFields,
        onToggleField,
        onCommitLeaf,
        onLive,
        onAnimate,
        onDeanimate,
        onAddKeyframe,
        onRemoveKeyframe,
        onRemoveNode,
        onAddNested,
        onAddListItem,
        onPreviewTexture,
    } = props;
    const open = expandedFields.has(pathKey(node.path));
    const kind = widgetFor(node);
    const label = prettyName(node.key ?? 'item');
    const protectedField = !!node.key && sameKey(node.key, 'emitterName');
    const removeThis = !protectedField && onRemoveNode ? () => onRemoveNode(node) : null;

    const childProps: FieldRowCallbacks = {
        onCommitLeaf,
        expandedFields,
        onToggleField,
        onLive,
        onAnimate,
        onDeanimate,
        onAddKeyframe,
        onRemoveKeyframe,
        onRemoveNode,
        onAddNested,
        onAddListItem,
        onPreviewTexture,
    };

    /** Widget for a value node. `wrap` re-wraps payloads for option interiors. */
    const renderControl = (
        target: EditorNode | null,
        wrap?: (inner: JsonBinValue) => { path: NodePath; value: JsonBinValue },
    ): ReactNode => {
        if (!target) return <span style={mutedStyle}>-</span>;
        const send = (n: EditorNode, value: JsonBinValue, live?: boolean) => {
            const out = wrap ? wrap(value) : { path: n.path, value };
            if (live) onLive?.(out.path, out.value);
            else onCommitLeaf(out.path, out.value);
        };
        const k = widgetFor(target);
        if (k === 'number' && target.kind === 'option') {
            const inner = target.children?.[0];
            if (!inner) return <span style={mutedStyle}>(empty)</span>;
            return renderControl(inner, (v) => ({
                path: target.path,
                value: encodeOption(target, v),
            }));
        }
        if (k === 'vec' || k === 'color') {
            const vec = target.kind === 'option' ? target.children?.[0] ?? null : target;
            if (!vec) return <span style={mutedStyle}>(empty)</span>;
            const wrapVec =
                target.kind === 'option'
                    ? (v: JsonBinValue) => ({ path: target.path, value: encodeOption(target, v) })
                    : wrap;
            if (k === 'color') {
                return (
                    <ColorWidget
                        node={vec}
                        onCommit={(comps) => {
                            const value = encodeVector(vec, comps);
                            const out = wrapVec ? wrapVec(value) : { path: vec.path, value };
                            onCommitLeaf(out.path, out.value);
                        }}
                    />
                );
            }
            return (
                <VecWidget
                    node={vec}
                    onCommitAxis={(i, v) => {
                        const value = encodeVectorSet(vec, i, v);
                        const out = wrapVec ? wrapVec(value) : { path: vec.path, value };
                        onCommitLeaf(out.path, out.value);
                    }}
                />
            );
        }
        if (k === 'number') {
            return (
                <NumberWidget
                    node={target}
                    onCommit={(v) => send(target, encodeNumber(target, v))}
                    onLive={(v) => send(target, encodeNumber(target, v), true)}
                />
            );
        }
        if (k === 'bool') return <BoolWidget node={target} onCommit={(v) => send(target, encodeBool(target, v))} />;
        if (k === 'enum') return <EnumWidget node={target} onCommit={(v) => send(target, encodeNumber(target, v))} />;
        if (k === 'texture' || k === 'string') {
            return (
                <StringWidget
                    node={target}
                    isTexture={k === 'texture'}
                    onPreview={onPreviewTexture}
                    onCommit={(v) => send(target, encodeString(target, v))}
                />
            );
        }
        if (k === 'unsupported') {
            return <span style={mutedStyle}>(read-only)</span>;
        }
        return <span style={mutedStyle}>-</span>;
    };

    // --- Value* struct: constantValue widget + Animate/Constant + keyframes ---
    if (kind === 'valueStruct') {
        const cv = childByKey(node, 'constantValue');
        const { dynamics, times, values } = dynamicsLists(node);
        const animated = isAnimated(node) && !!values;
        const primary = cv ?? values?.children?.[0] ?? null;
        const canDyn = depth === 0 && canAnimate(node) && (onAnimate || onDeanimate);
        const extraDynChildren = (dynamics?.children ?? []).filter(
            (c) => !sameKey(c.key, 'times') && !sameKey(c.key, 'values'),
        );
        return (
            <>
                <div style={rowStyle}>
                    <div style={labelStyle}>
                        {label}
                        {advanced && node.className && <span style={badgeStyle}>{node.className}</span>}
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {renderControl(primary)}
                        {canDyn &&
                            (animated ? (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--secondary dl-btn--sm"
                                    title="Remove the animated curve"
                                    onClick={() => onDeanimate?.(node)}
                                    style={{ color: 'var(--accent-secondary)', flexShrink: 0 }}
                                >
                                    Constant
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--secondary dl-btn--sm"
                                    title="Animate this value (add a dynamics curve)"
                                    onClick={() => onAnimate?.(node)}
                                    style={{ color: 'var(--accent-secondary)', flexShrink: 0 }}
                                >
                                    Animate
                                </button>
                            ))}
                    </div>
                    {removeThis && <DeleteBtn onDelete={removeThis} />}
                </div>
                {advanced && animated && times && values && (
                    <KeyframeEditor
                        times={times}
                        values={values}
                        onCommitLeaf={onCommitLeaf}
                        onAddKeyframe={() => onAddKeyframe?.(node)}
                        onRemoveKeyframe={(i) => onRemoveKeyframe?.(node, i)}
                    />
                )}
                {advanced && extraDynChildren.length > 0 && (
                    <div style={{ paddingLeft: LABEL_W + 12 }}>
                        {extraDynChildren.map((c, i) => (
                            <FieldRow
                                key={(c.key ?? 'i') + i}
                                node={c}
                                advanced={advanced}
                                depth={depth + 1}
                                {...childProps}
                            />
                        ))}
                    </div>
                )}
            </>
        );
    }

    // --- Generic struct / list: expandable, recursive children ---
    if (kind === 'struct' || kind === 'list') {
        const kids = node.children ?? [];
        return (
            <>
                <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={() => onToggleField(node.path)}>
                    <div style={labelStyle}>
                        <span style={{ color: 'var(--accent-secondary)', width: 10 }}>{open ? '▼' : '▶'}</span>
                        {label}
                        {advanced && typeBadge(node) && <span style={badgeStyle}>{typeBadge(node)}</span>}
                    </div>
                    <div style={{ flex: 1, color: 'var(--text-muted)', fontSize: 11 }}>{kids.length} items</div>
                    {kind === 'list' && onAddListItem && (
                        <span onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                className="dl-btn dl-btn--secondary dl-btn--sm"
                                title="Add an item to this list"
                                onClick={() => onAddListItem(node)}
                            >
                                + item
                            </button>
                        </span>
                    )}
                    {kind === 'struct' && onAddNested && (
                        <span onClick={(e) => e.stopPropagation()}>
                            <GenericFieldMenu onAdd={(entry) => onAddNested(node, entry)} />
                        </span>
                    )}
                    {removeThis && <DeleteBtn onDelete={removeThis} />}
                </div>
                {open && (
                    <div style={{ paddingLeft: 16 }}>
                        {kids.map((c, i) => (
                            <FieldRow
                                key={(c.key ?? 'i') + i}
                                node={c}
                                advanced={advanced}
                                depth={depth + 1}
                                {...childProps}
                            />
                        ))}
                    </div>
                )}
            </>
        );
    }

    // --- Plain leaf / vector / option row ---
    return (
        <div style={rowStyle}>
            <div style={labelStyle}>
                {label}
                {advanced && typeBadge(node) && <span style={badgeStyle}>{typeBadge(node)}</span>}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {renderControl(node)}
            </div>
            {removeThis && <DeleteBtn onDelete={removeThis} />}
        </div>
    );
}

/* NOT memoized: leaf edits mutate nodes in place, so a row can't tell from its
   props that its value changed. EmitterGroup is the memo boundary — it bails
   per-emitter via its `rev` prop, and once a group renders, all its rows must
   render too. */
const FieldRow = FieldRowInner;
export default FieldRow;
