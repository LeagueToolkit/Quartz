/**
 * Flint - Logging Service
 * Captures console.log/warn/error and stores them for the log panel
 * This is initialized BEFORE React mounts to capture early logs
 */

import type { LogEntry } from './types';

// Buffer for logs before React state is available
let logBuffer: LogEntry[] = [];
let logIdCounter = 0;
let stateDispatcher: ((log: LogEntry) => void) | null = null;

/**
 * Create a log entry
 */
function createLog(level: LogEntry['level'], message: string): LogEntry {
    return {
        id: ++logIdCounter,
        timestamp: Date.now(),
        level,
        message,
    };
}

/**
 * Add a log entry - either buffers it or dispatches to state
 */
function addLogEntry(level: LogEntry['level'], message: string) {
    const log = createLog(level, message);

    if (stateDispatcher) {
        stateDispatcher(log);
    } else {
        // Buffer until state is ready
        logBuffer.push(log);
        // Keep only last 100 buffered logs
        if (logBuffer.length > 100) {
            logBuffer = logBuffer.slice(-100);
        }
    }
}

/**
 * Connect the logger to React state dispatch
 * Called from LogPanel when it mounts
 */
export function connectLogger(dispatcher: (log: LogEntry) => void): LogEntry[] {
    stateDispatcher = dispatcher;

    // Return buffered logs so they can be added to state
    const buffered = [...logBuffer];
    logBuffer = [];
    return buffered;
}

/**
 * Disconnect the logger (cleanup)
 */
export function disconnectLogger() {
    stateDispatcher = null;
}

// Store original console methods
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

/**
 * Format arguments to a string message
 */
function formatArgs(args: unknown[]): string {
    return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

/**
 * Check if a log message should be filtered out (noisy logs)
 */
function shouldFilter(message: string): boolean {
    const filters = [
        '[HMR]',
        '[vite]',
        'Download the React DevTools',
    ];
    return filters.some(f => message.includes(f));
}

/**
 * Initialize console interception
 * Call this BEFORE React mounts
 */
export function initializeLogger() {
    // Override console.log
    console.log = (...args: unknown[]) => {
        originalConsole.log(...args);
        const message = formatArgs(args);
        if (!shouldFilter(message)) {
            addLogEntry('info', message);
        }
    };

    // Override console.warn
    console.warn = (...args: unknown[]) => {
        originalConsole.warn(...args);
        const message = formatArgs(args);
        addLogEntry('warning', message);
    };

    // Override console.error
    console.error = (...args: unknown[]) => {
        originalConsole.error(...args);
        const message = formatArgs(args);
        addLogEntry('error', message);
    };

    // Log initialization
    addLogEntry('info', 'Flint logger initialized');
}

/**
 * Restore original console methods
 */
export function restoreConsole() {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
}

/**
 * Initialize Tauri event listener for backend logs
 * Call this after the app is ready
 */
export async function initBackendLogListener() {
    try {
        const { listen } = await import('@tauri-apps/api/event');

        await listen<{ timestamp: number; level: string; target: string; message: string }>(
            'log-event',
            (event) => {
                const { level, target, message } = event.payload;

                // Map Rust log levels to our levels
                let logLevel: 'info' | 'warning' | 'error' = 'info';
                const levelLower = level.toLowerCase();
                if (levelLower === 'warn' || levelLower === 'warning') {
                    logLevel = 'warning';
                } else if (levelLower === 'error') {
                    logLevel = 'error';
                }

                // Format message with target
                const formattedMessage = `[${target}] ${message}`;
                addLogEntry(logLevel, formattedMessage);
            }
        );

        originalConsole.log('[Logger] Backend log listener initialized');
    } catch (error) {
        originalConsole.error('[Logger] Failed to initialize backend log listener:', error);
    }
}
