import { invokeCommand } from './core';
import type { AppInfo } from '@/lib/types';

export function getAppInfo(): Promise<AppInfo> {
    return invokeCommand<AppInfo>('get_app_info');
}

/** Model supplied by the Windows Explorer `Inspect Model` launch verb. */
export function getStartupModelPath(): Promise<string | null> {
    return invokeCommand<string | null>('get_startup_model_path');
}

/** BIN handed off from another tool (e.g. Flint) via `--paint-bin` to open in Paint. */
export function getStartupPaintBin(): Promise<string | null> {
    return invokeCommand<string | null>('get_startup_paint_bin');
}

/** BIN handed off via `--port-bin` to open in Port. */
export function getStartupPortBin(): Promise<string | null> {
    return invokeCommand<string | null>('get_startup_port_bin');
}

/** BIN handed off via `--bineditor-bin` to open in the Bin Editor. */
export function getStartupBinEditorBin(): Promise<string | null> {
    return invokeCommand<string | null>('get_startup_bineditor_bin');
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
