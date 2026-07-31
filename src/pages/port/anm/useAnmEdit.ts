/* The animation view's mutation surface.
 *
 * A sibling of useAnmMode for the same reason useAnmMode is a sibling of
 * usePort: reads and writes have different lifecycles. useAnmMode re-projects
 * when the session or its revision changes; this hook fires one command per
 * user gesture and has to care about ordering between them.
 *
 * WHY EDITS ARE SERIALISED
 * Every command returns the full reprojected model, and a `VfxPath` records a
 * map hop as the entry's POSITION. So two edits in flight at once is not just a
 * last-write-wins race on the model, it is a correctness bug: the second
 * command was addressed against the tree as it looked BEFORE the first one
 * renumbered it. Queueing them behind one promise chain is the fix, and it also
 * makes the ticket check below trivially correct.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    vfxAnmCreateClip,
    vfxAnmCreateEvent,
    vfxAnmDeleteClips,
    vfxAnmDeleteEvents,
    vfxAnmMoveEvent,
    vfxAnmRenameClip,
    vfxAnmRenameEvent,
    vfxAnmPortClip,
    vfxAnmPortEvent,
    vfxAnmReorderClip,
    vfxAnmReorderEvent,
    vfxAnmSetClipField,
    vfxAnmSetEventField,
    type AnmClipSpec,
    type AnmEventSpec,
    type AnmValue,
    type ClipField,
    type EventField,
    type PortClipResult,
} from '@/lib/api/vfxAnm';
import type { AnmModel, VfxPath } from '@/lib/api/vfxSession';
import { log } from '@/lib/util/logger';

interface UseAnmEditArgs {
    sessionId: number | null;
    /** Re-read the projection. Called after every landed edit. */
    refresh: () => void;
    /** Fast path: receives the model the command already returned, so the caller
     *  publishes it instead of paying for a second round-trip. When given, the
     *  hook does NOT also call `refresh`. */
    onModel?: (model: AnmModel) => void;
    /** Called after a landed edit so the page can flag unsaved changes. Without
     *  it Port's Save button stays disabled, since it gates on `fileSaved` and
     *  an animation edit would never clear that. */
    onDirty?: () => void;
}

export interface UseAnmEditResult {
    /** Key of the row whose edit is in flight, or null. Rows disable on their
     *  own key rather than on a global flag so one slow write doesn't freeze
     *  the whole column. */
    busyKey: string | null;
    /** Message from the last failed edit, or null once a later edit succeeds. */
    lastError: string | null;
    clearError: () => void;
    /** Surface a client-side problem in the same strip a failed command uses,
     *  so a rejected gesture reads the same as a rejected write. */
    reportError: (message: string) => void;
    /** True when there is no session to write to, so affordances can hide. */
    disabled: boolean;

    setClipField: (busyKey: string, clip: VfxPath, field: ClipField, value: AnmValue) => Promise<boolean>;
    setEventField: (busyKey: string, event: VfxPath, field: EventField, value: AnmValue) => Promise<boolean>;
    renameClip: (busyKey: string, clip: VfxPath, newName: string) => Promise<boolean>;
    renameEvent: (busyKey: string, event: VfxPath, newName: string) => Promise<boolean>;
    deleteClip: (busyKey: string, clip: VfxPath) => Promise<boolean>;
    deleteEvent: (busyKey: string, event: VfxPath) => Promise<boolean>;
    createEvent: (busyKey: string, clip: VfxPath, spec: AnmEventSpec) => Promise<boolean>;
    createClip: (busyKey: string, spec: AnmClipSpec) => Promise<boolean>;
    moveEvent: (busyKey: string, event: VfxPath, targetClip: VfxPath) => Promise<boolean>;
    reorderEvent: (busyKey: string, event: VfxPath, newIndex: number) => Promise<boolean>;
    reorderClip: (busyKey: string, clip: VfxPath, newIndex: number) => Promise<boolean>;
    /* Cross-session. Both ids are explicit because a port reads one session and
       writes another, unlike every op above which acts on this column alone. */
    portClip: (
        busyKey: string,
        targetSessionId: number,
        donorSessionId: number,
        donorClip: VfxPath,
        donorGeneration: number | undefined,
        publish: (result: PortClipResult) => void,
    ) => Promise<boolean>;
    portEvent: (
        busyKey: string,
        targetSessionId: number,
        donorSessionId: number,
        donorEvent: VfxPath,
        targetClip: VfxPath,
        donorGeneration: number | undefined,
        publish: (result: PortClipResult) => void,
    ) => Promise<boolean>;
}

