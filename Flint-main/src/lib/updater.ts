/**
 * Flint - Auto-Update Manager
 * Uses Tauri's official updater plugin
 */

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateCheckResult {
    available: boolean;
    currentVersion: string;
    newVersion?: string;
    body?: string;
    date?: string;
}

/**
 * Check for available updates using Tauri's updater plugin
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
    try {
        const update = await check();

        if (update) {
            return {
                available: true,
                currentVersion: update.currentVersion,
                newVersion: update.version,
                body: update.body,
                date: update.date,
            };
        }

        return {
            available: false,
            currentVersion: '0.0.0',
        };
    } catch (error) {
        console.error('[Updater] Failed to check for updates:', error);
        throw error;
    }
}

/**
 * Download and install an available update
 */
export async function downloadAndInstallUpdate(
    onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
    try {
        const update = await check();

        if (!update) {
            throw new Error('No update available');
        }

        console.log('[Updater] Downloading update...');

        // Track download progress
        let totalBytes = 0;
        let downloadedBytes = 0;

        // Download with progress callback
        await update.downloadAndInstall((event) => {
            switch (event.event) {
                case 'Started':
                    console.log('[Updater] Download started');
                    totalBytes = event.data.contentLength || 0;
                    downloadedBytes = 0;
                    onProgress?.(0, totalBytes);
                    break;
                case 'Progress':
                    downloadedBytes += event.data.chunkLength;
                    console.log(`[Updater] Downloaded ${downloadedBytes} / ${totalBytes} bytes`);
                    if (onProgress && totalBytes > 0) {
                        onProgress(downloadedBytes, totalBytes);
                    }
                    break;
                case 'Finished':
                    console.log('[Updater] Download finished');
                    onProgress?.(totalBytes, totalBytes);
                    break;
            }
        });

        console.log('[Updater] Update installed successfully, relaunching...');

        // Relaunch the app
        await relaunch();
    } catch (error) {
        console.error('[Updater] Failed to install update:', error);
        throw error;
    }
}
