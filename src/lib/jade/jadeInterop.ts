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
        const onRuby = (event: Event) => {
            const request = (event as CustomEvent<JadeOpenRequest>).detail;
            if (!request || request.handled) return;
            request.handled = true;
            request.task = openBinInRuby(binPath);
        };
        window.addEventListener(OPEN_CURRENT_BIN_EVENT, onOpen);
        window.addEventListener(OPEN_CURRENT_BIN_IN_RUBY_EVENT, onRuby);
        return () => {
            window.removeEventListener(OPEN_CURRENT_BIN_EVENT, onOpen);
            window.removeEventListener(OPEN_CURRENT_BIN_IN_RUBY_EVENT, onRuby);
        };
    }, [binPath]);
}

/* ── RubyRe ───────────────────────────────────────────────────────────────────
   Same shape as the Jade handoff: the title-bar button asks whichever BIN tool is
   mounted for its path, and every page already calling `useJadeBin` answers both
   without needing its own hook. */

const OPEN_CURRENT_BIN_IN_RUBY_EVENT = 'quartz:open-current-bin-in-ruby';

function openRuby(binPath: string | null): Promise<JadeOpenResult> {
    const prefs = useUiPrefsStore.getState();
    return invokeCommand<JadeOpenResult>('ruby_open', {
        binPath,
        configuredExecutable: prefs.rubyExecutablePath || null,
    });
}

/** True when RubyRe is installed (or a portable path is configured). */
export function rubyInstalled(): Promise<boolean> {
    const prefs = useUiPrefsStore.getState();
    return invokeCommand<boolean>('ruby_installed', {
        configuredExecutable: prefs.rubyExecutablePath || null,
    });
}

/* Deliberately does NOT throw on `warning`. "RubyRe is not installed" is an
   expected outcome the caller turns into a download prompt, not an error. */
export function openBinInRuby(binPath: string): Promise<JadeOpenResult> {
    return openRuby(binPath);
}

/** `launched === null` means RubyRe is not installed; the caller shows the
 *  download prompt rather than treating it as a failure. */
export async function requestOpenCurrentBinInRuby(): Promise<JadeOpenResult> {
    const detail: JadeOpenRequest = { handled: false };
    window.dispatchEvent(new CustomEvent<JadeOpenRequest>(OPEN_CURRENT_BIN_IN_RUBY_EVENT, { detail }));
    return detail.handled && detail.task ? detail.task : openRuby(null);
}
