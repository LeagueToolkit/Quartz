/**
 * Drag-and-drop helpers for accepting .bin / .py files from the OS file
 * explorer onto a target/donor panel.
 *
 * Shared by Port2's TargetColumn / DonorColumn and VfxHub's panels.
 *
 * Usage:
 *   const drop = useBinFileDrop((filePath) => processTargetBin(filePath));
 *   <div {...drop.handlers}> ... {drop.isOver && <Overlay/>} </div>
 */
import { useCallback, useRef, useState } from 'react';

const ACCEPTED_EXTENSIONS = ['.bin', '.py'];

function pickAcceptableFilePath(event) {
    const files = event?.dataTransfer?.files;
    if (!files || files.length === 0) return null;
    // Electron exposes the absolute path on the File object.
    for (const f of files) {
        const p = f.path;
        if (typeof p === 'string' && p) {
            const lower = p.toLowerCase();
            if (ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
                return p;
            }
        }
    }
    return null;
}

/**
 * @param {(filePath: string) => any} onAcceptedFile  Called with the dropped file path.
 */
export function useBinFileDrop(onAcceptedFile) {
    const [isOver, setIsOver] = useState(false);
    const counterRef = useRef(0);

    const isExternalFileDrag = (e) => {
        const types = e?.dataTransfer?.types;
        if (!types) return false;
        for (const t of types) {
            if (t === 'Files' || t === 'application/x-moz-file') return true;
        }
        return false;
    };

    const onDragEnter = useCallback((e) => {
        if (!isExternalFileDrag(e)) return; // ignore internal drags (VFX systems, etc.)
        e.preventDefault();
        e.stopPropagation();
        counterRef.current += 1;
        if (counterRef.current === 1) setIsOver(true);
    }, []);

    const onDragOver = useCallback((e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.dataTransfer.dropEffect = 'copy'; } catch (_) { /* noop */ }
    }, []);

    const onDragLeave = useCallback((e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        counterRef.current = Math.max(0, counterRef.current - 1);
        if (counterRef.current === 0) setIsOver(false);
    }, []);

    const onDrop = useCallback(
        (e) => {
            if (!isExternalFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            counterRef.current = 0;
            setIsOver(false);
            const filePath = pickAcceptableFilePath(e);
            if (filePath && typeof onAcceptedFile === 'function') {
                onAcceptedFile(filePath);
            }
        },
        [onAcceptedFile]
    );

    // Capture-phase bindings so we intercept the event BEFORE any child
    // element's bubble-phase handler can stopPropagation() on it. Inner
    // panels (e.g. Port2's TargetColumn .port-panel) always stopPropagation
    // on drag events even when they ignore the payload, which would
    // otherwise hide every file drag from this hook.
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
