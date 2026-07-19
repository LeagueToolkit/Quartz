import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getStartupPaintBin } from '@/lib/api/system';
import { useNavigationStore } from '@/lib/stores';

/* Routes a BIN handed off from another tool (e.g. Flint via `--paint-bin`) into
   the Paint page. Cold start reads it from argv; an already-running Quartz gets
   it through the `paint-bin-launch` event forwarded by single-instance. Both
   funnel through openInTool('paint', path), which Paint consumes on mount. */
export function PaintLaunchHost() {
    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | null = null;
        const open = (path: string | null) => {
            if (path) useNavigationStore.getState().openInTool('paint', path);
        };
        void getStartupPaintBin().then(open).catch(() => { /* not launched with a bin */ });
        void listen<string>('paint-bin-launch', (event) => open(event.payload))
            .then((stop) => { if (disposed) stop(); else unlisten = stop; })
            .catch(() => { /* event bridge unavailable */ });
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);

    return null;
}
