import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

/*
 * Pointer-based drag for the Port donor → target interactions.
 *
 * Why not HTML5 drag-and-drop? On Windows/WebView2, Tauri's native drag-drop
 * (`dragDropEnabled: true`, required so OS *file* drops deliver real paths)
 * takes over the webview's IDropTarget and swallows DOM `dragstart`/`dragover`/
 * `drop` events. The two are mutually exclusive. Since the app needs native
 * file drops on other pages, the in-app VFX dragging is rebuilt here on raw
 * pointer events, which the native layer leaves untouched.
 *
 * A donor row calls `startDrag(payload, event)` on pointerdown. The provider
 * tracks the pointer globally, shows a floating ghost, highlights the drop zone
 * under the cursor, and on pointerup hit-tests `elementFromPoint` for the
 * nearest registered drop zone and dispatches the payload to its handler.
 */

export type PortDragPayload =
    | { kind: 'system'; systemKey: string; label: string }
    | { kind: 'emitter'; sourceType: 'donor' | 'target'; sourceSystemKey: string; emitterName: string; label: string };

// A drop zone accepts a payload and returns whether it handled it. Zones are
// matched from the cursor location, innermost first.
interface DropZone {
    id: string;
    el: HTMLElement;
    accepts: (payload: PortDragPayload) => boolean;
    onDrop: (payload: PortDragPayload) => void;
    // Optional live highlight callback while a compatible drag hovers the zone.
    onHoverChange?: (isOver: boolean) => void;
}

interface PortDragContextValue {
    /* Begin a drag from a donor row. Call inside onPointerDown. */
    startDrag: (payload: PortDragPayload, e: React.PointerEvent) => void;
    /* Register a drop zone; returns an unregister fn. */
    registerZone: (zone: DropZone) => () => void;
    /* The payload currently being dragged, or null. */
    dragging: PortDragPayload | null;
}

const PortDragContext = createContext<PortDragContextValue | null>(null);

// Pixels the pointer must travel before a press becomes a drag (so clicks and
// double-clicks on donor rows still work).
const DRAG_THRESHOLD = 5;

