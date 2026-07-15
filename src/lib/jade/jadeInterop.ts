import { useEffect } from 'react';
import { invokeCommand } from '@/lib/api/core';
import { useUiPrefsStore } from '@/lib/stores/uiPrefsStore';

export interface JadeOpenResult {
    launched: string | null;
    warning: string | null;
}

interface JadeOpenRequest {
    handled: boolean;
    task?: Promise<JadeOpenResult>;
}

const OPEN_CURRENT_BIN_EVENT = 'quartz:open-current-bin-in-jade';

function openJade(binPath: string | null): Promise<JadeOpenResult> {
    const prefs = useUiPrefsStore.getState();
    if (!prefs.communicateWithJade) {
        return Promise.reject(new Error('Jade communication is disabled in Settings > External Tools.'));
    }
    return invokeCommand<JadeOpenResult>('jade_open', {
        binPath,
        configuredExecutable: prefs.jadeExecutablePath || null,
    });
}

export async function openBinInJade(binPath: string): Promise<JadeOpenResult> {
    const result = await openJade(binPath);
    if (result.warning) throw new Error(result.warning);
    return result;
}

export async function requestOpenCurrentBinInJade(): Promise<JadeOpenResult> {
    const detail: JadeOpenRequest = { handled: false };
    window.dispatchEvent(new CustomEvent<JadeOpenRequest>(OPEN_CURRENT_BIN_EVENT, { detail }));
    const result = detail.handled && detail.task
        ? await detail.task
        : await openJade(null);
    if (result.warning) throw new Error(result.warning);
    return result;
}

/** Makes a mounted BIN tool answer the Jade logo in the title bar. */
export function useJadeBin(binPath: string | null | undefined): void {
    useEffect(() => {
        if (!binPath) return;
        const onOpen = (event: Event) => {
            const request = (event as CustomEvent<JadeOpenRequest>).detail;
            if (!request || request.handled) return;
            request.handled = true;
            request.task = openBinInJade(binPath);
        };
        window.addEventListener(OPEN_CURRENT_BIN_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_CURRENT_BIN_EVENT, onOpen);
    }, [binPath]);
}
