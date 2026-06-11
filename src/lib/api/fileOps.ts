import { invokeCommand } from './core';

export interface RandomizeResult {
    replacedCount: number;
    errors: string[];
}

export interface RenameResult {
    renamedCount: number;
    errors: string[];
}

export interface ExecResult {
    code: number;
    stdout: string;
    stderr: string;
}

/**
 * Replace files under `targetDir` with random picks from `images`, matched by
 * extension. `smartNameMatching` reuses one pick for files sharing a base name.
 */
export function fileRandomize(
    images: string[],
    targetDir: string,
    opts: { smartNameMatching?: boolean; scanSubdirectories?: boolean } = {},
): Promise<RandomizeResult> {
    return invokeCommand<RandomizeResult>('file_randomize', {
        images,
        targetDir,
        smartNameMatching: opts.smartNameMatching,
        scanSubdirectories: opts.scanSubdirectories,
    });
}

/**
 * Batch-rename files in `dir`: prepends `prefix` and inserts `suffix` before
 * the extension. Pass find/replace text via `opts` for literal substitution.
 */
export function fileRename(
    dir: string,
    prefix: string,
    suffix: string,
    opts: {
        textToFind?: string;
        textToReplaceWith?: string;
        scanSubdirectories?: boolean;
    } = {},
): Promise<RenameResult> {
    return invokeCommand<RenameResult>('file_rename', {
        dir,
        prefix,
        suffix,
        textToFind: opts.textToFind,
        textToReplaceWith: opts.textToReplaceWith,
        scanSubdirectories: opts.scanSubdirectories,
    });
}

/** Run an external EXE, optionally in its own console window (Windows). */
export function toolsExecute(
    exe: string,
    args: string[] = [],
    opts: { cwd?: string; openConsole?: boolean } = {},
): Promise<ExecResult> {
    return invokeCommand<ExecResult>('tools_execute', {
        exe,
        args,
        cwd: opts.cwd,
        openConsole: opts.openConsole,
    });
}
