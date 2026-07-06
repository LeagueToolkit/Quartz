import { pickPath } from '@/components/explorer';

const BIN_FILTER = [{ name: 'BIN / PY', extensions: ['bin', 'py'] }];

/* Pick a .bin via the native dialog; the session backend opens it natively
   (and politely rejects .py sources). */
export async function pickBinPath(): Promise<string | null> {
    const path = await pickPath({ mode: 'file', filters: BIN_FILTER, recentsKey: 'bin' });
    return typeof path === 'string' ? path : null;
}
