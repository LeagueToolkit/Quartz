import type { ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import './dropOverlay.css';

/* Canonical drag-over / drop-target feedback for the whole app.

   Two visual families, unified so every page reads the same:
   - `variant="pill"` (default): a dashed accent border + faint tint over the
     target, with a centered mono pill label. Matches Port's column overlays and
     the old Bin Editor v1 look — the most reused, most "labeled" treatment.
   - `variant="scrim"`: an opaque blurred scrim with a 3px pulsing dashed border,
     a large centered icon, and a label. Matches the old Bin Editor v2 /
     Image Recolor full-panel drop zones.

   Render it as the last child of a `position: relative` drop target and gate it
   on the target's own `isOver`/drag state:

     {isOver && <DropOverlay label="Drop .bin here" />}

   The overlay is `pointer-events: none`, so it never eats the drop event — the
   parent's DOM/`useFileDrop` handlers still fire underneath. */
export interface DropOverlayProps {
    /** Pill/label text, e.g. "Drop .bin or .py to load as Target". */
    label: ReactNode;
    /** Accent to key the border/tint off. Donor-side zones use "secondary". */
    accent?: 'primary' | 'secondary';
    /** Visual family — see the component doc. Defaults to "pill". */
    variant?: 'pill' | 'scrim';
    /** Icon shown above the label in the "scrim" variant. Defaults to a cloud. */
    icon?: ReactNode;
    /** Extra classes on the overlay root (rarely needed). */
    className?: string;
}

export function DropOverlay({
    label,
    accent = 'primary',
    variant = 'pill',
    icon,
    className = '',
}: DropOverlayProps) {
    const accentVar = accent === 'secondary' ? 'var(--accent-secondary)' : 'var(--accent-primary)';
    const style = { '--drop-accent': accentVar } as React.CSSProperties;

    if (variant === 'scrim') {
        return (
            <div className={`drop-overlay drop-overlay--scrim ${className}`.trim()} style={style}>
                <span className="drop-overlay__icon">{icon ?? <UploadCloud size={40} />}</span>
                <span className="drop-overlay__scrim-label">{label}</span>
            </div>
        );
    }

    return (
        <div className={`drop-overlay drop-overlay--pill ${className}`.trim()} style={style}>
            <span className="drop-overlay__pill">{label}</span>
        </div>
    );
}

export default DropOverlay;