export function useAnmEdit({
    sessionId,
    refresh,
    onModel,
    onDirty,
}: UseAnmEditArgs): UseAnmEditResult {
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    /* Latest-wins ticket, matching useAnmMode's `inFlight`. The queue below
       already prevents overlap, but the component can unmount mid-edit and the
       session can change under us; the ticket is what makes the resolve path
       safe to ignore in both cases. */
    const inFlight = useRef(0);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    /* Tail of the serialisation chain. Each op appends itself, so ops run in
       the order the user made them no matter how slow an earlier one was. */
    const queue = useRef<Promise<unknown>>(Promise.resolve());

    /* Read through refs so the returned callbacks stay identity-stable. These
       components are React.memo'd on explicit props, and a callback that
       changed whenever `refresh` did would re-render every clip card. */
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;
    const onModelRef = useRef(onModel);
    onModelRef.current = onModel;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;
    const sessionRef = useRef(sessionId);
    sessionRef.current = sessionId;

    /* `foreign` marks an op whose result belongs to a DIFFERENT column than the
       one running it (a port reads the donor and writes the target). Such an op
       must not publish into this column's model or dirty this column's bin, or
       a donor-initiated port would replace the donor's clip list with the
       target's and flag the wrong file as unsaved. */
    const run = useCallback(
        (
            key: string,
            op: (session: number) => Promise<AnmModel>,
            foreign = false,
        ): Promise<boolean> => {
            const session = sessionRef.current;
            if (session === null) {
                setLastError('No animation session is loaded.');
                return Promise.resolve(false);
            }

            const ticket = ++inFlight.current;
            setBusyKey(key);
            setLastError(null);

            const next = queue.current
                .catch(() => undefined) // A failed predecessor must not break the chain.
                .then(async () => {
                    /* The session can be swapped while this op sat in the queue.
                       Writing to the old one would silently edit a bin the user
                       is no longer looking at. */
                    if (sessionRef.current !== session) return false;
                    try {
                        const model = await op(session);
                        if (!mounted.current) return true;
                        /* Publish the model the command already returned, OR
                           re-read. Never both: doing both replaced the clip list
                           twice per edit, and the second replacement arrived
                           from a fresh fetch whose rows were all new objects, so
                           every card in the column remounted and the whole view
                           visibly flashed. */
                        if (!foreign) {
                            if (onModelRef.current) onModelRef.current(model);
                            else refreshRef.current();
                            // The bin is dirty now; let the Save button know.
                            onDirtyRef.current?.();
                        }
                        return true;
                    } catch (e) {
                        const message = e instanceof Error ? e.message : String(e);
                        log.error('[anm] edit failed', e);
                        if (mounted.current) setLastError(message);
                        /* Re-read anyway. The row reverts to whatever the tree
                           actually holds, so a partially applied edit can never
                           leave the card showing a value the bin does not have. */
                        refreshRef.current();
                        return false;
                    } finally {
                        if (mounted.current && ticket === inFlight.current) setBusyKey(null);
                    }
                });

            queue.current = next;
            return next;
        },
        [],
    );

    const clearError = useCallback(() => setLastError(null), []);
    const reportError = useCallback((message: string) => setLastError(message), []);

    const setClipField = useCallback(
        (key: string, clip: VfxPath, field: ClipField, value: AnmValue) =>
            run(key, (s) => vfxAnmSetClipField(s, clip, field, value)),
        [run],
    );
    const setEventField = useCallback(
        (key: string, event: VfxPath, field: EventField, value: AnmValue) =>
            run(key, (s) => vfxAnmSetEventField(s, event, field, value)),
        [run],
    );
    const renameClip = useCallback(
        (key: string, clip: VfxPath, newName: string) =>
            run(key, (s) => vfxAnmRenameClip(s, clip, newName)),
        [run],
    );
    const renameEvent = useCallback(
        (key: string, event: VfxPath, newName: string) =>
            run(key, (s) => vfxAnmRenameEvent(s, event, newName)),
        [run],
    );
    const deleteClip = useCallback(
        (key: string, clip: VfxPath) => run(key, (s) => vfxAnmDeleteClips(s, [clip])),
        [run],
    );
    const deleteEvent = useCallback(
        (key: string, event: VfxPath) => run(key, (s) => vfxAnmDeleteEvents(s, [event])),
        [run],
    );
    const createEvent = useCallback(
        (key: string, clip: VfxPath, spec: AnmEventSpec) =>
            run(key, (s) => vfxAnmCreateEvent(s, clip, spec)),
        [run],
    );
    const createClip = useCallback(
        (key: string, spec: AnmClipSpec) => run(key, (s) => vfxAnmCreateClip(s, spec)),
        [run],
    );
    const moveEvent = useCallback(
        (key: string, event: VfxPath, targetClip: VfxPath) =>
            run(key, (s) => vfxAnmMoveEvent(s, event, targetClip)),
        [run],
    );
    const reorderEvent = useCallback(
        (key: string, event: VfxPath, newIndex: number) =>
            run(key, (s) => vfxAnmReorderEvent(s, event, newIndex)),
        [run],
    );
    const reorderClip = useCallback(
        (key: string, clip: VfxPath, newIndex: number) =>
            run(key, (s) => vfxAnmReorderClip(s, clip, newIndex)),
        [run],
    );

    /* Porting is the one op that does NOT run against this column's session: it
       reads the DONOR and writes the TARGET. It still goes through `run` so it
       shares the serialisation queue and the busy/error surface, but `run`'s
       session argument is ignored and both ids are passed explicitly. The
       result publishes into the TARGET column, which is why the caller supplies
       its own publisher rather than reusing this hook's `onModel`. */
    const portClip = useCallback(
        (
            key: string,
            targetSessionId: number,
            donorSessionId: number,
            donorClip: VfxPath,
            donorGeneration: number | undefined,
            publish: (r: PortClipResult) => void,
        ) =>
            run(key, async () => {
                const result = await vfxAnmPortClip(
                    targetSessionId,
                    donorSessionId,
                    donorClip,
                    undefined,
                    donorGeneration,
                );
                publish(result);
                return result.model;
            }, true),
        [run],
    );
    const portEvent = useCallback(
        (
            key: string,
            targetSessionId: number,
            donorSessionId: number,
            donorEvent: VfxPath,
            targetClip: VfxPath,
            donorGeneration: number | undefined,
            publish: (r: PortClipResult) => void,
        ) =>
            run(key, async () => {
                const result = await vfxAnmPortEvent(
                    targetSessionId,
                    donorSessionId,
                    donorEvent,
                    targetClip,
                    donorGeneration,
                );
                publish(result);
                return result.model;
            }, true),
        [run],
    );

    return {
        busyKey,
        lastError,
        clearError,
        reportError,
        disabled: sessionId === null,
        setClipField,
        setEventField,
        renameClip,
        renameEvent,
        deleteClip,
        deleteEvent,
        createEvent,
        createClip,
        moveEvent,
        reorderEvent,
        reorderClip,
        portClip,
        portEvent,
    };
}
