import { useCallback, useRef, useState } from 'react';

/* Drag-and-drop helpers for accepting .bin / .py files onto a panel.
   In Tauri the File object does not expose an absolute path, so OS file drops
   are wired through the webview drag events; the dropped path is resolved by
   the caller. Internal VFX drags are ignored. */

function isExternalFileDrag(e: React.DragEvent): boolean {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    for (const t of Array.from(types)) {
        if (t === 'Files' || t === 'application/x-moz-file') return true;
    }
    return false;
}

export function useBinFileDrop(onAcceptedFile: (filePath: string) => void) {
    const [isOver, setIsOver] = useState(false);
    const counterRef = useRef(0);

    const onDragEnter = useCallback((e: React.DragEvent) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        counterRef.current += 1;
        if (counterRef.current === 1) setIsOver(true);
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
        counterRef.current = Math.max(0, counterRef.current - 1);
        if (counterRef.current === 0) setIsOver(false);
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            if (!isExternalFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            counterRef.current = 0;
            setIsOver(false);
            // TODO(backend): Tauri webview File objects lack an absolute path.
            // The native onDragDrop event provides paths; left to backend wiring.
            const files = e.dataTransfer?.files;
            const f = files && files.length > 0 ? (files[0] as File & { path?: string }) : null;
            const p = f?.path;
            if (p && /\.(bin|py)$/i.test(p) && typeof onAcceptedFile === 'function') onAcceptedFile(p);
        },
        [onAcceptedFile]
    );

    return {
        isOver,
        handlers: {
            onDragEnterCapture: onDragEnter,
            onDragOverCapture: onDragOver,
            onDragLeaveCapture: onDragLeave,
            onDropCapture: onDrop,
        },
    };
}
