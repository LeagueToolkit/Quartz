/* ANM mode: the toggle's state and the clip data behind it.
 *
 * Deliberately a sibling of usePort rather than more keys on it - usePort is
 * already ~1600 lines returning ~155 keys, and animation editing will add its
 * own CRUD surface later. Port composes the two.
 *
 * The animation bin is ALREADY resident: `vfx_session::open` loads every bin the
 * skin's `linked:` list resolves to, which includes `animations/skinNN.bin`. So
 * this hook opens nothing and reloads nothing - it projects the sessions Port
 * already holds. Switching modes costs one command per side, not a reload.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vfxAnmModel, type AnmModel } from '@/lib/api/vfxSession';
import { usePortStore, type PortMode } from '@/lib/stores/portStore';
import { log } from '@/lib/util/logger';
import { buildAnmSystems, type AnmSystem } from './anmModel';

interface UseAnmModeArgs {
    targetSessionId: number | null;
    donorSessionId: number | null;
}

export interface UseAnmModeResult {
    mode: PortMode;
    setMode: (m: PortMode) => void;
    isAnm: boolean;
    targetClips: AnmSystem[];
    donorClips: AnmSystem[];
    /** Cross-reference problems for the loaded target, for the warning strip. */
    targetWarnings: string[];
    loading: boolean;
    error: string | null;
    /** Re-read both sides; call after an edit lands. */
    refresh: () => void;
    /* Publish a model an edit command already returned, skipping the re-read.
       Every anm mutation responds with the full reprojected model, so a refetch
       after one is a second round-trip for data we are already holding. */
    publishTarget: (model: AnmModel) => void;
    publishDonor: (model: AnmModel) => void;
}

export function useAnmMode({ targetSessionId, donorSessionId }: UseAnmModeArgs): UseAnmModeResult {
    const mode = usePortStore((s) => s.portMode);
    const setStoreMode = usePortStore((s) => s.set);

    const [targetModel, setTargetModel] = useState<AnmModel | null>(null);
    const [donorModel, setDonorModel] = useState<AnmModel | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setMode = useCallback(
        (m: PortMode) => setStoreMode('portMode', m),
        [setStoreMode],
    );

    const isAnm = mode === 'anm';

    /* Bumped to force a re-read after an edit. Kept separate from the session
       ids so a refresh doesn't look like a session change. */
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision((r) => r + 1), []);

    /* Only fetch while ANM mode is actually showing. Entering the page in VFX
       mode should not pay for a projection nobody will look at. */
    const inFlight = useRef(0);
    useEffect(() => {
        if (!isAnm) return;
        if (targetSessionId === null && donorSessionId === null) {
            setTargetModel(null);
            setDonorModel(null);
            return;
        }

        const ticket = ++inFlight.current;
        let cancelled = false;
        setLoading(true);
        setError(null);

        const read = async (id: number | null) => (id === null ? null : await vfxAnmModel(id));

        void Promise.all([read(targetSessionId), read(donorSessionId)])
            .then(([t, d]) => {
                // Ignore a response that a newer request has already superseded,
                // so a fast bin swap can't land stale clips over fresh ones.
                if (cancelled || ticket !== inFlight.current) return;
                setTargetModel(t);
                setDonorModel(d);
            })
            .catch((e) => {
                if (cancelled || ticket !== inFlight.current) return;
                const message = e instanceof Error ? e.message : String(e);
                log.error('[anm] failed to read the animation graph', e);
                setError(message);
                setTargetModel(null);
                setDonorModel(null);
            })
            .finally(() => {
                if (!cancelled && ticket === inFlight.current) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isAnm, targetSessionId, donorSessionId, revision]);

    /* Bumping the ticket is what makes publishing safe: a read that was already
       in flight when the edit landed would otherwise resolve afterwards and put
       the pre-edit clips back. Same guard the fetch itself uses. */
    const publishTarget = useCallback((model: AnmModel) => {
        inFlight.current += 1;
        setTargetModel(model);
    }, []);
    const publishDonor = useCallback((model: AnmModel) => {
        inFlight.current += 1;
        setDonorModel(model);
    }, []);

    const targetClips = useMemo(() => buildAnmSystems(targetModel), [targetModel]);
    const donorClips = useMemo(() => buildAnmSystems(donorModel), [donorModel]);
    const targetWarnings = useMemo(() => targetModel?.warnings ?? [], [targetModel]);

    return {
        mode,
        setMode,
        isAnm,
        targetClips,
        donorClips,
        targetWarnings,
        loading,
        error,
        refresh,
        publishTarget,
        publishDonor,
    };
}
