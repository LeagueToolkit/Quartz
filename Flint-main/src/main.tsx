/**
 * Flint - League of Legends Modding IDE
 * React Entry Point
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initializeLogger, initBackendLogListener } from './lib/logger';
import { AppProvider } from './lib/state';
import { App } from './components/App';

// Import styles
import './styles/index.css';
// Import default theme (can be swapped via custom theme import)
import './themes/default.css';

// Initialize logger BEFORE React mounts to capture early logs
initializeLogger();

// Initialize app
const container = document.getElementById('app');
if (!container) {
    throw new Error('[Flint] Could not find #app element');
}

// Remove loading screen
const loadingScreen = document.getElementById('loading-screen');
if (loadingScreen) {
    loadingScreen.remove();
}

const root = createRoot(container);
root.render(
    React.createElement(
        React.StrictMode,
        null,
        React.createElement(AppProvider, null, React.createElement(App))
    )
);

// Show window after React has mounted and painted
// Use requestAnimationFrame to ensure the DOM is ready
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        getCurrentWindow()
            .show()
            .then(() => {
                console.log('[Flint] Window shown successfully');
                // Initialize backend log listener after window is ready
                initBackendLogListener();
            })
            .catch((err) => {
                console.error('[Flint] Failed to show window:', err);
            });
    });
});
