import { open } from '@tauri-apps/plugin-dialog';

const BIN_FILTER = [{ name: 'BIN / PY', extensions: ['bin', 'py'] }];

/* Pick a .bin via the native dialog; the session backend opens it natively
   (and politely rejects .py sources). */
export async function pickBinPath(): Promise<string | null> {
    const path = await open({ multiple: false, filters: BIN_FILTER });
    return typeof path === 'string' ? path : null;
}
