import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getStartupPaintBin, getStartupPortBin, getStartupBinEditorBin } from '@/lib/api/system';
import { useNavigationStore, type Page } from '@/lib/stores';

/* Routes a BIN handed off from another tool (Flint, RubyRe) into the page it names.

   Each entry pairs the cold-start reader (argv, for a Quartz that was not running)
   with the single-instance event (for one that was). Both funnel through
   openInTool(page, path), which the destination page consumes on mount. */
const HANDOFFS: { page: Page; event: string; startup: () => Promise<string | null> }[] = [
    { page: 'paint', event: 'paint-bin-launch', startup: getStartupPaintBin },
    { page: 'port', event: 'port-bin-launch', startup: getStartupPortBin },
    { page: 'bineditor', event: 'bineditor-bin-launch', startup: getStartupBinEditorBin },
];

export function PaintLaunchHost() {
    useEffect(() => {
        let disposed = false;
        const stops: (() => void)[] = [];

        for (const { page, event, startup } of HANDOFFS) {
            const open = (path: string | null) => {
                if (path) useNavigationStore.getState().openInTool(page, path);
            };
            void startup().then(open).catch(() => { /* not launched with a bin */ });
            void listen<string>(event, (e) => open(e.payload))
                .then((stop) => { if (disposed) stop(); else stops.push(stop); })
                .catch(() => { /* event bridge unavailable */ });
        }

        return () => {
            disposed = true;
            for (const stop of stops) stop();
        };
    }, []);

    return null;
}
