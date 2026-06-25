import { useEffect, useRef } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

/* Tauri webview File objects don't expose absolute paths, so OS file drops are
   wired through the webview drag-drop event, which carries real disk paths. This
   hook subscribes once and forwards typed callbacks; position lets a caller pick
   the right drop zone from the cursor location. */

export interface FileDropPosition {
    x: number;
    y: number;
}

export interface UseFileDropHandlers {
    /* Fired on a completed drop with the dropped absolute paths. */
    onDrop: (paths: string[], position: FileDropPosition) => void;
    /* Cursor entered/moved over the window during a drag (hover styling). */
    onEnter?: (position: FileDropPosition) => void;
    onOver?: (position: FileDropPosition) => void;
    /* Drag left the window or was cancelled. */
    onLeave?: () => void;
}

export function useFileDrop(handlers: UseFileDropHandlers) {
    const ref = useRef(handlers);
    ref.current = handlers;

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;

        (async () => {
            try {
                const webview = getCurrentWebview();
                const handle = await webview.onDragDropEvent((event) => {
                    const payload = event.payload;
                    if (payload.type === 'enter') {
                        ref.current.onEnter?.(payload.position);
                    } else if (payload.type === 'over') {
                        ref.current.onOver?.(payload.position);
                    } else if (payload.type === 'leave') {
                        ref.current.onLeave?.();
                    } else if (payload.type === 'drop') {
                        ref.current.onDrop(payload.paths || [], payload.position);
                    }
                });
                if (cancelled) handle();
                else unlisten = handle;
            } catch {
                /* Drag-drop is unavailable outside Tauri; dialog flows still work. */
            }
        })();

        return () => {
            cancelled = true;
            if (unlisten) unlisten();
        };
    }, []);
}
