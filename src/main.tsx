import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '@/lib/stores';
import { App } from '@/App';
import '@/styles/theme.css';
import '@/styles/index.css';
import '@/styles/shell.css';
import '@/styles/home.css';
import '@/styles/theme-variables.css';
/* Standardized component primitives (.dl-*) — promoted app-wide so real
   components share the Design Lab styling. Lab-only chrome is scoped to
   .dl-root, so importing globally only exposes the reusable element classes. */
import '@/pages/designlab/design-lab.css';

const container = document.getElementById('app');
if (!container) throw new Error('[Quartz] #app element not found');

document.getElementById('loading-screen')?.remove();

/* Design Lab bypass — when this webview is opened with ?lab (or #design-lab),
   render the standalone Design Lab instead of booting the full app. The lab
   window is spawned from Settings → Appearance. */
const isDesignLab = window.location.search.includes('lab') || window.location.hash.includes('design-lab');

if (isDesignLab) {
    // The lab carries its own self-contained dark+red palette, so no theme
    // application is needed here.
    import('@/pages/designlab/DesignLab').then(({ DesignLab }) => {
        createRoot(container).render(React.createElement(DesignLab));
    });
} else {
    createRoot(container).render(
        React.createElement(
            React.StrictMode,
            null,
            React.createElement(AppProvider, null, React.createElement(App)),
        ),
    );
}
