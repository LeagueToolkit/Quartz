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
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
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
    onMoveNode?: (node: EditorNode, delta: number) => void;
    onAddNested?: (node: EditorNode, entry: SchemaEntry) => void;
    onAddListItem?: (node: EditorNode) => void;
    onPreviewTexture?: (path: string) => void;
    /** Path of the bin being edited, for resolving inline texture previews. */
    binPath?: string | null;
}

interface FieldRowProps extends FieldRowCallbacks {
    node: EditorNode;
    advanced: boolean;
    depth?: number;
}

const LABEL_W = 168;

const badgeStyle: CSSProperties = {
    padding: '0 5px',
    borderRadius: 3,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
};
const mutedStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };

/* Hover-revealed per-row action toolbar (RubyRe pattern): move up / move down /
   delete. Only the handlers that are provided render a button. */
function RowActions({
    onUp,
    onDown,
    onDelete,
}: {
    onUp?: () => void;
    onDown?: () => void;
    onDelete?: () => void;
}) {
    if (!onUp && !onDown && !onDelete) return null;
    return (
        <div className="bev2-rowactions">
            {onUp && (
                <button
                    type="button"
                    className="bev2-rowbtn"
                    title="Move up"
                    onClick={(e) => { e.stopPropagation(); onUp(); }}
                >
                    <ArrowUp size={13} />
                </button>
            )}
            {onDown && (
                <button
                    type="button"
                    className="bev2-rowbtn"
                    title="Move down"
                    onClick={(e) => { e.stopPropagation(); onDown(); }}
                >
                    <ArrowDown size={13} />
                </button>
            )}
            {onDelete && (
                <button
                    type="button"
                    className="bev2-rowbtn bev2-rowbtn--danger"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                    <Trash2 size={13} />
                </button>
            )}
        </div>
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
        onMoveNode,
        onAddNested,
        onAddListItem,
        onPreviewTexture,
        binPath,
    } = props;
    const open = expandedFields.has(pathKey(node.path));
    const kind = widgetFor(node);
    const label = prettyName(node.key ?? 'item');
    const protectedField = !!node.key && sameKey(node.key, 'emitterName');
    const removeThis = !protectedField && onRemoveNode ? () => onRemoveNode(node) : null;
    // Reorder is offered on any non-protected node with a move handler. Edge
    // moves are clamped to no-ops by the backend, so first/last rows stay safe.
    const moveUp = !protectedField && onMoveNode ? () => onMoveNode(node, -1) : undefined;
    const moveDown = !protectedField && onMoveNode ? () => onMoveNode(node, 1) : undefined;
    const rowActions = (
        <RowActions onUp={moveUp} onDown={moveDown} onDelete={removeThis ?? undefined} />
    );

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
        onMoveNode,
        onAddNested,
        onAddListItem,
        onPreviewTexture,
        binPath,
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
                    binPath={binPath}
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
        // Nested Value* fields (textureMult UV controls, erosion drive/mixer,
        // trail definitions, etc.) are first-class animated values too.
        const canDyn = canAnimate(node) && (onAnimate || onDeanimate);
        const extraDynChildren = (dynamics?.children ?? []).filter(
            (c) => !sameKey(c.key, 'times') && !sameKey(c.key, 'values'),
        );
        return (
            <>
                <div className="bev2-row">
                    <div className="bev2-label">
                        {label}
                        {advanced && node.className && <span style={badgeStyle}>{node.className}</span>}
                    </div>
                    <div className="bev2-value">
                        {renderControl(primary)}
                        {canDyn &&
                            (animated ? (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--secondary dl-btn--sm bev2-animbtn"
                                    title="Remove the animated curve"
                                    onClick={() => onDeanimate?.(node)}
                                >
                                    Constant
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--secondary dl-btn--sm bev2-animbtn"
                                    title="Animate this value (add a dynamics curve)"
                                    onClick={() => onAnimate?.(node)}
                                >
                                    Animate
                                </button>
                            ))}
                    </div>
                    {rowActions}
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
                    <div className="bev2-nest" style={{ paddingLeft: LABEL_W + 12 }}>
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
                <div className="bev2-row bev2-row--expandable" onClick={() => onToggleField(node.path)}>
                    <div className="bev2-label">
                        <span style={{ color: 'var(--accent-secondary)', width: 10 }}>{open ? '▼' : '▶'}</span>
                        {label}
                        {advanced && typeBadge(node) && <span style={badgeStyle}>{typeBadge(node)}</span>}
                    </div>
                    <div className="bev2-summary">{kids.length} items</div>
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
                            <GenericFieldMenu
                                className={node.className}
                                present={kids.map((child) => child.key)}
                                onAdd={(entry) => onAddNested(node, entry)}
                            />
                        </span>
                    )}
                    {rowActions}
                </div>
                {open && (
                    <div className="bev2-nest">
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
        <div className="bev2-row">
            <div className="bev2-label">
                {label}
                {advanced && typeBadge(node) && <span style={badgeStyle}>{typeBadge(node)}</span>}
            </div>
            <div className="bev2-value">
                {renderControl(node)}
            </div>
            {rowActions}
        </div>
    );
}

/* NOT memoized: leaf edits mutate nodes in place, so a row can't tell from its
   props that its value changed. EmitterGroup is the memo boundary — it bails
   per-emitter via its `rev` prop, and once a group renders, all its rows must
   render too. */
const FieldRow = FieldRowInner;
export default FieldRow;
