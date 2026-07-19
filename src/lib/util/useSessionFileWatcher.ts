import { useEffect, useRef } from 'react';

interface SessionFileWatcherOptions<T> {
    sessionId: number | null;
    reload: (sessionId: number) => Promise<T | null>;
    onReload: (model: T) => void;
    paused?: boolean;
    intervalMs?: number;
}

/**
 * Watches a resident native BIN session for out-of-process disk writes.
 * The backend compares every loaded BIN's current mtime with its parse-time
 * stamp and only reparses when something actually changed, keeping idle polls
 * extremely cheap.
 */
export function useSessionFileWatcher<T>({
    sessionId,
    reload,
    onReload,
    paused = false,
    intervalMs = 600,
}: SessionFileWatcherOptions<T>): void {
    const reloadRef = useRef(reload);
    const onReloadRef = useRef(onReload);
    reloadRef.current = reload;
    onReloadRef.current = onReload;

    useEffect(() => {
        if (sessionId === null || paused) return;
        let disposed = false;
        let checking = false;
        let lastError = '';

        const check = async () => {
            if (disposed || checking || document.visibilityState === 'hidden') return;
            checking = true;
            try {
                const model = await reloadRef.current(sessionId);
                lastError = '';
                if (!disposed && model !== null) onReloadRef.current(model);
            } catch (error) {
                // An external writer may briefly leave the file incomplete.
                // Keep the resident model and retry on the next tick.
                const message = error instanceof Error ? error.message : String(error);
                if (message !== lastError) {
                    console.warn('[bin watcher] reload deferred:', message);
                    lastError = message;
                }
            } finally {
                checking = false;
            }
        };

        const timer = window.setInterval(() => { void check(); }, intervalMs);
        const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
        document.addEventListener('visibilitychange', onVisible);
        void check();
        return () => {
            disposed = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [intervalMs, paused, sessionId]);
}
