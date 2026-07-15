import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelPreviewData } from '@/lib/api/modelInspect';
import { resolveDiskTextureDataUrl } from '@/lib/util/resolveTextureDataUrl';
import './model-inspect.css';

export function ModelViewport({
    path,
    texturePath,
    autoRotate = true,
    interactive = true,
    wireframe = false,
    showGrid = false,
    hiddenGroups,
    onLoaded,
    className = '',
}: {
    path: string;
    texturePath?: string | null;
    autoRotate?: boolean;
    interactive?: boolean;
    wireframe?: boolean;
    showGrid?: boolean;
    hiddenGroups?: ReadonlySet<string>;
    onLoaded?: (model: ModelPreviewData) => void;
    className?: string;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const onLoadedRef = useRef(onLoaded);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hiddenKey = useMemo(() => [...(hiddenGroups ?? [])].sort().join('\u0000'), [hiddenGroups]);

    useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !path) return;
        let cancelled = false;
        let dispose: (() => void) | null = null;
        setLoading(true);
        setError(null);

        void (async () => {
            const [{ mountModelScene }, textureUrl] = await Promise.all([
                import('@/lib/model/modelScene'),
                texturePath ? resolveDiskTextureDataUrl(texturePath) : Promise.resolve(null),
            ]);
            if (cancelled) return;
            const mounted = await mountModelScene(host, path, {
                textureUrl,
                autoRotate,
                interactive,
                wireframe,
                showGrid,
                hiddenGroups,
            });
            if (cancelled) {
                mounted.dispose();
                return;
            }
            dispose = mounted.dispose;
            setLoading(false);
            onLoadedRef.current?.(mounted.data);
        })().catch((reason: unknown) => {
            if (cancelled) return;
            setLoading(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        });

        return () => {
            cancelled = true;
            dispose?.();
            host.replaceChildren();
        };
        // hiddenKey is a stable representation of the set's contents.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, texturePath, autoRotate, interactive, wireframe, showGrid, hiddenKey]);

    return (
        <div className={`model-viewport ${className}`}>
            <div ref={hostRef} className="model-viewport__host" />
            {loading && <div className="model-viewport__status"><span className="model-viewport__spinner" />Loading model…</div>}
            {error && <div className="model-viewport__status model-viewport__status--error">{error}</div>}
        </div>
    );
}
