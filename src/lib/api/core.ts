import { invoke } from '@tauri-apps/api/core';

export class QuartzError extends Error {
    command: string;
    originalError: unknown;

    constructor(command: string, originalError: unknown) {
        const message =
            typeof originalError === 'string'
                ? originalError
                : (originalError as Error)?.message || 'Unknown error';
        super(message);
        this.name = 'QuartzError';
        this.command = command;
        this.originalError = originalError;
    }
}

export async function invokeCommand<T>(
    command: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    try {
        return await invoke<T>(command, args);
    } catch (error) {
        console.error(`[Quartz] Command "${command}" failed:`, error);
        throw new QuartzError(command, error);
    }
}
