import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
    available: boolean;
    version?: string;
    notes?: string;
}

export async function checkForUpdate(): Promise<{ info: UpdateInfo; update: Update | null }> {
    const update = await check();
    if (!update) return { info: { available: false }, update: null };
    return {
        info: { available: true, version: update.version, notes: update.body ?? undefined },
        update,
    };
}

export async function installUpdate(update: Update): Promise<void> {
    await update.downloadAndInstall();
    await relaunch();
}
