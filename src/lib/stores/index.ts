import React from 'react';

export { useNavigationStore, type Page } from './navigationStore';
export { useConfigStore } from './configStore';
export { useNotificationStore } from './notificationStore';
export { useThemeStore } from './themeStore';
export { useUiPrefsStore, applyUiPrefs, TOGGLEABLE_PAGES, type RecentBin } from './uiPrefsStore';
export { usePaintStore, type HslValues, type PaintState } from './paintStore';
export { usePortStore, type PortResidentState } from './portStore';

/* Stores are module-level singletons, so no Context is required. AppProvider
   is the single mount-time seam for future boot logic (loading persisted
   config, attaching event listeners). */
export function AppProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
}
