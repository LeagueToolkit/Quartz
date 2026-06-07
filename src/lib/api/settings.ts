import { invokeCommand } from './core';
import type { QuartzSettings } from '@/lib/types';

export function getAppHome(): Promise<string> {
    return invokeCommand<string>('get_app_home');
}

export function getSettings(): Promise<QuartzSettings> {
    return invokeCommand<QuartzSettings>('get_settings');
}

export function saveSettings(settings: QuartzSettings): Promise<void> {
    return invokeCommand<void>('save_settings', { settings });
}
