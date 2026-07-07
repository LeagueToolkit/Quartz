import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Chroma } from '../types';

interface Props {
    chroma: Chroma;
    index: number;
    selected: boolean;
    color: string;
    offlineMode: boolean;
    onClick: (e: React.MouseEvent) => void;
    /* Text shown after "Chroma ID:" in the preview. Defaults to the raw id. */
    idLabel?: string;
}

/* A single chroma swatch whose hover preview is rendered through a portal to
   document.body. The old inline tooltip was clipped by the card media's
   `overflow: hidden`; portaling lets it escape the card bounds entirely and
   positions it above the dot in viewport coordinates. */
export function ChromaDot({ chroma, index, selected, color, offlineMode, onClick, idLabel }: Props) {
    const dotRef = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        if (!hover || !dotRef.current) return;
        const r = dotRef.current.getBoundingClientRect();
        // Center horizontally over the dot; sit just above it (tooltip uses a
        // bottom-anchored translate so it grows upward from this point).
        setPos({ left: r.left + r.width / 2, top: r.top - 8 });
    }, [hover]);

    const label = chroma.name || `Chroma ${index + 1}`;

    return (
        <div
            ref={dotRef}
            className={`chroma-dot ${selected ? 'selected' : ''}`}
            style={{ backgroundColor: color }}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {hover && pos && createPortal(
                <div
                    className="chroma-tooltip chroma-tooltip--portal"
                    style={{ left: pos.left, top: pos.top }}
                >
                    <div className="chroma-preview-image">
                        {!offlineMode ? (
                            <img
                                src={chroma.image_url}
                                alt={label}
                                style={{ width: 128, height: 128, objectFit: 'cover', borderRadius: 4 }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <div style={{ width: 128, height: 128, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                No image (offline)
                            </div>
                        )}
                    </div>
                    <div className="chroma-preview-name">{label}</div>
                    <div className="chroma-preview-ids">
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chroma ID: {idLabel ?? chroma.id}</div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
