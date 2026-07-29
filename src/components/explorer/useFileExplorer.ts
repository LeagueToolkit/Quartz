import type { ExplorerOptions, PickFn } from './types';
import { useUiPrefsStore } from '@/lib/stores/uiPrefsStore';

/* Event bridge between call sites and the single mounted FileExplorerHost.

   `pickPath(options)` is a plain async function (no React) that opens the
   explorer and resolves to the chosen path(s) or null, mirroring
   @tauri-apps/plugin-dialog's return shape (string | string[] | null). Util
   and hook modules import it directly; components use the useFileExplorer()
   wrapper for consistency.

   When the user has enabled "Use native file browser" in General settings,
   file/folder/save requests are delegated to @tauri-apps/plugin-dialog so
   they open the Windows dialog instead of the in-app explorer. `browse`
   mode has no native equivalent (it's "peek without picking") so it always
   uses the in-app explorer regardless of the setting. */

export const EXPLORER_OPEN = 'quartz-explorer-open';
export const EXPLORER_RESULT = 'quartz-explorer-result';

export interface ExplorerOpenDetail { requestId: number; options: ExplorerOptions }
export interface ExplorerResultDetail { requestId: number; result: string | string[] | null }

let counter = 0;

async function pickViaNativeDialog(options: ExplorerOptions): Promise<string | string[] | null> {
    const dialog = await import('@tauri-apps/plugin-dialog');
    switch (options.mode) {
        case 'save': {
            const r = await dialog.save({ title: options.title, defaultPath: options.defaultPath, filters: options.filters });
            return r ?? null;
        }
        case 'directory': {
            const r = await dialog.open({ title: options.title, defaultPath: options.defaultPath, directory: true, multiple: false });
            return typeof r === 'string' ? r : null;
        }
        case 'files': {
            const r = await dialog.open({ title: options.title, defaultPath: options.defaultPath, filters: options.filters, directory: false, multiple: true });
            if (Array.isArray(r)) return r;
            return typeof r === 'string' ? [r] : null;
        }
        case 'file':
        default: {
            const r = await dialog.open({ title: options.title, defaultPath: options.defaultPath, filters: options.filters, directory: false, multiple: false });
            return typeof r === 'string' ? r : null;
        }
    }
}

function pickViaInAppExplorer(options: ExplorerOptions): Promise<string | string[] | null> {
    return new Promise((resolve) => {
        const requestId = ++counter;
        const onResult = (e: Event) => {
            const detail = (e as CustomEvent<ExplorerResultDetail>).detail;
            if (detail.requestId !== requestId) return;
            window.removeEventListener(EXPLORER_RESULT, onResult);
            resolve(detail.result ?? null);
        };
        window.addEventListener(EXPLORER_RESULT, onResult);
        window.dispatchEvent(new CustomEvent<ExplorerOpenDetail>(EXPLORER_OPEN, { detail: { requestId, options } }));
    });
}

/** Open the configured file explorer (native Windows dialog or in-app) and
 *  await the user's choice. `browse` mode is always in-app. */
export function pickPath(options: ExplorerOptions): Promise<string | string[] | null> {
    const useNative = useUiPrefsStore.getState().useNativeFileBrowser;
    if (useNative && options.mode !== 'browse') {
        return pickViaNativeDialog(options);
    }
    return pickViaInAppExplorer(options);
}

/** Open the in-app Asset Explorer at a path without turning it into a file
 *  picker. A file path opens its containing folder and selects that file. */
export function revealInFileManager(defaultPath?: string): void {
    void pickPath({
        mode: 'browse',
        title: 'Asset Explorer',
        defaultPath,
        recentsKey: 'default',
    });
}

/** Hook form for components. Returns the same picker as `pickPath`. */
export function useFileExplorer(): PickFn {
    return pickPath;
}
