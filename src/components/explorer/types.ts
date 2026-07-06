export type { FsEntry } from '@/lib/api/explorer';

export interface FileFilter {
    name: string;
    extensions: string[];
}

export type ExplorerMode = 'directory' | 'file' | 'files' | 'save';

export interface ExplorerOptions {
    mode: ExplorerMode;
    title?: string;
    filters?: FileFilter[];
    /** Pre-fill (save mode) or start folder (open modes). File paths open the
     *  containing folder with the file pre-selected. */
    defaultPath?: string;
    /** Which recents bucket this call site reads/writes (e.g. 'bin', 'audio').
     *  Defaults to 'default'. */
    recentsKey?: string;
}

/** The picker fn returned by useFileExplorer(). Shape matches plugin-dialog:
 *  directory/file/save resolve to a path or null; files resolves to string[]
 *  or null. */
export type PickFn = (options: ExplorerOptions) => Promise<string | string[] | null>;
