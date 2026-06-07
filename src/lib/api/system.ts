import { invokeCommand } from './core';
import type { AppInfo } from '@/lib/types';

export function getAppInfo(): Promise<AppInfo> {
    return invokeCommand<AppInfo>('get_app_info');
}

export function contextMenuIsEnabled(): Promise<boolean> {
    return invokeCommand<boolean>('context_menu_is_enabled');
}
export function contextMenuEnable(): Promise<void> {
    return invokeCommand<void>('context_menu_enable');
}
export function contextMenuDisable(): Promise<void> {
    return invokeCommand<void>('context_menu_disable');
}
