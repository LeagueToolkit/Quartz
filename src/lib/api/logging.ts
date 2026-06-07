import { invokeCommand } from './core';
import type { LogLevel } from '@/lib/types';

export function logMessage(level: LogLevel, message: string): Promise<void> {
    return invokeCommand<void>('log_message', { level, message });
}
