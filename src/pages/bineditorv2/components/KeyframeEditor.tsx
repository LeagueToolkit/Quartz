import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { EditorNode, JsonBinValue, NodePath } from '@/lib/api/bineditor';
import { encodeNumber, encodeVector, encodeVectorSet, vectorComponents } from '../model/nodes';
import { ColorWidget, NumInput } from './widgets';

interface KeyframeEditorProps {
    times: EditorNode;
    values: EditorNode;
    onCommitLeaf: (path: NodePath, value: JsonBinValue) => void;
    onAddKeyframe: () => void;
    onRemoveKeyframe: (index: number) => void;
}

interface Viewport {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

interface DragState {
    keyIndex: number;
    componentIndex: number;
}

const GRAPH_W = 760;
const GRAPH_H = 220;
const PAD = { left: 48, right: 14, top: 14, bottom: 26 };
const MIN_SPAN = 0.000001;
const AXIS_COLORS = ['#5eead4', '#7dd3fc', '#fda4af', '#fde68a'];

function toFiniteNumber(value: unknown, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function expandRange(min: number, max: number): [number, number] {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
    if (Math.abs(max - min) < MIN_SPAN) {
        const pad = Math.max(Math.abs(min) * 0.25, 1);
        return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad];
}

function buildFitViewport(timeData: number[], seriesData: number[][]): Viewport {
    const xValues = timeData.length > 0 ? timeData : [0, 1];
    const yValues = seriesData.flat();
    const [xMin, xMax] = expandRange(Math.min(...xValues), Math.max(...xValues));
    const [yMin, yMax] = expandRange(
        yValues.length > 0 ? Math.min(...yValues) : -1,
        yValues.length > 0 ? Math.max(...yValues) : 1,
    );
    return { xMin, xMax, yMin, yMax };
}

function viewportEquals(a: Viewport, b: Viewport): boolean {
    return a.xMin === b.xMin && a.xMax === b.xMax && a.yMin === b.yMin && a.yMax === b.yMax;
}

function formatAxis(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
    if (abs >= 10) return value.toFixed(2);
    if (abs >= 1) return value.toFixed(4);
    return value.toFixed(6);
}

export default function KeyframeEditor({
    times,
    values,
    onCommitLeaf,
    onAddKeyframe,
    onRemoveKeyframe,
}: KeyframeEditorProps) {
    const [open, setOpen] = useState(false);
    const [viewport, setViewport] = useState<Viewport>({ xMin: -0.1, xMax: 1.1, yMin: -1, yMax: 1 });
    const [draftTimes, setDraftTimes] = useState<number[] | null>(null);
    const [draftSeries, setDraftSeries] = useState<number[][] | null>(null);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [panOrigin, setPanOrigin] = useState<{ x: number; y: number; viewport: Viewport } | null>(null);
    const graphRef = useRef<SVGSVGElement | null>(null);
    const pointerIdRef = useRef<number | null>(null);

    const timeKids = times.children ?? [];
    const valueKids = values.children ?? [];
    const n = Math.max(timeKids.length, valueKids.length);

    const baseTimes = timeKids.map((node) => toFiniteNumber(node.value, 0));
    const sample = valueKids.find(Boolean);
    const componentCount = sample?.kind === 'vector' ? Math.max(sample.children?.length ?? 0, 1) : 1;
    const baseSeries = Array.from({ length: componentCount }, (_, componentIndex) =>
        valueKids.map((node) => {
            if (!node) return 0;
            if (node.kind === 'vector') return toFiniteNumber(node.children?.[componentIndex]?.value, 0);
            return toFiniteNumber(node.value, 0);
        }),
    );

    const shownTimes = draftTimes ?? baseTimes;
    const shownSeries = draftSeries ?? baseSeries;
    const canGraph = valueKids.length > 0
        && valueKids.every((node) => !!node && (node.kind === 'primitive' || node.kind === 'vector'));
    const fitViewport = buildFitViewport(shownTimes, shownSeries);

    useEffect(() => {
        if (!open) return;
        setViewport((current) => (viewportEquals(current, fitViewport) ? current : fitViewport));
    }, [open, n, componentCount]);

    useEffect(() => {
        if (drag) return;
        setDraftTimes(null);
        setDraftSeries(null);
    }, [times, values, drag]);

    const plotW = GRAPH_W - PAD.left - PAD.right;
    const plotH = GRAPH_H - PAD.top - PAD.bottom;
    const xSpan = Math.max(viewport.xMax - viewport.xMin, MIN_SPAN);
    const ySpan = Math.max(viewport.yMax - viewport.yMin, MIN_SPAN);
    const toPlotX = (timeValue: number) => PAD.left + ((timeValue - viewport.xMin) / xSpan) * plotW;
    const toPlotY = (sampleValue: number) => PAD.top + (1 - (sampleValue - viewport.yMin) / ySpan) * plotH;

    const readGraphPoint = (clientX: number, clientY: number) => {
        const rect = graphRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const relX = clamp(clientX - rect.left, PAD.left, rect.width - PAD.right);
        const relY = clamp(clientY - rect.top, PAD.top, rect.height - PAD.bottom);
        const plotX = (relX - PAD.left) / Math.max(rect.width - PAD.left - PAD.right, 1);
        const plotY = (relY - PAD.top) / Math.max(rect.height - PAD.top - PAD.bottom, 1);
        return {
            time: viewport.xMin + plotX * xSpan,
            value: viewport.yMax - plotY * ySpan,
            relX,
            relY,
            rect,
        };
    };

    const commitDraft = (nextTimes: number[], nextSeries: number[][]) => {
        nextTimes.forEach((timeValue, index) => {
            const timeNode = timeKids[index];
            if (timeNode && timeValue !== baseTimes[index]) {
                onCommitLeaf(timeNode.path, encodeNumber(timeNode, timeValue));
            }
        });
        valueKids.forEach((valueNode, index) => {
            if (!valueNode) return;
            if (valueNode.kind === 'vector') {
                const nextVector = nextSeries.map((series) => series[index] ?? 0);
                if (nextVector.some((value, componentIndex) => value !== baseSeries[componentIndex]?.[index])) {
                    onCommitLeaf(valueNode.path, encodeVector(valueNode, nextVector));
                }
                return;
            }
            const nextValue = nextSeries[0]?.[index] ?? 0;
            if (nextValue !== baseSeries[0]?.[index]) {
                onCommitLeaf(valueNode.path, encodeNumber(valueNode, nextValue));
            }
        });
    };

    const zoomViewport = (factorX: number, factorY: number, anchorTime: number, anchorValue: number) => {
        setViewport((current) => {
            const currentXSpan = Math.max(current.xMax - current.xMin, MIN_SPAN);
            const currentYSpan = Math.max(current.yMax - current.yMin, MIN_SPAN);
            const nextXSpan = Math.max(currentXSpan * factorX, MIN_SPAN);
            const nextYSpan = Math.max(currentYSpan * factorY, MIN_SPAN);
            const anchorXRatio = (anchorTime - current.xMin) / currentXSpan;
            const anchorYRatio = (anchorValue - current.yMin) / currentYSpan;
            return {
                xMin: anchorTime - anchorXRatio * nextXSpan,
                xMax: anchorTime + (1 - anchorXRatio) * nextXSpan,
                yMin: anchorValue - anchorYRatio * nextYSpan,
                yMax: anchorValue + (1 - anchorYRatio) * nextYSpan,
            };
        });
    };

    const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
        if (!canGraph) return;
        const point = readGraphPoint(event.clientX, event.clientY);
        if (!point) return;
        event.preventDefault();
        const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
        if (event.shiftKey) {
            zoomViewport(1, factor, point.time, point.value);
            return;
        }
        if (event.altKey) {
            zoomViewport(factor, 1, point.time, point.value);
            return;
        }
        zoomViewport(factor, factor, point.time, point.value);
    };

    const handleGraphPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (!canGraph) return;
        const point = readGraphPoint(event.clientX, event.clientY);
        if (!point) return;
        pointerIdRef.current = event.pointerId;
        graphRef.current?.setPointerCapture(event.pointerId);
        setPanOrigin({ x: point.relX, y: point.relY, viewport });
    };

