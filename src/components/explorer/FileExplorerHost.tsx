import { useEffect, useState } from 'react';
import { FileExplorer } from './FileExplorer';
import { EXPLORER_OPEN, EXPLORER_RESULT, type ExplorerOpenDetail, type ExplorerResultDetail } from './useFileExplorer';
import type { ExplorerOptions, FsEntry } from './types';

interface Active { requestId: number; options: ExplorerOptions }

/** Singleton explorer, mounted once in the app shell. Listens for open events
 *  from useFileExplorer() and replies with the chosen path(s) or null. */
export function FileExplorerHost({ onInspect }: { onInspect?: (entry: FsEntry) => void }) {
    const [active, setActive] = useState<Active | null>(null);

    useEffect(() => {
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<ExplorerOpenDetail>).detail;
            setActive({ requestId: detail.requestId, options: detail.options });
        };
        window.addEventListener(EXPLORER_OPEN, onOpen);
        return () => window.removeEventListener(EXPLORER_OPEN, onOpen);
    }, []);

    const reply = (result: string | string[] | null) => {
        if (!active) return;
        window.dispatchEvent(new CustomEvent<ExplorerResultDetail>(EXPLORER_RESULT, {
            detail: { requestId: active.requestId, result },
        }));
        setActive(null);
    };

    if (!active) return null;
    return (
        <FileExplorer
            open
            options={active.options}
            onResolve={(r) => reply(r)}
            onCancel={() => reply(null)}
            onInspect={onInspect}
        />
    );
}
