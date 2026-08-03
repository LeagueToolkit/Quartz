import { pickPath } from '@/components/explorer';

const BIN_FILTER = [{ name: 'BIN / PY', extensions: ['bin', 'py'] }];

/** Which Port column a bin is being opened into. */
export type PortSlot = 'target' | 'donor';

/* The explorer's recents bucket for a Port column.
 *
 * Target and donor get SEPATE buckets, because the two columns hold different
 * kinds of file in practice: the target is the skin you are working on, the
 * donor is whatever you are lifting effects out of today. Sharing one bucket
 * meant opening a donor pushed it to the top of the target's Recent list, so
 * the list you reached for was never the one you wanted. Port's own per-slot
 * lists (`recentTargetBins` / `recentDonorBins`) already worked this way; the
 * explorer's sidebar is what was still pooled. */
export function binRecentsKey(slot: PortSlot): string {
    return `port-${slot}-bin`;
}

/* Pick a .bin via the native dialog; the session backend opens it natively
   (and politely rejects .py sources). */
export async function pickBinPath(slot: PortSlot): Promise<string | null> {
    const path = await pickPath({
        mode: 'file',
        filters: BIN_FILTER,
        recentsKey: binRecentsKey(slot),
    });
    return typeof path === 'string' ? path : null;
}
