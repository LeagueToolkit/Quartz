import React from 'react';
import { createRoot } from 'react-dom/client';
import {
    AppProvider, applyUiPrefs, useConfigStore, useThemeStore, useUiPrefsStore,
} from '@/lib/stores';
import { App } from '@/App';
import { getLeaguePath } from '@/lib/api/league';
import { invokeCommand } from '@/lib/api/core';
import { applyFont } from '@/lib/fonts/fontManager';
import { log } from '@/lib/util/logger';
import '@/styles/theme.css';
import '@/styles/index.css';
import '@/styles/shell.css';
import '@/styles/home.css';
import '@/styles/theme-variables.css';
/* Standardized component primitives (.dl-*) — promoted app-wide so real
   components share the Design Lab styling. Lab-only chrome is scoped to
   .dl-root, so importing globally only exposes the reusable element classes. */
import '@/pages/designlab/design-lab.css';

const appContainer = document.getElementById('app');
if (!appContainer) throw new Error('[Quartz] #app element not found');
const container: HTMLElement = appContainer;

/* Design Lab bypass — when this webview is opened with ?lab (or #design-lab),
   render the standalone Design Lab instead of booting the full app. The lab
   window is spawned from Settings → Appearance. */
const isDesignLab = window.location.search.includes('lab') || window.location.hash.includes('design-lab');

async function hydrateQuartz(): Promise<void> {
    // Match the native splash lifecycle: initialize persisted state while the
    // main WebView is hidden, then render the already-hydrated application.
    await useConfigStore.getState().load();
    await useThemeStore.getState().init();
    applyUiPrefs();
    applyFont(useUiPrefsStore.getState().font);

    const { settings, update } = useConfigStore.getState();
    if (!settings.leaguePath) {
        const detected = await getLeaguePath().catch((error) => {
            log.error('boot league auto-detect', error);
            return null;
        });
        if (detected) await update({ leaguePath: detected });
    }
}

function StartupReadySignal() {
    React.useEffect(() => {
        let cancelled = false;
        void (async () => {
            // A committed React tree is not necessarily painted yet. Wait for
            // fonts (with a bounded timeout) and two frames before telling Rust
            // that it is safe to replace the startup window.
            if (document.fonts?.ready) {
                await Promise.race([
                    document.fonts.ready,
                    new Promise<void>((resolve) => window.setTimeout(resolve, 600)),
                ]);
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (!cancelled) {
                await invokeCommand<void>('startup_main_ready').catch((error) => {
                    log.error('startup main-ready handshake', error);
                });
            }
        })();
        return () => { cancelled = true; };
    }, []);
    return null;
}

function renderQuartz(): void {
    createRoot(container).render(
        React.createElement(
            React.StrictMode,
            null,
            React.createElement(
                AppProvider,
                null,
                React.createElement(App),
                React.createElement(StartupReadySignal),
            ),
        ),
    );
}

if (isDesignLab) {
    // The lab carries its own self-contained dark+red palette, so no theme
    // application is needed here.
    import('@/pages/designlab/DesignLab').then(({ DesignLab }) => {
        createRoot(container).render(React.createElement(DesignLab));
    });
} else {
    void hydrateQuartz()
        .catch((error) => log.error('Quartz boot hydration', error))
        .finally(renderQuartz);
}
