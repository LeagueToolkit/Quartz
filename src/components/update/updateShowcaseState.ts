export const UPDATE_SHOWCASE_SEEN_KEY = 'quartz:update-showcase:last-seen';
export const UPDATE_SHOWCASE_PENDING_KEY = 'quartz:update-showcase:pending';

/** Asks the showcase to open, whether or not this version has been seen.
 *  Fired by the Settings entry; the showcase itself decides what to render. */
export const SHOW_UPDATE_NOTES_EVENT = 'quartz:show-update-notes';

/** Open the patch notes for the running build. */
export function showUpdateNotes(): void {
    window.dispatchEvent(new Event(SHOW_UPDATE_NOTES_EVENT));
}

export function markUpdateShowcasePending(version: string): void {
    try {
        localStorage.setItem(UPDATE_SHOWCASE_PENDING_KEY, version.replace(/^v/i, ''));
    } catch {
        // Storage may be unavailable in restricted WebViews; version comparison
        // still provides the normal fallback on the next launch.
    }
}
