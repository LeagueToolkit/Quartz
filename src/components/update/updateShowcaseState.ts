export const UPDATE_SHOWCASE_SEEN_KEY = 'quartz:update-showcase:last-seen';
export const UPDATE_SHOWCASE_PENDING_KEY = 'quartz:update-showcase:pending';

export function markUpdateShowcasePending(version: string): void {
    try {
        localStorage.setItem(UPDATE_SHOWCASE_PENDING_KEY, version.replace(/^v/i, ''));
    } catch {
        // Storage may be unavailable in restricted WebViews; version comparison
        // still provides the normal fallback on the next launch.
    }
}
