import type { ExplorerOptions, PickFn } from './types';

/* Event bridge between call sites and the single mounted FileExplorerHost.
   useFileExplorer() returns a promise-returning picker whose resolved shape
   matches @tauri-apps/plugin-dialog (string | string[] | null), so migrating a
   call site is just import + call swap. */

export const EXPLORER_OPEN = 'quartz-explorer-open';
export const EXPLORER_RESULT = 'quartz-explorer-result';

export interface ExplorerOpenDetail { requestId: number; options: ExplorerOptions }
export interface ExplorerResultDetail { requestId: number; result: string | string[] | null }

let counter = 0;

export function useFileExplorer(): PickFn {
    return (options: ExplorerOptions) =>
        new Promise<string | string[] | null>((resolve) => {
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
