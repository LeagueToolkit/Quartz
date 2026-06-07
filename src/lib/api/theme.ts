import { invokeCommand } from './core';
import type { Theme } from '@/lib/theme/types';

export function listCustomThemes(): Promise<Theme[]> {
    return invokeCommand<Theme[]>('list_custom_themes');
}

export function saveCustomTheme(theme: Theme): Promise<void> {
    return invokeCommand<void>('save_custom_theme', { theme });
}

export function deleteCustomTheme(id: string): Promise<void> {
    return invokeCommand<void>('delete_custom_theme', { id });
}
