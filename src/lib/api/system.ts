import { invokeCommand } from './core';
import type { AppInfo } from '@/lib/types';

export function getAppInfo(): Promise<AppInfo> {
    return invokeCommand<AppInfo>('get_app_info');
}
