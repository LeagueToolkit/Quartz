
// Simple event system for Asset Preview to avoid complex prop drilling
export const ASSET_PREVIEW_EVENT = 'open-asset-preview';

/**
 * Triggers the global asset preview modal.
 * @param {string} path - Absolute path to the asset
 * @param {string|null} dataUrl - Optional pre-loaded data URL (for fast preview)
 */
export const openAssetPreview = (path, dataUrl = null, mode = 'browser') => {
    // Allow opening without path (defaults to desktop/home)
    // if (!path) return;

    window.dispatchEvent(new CustomEvent(ASSET_PREVIEW_EVENT, {
        detail: {
            path,
            dataUrl,
            mode
        }
    }));
};
