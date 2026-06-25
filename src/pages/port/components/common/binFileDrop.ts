import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileDrop, type FileDropPosition } from '@/lib/util/useFileDrop';

/* Drag-and-drop helpers for accepting .bin / .py files onto a panel.
   In Tauri the File object does not expose an absolute path, so the real dropped
   paths come from the webview drag-drop event. The DOM drag events are kept only
   for the hover visuals; the actual path is sourced from the Tauri event and
   hit-tested against this panel's bounds so the right zone (target/donor) loads.
   Internal VFX drags are ignored. */

function isExternalFileDrag(e: React.DragEvent): boolean {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    for (const t of Array.from(types)) {
        if (t === 'Files' || t === 'application/x-moz-file') return true;
    }
    return false;
}

function pickBinPath(paths: string[]): string | null {
    const match = paths.find((p) => /\.(bin|py)$/i.test(p));
    return match || null;
}

export function useBinFileDrop(onAcceptedFile: (filePath: string) => void) {
    const [isOver, setIsOver] = useState(false);
    const zoneRef = useRef<HTMLDivElement | null>(null);
    const onAcceptedRef = useRef(onAcceptedFile);
    onAcceptedRef.current = onAcceptedFile;

    const containsPoint = useCallback((pos: FileDropPosition) => {
        const el = zoneRef.current;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return pos.x >= r.left && pos.x <= r.right && pos.y >= r.top && pos.y <= r.bottom;
    }, []);

    // Hover styling driven by the OS drag-drop event so it tracks the real cursor.
    useFileDrop({
        onEnter: (pos) => setIsOver(containsPoint(pos)),
        onOver: (pos) => setIsOver(containsPoint(pos)),
        onLeave: () => setIsOver(false),
        onDrop: (paths, pos) => {
            setIsOver(false);
            if (!containsPoint(pos)) return;
            const p = pickBinPath(paths);
            if (p && typeof onAcceptedRef.current === 'function') onAcceptedRef.current(p);
        },
    });

    // DOM handlers only suppress the default browser behavior and back the hover
    // visuals when the webview event isn't delivering positions (best effort).
    const onDragEnter = useCallback((e: React.DragEvent) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            e.dataTransfer.dropEffect = 'copy';
        } catch {
            /* noop */
        }
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        if (!isExternalFileDrag(e)) return;
        // The OS drag-drop event carries the absolute paths; just swallow this.
        e.preventDefault();
        e.stopPropagation();
    }, []);

    useEffect(() => () => setIsOver(false), []);

    return {
        isOver,
        zoneRef,
        handlers: {
            ref: zoneRef,
            onDragEnterCapture: onDragEnter,
            onDragOverCapture: onDragOver,
            onDragLeaveCapture: onDragLeave,
            onDropCapture: onDrop,
        },
    };
}
