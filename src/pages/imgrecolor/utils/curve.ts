/*
 * Value-channel tone curve, modeled on GIMP's Curves dialog.
 *
 * The curve is a small list of control points in 0-255 input/output space, kept sorted by
 * input. It is baked into a 256-entry lookup table for both the live preview and the batch
 * save, so the pixel path is a single array index rather than spline math per pixel.
 */

export interface CurvePoint {
    /** Input level, 0-255. */
    x: number;
    /** Output level, 0-255. */
    y: number;
}

/* The identity curve: black stays black, white stays white. */
export const DEFAULT_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

export function isIdentityCurve(points: CurvePoint[]): boolean {
    return points.length === 2
        && points[0].x === 0 && points[0].y === 0
        && points[1].x === 255 && points[1].y === 255;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/*
 * Build the 256-entry LUT for a set of control points.
 *
 * Uses monotone cubic interpolation (Fritsch-Carlson). A plain cubic spline through the
 * same points can overshoot between them - a curve pulled toward pure black can dip below
 * zero and clip, inverting shadow detail - and monotone interpolation is what keeps the
 * output moving in the same direction as the points the user actually placed.
 */
export function buildCurveLut(points: CurvePoint[]): Uint8Array {
    const lut = new Uint8Array(256);

    const pts = [...points].sort((a, b) => a.x - b.x);
    if (pts.length === 0) {
        for (let i = 0; i < 256; i++) lut[i] = i;
        return lut;
    }
    if (pts.length === 1) {
        lut.fill(clamp(Math.round(pts[0].y), 0, 255));
        return lut;
    }

    const n = pts.length;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);

    // Secant slopes between consecutive points.
    const dxs: number[] = [];
    const dys: number[] = [];
    const ms: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        const dx = xs[i + 1] - xs[i];
        const dy = ys[i + 1] - ys[i];
        // Coincident x would divide by zero; treat as flat.
        dxs.push(dx);
        dys.push(dy);
        ms.push(dx === 0 ? 0 : dy / dx);
    }

    // Tangents: endpoints take the adjacent secant, interior points average neighbours.
    const tangents: number[] = new Array(n);
    tangents[0] = ms[0];
    tangents[n - 1] = ms[n - 2];
    for (let i = 1; i < n - 1; i++) {
        if (ms[i - 1] * ms[i] <= 0) {
            // A direction change is a local extremum: flatten so the curve cannot overshoot.
            tangents[i] = 0;
        } else {
            tangents[i] = (ms[i - 1] + ms[i]) / 2;
        }
    }

    // Fritsch-Carlson: pull tangents back inside the monotonicity circle.
    for (let i = 0; i < n - 1; i++) {
        if (ms[i] === 0) {
            tangents[i] = 0;
            tangents[i + 1] = 0;
            continue;
        }
        const a = tangents[i] / ms[i];
        const b = tangents[i + 1] / ms[i];
        const h = Math.hypot(a, b);
        if (h > 3) {
            const t = 3 / h;
            tangents[i] = t * a * ms[i];
            tangents[i + 1] = t * b * ms[i];
        }
    }

    let seg = 0;
    for (let x = 0; x < 256; x++) {
        // Flat extension outside the control-point range, like GIMP's endpoints.
        if (x <= xs[0]) { lut[x] = clamp(Math.round(ys[0]), 0, 255); continue; }
        if (x >= xs[n - 1]) { lut[x] = clamp(Math.round(ys[n - 1]), 0, 255); continue; }

        while (seg < n - 2 && x > xs[seg + 1]) seg++;

        const h = dxs[seg];
        if (h === 0) { lut[x] = clamp(Math.round(ys[seg]), 0, 255); continue; }

        // Hermite basis on the normalised position within the segment.
        const t = (x - xs[seg]) / h;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        const y = h00 * ys[seg] + h10 * h * tangents[seg] + h01 * ys[seg + 1] + h11 * h * tangents[seg + 1];
        lut[x] = clamp(Math.round(y), 0, 255);
    }

    return lut;
}

/*
 * Insert a point, or move the existing one at that input level.
 *
 * Endpoints keep their x pinned at 0 and 255 so the curve always spans the full range;
 * only their output level can move, which is how GIMP behaves.
 */
export function upsertPoint(points: CurvePoint[], x: number, y: number): CurvePoint[] {
    const cx = clamp(Math.round(x), 0, 255);
    const cy = clamp(Math.round(y), 0, 255);
    const next = points.filter((p) => p.x !== cx);
    next.push({ x: cx, y: cy });
    return next.sort((a, b) => a.x - b.x);
}

/* Remove the point at `index`, unless it is one of the two endpoints. */
export function removePoint(points: CurvePoint[], index: number): CurvePoint[] {
    if (index <= 0 || index >= points.length - 1) return points;
    return points.filter((_, i) => i !== index);
}
