import * as THREE from 'three';
import { convertFileSrc } from '@tauri-apps/api/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader.js';
import {
    modelInspectLoad,
    modelInspectSceneAssets,
    type ModelGroup,
    type ModelPreviewData,
    type ModelSceneAssets,
} from '@/lib/api/modelInspect';
import {
    evaluateWorldMatrices,
    evaluateSkeletonSegments,
    inverseBindMatrix,
    type SkeletonRuntime,
    type AnimClip,
} from './skinning';

/** A submesh-visibility event for the scene: show/hide tokens (names or `0x`
 *  hashes) over a frame window (null = 0 / clip end). */
export interface SceneVisEvent {
    startFrame: number | null;
    endFrame: number | null;
    show: string[];
    hide: string[];
}

/** League fnv1a-32 (lowercased) as a `0x`-padded hex string, for matching a
 *  submesh-visibility hash token against a submesh name. */
function fnv1a32Hex(name: string): string {
    let h = 0x811c9dc5;
    const s = name.toLowerCase();
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `0x${h.toString(16).padStart(8, '0')}`;
}

/** Does an event token (a submesh NAME or a `0x…` hash) refer to `groupName`? */
function tokenMatchesGroup(token: string, groupName: string): boolean {
    if (token.toLowerCase() === groupName.toLowerCase()) return true;
    if (/^0x[0-9a-f]+$/i.test(token)) return token.toLowerCase() === fnv1a32Hex(groupName);
    return false;
}

export interface ModelSceneOptions {
    textureUrl?: string | null;
    /** Per-submesh texture URLs. `*` is the BIN-authored base material. */
    textureUrls?: Record<string, string>;
    autoRotate?: boolean;
    interactive?: boolean;
    wireframe?: boolean;
    showGrid?: boolean;
    showSkybox?: boolean;
    hiddenGroups?: ReadonlySet<string>;
    modelScale?: number;
    modelData?: ModelPreviewData;
    /** Skeleton for skinned playback (built from model_inspect_skeleton). */
    skeleton?: SkeletonRuntime | null;
    /** Show the bone-line overlay. */
    showSkeleton?: boolean;
}

export interface MountedModelScene {
    data: ModelPreviewData;
    setHiddenGroups: (hidden: ReadonlySet<string>) => void;
    /** True when the mesh has bones + a skeleton was supplied (animatable). */
    readonly skinned: boolean;
    /** Set the active animation clip (null = bind pose / stopped). */
    setClip: (clip: AnimClip | null) => void;
    /** Set playback time in seconds (also updates the skeleton overlay). */
    setTime: (seconds: number) => void;
    setShowSkeleton: (show: boolean) => void;
    /** Submesh-visibility events for the active clip (null = none). Applied per
     *  frame during playback: a submesh is shown/hidden while an event's frame
     *  window is live, over the base hidden set. */
    setVisibilityEvents: (events: SceneVisEvent[] | null, fps: number) => void;
    /** Live render toggles (no scene remount). */
    setWireframe: (on: boolean) => void;
    setAutoRotate: (on: boolean) => void;
    setShowGrid: (on: boolean) => void;
    setShowSkybox: (on: boolean) => void;
    /** Hot-swap one submesh group's texture in place (no scene remount). Pass a
     *  file:// or disk URL; the base group is keyed `*`. Rejects on decode
     *  failure, keeping the previous texture. */
    setGroupTexture: (groupName: string, url: string) => Promise<void>;
    /** Current groupName -> applied texture URL (base under `*`). For the file
     *  watcher + texture picker to know what to watch / replace. */
    appliedTextures: () => Record<string, string>;
    /** Submesh group names in render order (for the per-submesh picker UI). */
    groupNames: () => string[];
    dispose: () => void;
}

const PALETTE = [0x8b5cf6, 0x38bdf8, 0x2dd4bf, 0xf59e0b, 0xfb7185, 0xa3e635, 0xe879f9];
let sceneAssetsPromise: Promise<ModelSceneAssets> | null = null;

function sceneAssets(): Promise<ModelSceneAssets> {
    sceneAssetsPromise ??= modelInspectSceneAssets().catch(() => ({ groundPath: null, skyboxPath: null }));
    return sceneAssetsPromise;
}

function displayGroups(data: ModelPreviewData): ModelGroup[] {
    if (data.groups.length > 0) return data.groups;
    return [{ name: 'Base', indexStart: 0, indexCount: data.indices.length }];
}

