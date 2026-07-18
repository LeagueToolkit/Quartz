/*
 * ColorPicker — self-contained popover picker.
 *
 * Replaces the Electron `CreatePicker` DOM picker. Same UX contract: a
 * saturation/value square, a hue strip and a hex field. Commits a hex string
 * through onCommit on every change. Positions itself near the anchor element
 * and closes on outside click / Escape.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import './ColorPicker.css';

/** Opt-in alpha support: pass `alpha` (0..1) to render an alpha slider; the
 *  picker then reports alpha changes through `onAlpha`. Omit for RGB-only. */
export interface ColorPickerOpts {
    alpha?: number;
    onAlpha?: (alpha: number) => void;
}

interface PickerState {
    anchor: { left: number; top: number; bottom: number; right: number };
    hex: string;
    onCommit: (hex: string) => void;
    alpha: number | null;
    onAlpha?: (alpha: number) => void;
}

let openController: ((s: PickerState | null) => void) | null = null;

export function openColorPicker(
    event: { currentTarget?: Element | null; target?: EventTarget | null },
    initialHex: string,
    onCommit: (hex: string) => void,
    opts?: ColorPickerOpts,
): void {
    const el = (event.currentTarget || event.target) as Element | null;
    const rect = el && 'getBoundingClientRect' in el
        ? (el as Element).getBoundingClientRect()
        : ({ left: 100, top: 100, bottom: 130, right: 130 } as DOMRect);
    openController?.({
        anchor: { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right },
        hex: initialHex || '#808080',
        onCommit,
        alpha: opts?.alpha ?? null,
        onAlpha: opts?.onAlpha,
    });
}

export function cleanupColorPickers(): void {
    openController?.(null);
}

/* ── color math ─────────────────────────────────────────────────────────── */

function hexToHsv(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return [h, s, max];
}

function hsvToHex(h: number, s: number, v: number): string {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

/* ── host ───────────────────────────────────────────────────────────────── */

export function ColorPickerHost() {
    const [state, setState] = useState<PickerState | null>(null);
    const [h, setH] = useState(0);
    const [s, setS] = useState(0);
    const [v, setV] = useState(0);
    const [hexText, setHexText] = useState('#808080');
    const [alpha, setAlpha] = useState(1);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState({ left: 0, top: 0 });

    useEffect(() => {
        openController = (next) => {
            if (next) {
                const [nh, ns, nv] = hexToHsv(next.hex);
                setH(nh); setS(ns); setV(nv);
                setHexText(next.hex);
                setAlpha(next.alpha ?? 1);
            }
            setState(next);
        };
        return () => { openController = null; };
    }, []);

    const commit = (nh: number, ns: number, nv: number) => {
        const hex = hsvToHex(nh, ns, nv);
        setHexText(hex);
        state?.onCommit(hex);
    };

    useLayoutEffect(() => {
        if (!state || !rootRef.current) return;
        const w = rootRef.current.offsetWidth || 240;
        const ht = rootRef.current.offsetHeight || 280;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 8;
        let left = state.anchor.left;
        let top = state.anchor.bottom + 6;
        if (left + w + margin > vw) left = Math.max(margin, vw - w - margin);
        if (top + ht + margin > vh) {
            const above = state.anchor.top - ht - 6;
            top = above >= margin ? above : Math.max(margin, vh - ht - margin);
        }
        setPos({ left: Math.round(left), top: Math.round(top) });
    }, [state]);

    useEffect(() => {
        if (!state) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setState(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(null); };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
    }, [state]);

    if (!state) return null;

    const handleSv = (e: React.MouseEvent | MouseEvent, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const ns = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const nv = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        setS(ns); setV(nv); commit(h, ns, nv);
    };

    const handleHue = (e: React.MouseEvent | MouseEvent, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
        setH(nh); commit(nh, s, v);
    };

    const handleAlpha = (e: React.MouseEvent | MouseEvent, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const na = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setAlpha(na);
        state?.onAlpha?.(na);
    };

    const startDrag = (e: React.MouseEvent, el: HTMLElement, handler: (e: MouseEvent | React.MouseEvent, el: HTMLElement) => void) => {
        e.preventDefault();
        handler(e, el);
        let frame = 0;
        let latest: MouseEvent | null = null;
        const flush = () => { frame = 0; if (latest) { handler(latest, el); latest = null; } };
        const move = (ev: MouseEvent) => {
            latest = ev;
            // Coalesce to one commit per animation frame so a fast drag never
            // fires a full setPalette clone per pixel.
            if (!frame) frame = requestAnimationFrame(flush);
        };
        const up = () => {
            if (frame) { cancelAnimationFrame(frame); frame = 0; }
            if (latest) { handler(latest, el); latest = null; }
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    const pickScreenColor = async () => {
        const EyeDropperCtor = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (!EyeDropperCtor) {
            return;
        }
        try {
            const eyeDropper = new EyeDropperCtor();
            const result = await eyeDropper.open();
            if (result?.sRGBHex) {
                const hex = result.sRGBHex.startsWith('#') ? result.sRGBHex : `#${result.sRGBHex}`;
                const [nh, ns, nv] = hexToHsv(hex);
                setH(nh); setS(ns); setV(nv);
                setHexText(hex);
                state?.onCommit(hex);
            }
        } catch {
            // User cancelled or the webview blocked the picker; keep the modal open.
        }
    };

    const currentHex = hsvToHex(h, s, v);
    const hueHex = hsvToHex(h, 1, 1);

    return (
        <div ref={rootRef} className="paint-color-picker" style={{ left: pos.left, top: pos.top }} onMouseDown={(e) => e.stopPropagation()}>
            <div
                className="pcp-sv"
                style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})` }}
                onMouseDown={(e) => startDrag(e, e.currentTarget, handleSv)}
            >
                <div className="pcp-sv-thumb" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
            </div>
            <div className="pcp-hue" onMouseDown={(e) => startDrag(e, e.currentTarget, handleHue)}>
                <div className="pcp-hue-thumb" style={{ left: `${(h / 360) * 100}%` }} />
            </div>
            {state.alpha !== null && (
                <div
                    className="pcp-alpha"
                    onMouseDown={(e) => startDrag(e, e.currentTarget, handleAlpha)}
                    title={`Alpha: ${alpha.toFixed(2)}`}
                >
                    {/* Checkerboard shows through the opacity gradient. */}
                    <div className="pcp-alpha-track" style={{ background: `linear-gradient(to right, transparent, ${currentHex})` }} />
                    <div className="pcp-alpha-thumb" style={{ left: `${alpha * 100}%` }} />
                </div>
            )}
            <div className="pcp-row">
                <button
                    type="button"
                    className="pcp-pipette"
                    onClick={pickScreenColor}
                    title="Pick a color from the screen"
                >
                    <Pipette size={13} />
                </button>
                <div className="pcp-swatch" style={{ background: currentHex }} />
                <input
                    className="pcp-hex"
                    value={hexText}
                    onChange={(e) => {
                        const val = e.target.value;
                        setHexText(val);
                        if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
                            const hx = val.startsWith('#') ? val : `#${val}`;
                            const [nh, ns, nv] = hexToHsv(hx);
                            setH(nh); setS(ns); setV(nv);
                            state.onCommit(hx);
                        }
                    }}
                />
            </div>
        </div>
    );
}
