/* Shared stale-file detection for editor saves.
 *
 * When a bin's file changed on disk since the session opened it, the Rust save
 * commands (vfx_save / paint_save / bin_editor_save) abort with an Error whose
 * message begins with `STALE_FILE:` and lists the affected paths. The frontend
 * matches that marker to prompt the user (overwrite / cancel) and, on overwrite,
 * re-invokes the same save with `force: true`. */

const STALE_MARKER = 'STALE_FILE:';

/** True when an error is the backend's stale-file guard (not a real failure). */
export function isStaleFileError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes(STALE_MARKER);
}

/** The file paths named in a stale-file error, best-effort (for the prompt). */
export function staleFilePaths(error: unknown): string[] {
    const msg = error instanceof Error ? error.message : String(error);
    const idx = msg.indexOf(':', msg.indexOf(STALE_MARKER) + STALE_MARKER.length);
    if (idx < 0) return [];
    return msg
        .slice(idx + 1)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
}
