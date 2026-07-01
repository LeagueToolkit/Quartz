import { useEffect } from 'react';

/* The .dl-btn cursor-following radial glow reads --mx/--my (set in px relative to
   the button). Those vars are only meaningful while the pointer is over a button,
   so a single document-level listener updates them on whichever .dl-btn is under
   the cursor. Without this the glow falls back to its 50%/50% default and just
   sits in the middle. */
export function useButtonGlow() {
    useEffect(() => {
        let current: HTMLElement | null = null;

        const onMove = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement)?.closest<HTMLElement>('.dl-btn');
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
