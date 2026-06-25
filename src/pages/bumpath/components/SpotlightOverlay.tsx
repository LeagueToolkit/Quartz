import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';

/* SpotlightOverlay
   Dims the entire screen except a rectangular spotlight around the target rect.
   Uses four fixed layers (top, left, right, bottom) to create a "hole" where
   the target is. */

export interface SpotlightRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface SpotlightOverlayProps {
    rect: SpotlightRect | null;
    padding?: number;
    dimColor?: string;
    zIndex?: number;
}

const SpotlightOverlay = ({
    rect,
    padding = 8,
    dimColor = 'rgba(0,0,0,0.55)',
    zIndex = 5000,
}: SpotlightOverlayProps) => {
    if (!rect) return null;

    const { innerWidth: vw, innerHeight: vh } = window;
    const x = Math.max(0, rect.left - padding);
    const y = Math.max(0, rect.top - padding);
    const w = Math.min(vw - x, rect.width + padding * 2);
    const h = Math.min(vh - y, rect.height + padding * 2);

    // Regions around the hole
    const topStyle: CSSProperties = {
        position: 'fixed', left: 0, top: 0, width: '100vw', height: y,
        background: dimColor, zIndex,
        pointerEvents: 'none',
    };
    const leftStyle: CSSProperties = {
        position: 'fixed', left: 0, top: y, width: x, height: h,
        background: dimColor, zIndex,
        pointerEvents: 'none',
    };
    const rightStyle: CSSProperties = {
        position: 'fixed', left: x + w, top: y, width: Math.max(0, vw - (x + w)), height: h,
        background: dimColor, zIndex,
        pointerEvents: 'none',
    };
    const bottomStyle: CSSProperties = {
        position: 'fixed', left: 0, top: y + h, width: '100vw', height: Math.max(0, vh - (y + h)),
        background: dimColor, zIndex,
        pointerEvents: 'none',
    };

    const ringStyle: CSSProperties = {
        position: 'fixed', left: x, top: y, width: w, height: h,
        borderRadius: 10,
        // Accent ring with a restrained spotlight glow
        boxShadow:
            '0 0 0 2px color-mix(in oklab, var(--accent-primary) 95%, transparent), 0 0 16px color-mix(in oklab, var(--accent-primary) 45%, transparent), inset 0 0 12px color-mix(in oklab, var(--accent-primary) 30%, transparent)',
        pointerEvents: 'none',
        zIndex: zIndex + 1,
    };

    return createPortal(
        <>
            <div style={topStyle} />
            <div style={leftStyle} />
            <div style={rightStyle} />
            <div style={bottomStyle} />
            <div style={ringStyle} />
        </>,
        document.body,
    );
};

export default SpotlightOverlay;
