import { logMessage } from '@/lib/api/logging';
import type { LogLevel } from '@/lib/types';

/* Logs to the devtools console and forwards to the Rust tracing sink. Backend
   forwarding is best-effort: outside Tauri (plain browser) it just no-ops. */
function emit(level: LogLevel, args: unknown[]) {
    const consoleFn =
        level === 'error' ? console.error
        : level === 'warn' ? console.warn
        : console.log;
    consoleFn(`[quartz]`, ...args);

    const message = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
    void logMessage(level, message).catch(() => {});
}

export const log = {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
};
