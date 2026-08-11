import { useCallback, useMemo, useRef, useState } from 'react';
import {
    buildCurveLut,
    removePoint,
    upsertPoint,
    type CurvePoint,
} from '../utils/curve';

interface CurveEditorProps {
    points: CurvePoint[];
    onChange: (points: CurvePoint[]) => void;
    disabled: boolean;
}

/* Editor coordinates are a fixed 0-255 square; the SVG scales to the panel width, so
   the drawing never needs to know its pixel size. */
const SIZE = 255;
/* Click/drag within this many levels of a point grabs it instead of adding a new one. */
const HIT_RADIUS = 10;

/* GIMP-style Value tone curve. Drag to move a point, click empty space to add one,
   right-click or double-click a point to remove it. Endpoints move vertically only. */
export function CurveEditor({ points, onChange, disabled }: CurveEditorProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    // The rendered curve follows the same LUT the pixels will use, so what you see is
    // exactly what gets applied.
    const path = useMemo(() => {
        const lut = buildCurveLut(points);
        let d = `M 0 ${SIZE - lut[0]}`;
        for (let x = 1; x < 256; x++) d += ` L ${x} ${SIZE - lut[x]}`;
        return d;
    }, [points]);

    /* Pointer position in curve space (0-255, y already flipped). */
    const toCurveSpace = useCallback((e: { clientX: number; clientY: number }) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        const x = ((e.clientX - rect.left) / rect.width) * SIZE;
        const y = SIZE - ((e.clientY - rect.top) / rect.height) * SIZE;
        return { x: Math.max(0, Math.min(SIZE, x)), y: Math.max(0, Math.min(SIZE, y)) };
    }, []);

    const findNear = useCallback((x: number, y: number) => {
        let best = -1;
        let bestDist = HIT_RADIUS;
        points.forEach((p, i) => {
            const dist = Math.hypot(p.x - x, p.y - y);
            if (dist <= bestDist) { bestDist = dist; best = i; }
        });
        return best;
    }, [points]);

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (disabled) return;
        const pos = toCurveSpace(e);
        if (!pos) return;

        const hit = findNear(pos.x, pos.y);
        if (e.button === 2) {
            // Right-click removes an interior point (endpoints are permanent).
            if (hit >= 0) onChange(removePoint(points, hit));
            return;
        }
        if (e.button !== 0) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        if (hit >= 0) {
            setDragIndex(hit);
            return;
        }
        // Empty space: add a point there and immediately start dragging it.
        const next = upsertPoint(points, pos.x, pos.y);
        onChange(next);
        setDragIndex(next.findIndex((p) => p.x === Math.round(pos.x)));
    };

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (disabled || dragIndex === null) return;
        const pos = toCurveSpace(e);
        if (!pos) return;

        const isFirst = dragIndex === 0;
        const isLast = dragIndex === points.length - 1;
        const next = points.map((p, i) => (i === dragIndex ? { ...p, y: Math.round(pos.y) } : p));

        if (isFirst || isLast) {
            // Endpoints are pinned to x=0 / x=255; only their level moves.
            onChange(next);
            return;
        }

        /* Interior points stay strictly between their neighbours, so the list cannot
           reorder mid-drag and swap the point out from under the pointer. */
        const lo = points[dragIndex - 1].x + 1;
        const hi = points[dragIndex + 1].x - 1;
        next[dragIndex] = {
            x: Math.max(lo, Math.min(hi, Math.round(pos.x))),
            y: Math.round(pos.y),
        };
        onChange(next);
    };

    const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
        if (dragIndex !== null) {
            setDragIndex(null);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        }
    };

    const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (disabled) return;
        const pos = toCurveSpace(e);
        if (!pos) return;
        const hit = findNear(pos.x, pos.y);
        if (hit >= 0) onChange(removePoint(points, hit));
    };

    return (
        <svg
            ref={svgRef}
            className="imgrecolor-curve__svg"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            preserveAspectRatio="none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: disabled ? 'default' : 'crosshair', opacity: disabled ? 0.5 : 1 }}
        >
            {/* Quarter grid + the identity diagonal for reference. */}
            {[0.25, 0.5, 0.75].map((f) => (
                <g key={f}>
                    <line x1={SIZE * f} y1={0} x2={SIZE * f} y2={SIZE} className="imgrecolor-curve__grid" />
                    <line x1={0} y1={SIZE * f} x2={SIZE} y2={SIZE * f} className="imgrecolor-curve__grid" />
                </g>
            ))}
            <line x1={0} y1={SIZE} x2={SIZE} y2={0} className="imgrecolor-curve__diagonal" />

            <path d={path} className="imgrecolor-curve__line" />

            {points.map((p, i) => (
                <circle
                    key={`${p.x}-${i}`}
                    cx={p.x}
                    cy={SIZE - p.y}
                    r={i === dragIndex ? 6 : 4.5}
                    className="imgrecolor-curve__point"
                />
            ))}
        </svg>
    );
}
