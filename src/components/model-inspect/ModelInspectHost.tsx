import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getStartupModelPath } from '@/lib/api/system';
import {
    OPEN_MODEL_INSPECT_EVENT,
    type OpenModelInspectDetail,
} from '@/lib/model/modelInspectEvent';
import { ModelInspectModal } from './ModelInspectModal';

interface Request extends OpenModelInspectDetail { id: number }

/** Singleton host used by the explorer, Port hover cards, and Windows shell. */
export function ModelInspectHost() {
    const [request, setRequest] = useState<Request | null>(null);

    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | null = null;
        const open = (detail: OpenModelInspectDetail) => {
            if (detail.path) setRequest({ ...detail, id: Date.now() });
        };
        const onOpen = (event: Event) => open((event as CustomEvent<OpenModelInspectDetail>).detail);
        window.addEventListener(OPEN_MODEL_INSPECT_EVENT, onOpen);
        void getStartupModelPath().then((path) => { if (path) open({ path }); }).catch(() => { /* normal browser preview */ });
        void listen<string>('model-inspect-launch', (event) => open({ path: event.payload }))
            .then((stop) => { if (disposed) stop(); else unlisten = stop; })
            .catch(() => { /* normal browser preview */ });
        return () => {
            disposed = true;
            unlisten?.();
            window.removeEventListener(OPEN_MODEL_INSPECT_EVENT, onOpen);
        };
    }, []);

    const close = useCallback(() => setRequest(null), []);
    if (!request) return null;
    return (
        <ModelInspectModal
            key={request.id}
            path={request.path}
            initialTexturePath={request.texturePath}
            initialTexturePaths={request.texturePaths}
            initialHiddenGroups={request.hiddenGroups}
            modelScale={request.modelScale}
            anmPaths={request.anmPaths}
            anmClips={request.anmClips}
            chromaOptions={request.chromaOptions}
            selectedChromaId={request.selectedChromaId}
            onSelectChroma={request.onSelectChroma}
            onClose={close}
        />
    );
}
