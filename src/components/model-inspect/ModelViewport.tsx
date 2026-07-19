import { useEffect, useMemo, useRef, useState } from 'react';
import { modelInspectLoad, modelInspectSkeleton, type ModelPreviewData } from '@/lib/api/modelInspect';
import type { MountedModelScene } from '@/lib/model/modelScene';
import { buildSkeleton, type SkeletonRuntime } from '@/lib/model/skinning';
import { resolveDiskTextureDataUrl } from '@/lib/util/resolveTextureDataUrl';
import { useTextureWatcher, type TextureWatchTarget } from '@/lib/util/useTextureWatcher';
import './model-inspect.css';

/** Handed to the parent once the scene is mounted, so it can drive playback. */
export interface ModelSceneReady {
    scene: MountedModelScene;
    /** True when the mesh is skinned and a skeleton was loaded. */
    animatable: boolean;
    /** Submesh group names, for the per-submesh texture picker. */
    groups: string[];
    /** Decode a disk texture (.tex/.dds/png...) and apply it to a group (`*` =
     *  base). Used by the manual texture picker; also registers the path with the
     *  live file-watcher so later edits hot-reload. */
    applyGroupTextureFromDisk: (group: string, diskPath: string) => Promise<void>;
    /** Disk path of the texture currently applied to a group (or its base
     *  fallback), or null when the group has no texture. */
    currentTexturePath: (group: string) => string | null;
    /** Force re-decode + re-apply every applied texture from disk (manual
     *  fallback when the file watcher misses a change). */
    reloadAllTextures: () => Promise<void>;
}

