import { useEffect } from 'react';

/* The cursor-following radial glow reads --mx/--my (set in px relative to the
   element). Those vars are only meaningful while the pointer is over a glowing
   element, so a single document-level listener updates them on whichever
   .dl-btn or .q-glow-card is under the cursor. Without this the glow falls back
   to its 50%/50% default and just sits in the middle. */
const GLOW_SELECTOR = '.dl-btn, .q-glow-card';

export function useButtonGlow() {
    useEffect(() => {
        let current: HTMLElement | null = null;

        const onMove = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement)?.closest<HTMLElement>(GLOW_SELECTOR);
            if (btn !== current) {
                current?.style.removeProperty('--mx');
                current?.style.removeProperty('--my');
                current = btn;
            }
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
            btn.style.setProperty('--my', `${e.clientY - r.top}px`);
        };

        document.addEventListener('mousemove', onMove, { passive: true });
        return () => document.removeEventListener('mousemove', onMove);
    }, []);
}