    const handlePointPointerDown = (event: ReactPointerEvent<SVGCircleElement>, keyIndex: number, componentIndex: number) => {
        if (!canGraph) return;
        event.stopPropagation();
        pointerIdRef.current = event.pointerId;
        graphRef.current?.setPointerCapture(event.pointerId);
        setDraftTimes([...shownTimes]);
        setDraftSeries(shownSeries.map((series) => [...series]));
        setDrag({ keyIndex, componentIndex });
    };

    const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (!canGraph) return;
        const point = readGraphPoint(event.clientX, event.clientY);
        if (!point) return;
        if (drag) {
            setDraftTimes((currentTimes) => {
                const timesDraft = currentTimes ? [...currentTimes] : [...shownTimes];
                const prevTime = drag.keyIndex > 0 ? timesDraft[drag.keyIndex - 1] + 0.0001 : -Infinity;
                const nextTime = drag.keyIndex < timesDraft.length - 1 ? timesDraft[drag.keyIndex + 1] - 0.0001 : Infinity;
                timesDraft[drag.keyIndex] = clamp(point.time, prevTime, nextTime);
                return timesDraft;
            });
            setDraftSeries((currentSeries) => {
                const seriesDraft = (currentSeries ?? shownSeries).map((series) => [...series]);
                if (!seriesDraft[drag.componentIndex]) return seriesDraft;
                seriesDraft[drag.componentIndex][drag.keyIndex] = point.value;
                return seriesDraft;
            });
            return;
        }
        if (panOrigin) {
            const rect = point.rect;
            const dx = (point.relX - panOrigin.x) / Math.max(rect.width - PAD.left - PAD.right, 1);
            const dy = (point.relY - panOrigin.y) / Math.max(rect.height - PAD.top - PAD.bottom, 1);
            const origin = panOrigin.viewport;
            const originXSpan = Math.max(origin.xMax - origin.xMin, MIN_SPAN);
            const originYSpan = Math.max(origin.yMax - origin.yMin, MIN_SPAN);
            setViewport({
                xMin: origin.xMin - dx * originXSpan,
                xMax: origin.xMax - dx * originXSpan,
                yMin: origin.yMin + dy * originYSpan,
                yMax: origin.yMax + dy * originYSpan,
            });
        }
    };

    const handlePointerUp = () => {
        if (pointerIdRef.current !== null) {
            graphRef.current?.releasePointerCapture(pointerIdRef.current);
            pointerIdRef.current = null;
        }
        if (drag && draftTimes && draftSeries) commitDraft(draftTimes, draftSeries);
        setDrag(null);
        setPanOrigin(null);
    };

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
                            width={72}
                            onCommit={(x) => onCommitLeaf(v.path, encodeVectorSet(v, i, x))}
                        />
                    ))}
                </div>
            );
        }
        return (
            <NumInput
                value={v.value}
                width={72}
                onCommit={(x) => onCommitLeaf(v.path, encodeNumber(v, x))}
            />
        );
    };

    const gridLines = [0, 0.25, 0.5, 0.75, 1];
    const displayedSeries = shownSeries;
    const legendLabels = componentCount === 1
        ? ['Value']
        : ['X', 'Y', 'Z', 'W'].slice(0, componentCount);

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
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {canGraph && (
                        <div
                            style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary), black 12%), var(--bg-tertiary))',
                                padding: 10,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    {legendLabels.map((label, index) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 999, background: AXIS_COLORS[index] }} />
                                            {label}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="dl-btn dl-btn--secondary dl-btn--sm"
                                        title="Zoom in"
                                        onClick={() => zoomViewport(1 / 1.35, 1 / 1.35, (viewport.xMin + viewport.xMax) / 2, (viewport.yMin + viewport.yMax) / 2)}
                                    >
                                        Zoom in
                                    </button>
                                    <button
                                        type="button"
                                        className="dl-btn dl-btn--secondary dl-btn--sm"
                                        title="Zoom out"
                                        onClick={() => zoomViewport(1.35, 1.35, (viewport.xMin + viewport.xMax) / 2, (viewport.yMin + viewport.yMax) / 2)}
                                    >
                                        Zoom out
                                    </button>
                                    <button
                                        type="button"
                                        className="dl-btn dl-btn--secondary dl-btn--sm"
                                        title="Fit all keyframes"
                                        onClick={() => setViewport(buildFitViewport(baseTimes, baseSeries))}
                                    >
                                        Fit
                                    </button>
                                </div>
                            </div>
                            <svg
                                ref={graphRef}
                                viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
                                style={{
                                    width: '100%',
                                    height: 220,
                                    display: 'block',
                                    cursor: drag ? 'grabbing' : panOrigin ? 'grabbing' : 'grab',
                                    touchAction: 'none',
                                }}
                                onWheel={handleWheel}
                                onPointerDown={handleGraphPointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={() => {
                                    if (drag || panOrigin) handlePointerUp();
                                }}
                            >
                                <rect
                                    x={PAD.left}
                                    y={PAD.top}
                                    width={plotW}
                                    height={plotH}
                                    rx={6}
                                    fill="rgba(5, 10, 18, 0.92)"
                                    stroke="rgba(255,255,255,0.06)"
                                />
                                {gridLines.map((ratio) => {
                                    const x = PAD.left + plotW * ratio;
                                    const t = viewport.xMin + xSpan * ratio;
                                    return (
                                        <g key={`x-${ratio}`}>
                                            <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 6" />
                                            <text x={x} y={GRAPH_H - 7} textAnchor="middle" fill="rgba(255,255,255,0.56)" fontSize="11">
                                                {formatAxis(t)}
                                            </text>
                                        </g>
                                    );
                                })}
                                {gridLines.map((ratio) => {
                                    const y = PAD.top + plotH * ratio;
                                    const v = viewport.yMax - ySpan * ratio;
                                    return (
                                        <g key={`y-${ratio}`}>
                                            <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 6" />
                                            <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.56)" fontSize="11">
                                                {formatAxis(v)}
                                            </text>
                                        </g>
                                    );
                                })}
                                {displayedSeries.map((series, componentIndex) => {
                                    const path = shownTimes
                                        .map((timeValue, keyIndex) => `${keyIndex === 0 ? 'M' : 'L'} ${toPlotX(timeValue)} ${toPlotY(series[keyIndex] ?? 0)}`)
                                        .join(' ');
                                    return (
                                        <g key={`series-${componentIndex}`}>
                                            <path
                                                d={path}
                                                fill="none"
                                                stroke={AXIS_COLORS[componentIndex] ?? AXIS_COLORS[0]}
                                                strokeWidth={2}
                                                strokeLinejoin="round"
                                                strokeLinecap="round"
                                            />
                                            {shownTimes.map((timeValue, keyIndex) => (
                                                <circle
                                                    key={`${componentIndex}-${keyIndex}`}
                                                    cx={toPlotX(timeValue)}
                                                    cy={toPlotY(series[keyIndex] ?? 0)}
                                                    r={drag?.keyIndex === keyIndex && drag.componentIndex === componentIndex ? 6.5 : 5}
                                                    fill="rgba(7, 12, 20, 0.98)"
                                                    stroke={AXIS_COLORS[componentIndex] ?? AXIS_COLORS[0]}
                                                    strokeWidth={2}
                                                    onPointerDown={(event) => handlePointPointerDown(event, keyIndex, componentIndex)}
                                                />
                                            ))}
                                        </g>
                                    );
                                })}
                            </svg>
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <span>Wheel: zoom</span>
                                <span>Shift + wheel: vertical zoom</span>
                                <span>Alt + wheel: time zoom</span>
                                <span>Drag background: pan</span>
                                <span>Drag point: move keyframe</span>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {Array.from({ length: n }).map((_, i) => {
                            const t = timeKids[i];
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>t</span>
                                    {t ? (
                                        <NumInput
                                            value={t.value}
                                            width={72}
                                            onCommit={(x) => onCommitLeaf(t.path, encodeNumber(t, x))}
                                        />
                                    ) : (
                                        <span style={{ width: 72 }} />
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
                </div>
            )}
        </div>
    );
}
