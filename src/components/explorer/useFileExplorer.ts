import type { ExplorerOptions, PickFn } from './types';

/* Event bridge between call sites and the single mounted FileExplorerHost.

   `pickPath(options)` is a plain async function (no React) that opens the
   explorer and resolves to the chosen path(s) or null, mirroring
   @tauri-apps/plugin-dialog's return shape (string | string[] | null). Util
   and hook modules import it directly; components use the useFileExplorer()
   wrapper for consistency. */

export const EXPLORER_OPEN = 'quartz-explorer-open';
export const EXPLORER_RESULT = 'quartz-explorer-result';

export interface ExplorerOpenDetail { requestId: number; options: ExplorerOptions }
export interface ExplorerResultDetail { requestId: number; result: string | string[] | null }

let counter = 0;

/** Open the custom file explorer and await the user's choice. */
export function pickPath(options: ExplorerOptions): Promise<string | string[] | null> {
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

/** Hook form for components. Returns the same picker as `pickPath`. */
export function useFileExplorer(): PickFn {
    return pickPath;
}
