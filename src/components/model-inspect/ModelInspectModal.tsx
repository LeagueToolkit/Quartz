import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { explorerReveal } from '@/lib/api/explorer';
import { modelInspectAnimation, modelInspectDiskAnimations, type ModelPreviewData, type PreparedClip, type SubmeshVisEvent } from '@/lib/api/modelInspect';
import type { ModelInspectChromaOption } from '@/lib/model/modelInspectEvent';
import { buildClip, type AnimClip } from '@/lib/model/skinning';
import { ModelViewport, type ModelSceneReady } from './ModelViewport';
import { ModelControls } from './ModelControls';

function animName(path: string): string {
    return (path.split(/[/\\]/).pop() || path).replace(/\.anm$/i, '');
}

/** The shared leading `_`-segment across all anm names (the champion token, e.g.
 *  `akali`). '' when the names don't share one. */
function commonChampToken(names: string[]): string {
    if (names.length < 2) return '';
    const first = names[0].split('_')[0];
    if (!first) return '';
    return names.every((n) => n.split('_')[0] === first) ? first : '';
}

/** Trim the champion token and the skin token (`base`, `skin01`, `skin_01`, …)
 *  off an anm name so `akali_base_joke_loop` reads as `joke_loop`. */
function trimAnmName(name: string, champ: string): string {
    const segs = name.split('_');
    if (champ && segs[0] === champ) segs.shift();
    // Drop a leading skin marker: `base`, or `skin` optionally followed by digits
    // (as its own segment or glued, e.g. `skin01`).
    if (segs.length > 1) {
        const head = segs[0].toLowerCase();
        if (head === 'base' || head === 'skin' || /^skin\d+$/.test(head)) {
            segs.shift();
            // `skin` split as its own segment leaves the number segment behind.
            if (head === 'skin' && segs.length > 1 && /^\d+$/.test(segs[0])) segs.shift();
        }
    }
    return segs.join('_') || name;
}

