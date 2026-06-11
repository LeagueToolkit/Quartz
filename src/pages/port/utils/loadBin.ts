import { open } from '@tauri-apps/plugin-dialog';
import { readBin, writeBin } from '@/lib/api';
import { parseVfxEmitters, type VfxSystemMap } from './vfxEmitterParser';

const BIN_FILTER = [{ name: 'BIN / PY', extensions: ['bin', 'py'] }];

export interface LoadedBin {
    path: string;
    text: string;
    systems: VfxSystemMap;
}

/* Open a .bin/.py via the native dialog, read it through the ritobin bridge,
   and parse into VfxSystemDefinitionData systems. */
export async function pickBinPath(): Promise<string | null> {
    const path = await open({ multiple: false, filters: BIN_FILTER });
    return typeof path === 'string' ? path : null;
}

export async function loadBin(path: string): Promise<LoadedBin> {
    const text = await readBin(path);
    const systems = parseVfxEmitters(text) || {};
    return { path, text, systems };
}

/* Write ritobin .py text back to the .bin via the bridge. */
export async function saveBinText(text: string, binPath: string): Promise<void> {
    await writeBin(text, binPath);
}
