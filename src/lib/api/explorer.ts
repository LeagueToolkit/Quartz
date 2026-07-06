import { invokeCommand } from './core';

export interface FsEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isShortcut: boolean;
    size: number;
    modified: number;
    extension: string;
}

export interface QuickLink {
    name: string;
    path: string;
    kind: 'folder' | 'drive';
}

export interface ResolvedPath {
    resolved: string;
    exists: boolean;
    isDir: boolean;
    isFile: boolean;
}

/** List a directory (dirs-first, alpha). `extFilter` keeps only files whose
 *  lowercased extension is in the list; directories always pass. */
export function explorerListDir(path: string, extFilter?: string[]): Promise<FsEntry[]> {
    return invokeCommand<FsEntry[]>('explorer_list_dir', { path, extFilter: extFilter ?? null });
}

export function explorerQuickLinks(): Promise<QuickLink[]> {
    return invokeCommand<QuickLink[]>('explorer_quick_links');
}

/** Expand %VARS%, normalize, report exists/kind. Backs the address bar. */
export function explorerResolvePath(path: string): Promise<ResolvedPath> {
    return invokeCommand<ResolvedPath>('explorer_resolve_path', { path });
}

/** Reveal a path in the OS file manager. */
export function explorerReveal(path: string): Promise<void> {
    return invokeCommand<void>('explorer_reveal', { path });
}

/** Keep only paths that still exist on disk (order preserved). */
export function explorerFilterExisting(paths: string[]): Promise<string[]> {
    return invokeCommand<string[]>('explorer_filter_existing', { paths });
}

/** Rename a file/folder in place (bare name, no separators). Returns new path. */
export function explorerRename(path: string, newName: string): Promise<string> {
    return invokeCommand<string>('explorer_rename', { path, newName });
}

/** Delete a file, or a folder recursively. */
export function explorerDelete(path: string): Promise<void> {
    return invokeCommand<void>('explorer_delete', { path });
}

/** Copy a file/folder into destDir (auto-suffixes on collision). Returns new path. */
export function explorerCopy(path: string, destDir: string): Promise<string> {
    return invokeCommand<string>('explorer_copy', { path, destDir });
}

/** Create an empty folder inside parent. Returns its path. */
export function explorerNewFolder(parent: string, name: string): Promise<string> {
    return invokeCommand<string>('explorer_new_folder', { parent, name });
}

/** Decode an image / game texture to a PNG `data:` URL for thumbnails. */
export function explorerThumbnail(path: string): Promise<string> {
    return invokeCommand<string>('explorer_thumbnail', { path });
}
