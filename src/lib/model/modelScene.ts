import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelInspectLoad, type ModelGroup, type ModelPreviewData } from '@/lib/api/modelInspect';

export interface ModelSceneOptions {
    textureUrl?: string | null;
    autoRotate?: boolean;
    interactive?: boolean;
    wireframe?: boolean;
    showGrid?: boolean;
    hiddenGroups?: ReadonlySet<string>;
}

export interface MountedModelScene {
    data: ModelPreviewData;
    dispose: () => void;
}

const PALETTE = [0x8b5cf6, 0x38bdf8, 0x2dd4bf, 0xf59e0b, 0xfb7185, 0xa3e635, 0xe879f9];

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
    const [data, texture] = await Promise.all([
        modelInspectLoad(path),
        loadTexture(options.textureUrl),
    ]);
    if (data.positions.length === 0 || data.indices.length === 0) {
        texture?.dispose();
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

    const materials = groups.map((group, index) => new THREE.MeshStandardMaterial({
        color: texture || colors ? 0xffffff : PALETTE[index % PALETTE.length],
        map: texture,
        vertexColors: !!colors,
        roughness: 0.68,
        metalness: 0.025,
        side: THREE.DoubleSide,
        wireframe: !!options.wireframe,
        transparent: !!texture,
        alphaTest: texture ? 0.08 : 0,
        depthWrite: true,
        visible: !options.hiddenGroups?.has(group.name),
    }));

    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, materials);
    root.add(mesh);
    scene.add(root);

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    root.position.copy(center).multiplyScalar(-1);
    const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const radius = Math.max(geometry.boundingSphere?.radius ?? size.length() * 0.5, 0.05);

    scene.add(new THREE.HemisphereLight(0xe7efff, 0x202030, 1.45));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(radius * 2.4, radius * 3.2, radius * 3.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8b5cf6, 1.1);
    rim.position.set(-radius * 2.2, radius * 1.2, -radius * 2.4);
    scene.add(rim);

    let grid: THREE.GridHelper | null = null;
    if (options.showGrid) {
        const gridSize = Math.max(size.x, size.z, radius) * 3;
        grid = new THREE.GridHelper(gridSize, 18, 0x6d5dfc, 0x343449);
        grid.position.y = -size.y * 0.5;
        (grid.material as THREE.Material).transparent = true;
        (grid.material as THREE.Material).opacity = 0.42;
        scene.add(grid);
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

    return {
        data,
        dispose: () => {
            if (disposed) return;
            disposed = true;
            resizeObserver.disconnect();
            renderer.setAnimationLoop(null);
            controls.dispose();
            geometry.dispose();
            materials.forEach((material) => material.dispose());
            texture?.dispose();
            grid?.geometry.dispose();
            if (grid) {
                const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
                gridMaterials.forEach((material) => material.dispose());
            }
            renderer.dispose();
            renderer.forceContextLoss();
            if (renderer.domElement.parentElement === host) renderer.domElement.remove();
        },
    };
}