export function ModelInspectModal({ path, initialTexturePath, initialTexturePaths, initialHiddenGroups, modelScale, anmPaths = [], anmClips = [], chromaOptions = [], selectedChromaId = null, onSelectChroma, onClose }: {
    path: string;
    initialTexturePath?: string | null;
    initialTexturePaths?: Record<string, string>;
    initialHiddenGroups?: string[];
    modelScale?: number;
    anmPaths?: string[];
    anmClips?: PreparedClip[];
    chromaOptions?: ModelInspectChromaOption[];
    selectedChromaId?: number | null;
    onSelectChroma?: (chromaId: number | null) => void | Promise<void>;
    onClose: () => void;
}) {
    const [model, setModel] = useState<ModelPreviewData | null>(null);
    const [texturePath, setTexturePath] = useState<string | null>(initialTexturePath ?? null);
    const [showTexture, setShowTexture] = useState(true);
    const [wireframe, setWireframe] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [showSkybox, setShowSkybox] = useState(true);
    const [autoRotate, setAutoRotate] = useState(false);
    const [switchingChroma, setSwitchingChroma] = useState(false);
    const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set(initialHiddenGroups ?? []));

    // ── Animation state ─────────────────────────────────────────────────────
    const [animatable, setAnimatable] = useState(false);
    // Anims from the caller (WAD prep) or, for a loose .skn open, resolved from
    // its skin bin on disk once we know the mesh is animatable.
    const [resolvedAnms, setResolvedAnms] = useState<string[]>(anmPaths);
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [selectedAnm, setSelectedAnm] = useState<string>('');
    const [clip, setClip] = useState<AnimClip | null>(null);
    const [playing, setPlaying] = useState(false);
    const [playRate, setPlayRate] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [animError, setAnimError] = useState<string | null>(null);
    const sceneRef = useRef<ModelSceneReady | null>(null);
    // Current clip's visibility events + fps, so a scene re-mount (chroma switch)
    // can restore them.
    const visRef = useRef<{ events: SubmeshVisEvent[] | null; fps: number }>({ events: null, fps: 30 });
    // Live values for the rAF loop without re-subscribing every frame.
    const playStateRef = useRef({ playing: false, rate: 1, time: 0, duration: 0 });
    playStateRef.current = { playing, rate: playRate, time: currentTime, duration: clip?.durationSeconds ?? 0 };

    const handleSceneReady = useCallback((ready: ModelSceneReady | null) => {
        sceneRef.current = ready;
        setAnimatable(!!ready?.animatable);
        if (ready) {
            ready.scene.setClip(clip);
            ready.scene.setTime(currentTime);
            ready.scene.setShowSkeleton(showSkeleton);
            ready.scene.setVisibilityEvents(visRef.current.events, visRef.current.fps);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Trim the shared champion token + skin marker off anm labels
    // (akali_base_joke_loop -> joke_loop).
    const champToken = useMemo(() => commonChampToken(resolvedAnms.map(animName)), [resolvedAnms]);
    const displayAnmName = useCallback((p: string) => trimAnmName(animName(p), champToken), [champToken]);

    // Loose .skn open: if the caller gave no anms but the mesh is animatable,
    // resolve them from the skin bin on disk.
    useEffect(() => {
        if (!animatable || anmPaths.length > 0) return;
        let cancelled = false;
        void modelInspectDiskAnimations(path)
            .then((paths) => { if (!cancelled && paths.length) setResolvedAnms(paths); })
            .catch(() => { /* no skin bin nearby; leave the list empty */ });
        return () => { cancelled = true; };
    }, [animatable, anmPaths, path]);

    // Resolve the clip (submesh-visibility events + fps) for an anm disk path.
    const clipForAnm = useCallback((anmPath: string): { events: SubmeshVisEvent[] } | null => {
        const lower = anmPath.toLowerCase();
        const direct = anmClips.find((c) => c.anmPath?.toLowerCase() === lower);
        if (direct) return { events: direct.events };
        // A sequencer member may carry the selected anm.
        for (const c of anmClips) {
            const m = c.members.find((mm) => mm.anmPath.toLowerCase() === lower);
            if (m) return { events: m.events };
        }
        return null;
    }, [anmClips]);

    // Load the selected .anm clip.
    useEffect(() => {
        if (!selectedAnm) {
            setClip(null); setCurrentTime(0); setPlaying(false);
            sceneRef.current?.scene.setVisibilityEvents(null, 30);
            return;
        }
        let cancelled = false;
        setAnimError(null);
        void modelInspectAnimation(selectedAnm)
            .then((anm) => {
                if (cancelled) return;
                setClip(buildClip(anm)); setCurrentTime(0); setPlaying(true);
                const info = clipForAnm(selectedAnm);
                sceneRef.current?.scene.setVisibilityEvents(info?.events ?? null, anm.fps);
            })
            .catch((e) => { if (!cancelled) setAnimError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, [selectedAnm, clipForAnm]);

    // Push clip to the scene when it changes.
    useEffect(() => { sceneRef.current?.scene.setClip(clip); }, [clip]);
    useEffect(() => { sceneRef.current?.scene.setShowSkeleton(showSkeleton); }, [showSkeleton]);

    // Playback loop: advance time while playing, drive the scene pose.
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            const st = playStateRef.current;
            if (st.playing && st.duration > 0) {
                let next = st.time + dt * st.rate;
                if (next >= st.duration) next = next % st.duration;
                setCurrentTime(next);
                sceneRef.current?.scene.setTime(next);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    const scrubTo = (seconds: number) => {
        setCurrentTime(seconds);
        sceneRef.current?.scene.setTime(seconds);
    };
    const resetAnim = () => { setPlaying(false); scrubTo(0); };

    // Texture button per submesh: if a texture is already applied, reveal it in
    // the file manager (so the user can go edit it, then it hot-reloads); if
    // none is set, open a file dialog to pick one.
    const pickTextureForGroup = useCallback(async (group: string) => {
        const ready = sceneRef.current;
        if (!ready) return;
        const current = ready.currentTexturePath(group);
        if (current) {
            const { explorerReveal } = await import('@/lib/api/explorer');
            void explorerReveal(current).catch(() => {});
            return;
        }
        const { open } = await import('@tauri-apps/plugin-dialog');
        const picked = await open({
            title: group === '*' ? 'Select Base Texture' : `Select Texture for ${group}`,
            multiple: false,
            filters: [{ name: 'Texture', extensions: ['tex', 'dds', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp'] }],
        });
        const file = Array.isArray(picked) ? picked[0] : picked;
        if (typeof file !== 'string') return;
        try { await ready.applyGroupTextureFromDisk(group, file); } catch { /* keep current */ }
    }, []);

    const reloadTextures = useCallback(() => {
        void sceneRef.current?.reloadAllTextures();
    }, []);
    const hasTextures = Boolean(
        initialTexturePath
        || Object.keys(initialTexturePaths ?? {}).length
        || model?.suggestedTexture
        || Object.keys(model?.suggestedTextures ?? {}).length,
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const handleLoaded = useCallback((loaded: ModelPreviewData) => {
        setModel((current) => current === loaded ? current : loaded);
        setTexturePath((current) => current ?? (Object.keys(initialTexturePaths ?? {}).length ? null : loaded.suggestedTexture));
        if (!initialHiddenGroups?.length && loaded.suggestedHiddenGroups?.length) {
            setHiddenGroups((current) => current.size ? current : new Set(loaded.suggestedHiddenGroups ?? []));
        }
    }, [initialHiddenGroups, initialTexturePaths]);

    const toggleGroup = (name: string) => {
        setHiddenGroups((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const allGroupsVisible = Boolean(model?.groups.length)
        && model!.groups.every((group) => !hiddenGroups.has(group.name));

    const toggleAllGroups = () => {
        if (!model?.groups.length) return;
        setHiddenGroups(allGroupsVisible
            ? new Set(model.groups.map((group) => group.name))
            : new Set());
    };

    const fileName = path.split(/[/\\]/).pop() || path;
    return (
        <div className="model-inspect-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section className="model-inspect" role="dialog" aria-modal="true" aria-label={`Inspect ${fileName}`}>
                <div className="model-inspect__accent" />
                <header className="model-inspect__head">
                    <div className="model-inspect__heading">
                        <div>
                            <h2>Model Inspect</h2>
                            <span>{fileName}{model ? ` · ${model.kind === 'skinned' ? 'SKN' : 'SCB/SCO'} · version ${model.version}` : ''}</span>
                        </div>
                    </div>
                    <div className="model-inspect__tools">
                        <button type="button" className="model-inspect__tool" title="Close" onClick={onClose}><X size={17} /></button>
                    </div>
                </header>

                <div className="model-inspect__body">
                    <div className="model-inspect__stage">
                        <ModelViewport
                            path={path}
                            texturePath={showTexture ? texturePath : null}
                            texturePaths={showTexture ? initialTexturePaths : undefined}
                            autoResolveSkinMaterials={showTexture}
                            autoRotate={autoRotate}
                            wireframe={wireframe}
                            showGrid={showGrid}
                            showSkybox={showSkybox}
                            hiddenGroups={hiddenGroups}
                            modelScale={modelScale}
                            showSkeleton={showSkeleton}
                            onLoaded={handleLoaded}
                            onSceneReady={handleSceneReady}
                        />
                        <div className="model-inspect__hint">Drag to orbit · wheel to zoom · right-drag to pan</div>
                        <ModelControls
                            model={model}
                            wireframe={wireframe} setWireframe={setWireframe}
                            showGrid={showGrid} setShowGrid={setShowGrid}
                            showSkybox={showSkybox} setShowSkybox={setShowSkybox}
                            autoRotate={autoRotate} setAutoRotate={setAutoRotate}
                            showTexture={showTexture} setShowTexture={setShowTexture}
                            hasTextures={hasTextures}
                            hiddenGroups={hiddenGroups}
                            toggleGroup={toggleGroup}
                            allGroupsVisible={allGroupsVisible}
                            toggleAllGroups={toggleAllGroups}
                            onPickTexture={pickTextureForGroup}
                            onReloadTextures={reloadTextures}
                            chromaOptions={chromaOptions}
                            selectedChromaId={selectedChromaId}
                            switchingChroma={switchingChroma}
                            onSelectChroma={(next) => {
                                setSwitchingChroma(true);
                                void Promise.resolve(onSelectChroma?.(next)).finally(() => setSwitchingChroma(false));
                            }}
                            animatable={animatable}
                            anms={resolvedAnms}
                            animName={displayAnmName}
                            selectedAnm={selectedAnm} setSelectedAnm={setSelectedAnm}
                            animError={animError}
                            hasClip={!!clip}
                            playing={playing} setPlaying={setPlaying}
                            resetAnim={resetAnim}
                            currentTime={currentTime} durationSeconds={clip?.durationSeconds ?? 0} scrubTo={scrubTo}
                            playRate={playRate} setPlayRate={setPlayRate}
                            showSkeleton={showSkeleton} setShowSkeleton={setShowSkeleton}
                            onReveal={() => void explorerReveal(path)}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}