function vertexColors(rgba: number[], vertexCount: number): Float32Array | null {
    if (rgba.length !== vertexCount * 4) return null;
    const rgb = new Float32Array(vertexCount * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
        rgb[target] = rgba[source];
        rgb[target + 1] = rgba[source + 1];
        rgb[target + 2] = rgba[source + 2];
    }
    return rgb;
}

async function loadTexture(url: string | null | undefined): Promise<THREE.Texture | null> {
    if (!url) return null;
    try {
        const texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.premultiplyAlpha = false;
        return texture;
    } catch {
        return null;
    }
}

/** Mount a self-contained Three.js scene into `host`. The returned disposer
 *  releases every GPU resource, observer, listener, and animation callback. */
export async function mountModelScene(
    host: HTMLElement,
    path: string,
    options: ModelSceneOptions = {},
): Promise<MountedModelScene> {
    const [data, assetPaths] = await Promise.all([
        options.modelData ? Promise.resolve(options.modelData) : modelInspectLoad(path),
        sceneAssets(),
    ]);
    const requestedTextures = { ...(options.textureUrls ?? {}) };
    if (options.textureUrl && !requestedTextures['*']) requestedTextures['*'] = options.textureUrl;
    const textureCache = new Map<string, Promise<THREE.Texture | null>>();
    const loadedEntries = await Promise.all(Object.entries(requestedTextures).map(async ([, url]) => {
        let pending = textureCache.get(url);
        if (!pending) {
            pending = loadTexture(url);
            textureCache.set(url, pending);
        }
        return [url, await pending] as const;
    }));
    // Keyed by URL (not the submesh key) so textureForGroup and the hot-swap can
    // look up a loaded texture by its URL.
    const textures = new Map(loadedEntries.filter((entry): entry is readonly [string, THREE.Texture] => !!entry[1]));
    // Which requested key (if any) a group name binds to (same matching as
    // textureForGroup): exact/normalized submesh override, else the base `*`.
    const keyForGroup = (name: string): string | null => {
        const wanted = name.toLowerCase();
        for (const key of Object.keys(requestedTextures)) {
            const normalized = key.replace(/_\d+Material$/i, '').toLowerCase();
            if (key !== '*' && (key.toLowerCase() === wanted || normalized === wanted)) return key;
        }
        return requestedTextures['*'] != null ? '*' : null;
    };
    const textureForGroup = (name: string): THREE.Texture | null => {
        const key = keyForGroup(name);
        return key != null ? (textures.get(requestedTextures[key]) ?? null) : null;
    };
    if (data.positions.length === 0 || data.indices.length === 0) {
        new Set(textures.values()).forEach((texture) => texture.dispose());
        throw new Error('The model contains no renderable triangles');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(data.indices, 1));
    if (data.uvs.length === data.vertexCount * 2) {
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    if (data.normals.length === data.vertexCount * 3) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    } else {
        geometry.computeVertexNormals();
    }
    const colors = vertexColors(data.colors, data.vertexCount);
    if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groups = displayGroups(data);
    geometry.clearGroups();
    groups.forEach((group, index) => {
        const start = Math.min(group.indexStart, data.indices.length);
        const count = Math.min(group.indexCount, data.indices.length - start);
        if (count > 0) geometry.addGroup(start, count, index);
    });

    const materials = groups.map((group, index) => {
        const texture = textureForGroup(group.name);
        return new THREE.MeshBasicMaterial({
            color: texture || colors ? 0xffffff : PALETTE[index % PALETTE.length],
            map: texture,
            vertexColors: !!colors,
            side: THREE.DoubleSide,
            wireframe: !!options.wireframe,
            // League character materials are opaque cutouts: discard low alpha,
            // but do not blend/sort the entire mesh as transparent geometry.
            transparent: false,
            alphaTest: texture ? 0.5 : 0,
            depthWrite: true,
            visible: !options.hiddenGroups?.has(group.name),
        });
    });

    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const modelScale = Number.isFinite(options.modelScale) && (options.modelScale ?? 1) > 0 ? (options.modelScale ?? 1) : 1;
    root.scale.setScalar(modelScale);

    // Skinned path: the mesh carries bone influences AND a skeleton was supplied.
    // We drive skinning by writing our own skin matrices into skeleton.boneMatrices
    // each frame (three's bone hierarchy is bypassed), matching old Quartz's CPU
    // skinning while letting the GPU do the vertex blend.
    const skeletonRt = options.skeleton ?? null;
    const canSkin = !!skeletonRt
        && data.boneIndices?.length === data.vertexCount * 4
        && data.boneWeights?.length === data.vertexCount * 4
        && skeletonRt.sortedIds.length > 0;

    let mesh: THREE.Mesh | THREE.SkinnedMesh;
    let threeSkeleton: THREE.Skeleton | null = null;
    let bonesBySlot: THREE.Bone[] = [];
    let boneSlotByJointId: Map<number, number> | null = null;

    if (canSkin && skeletonRt) {
        // Bone slot order = joints sorted by id; build the lookup mesh vertices use.
        boneSlotByJointId = new Map(skeletonRt.sortedIds.map((id, slot) => [id, slot]));
        const influences = skeletonRt.influences;
        const vcount = data.vertexCount;
        const skinIndex = new Uint16Array(vcount * 4);
        const skinWeight = new Float32Array(vcount * 4);
        for (let i = 0; i < vcount * 4; i++) {
            // mesh-local influence index -> joint id -> compact bone slot.
            const local = data.boneIndices[i] ?? 0;
            const jointId = influences[local] ?? -1;
            skinIndex[i] = jointId >= 0 ? (boneSlotByJointId.get(jointId) ?? 0) : 0;
            skinWeight[i] = data.boneWeights[i] ?? 0;
        }
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

        // Canonical three.js skinning: give each bone its own matrix (we drive it
        // per frame), and hand three the inverse-bind list. three then computes
        // boneMatrices[i] = bone.matrixWorld * boneInverses[i] in skeleton.update().
        bonesBySlot = skeletonRt.sortedIds.map((jointId) => {
            const bone = new THREE.Bone();
            bone.matrixAutoUpdate = false;
            const joint = skeletonRt.jointById.get(jointId)!;
            bone.name = joint.name;
            return bone;
        });
        const boneInverses = skeletonRt.sortedIds.map((jointId) =>
            inverseBindMatrix(skeletonRt.jointById.get(jointId)!));
        threeSkeleton = new THREE.Skeleton(bonesBySlot, boneInverses);

        const skinned = new THREE.SkinnedMesh(geometry, materials);
        const boneRoot = new THREE.Group();
        boneRoot.matrixAutoUpdate = false; // stays at identity; bones carry world matrices
        bonesBySlot.forEach((b) => boneRoot.add(b));
        skinned.add(boneRoot);
        skinned.bind(threeSkeleton, new THREE.Matrix4());
        mesh = skinned;
    } else {
        mesh = new THREE.Mesh(geometry, materials);
    }
    root.add(mesh);
    scene.add(root);

    // Skeleton overlay (bone lines), toggled by showSkeleton.
    const overlayGeom = new THREE.BufferGeometry();
    overlayGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
    const overlay = new THREE.LineSegments(
        overlayGeom,
        new THREE.LineBasicMaterial({ color: 0x00e0ff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    overlay.renderOrder = 999;
    overlay.visible = !!options.showSkeleton && canSkin;
    root.add(overlay);

    // Playback state.
    let activeClip: AnimClip | null = null;
    let currentTime = 0;
    // Submesh-visibility events for the active clip + the base hidden set.
    let visEvents: SceneVisEvent[] | null = null;
    let visFps = 30;
    let baseHidden: ReadonlySet<string> = options.hiddenGroups ?? new Set();

    /** Effective per-frame submesh visibility: start from the base hidden set,
     *  then apply the live events (show wins over hide within a window). */
    const applyVisibility = () => {
        const clipEndFrame = activeClip ? activeClip.durationSeconds * visFps : 0;
        const frame = currentTime * visFps;
        // Collect forced show/hide from events whose window is live this frame.
        const forceShow: string[] = [];
        const forceHide: string[] = [];
        if (visEvents) {
            for (const ev of visEvents) {
                const start = ev.startFrame ?? 0;
                const end = ev.endFrame ?? clipEndFrame;
                if (frame < start || (end > 0 && frame > end)) continue;
                forceShow.push(...ev.show);
                forceHide.push(...ev.hide);
            }
        }
        materials.forEach((material, index) => {
            const gName = groups[index]?.name ?? '';
            let visible = !baseHidden.has(gName);
            if (forceHide.some((t) => tokenMatchesGroup(t, gName))) visible = false;
            if (forceShow.some((t) => tokenMatchesGroup(t, gName))) visible = true;
            material.visible = visible;
        });
    };

    const applyPose = () => {
        if (!canSkin || !skeletonRt || !threeSkeleton || !boneSlotByJointId) return;
        // World transform per joint at the current time; write into each bone's
        // matrix + matrixWorld, then let three build the skin matrices.
        const worldById = evaluateWorldMatrices(skeletonRt, activeClip, currentTime);
        for (const [jointId, slot] of boneSlotByJointId) {
            const world = worldById.get(jointId);
            const bone = bonesBySlot[slot];
            if (!world || !bone) continue;
            bone.matrix.copy(world);
            bone.matrixWorld.copy(world);
        }
        threeSkeleton.update();
        if (overlay.visible) {
            const seg = evaluateSkeletonSegments(skeletonRt, activeClip, currentTime);
            overlay.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(seg), 3));
            overlay.geometry.attributes.position.needsUpdate = true;
            overlay.geometry.setDrawRange(0, seg.length / 3);
        }
        applyVisibility();
    };
    // Prime bind pose immediately so a skinned mesh renders correctly at rest.
    applyPose();

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    root.position.copy(center).multiplyScalar(-modelScale);
    const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const radius = Math.max((geometry.boundingSphere?.radius ?? size.length() * 0.5) * modelScale, 0.05);

    // Ground + skybox are always loaded (small bundled assets) and toggled by
    // visibility, so flipping them doesn't remount the scene.
    let groundTexture: THREE.Texture | null = null;
    let ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
    if (assetPaths.groundPath) {
        try {
            groundTexture = await new THREE.TextureLoader().loadAsync(convertFileSrc(assetPaths.groundPath));
            groundTexture.colorSpace = THREE.SRGBColorSpace;
            groundTexture.wrapS = THREE.ClampToEdgeWrapping;
            groundTexture.wrapT = THREE.ClampToEdgeWrapping;
            const groundSize = Math.max(size.x * modelScale, size.z * modelScale, radius) * 4;
            ground = new THREE.Mesh(
                new THREE.PlaneGeometry(groundSize, groundSize),
                new THREE.MeshBasicMaterial({ map: groundTexture, side: THREE.DoubleSide }),
            );
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -size.y * modelScale * 0.5 - radius * 0.005;
            ground.visible = !!options.showGrid;
            scene.add(ground);
        } catch {
            groundTexture?.dispose();
            groundTexture = null;
        }
    }

    let skybox: THREE.CompressedTexture | null = null;
    const applySkyboxVisible = (show: boolean) => { scene.background = show && skybox ? skybox : null; };
    if (assetPaths.skyboxPath) {
        try {
            skybox = await new DDSLoader().loadAsync(convertFileSrc(assetPaths.skyboxPath));
            Object.assign(skybox, { isCubeTexture: true });
            skybox.mapping = THREE.CubeReflectionMapping;
            skybox.colorSpace = THREE.SRGBColorSpace;
            applySkyboxVisible(options.showSkybox !== false);
        } catch {
            skybox?.dispose();
            skybox = null;
        }
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.domElement.className = 'model-viewport__canvas';
    renderer.domElement.setAttribute('aria-label', `3D preview of ${data.name}`);
    host.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(42, 1, Math.max(radius / 1000, 0.001), radius * 100);
    camera.position.set(radius * 1.45, radius * 0.9, radius * 2.25);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = options.interactive !== false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.7;
    controls.target.set(0, 0, 0);
    controls.autoRotate = !!options.autoRotate && controls.enabled;
    controls.autoRotateSpeed = 1.5;
    controls.minDistance = radius * 0.25;
    controls.maxDistance = radius * 12;
    controls.update();

    let width = 0;
    let height = 0;
    const resize = () => {
        const nextWidth = Math.max(1, Math.floor(host.clientWidth));
        const nextHeight = Math.max(1, Math.floor(host.clientHeight));
        if (nextWidth === width && nextHeight === height) return;
        width = nextWidth;
        height = nextHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let disposed = false;
    renderer.setAnimationLoop(() => {
        if (disposed) return;
        if (options.autoRotate && options.interactive === false) root.rotation.y += 0.006;
        controls.update();
        renderer.render(scene, camera);
    });

    // Live groupName -> current texture URL (base under `*`), seeded from what
    // each group actually resolved to at mount. Drives the watcher + picker.
    const groupUrl: Record<string, string> = {};
    for (const g of groups) {
        const key = keyForGroup(g.name);
        if (key != null && requestedTextures[key]) groupUrl[g.name] = requestedTextures[key];
    }
    if (requestedTextures['*']) groupUrl['*'] = requestedTextures['*'];

    return {
        data,
        skinned: canSkin,
        setHiddenGroups: (hidden) => {
            baseHidden = hidden;
            applyVisibility();
        },
        setVisibilityEvents: (events, fps) => {
            visEvents = events;
            visFps = fps > 0 ? fps : 30;
            applyVisibility();
        },
        setGroupTexture: async (groupName, url) => {
            // Cache-bust file/http URLs so an edited-in-place file is refetched
            // instead of served from the browser cache. NEVER append a query to a
            // data: URL - that makes it an invalid URL (ERR_INVALID_URL). Data
            // URLs are already unique per decode, so no cache-bust is needed.
            const bustUrl = url.startsWith('data:')
                ? url
                : url + (url.includes('?') ? '&' : '?') + '_r=' + Date.now();
            const next = await loadTexture(bustUrl);
            if (!next) throw new Error('Could not decode texture');
            // Update every material whose resolved texture key matches `groupName`.
            // `groupName` is a texture key (e.g. `Body`, `Tails`, or `*` for base),
            // the same space `keyForGroup` resolves to. Matching by that key (not by
            // raw submesh name) is what makes the base `*` and per-submesh overrides
            // both hit the right materials. A submesh with no override resolves to
            // `*`, so a `*` reload also refreshes those.
            const wantKey = groupName.toLowerCase();
            const stale = new Set<THREE.Texture>();
            let applied = 0;
            materials.forEach((material, index) => {
                const gName = groups[index]?.name ?? '';
                const key = (keyForGroup(gName) ?? '').toLowerCase();
                if (key !== wantKey) return;
                if (material.map && material.map !== next) stale.add(material.map);
                material.map = next;
                material.color.setHex(0xffffff);
                material.alphaTest = 0.5;
                material.needsUpdate = true;
                applied++;
            });
            groupUrl[groupName] = url;
            // If the key didn't match any material's resolved key (naming drift),
            // fall back to a direct submesh-name match so the reload still lands.
            if (applied === 0 && groupName !== '*') {
                materials.forEach((material, index) => {
                    const gName = (groups[index]?.name ?? '').toLowerCase();
                    if (gName !== wantKey && gName.replace(/_\d+material$/i, '') !== wantKey) return;
                    if (material.map && material.map !== next) stale.add(material.map);
                    material.map = next;
                    material.color.setHex(0xffffff);
                    material.alphaTest = 0.5;
                    material.needsUpdate = true;
                });
            }
            // Dispose textures no longer referenced by any material.
            const live = new Set(materials.map((m) => m.map).filter(Boolean) as THREE.Texture[]);
            stale.forEach((t) => { if (!live.has(t)) t.dispose(); });
        },
        appliedTextures: () => ({ ...groupUrl }),
        groupNames: () => groups.map((g) => g.name),
        setClip: (clip) => {
            activeClip = clip;
            currentTime = 0;
            applyPose();
        },
        setTime: (seconds) => {
            currentTime = seconds;
            applyPose();
        },
        setShowSkeleton: (show) => {
            overlay.visible = show && canSkin;
            if (overlay.visible) applyPose();
        },
        setWireframe: (on) => { materials.forEach((m) => { m.wireframe = on; }); },
        setAutoRotate: (on) => { controls.autoRotate = on && controls.enabled; },
        setShowGrid: (on) => { if (ground) ground.visible = on; },
        setShowSkybox: (on) => { applySkyboxVisible(on); },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            resizeObserver.disconnect();
            renderer.setAnimationLoop(null);
            controls.dispose();
            geometry.dispose();
            overlay.geometry.dispose();
            (overlay.material as THREE.Material).dispose();
            threeSkeleton?.dispose();
            materials.forEach((material) => material.dispose());
            new Set(textures.values()).forEach((texture) => texture.dispose());
            ground?.geometry.dispose();
            ground?.material.dispose();
            groundTexture?.dispose();
            skybox?.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            if (renderer.domElement.parentElement === host) renderer.domElement.remove();
        },
    };
}
