/* How the edit surface reaches a clip card.
 *
 * WHY CONTEXT AND NOT PROPS
 * Port.tsx builds <ClipList> and ClipList builds <ClipItem>, and neither takes
 * an edit prop. Threading one through would mean editing both, plus giving
 * ClipList a `side` it has no other use for. Context skips the two intermediate
 * layers that would only be forwarding.
 *
 * It also keeps React.memo intact. The value below is memoised by the provider,
 * so a clip card re-renders when ITS row changes, not when a sibling's edit
 * lands.
 *
 * Un-provided, `useAnmEditContext` returns null and every card renders
 * read-only. That is the current state of the tree: wrapping the two ClipLists
 * in Port.tsx is what turns editing on, and it is one line per column.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { AnmModel, VfxPath } from '@/lib/api/vfxSession';
import type { PortClipResult } from '@/lib/api/vfxAnm';
import { useAnmEdit, type UseAnmEditResult } from '../useAnmEdit';

export interface AnmEditContextValue extends UseAnmEditResult {
    /** Clips in this column, so a drop target can be resolved from a row key
     *  without the card holding the whole list. */
    clipKeys: readonly string[];
    /** Which session this column edits. A `BinAddr` only means anything inside
     *  its own session, so a drop compares this to the dragged node's session
     *  to tell a same-column move from a cross-column PORT. */
    sessionId: number | null;
    /** Port a donor clip into the target, with the VFX systems its particle
     *  events reference. Present on the TARGET column only, since the target is
     *  the only side a port writes to. */
    portClipIn?: (busyKey: string, donorClip: VfxPath) => Promise<boolean>;
    /** Port one donor event into an existing target clip. */
    portEventIn?: (busyKey: string, donorEvent: VfxPath, targetClip: VfxPath) => Promise<boolean>;
}

const AnmEditContext = createContext<AnmEditContextValue | null>(null);

/** The edit surface for one column, or null when the column is read-only. */
export function useAnmEditContext(): AnmEditContextValue | null {
    return useContext(AnmEditContext);
}

interface AnmEditProviderProps {
    /** The session this column's clips live in. Null renders read-only. */
    sessionId: number | null;
    /** useAnmMode's `refresh`, the fallback when no `onModel` is given. */
    refresh: () => void;
    /** Publishes the model the command already returned, so a landed edit shows
     *  without a second read. */
    onModel?: (model: AnmModel) => void;
    /** Flags unsaved changes after a landed edit, so Save enables. */
    onDirty?: () => void;
    clipKeys: readonly string[];
    /** The OTHER column's session, when this column can receive a port. Only
     *  the target column passes it; the donor is never written to. */
    donorSessionId?: number | null;
    /** Donor generation counter, the staleness guard against a swapped donor
     *  bin. Passed straight through to the port command. */
    donorGeneration?: number;
    /** Called after a port lands, with the assets to copy and any effect keys
     *  that did not resolve. */
    onPorted?: (result: PortClipResult) => void;
    children: React.ReactNode;
}

export function AnmEditProvider({
    sessionId,
    refresh,
    onModel,
    onDirty,
    clipKeys,
    donorSessionId,
    donorGeneration,
    onPorted,
    children,
}: AnmEditProviderProps) {
    const edit = useAnmEdit({ sessionId, refresh, onModel, onDirty });

    /* Bound only when BOTH sessions exist. A card checks for the callback's
       presence to decide whether a cross-column drop is offered at all, so
       leaving it undefined is what makes the donor column reject the gesture
       without needing to know which side it is. */
    const canPort = sessionId !== null && donorSessionId != null;
    const onPortedRef = useRef(onPorted);
    onPortedRef.current = onPorted;
    const publish = useCallback((r: PortClipResult) => onPortedRef.current?.(r), []);

    const { portClip, portEvent } = edit;
    const portClipIn = useCallback(
        (busyKey: string, donorClip: VfxPath) =>
            portClip(busyKey, sessionId as number, donorSessionId as number, donorClip, donorGeneration, publish),
        [portClip, sessionId, donorSessionId, donorGeneration, publish],
    );
    const portEventIn = useCallback(
        (busyKey: string, donorEvent: VfxPath, targetClip: VfxPath) =>
            portEvent(
                busyKey,
                sessionId as number,
                donorSessionId as number,
                donorEvent,
                targetClip,
                donorGeneration,
                publish,
            ),
        [portEvent, sessionId, donorSessionId, donorGeneration, publish],
    );

    const value = useMemo<AnmEditContextValue>(
        () => ({
            ...edit,
            clipKeys,
            sessionId,
            portClipIn: canPort ? portClipIn : undefined,
            portEventIn: canPort ? portEventIn : undefined,
        }),
        [edit, clipKeys, sessionId, canPort, portClipIn, portEventIn],
    );
    return <AnmEditContext.Provider value={value}>{children}</AnmEditContext.Provider>;
}