export function ModelViewport({
    path,
    texturePath,
    texturePaths,
    autoRotate = true,
    interactive = true,
    wireframe = false,
    showGrid = false,
    showSkybox = true,
    showSkeleton = false,
    hiddenGroups,
    modelScale,
    autoResolveSkinMaterials = true,
    onLoaded,
    onSceneReady,
    className = '',
}: {
    path: string;
    texturePath?: string | null;
    texturePaths?: Record<string, string>;
    autoRotate?: boolean;
    interactive?: boolean;
    wireframe?: boolean;
    showGrid?: boolean;
    showSkybox?: boolean;
    showSkeleton?: boolean;
    hiddenGroups?: ReadonlySet<string>;
    modelScale?: number;
    autoResolveSkinMaterials?: boolean;
    onLoaded?: (model: ModelPreviewData) => void;
    onSceneReady?: (ready: ModelSceneReady | null) => void;
    className?: string;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef<MountedModelScene | null>(null);
    const hiddenGroupsRef = useRef<ReadonlySet<string> | undefined>(hiddenGroups);
    const onLoadedRef = useRef(onLoaded);
    const onSceneReadyRef = useRef(onSceneReady);
    // Live groupName -> disk texture path, for the file-watcher + picker. Updated
    // when a texture is picked so later edits to the new file also hot-reload.
    const groupDiskPathRef = useRef<Record<string, string>>({});
    const [watchTargets, setWatchTargets] = useState<TextureWatchTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hiddenKey = useMemo(() => [...(hiddenGroups ?? [])].sort().join('\u0000'), [hiddenGroups]);
    const texturePathsKey = useMemo(() => JSON.stringify(texturePaths ?? {}), [texturePaths]);

    useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);
    useEffect(() => { onSceneReadyRef.current = onSceneReady; }, [onSceneReady]);

    // Rebuild the watch list from the current group -> disk-path map. The url is
    // a stable disk-path token; the watcher re-decodes to a fresh data URL.
    const rebuildWatchTargets = () => {
        setWatchTargets(Object.entries(groupDiskPathRef.current)
            .filter(([, diskPath]) => !!diskPath)
            .map(([group, diskPath]) => ({ group, diskPath, url: diskPath })));
    };

    // On a watched texture change, re-decode from disk (force = bypass cache) and
    // hot-swap in place.
    useTextureWatcher(watchTargets, async (group, diskPath) => {
        const scene = mountedRef.current;
        if (!scene) return;
        const dataUrl = await resolveDiskTextureDataUrl(diskPath, true);
        if (dataUrl) await scene.setGroupTexture(group, dataUrl);
    });
    useEffect(() => {
        hiddenGroupsRef.current = hiddenGroups;
        mountedRef.current?.setHiddenGroups(hiddenGroups ?? new Set());
    }, [hiddenGroups, hiddenKey]);
    // Render toggles applied live, without remounting the scene.
    useEffect(() => { mountedRef.current?.setShowSkeleton(showSkeleton); }, [showSkeleton]);
    useEffect(() => { mountedRef.current?.setWireframe(wireframe); }, [wireframe]);
    useEffect(() => { mountedRef.current?.setAutoRotate(autoRotate); }, [autoRotate]);
    useEffect(() => { mountedRef.current?.setShowGrid(showGrid); }, [showGrid]);
    useEffect(() => { mountedRef.current?.setShowSkybox(showSkybox); }, [showSkybox]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !path) return;
        let cancelled = false;
        let dispose: (() => void) | null = null;
        setLoading(true);
        setError(null);

        void (async () => {
            const [modelData, { mountModelScene }] = await Promise.all([
                modelInspectLoad(path),
                import('@/lib/model/modelScene'),
            ]);
            // Skinned meshes may have a companion .skl; load it so the mesh can
            // animate. Failure (static mesh / missing skl) just means no skeleton.
            let skeleton: SkeletonRuntime | null = null;
            if (modelData.kind === 'skinned' && modelData.boneIndices?.length) {
                try {
                    skeleton = buildSkeleton(await modelInspectSkeleton(path));
                } catch {
                    skeleton = null;
                }
            }
            if (cancelled) return;
            const effectiveTexturePaths = Object.keys(texturePaths ?? {}).length
                ? texturePaths!
                : autoResolveSkinMaterials ? (modelData.suggestedTextures ?? {}) : {};
            const effectiveTexturePath = texturePath
                ?? (autoResolveSkinMaterials && !Object.keys(effectiveTexturePaths).length ? modelData.suggestedTexture : null);
            const [textureUrl, textureUrlEntries] = await Promise.all([
                effectiveTexturePath ? resolveDiskTextureDataUrl(effectiveTexturePath) : Promise.resolve(null),
                Promise.all(Object.entries(effectiveTexturePaths).map(async ([key, value]) => [key, await resolveDiskTextureDataUrl(value)] as const)),
            ]);
            if (cancelled) return;
            const textureUrls = Object.fromEntries(textureUrlEntries.filter((entry): entry is readonly [string, string] => !!entry[1]));
            const mounted = await mountModelScene(host, path, {
                textureUrl,
                textureUrls,
                autoRotate,
                interactive,
                wireframe,
                showGrid,
                showSkybox,
                hiddenGroups: hiddenGroupsRef.current ?? new Set(modelData.suggestedHiddenGroups ?? []),
                modelScale: modelScale ?? modelData.suggestedModelScale ?? 1,
                modelData,
                skeleton,
                showSkeleton,
            });
            if (cancelled) {
                mounted.dispose();
                return;
            }
            dispose = mounted.dispose;
            mountedRef.current = mounted;
            mounted.setHiddenGroups(hiddenGroupsRef.current ?? new Set(modelData.suggestedHiddenGroups ?? []));
            setLoading(false);

            // Seed the group -> disk-path map from the resolved textures and start
            // watching them, so editing any applied .tex/.dds/png hot-reloads it.
            const diskMap: Record<string, string> = {};
            for (const [key, value] of Object.entries(effectiveTexturePaths)) diskMap[key] = value;
            if (effectiveTexturePath && !diskMap['*']) diskMap['*'] = effectiveTexturePath;
            groupDiskPathRef.current = diskMap;
            rebuildWatchTargets();

            const applyGroupTextureFromDisk = async (group: string, diskPath: string) => {
                const dataUrl = await resolveDiskTextureDataUrl(diskPath);
                if (!dataUrl) throw new Error('Could not decode texture');
                await mounted.setGroupTexture(group, dataUrl);
                groupDiskPathRef.current[group] = diskPath;
                rebuildWatchTargets();
            };

            onLoadedRef.current?.(mounted.data);
            const currentTexturePath = (group: string): string | null => {
                const map = groupDiskPathRef.current;
                // Exact group, then a normalized submesh match, then the base `*`.
                if (map[group]) return map[group];
                const wanted = group.toLowerCase();
                for (const [k, v] of Object.entries(map)) {
                    if (k === '*') continue;
                    if (k.toLowerCase() === wanted || k.replace(/_\d+Material$/i, '').toLowerCase() === wanted) return v;
                }
                return map['*'] ?? null;
            };

            const reloadAllTextures = async () => {
                const map = groupDiskPathRef.current;
                for (const [group, diskPath] of Object.entries(map)) {
                    if (!diskPath) continue;
                    try {
                        // force = re-read from disk (bypass the decode cache) so an
                        // edited-in-place texture is actually picked up.
                        const dataUrl = await resolveDiskTextureDataUrl(diskPath, true);
                        if (dataUrl) await mounted.setGroupTexture(group, dataUrl);
                    } catch { /* keep current */ }
                }
            };

            onSceneReadyRef.current?.({
                scene: mounted,
                animatable: mounted.skinned,
                groups: mounted.groupNames(),
                applyGroupTextureFromDisk,
                currentTexturePath,
                reloadAllTextures,
            });
        })().catch((reason: unknown) => {
            if (cancelled) return;
            setLoading(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        });

        return () => {
            cancelled = true;
            mountedRef.current = null;
            onSceneReadyRef.current?.(null);
            dispose?.();
            host.replaceChildren();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // autoRotate/wireframe/showGrid/showSkybox are applied live above, so they
        // are intentionally NOT in these deps (they must not remount the scene).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, texturePath, texturePathsKey, interactive, modelScale, autoResolveSkinMaterials]);

    return (
        <div className={`model-viewport ${className}`}>
            <div ref={hostRef} className="model-viewport__host" />
            {loading && <div className="model-viewport__status"><span className="model-viewport__spinner" />Loading model…</div>}
            {error && <div className="model-viewport__status model-viewport__status--error">{error}</div>}
        </div>
    );
}