export function PortDragProvider({ children }: { children: React.ReactNode }) {
    const [dragging, setDragging] = useState<PortDragPayload | null>(null);

    // Zones live in a ref (not state) so registration never re-renders the tree.
    const zonesRef = useRef<Map<string, DropZone>>(new Map());
    // Live drag bookkeeping, kept in refs so the global listeners are stable.
    const pendingRef = useRef<{ payload: PortDragPayload; startX: number; startY: number; pointerId: number } | null>(null);
    const activeRef = useRef<PortDragPayload | null>(null);
    const hoveredZoneRef = useRef<string | null>(null);
    const ghostRef = useRef<HTMLDivElement | null>(null);

    const registerZone = useCallback((zone: DropZone) => {
        zonesRef.current.set(zone.id, zone);
        return () => {
            zonesRef.current.delete(zone.id);
        };
    }, []);

    // Find the innermost registered zone under a screen point that accepts the
    // active payload. elementFromPoint returns the topmost element; we walk up
    // its ancestors and match against registered zone elements.
    const zoneAtPoint = useCallback((x: number, y: number, payload: PortDragPayload): DropZone | null => {
        let node = document.elementFromPoint(x, y) as HTMLElement | null;
        while (node) {
            for (const zone of zonesRef.current.values()) {
                if (zone.el === node && zone.accepts(payload)) return zone;
            }
            node = node.parentElement;
        }
        return null;
    }, []);

    const clearHover = useCallback(() => {
        if (hoveredZoneRef.current) {
            const prev = zonesRef.current.get(hoveredZoneRef.current);
            prev?.onHoverChange?.(false);
            hoveredZoneRef.current = null;
        }
    }, []);

    const setHover = useCallback((zone: DropZone | null) => {
        const nextId = zone?.id ?? null;
        if (nextId === hoveredZoneRef.current) return;
        clearHover();
        if (zone) {
            zone.onHoverChange?.(true);
            hoveredZoneRef.current = zone.id;
        }
    }, [clearHover]);

    const positionGhost = useCallback((x: number, y: number) => {
        const g = ghostRef.current;
        if (g) {
            g.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
        }
    }, []);

    const finishDrag = useCallback(() => {
        activeRef.current = null;
        pendingRef.current = null;
        clearHover();
        if (ghostRef.current) {
            ghostRef.current.remove();
            ghostRef.current = null;
        }
        setDragging(null);
    }, [clearHover]);

    const beginActive = useCallback((payload: PortDragPayload, x: number, y: number) => {
        activeRef.current = payload;
        setDragging(payload);

        // Floating ghost that follows the cursor.
        const g = document.createElement('div');
        g.className = 'port-drag-ghost';
        g.textContent = payload.label;
        g.style.position = 'fixed';
        g.style.left = '0';
        g.style.top = '0';
        g.style.zIndex = '9999';
        g.style.pointerEvents = 'none';
        document.body.appendChild(g);
        ghostRef.current = g;
        positionGhost(x, y);
    }, [positionGhost]);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const pending = pendingRef.current;
            if (!pending) return;
            if (e.pointerId !== pending.pointerId) return;

            // Promote a pending press to an active drag once past threshold.
            if (!activeRef.current) {
                const dx = e.clientX - pending.startX;
                const dy = e.clientY - pending.startY;
                if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                beginActive(pending.payload, e.clientX, e.clientY);
            }

            const payload = activeRef.current;
            if (!payload) return;
            e.preventDefault();
            positionGhost(e.clientX, e.clientY);
            setHover(zoneAtPoint(e.clientX, e.clientY, payload));
        };

        const onUp = (e: PointerEvent) => {
            const pending = pendingRef.current;
            if (!pending || e.pointerId !== pending.pointerId) return;
            const payload = activeRef.current;
            if (payload) {
                const zone = zoneAtPoint(e.clientX, e.clientY, payload);
                if (zone) zone.onDrop(payload);
            }
            finishDrag();
        };

        const onCancel = () => {
            if (pendingRef.current) finishDrag();
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };
    }, [beginActive, finishDrag, positionGhost, setHover, zoneAtPoint]);

    const startDrag = useCallback((payload: PortDragPayload, e: React.PointerEvent) => {
        // Only left button; ignore if a press is already tracked.
        if (e.button !== 0) return;
        pendingRef.current = {
            payload,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
        };
    }, []);

    const value = useMemo<PortDragContextValue>(
        () => ({ startDrag, registerZone, dragging }),
        [startDrag, registerZone, dragging]
    );

    return <PortDragContext.Provider value={value}>{children}</PortDragContext.Provider>;
}

export function usePortDrag(): PortDragContextValue {
    const ctx = useContext(PortDragContext);
    if (!ctx) throw new Error('usePortDrag must be used within a PortDragProvider');
    return ctx;
}

/*
 * Register an element as a drop zone for the lifetime of the component.
 * Pass a ref to the element and the accept/drop handlers. `deps` re-registers
 * when the handlers change (so closures see fresh state).
 */
export function usePortDropZone(
    id: string,
    ref: React.RefObject<HTMLElement | null>,
    accepts: (payload: PortDragPayload) => boolean,
    onDrop: (payload: PortDragPayload) => void,
    onHoverChange?: (isOver: boolean) => void
) {
    const { registerZone } = usePortDrag();
    const acceptsRef = useRef(accepts);
    const onDropRef = useRef(onDrop);
    const onHoverRef = useRef(onHoverChange);
    acceptsRef.current = accepts;
    onDropRef.current = onDrop;
    onHoverRef.current = onHoverChange;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        return registerZone({
            id,
            el,
            accepts: (p) => acceptsRef.current(p),
            onDrop: (p) => onDropRef.current(p),
            onHoverChange: (over) => onHoverRef.current?.(over),
        });
        // Re-register if the element instance changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, registerZone, ref.current]);
}
