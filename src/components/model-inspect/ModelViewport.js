import React from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';

const isModelInspectPerfDebug = () => {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage?.getItem('modelInspectPerfDebug') === '1'
      || window.localStorage?.getItem('modelInspectDebug') === '1';
  } catch {
    return false;
  }
};

const MAX_MODEL_TEXTURE_DIM = 4096;
const MAX_ENV_TEXTURE_DIM = 2048;

const clampTextureSize = (texture, maxDim) => {
  try {
    const img = texture?.image;
    const w = Number(img?.width || 0);
    const h = Number(img?.height || 0);
    if (!w || !h) return;
    if (w <= maxDim && h <= maxDim) return;

    const scale = Math.min(maxDim / w, maxDim / h);
    const nw = Math.max(1, Math.floor(w * scale));
    const nh = Math.max(1, Math.floor(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, nw, nh);
    texture.image = canvas;
    texture.needsUpdate = true;
  } catch {
    // Ignore size clamp failures.
  }
};

const configureTextureForGpu = (texture, {
  maxDim = MAX_MODEL_TEXTURE_DIM,
  wrapS = THREE.ClampToEdgeWrapping,
  wrapT = THREE.ClampToEdgeWrapping,
} = {}) => {
  clampTextureSize(texture, maxDim);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = wrapS;
  texture.wrapT = wrapT;
  texture.anisotropy = 1;
  texture.premultiplyAlpha = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
};

const colorFromName = (name) => {
  let hash = 0;
  const text = String(name || '');
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}deg 70% 62%)`;
};

function SkeletonLines({ segments = [] }) {
  const geometry = React.useMemo(() => {
    if (!segments.length) return null;
    const points = [];
    for (const seg of segments) {
      points.push(new THREE.Vector3(seg[0], seg[1], seg[2]));
      points.push(new THREE.Vector3(seg[3], seg[4], seg[5]));
    }
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [segments]);

  React.useEffect(() => {
    return () => {
      if (geometry) geometry.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry} renderOrder={999}>
      <lineBasicMaterial color="#fbbf24" depthTest={false} depthWrite={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

function CameraAutoFit({ modelData, controlsRef }) {
  const { camera } = useThree();

  React.useEffect(() => {
    if (!modelData?.positions?.length) return;

    const box = new THREE.Box3();
    const pos = modelData.positions;
    const point = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      point.set(pos[i], pos[i + 1], pos[i + 2]);
      box.expandByPoint(point);
    }

    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDim * 1.9;

      camera.position.set(center.x + distance * 0.55, center.y + distance * 0.45, center.z + distance);
      camera.near = Math.max(0.01, maxDim / 500);
      camera.far = Math.max(2000, maxDim * 30);
      camera.updateProjectionMatrix();

      if (controlsRef?.current) {
        controlsRef.current.target.set(center.x, center.y, center.z);
        controlsRef.current.update();
      }
    }
  }, [modelData, camera, controlsRef]);

  return null;
}

const toAbsolutePathFromLocalProtocol = (value) => {
  const text = String(value || '');
  if (!text.startsWith('local-file://')) return text;
  return decodeURIComponent(text.slice('local-file://'.length));
};

const resolveBundledAssetAbsolutePath = (fileName) => {
  if (!(typeof window !== 'undefined' && window.require)) return '';
  const fs = window.require('fs');
  const nodePath = window.require('path');
  const candidates = [];
  const resourcesPath = (typeof process !== 'undefined' && process.resourcesPath) ? process.resourcesPath : '';
  const cwd = (typeof process !== 'undefined' && process.cwd) ? process.cwd() : '';

  if (resourcesPath) {
    candidates.push(nodePath.join(resourcesPath, 'build', fileName));
  }
  if (cwd) {
    candidates.push(nodePath.join(cwd, 'build', fileName));
    candidates.push(nodePath.join(cwd, 'public', fileName));
  }

  for (const filePath of candidates) {
    if (filePath && fs.existsSync(filePath)) return filePath;
  }
  return '';
};

const readGameTextureAsPngDataUrl = async (absolutePath) => {
  const perf = isModelInspectPerfDebug();
  const totalStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  if (typeof window === 'undefined' || !window.require) return null;
  const electron = window.require('electron');
  const ipcRenderer = electron?.ipcRenderer;
  if (!ipcRenderer) return null;
  try {
    const nativeStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const native = await ipcRenderer.invoke('texture:decodeToDataUrl', { filePath: absolutePath });
    if (native?.success && native?.dataUrl) {
      if (perf) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        console.log('[modelInspect:perf] native decode', {
          file: absolutePath,
          totalMs: +(now - totalStart).toFixed(2),
          nativeCallMs: +(now - nativeStart).toFixed(2),
          nativeDecodeMs: native.decodeMs,
          nativeEncodeMs: native.encodeMs,
          nativeTotalMs: native.nativeTotalMs,
        });
      }
      return native.dataUrl;
    }
    if (perf || native?.error) {
      console.warn('[modelInspect:perf] native decode returned no data', {
        file: absolutePath,
        success: native?.success,
        error: native?.error || '',
      });
    }
  } catch {
    if (perf) {
      console.warn('[modelInspect:perf] native decode threw', { file: absolutePath });
    }
    return null;
  }
  return null;
};

const resolveTextureSource = async (textureUrl) => {
  let source = String(textureUrl || '');
  const absPath = toAbsolutePathFromLocalProtocol(source);
  const lower = absPath.toLowerCase();
  if (lower.endsWith('.tex') || lower.endsWith('.dds')) {
    const dataUrl = await readGameTextureAsPngDataUrl(absPath);
    if (!dataUrl) return null;
    return dataUrl;
  }
  return source;
};

const readBundledFloorAsPngDataUrl = async () => {
  try {
    if (typeof window !== 'undefined' && window.require) {
      const fs = window.require('fs');
      const filePath = resolveBundledAssetAbsolutePath('floor.dds');
      if (filePath && fs.existsSync(filePath)) {
        return readGameTextureAsPngDataUrl(filePath);
      }
    }

    // No JS decode fallback for model inspect textures.
    return null;
  } catch {
    return null;
  }
};

const readBundledSkyboxAsPngDataUrl = async () => {
  try {
    if (typeof window !== 'undefined' && window.require) {
      const fs = window.require('fs');
      const filePath = resolveBundledAssetAbsolutePath('riots_sru_skybox_cubemap.dds');
      if (filePath && fs.existsSync(filePath)) {
        return readGameTextureAsPngDataUrl(filePath);
      }
    }

    // No JS decode fallback for model inspect textures.
    return null;
  } catch {
    return null;
  }
};

function SceneBackground({ texture, enabled }) {
  const { scene } = useThree();
  const fallbackColor = React.useMemo(() => new THREE.Color('#0c0a12'), []);

  React.useEffect(() => {
    if (enabled && texture) {
      scene.background = texture;
    } else {
      scene.background = fallbackColor;
    }
    return () => {
      scene.background = fallbackColor;
    };
  }, [scene, texture, enabled, fallbackColor]);

  return null;
}

class WebGLErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || error || 'WebGL initialization failed') };
  }

  componentDidCatch() {
    // keep silent: UI fallback is enough for this modal
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(8,8,14,0.65)',
        }}>
          <div style={{ maxWidth: 520, textAlign: 'center', fontSize: '0.82rem', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>WebGL context could not be created.</div>
            <div style={{ opacity: 0.85 }}>{this.state.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ModelMesh({ modelData, visibleSubmeshes, wireframe, flatLighting, showSkeleton, skeletonSegments, skinningMatrices, textureCache }) {

  const skinnedPositions = React.useMemo(() => {
    if (!modelData?.positions) return null;
    const out = new Float32Array(modelData.positions);
    const hasSkinData = modelData?.boneIndices && modelData?.boneWeights && modelData?.skeleton?.influences;
    if (!hasSkinData || !skinningMatrices || !skinningMatrices.size) return out;

    const infRemap = modelData.skeleton.influences || [];
    const idx = modelData.boneIndices;
    const w = modelData.boneWeights;
    const src = modelData.positions;
    const v = new THREE.Vector3();
    const tv = new THREE.Vector3();
    const acc = new THREE.Vector3();

    for (let i = 0, vi = 0; i < src.length; i += 3, vi++) {
      const ox = src[i + 0];
      const oy = src[i + 1];
      const oz = src[i + 2];
      v.set(ox, oy, oz);
      acc.set(0, 0, 0);
      let total = 0;

      for (let k = 0; k < 4; k++) {
        const weight = w[vi * 4 + k];
        if (weight <= 0.0001) continue;
        const infIdx = idx[vi * 4 + k];
        const jointId = (infRemap[infIdx] != null) ? infRemap[infIdx] : infIdx;
        const m = skinningMatrices.get(jointId);
        if (!m) continue;
        tv.copy(v).applyMatrix4(m);
        acc.addScaledVector(tv, weight);
        total += weight;
      }

      if (total > 0.0001) {
        if (Math.abs(total - 1) > 0.001) acc.multiplyScalar(1 / total);
        out[i + 0] = acc.x;
        out[i + 1] = acc.y;
        out[i + 2] = acc.z;
      } else {
        out[i + 0] = ox;
        out[i + 1] = oy;
        out[i + 2] = oz;
      }
    }

    return out;
  }, [modelData?.positions, modelData?.boneIndices, modelData?.boneWeights, modelData?.skeleton?.influences, skinningMatrices]);

  const geometries = React.useMemo(() => {
    if (!modelData) return [];

    const basePos = skinnedPositions || modelData.positions;
    const baseNrm = modelData.normals;
    const baseUvs = modelData.uvs;
    const baseIdx = modelData.indices;

    return (modelData.submeshes || []).map((submesh) => {
      const start = Math.max(0, submesh.indexStart || 0);
      const end = Math.min(baseIdx.length, start + (submesh.indexCount || 0));
      const subIdx = baseIdx.slice(start, end);

      // Some SKN variants store submesh-local indices. If index range fits within
      // submesh vertexCount, offset by vertexStart to get global vertex indices.
      let adjustedIdx = subIdx;
      if (submesh.vertexStart > 0 && submesh.vertexCount > 0 && subIdx.length > 0) {
        let maxLocal = -1;
        for (let i = 0; i < subIdx.length; i++) {
          if (subIdx[i] > maxLocal) maxLocal = subIdx[i];
        }
        if (maxLocal < submesh.vertexCount) {
          adjustedIdx = new Uint32Array(subIdx.length);
          for (let i = 0; i < subIdx.length; i++) {
            adjustedIdx[i] = subIdx[i] + submesh.vertexStart;
          }
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(basePos, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(baseNrm, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(baseUvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(adjustedIdx, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return { id: submesh.id, name: submesh.name, geometry };
    });
  }, [modelData, skinnedPositions]);

  React.useEffect(() => {
    return () => {
      for (const item of geometries) {
        item.geometry?.dispose?.();
      }
    };
  }, [geometries]);

  if (!modelData) return null;

  const MaterialTag = flatLighting ? 'meshBasicMaterial' : 'meshStandardMaterial';

  return (
    <group>
      {geometries.map((item) => {
        if (!visibleSubmeshes.has(item.id)) return null;
        const hasTex = textureCache.has(item.id);
        return (
          <mesh key={item.id} geometry={item.geometry}>
            <MaterialTag
              key={`${item.id}_${flatLighting ? 'flat' : 'std'}_${hasTex ? 'tex' : 'notex'}`}
              color={hasTex ? '#ffffff' : colorFromName(item.name)}
              map={textureCache.get(item.id) || null}
              wireframe={wireframe}
              transparent={false}
              alphaTest={hasTex ? 0.08 : 0}
              depthWrite
            />
          </mesh>
        );
      })}
      {showSkeleton && (skeletonSegments?.length > 0 || modelData.skeleton?.segments?.length > 0) && (
        <SkeletonLines segments={skeletonSegments?.length ? skeletonSegments : modelData.skeleton.segments} />
      )}
    </group>
  );
}

export default function ModelViewport({
  modelData,
  visibleSubmeshes,
  wireframe = false,
  flatLighting = false,
  showSkeleton = false,
  showGroundTexture = true,
  showSkybox = true,
  skeletonSegments = null,
  skinningMatrices = null,
  height = '100%',
  minHeight = 460,
}) {
  const controlsRef = React.useRef(null);
  const textureLoader = React.useMemo(() => new THREE.TextureLoader(), []);
  const [textureCache, setTextureCache] = React.useState(new Map());
  const [texturesReady, setTexturesReady] = React.useState(false);
  const [groundTexture, setGroundTexture] = React.useState(null);
  const [skyboxTexture, setSkyboxTexture] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const perf = isModelInspectPerfDebug();
    const batchStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const preloadTextures = async () => {
      if (!modelData) {
        setTexturesReady(false);
        return;
      }

      const sourceMap = modelData?.submeshTextureMap || {};
      const entries = Object.entries(sourceMap);

      if (entries.length === 0) {
        setTextureCache((prev) => {
          prev.forEach((t) => t.dispose());
          return new Map();
        });
        setTexturesReady(true);
        return;
      }

      setTexturesReady(false);
      const loaded = new Map();

      for (const [submeshId, textureUrl] of entries) {
        if (cancelled) break;
        try {
          const itemStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const source = await resolveTextureSource(textureUrl);
          const resolvedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          if (!source) continue;
          const texture = await textureLoader.loadAsync(source);
          const loadedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          texture.flipY = false;
          configureTextureForGpu(texture, {
            maxDim: MAX_MODEL_TEXTURE_DIM,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
          });
          loaded.set(submeshId, texture);
          if (perf) {
            console.log('[modelInspect:perf] submesh texture loaded', {
              submeshId,
              resolveMs: +(resolvedAt - itemStart).toFixed(2),
              loaderMs: +(loadedAt - resolvedAt).toFixed(2),
              totalMs: +(loadedAt - itemStart).toFixed(2),
              sourceType: String(textureUrl || '').toLowerCase().endsWith('.png') ? 'png' : 'game-texture',
            });
          }
        } catch {
          // Falls back to material color.
        }
      }

      if (cancelled) {
        loaded.forEach((t) => t.dispose());
        return;
      }

      setTextureCache((prev) => {
        prev.forEach((t) => t.dispose());
        return loaded;
      });
      setTexturesReady(true);
      if (perf) {
        const done = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        console.log('[modelInspect:perf] preload complete', {
          entryCount: entries.length,
          loadedCount: loaded.size,
          totalMs: +(done - batchStart).toFixed(2),
        });
      }
    };

    preloadTextures();
    return () => { cancelled = true; };
  }, [modelData, textureLoader]);

  React.useEffect(() => () => {
    setTextureCache((prev) => {
      prev.forEach((t) => t.dispose());
      return new Map();
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const perf = isModelInspectPerfDebug();
    const loadGroundTexture = async () => {
      if (!showGroundTexture) return;
      if (groundTexture) return;
      try {
        const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const dataUrl = await readBundledFloorAsPngDataUrl();
        const decodedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!dataUrl || cancelled) return;
        const tex = await textureLoader.loadAsync(dataUrl);
        const loadedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (cancelled) {
          tex.dispose();
          return;
        }
        configureTextureForGpu(tex, {
          maxDim: MAX_ENV_TEXTURE_DIM,
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
        });
        tex.repeat.set(1, 1);
        setGroundTexture(tex);
        if (perf) {
          console.log('[modelInspect:perf] ground texture loaded', {
            decodeMs: +(decodedAt - start).toFixed(2),
            loaderMs: +(loadedAt - decodedAt).toFixed(2),
            totalMs: +(loadedAt - start).toFixed(2),
          });
        }
      } catch {
        // Optional visual layer; fail silently.
      }
    };
    loadGroundTexture();
    return () => { cancelled = true; };
  }, [showGroundTexture, groundTexture, textureLoader]);

  React.useEffect(() => () => {
    if (groundTexture) groundTexture.dispose();
  }, [groundTexture]);

  React.useEffect(() => {
    let cancelled = false;
    const perf = isModelInspectPerfDebug();
    const loadSkybox = async () => {
      if (!showSkybox) return;
      if (skyboxTexture) return;
      try {
        const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const source = await readBundledSkyboxAsPngDataUrl();
        const decodedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!source) return;
        const tex = await textureLoader.loadAsync(source);
        const loadedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!tex || !tex.image || cancelled) {
          tex?.dispose?.();
          return;
        }
        configureTextureForGpu(tex, {
          maxDim: MAX_ENV_TEXTURE_DIM,
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
        });
        tex.mapping = THREE.EquirectangularReflectionMapping;
        setSkyboxTexture(tex);
        if (perf) {
          console.log('[modelInspect:perf] skybox loaded', {
            decodeMs: +(decodedAt - start).toFixed(2),
            loaderMs: +(loadedAt - decodedAt).toFixed(2),
            totalMs: +(loadedAt - start).toFixed(2),
          });
        }
      } catch {
        // Optional visual layer; fail silently.
      }
    };
    loadSkybox();
    return () => { cancelled = true; };
  }, [showSkybox, skyboxTexture, textureLoader]);

  React.useEffect(() => {
    if (showSkybox) return;
    setSkyboxTexture((prev) => {
      if (prev) prev.dispose();
      return null;
    });
  }, [showSkybox]);

  React.useEffect(() => () => {
    if (skyboxTexture) skyboxTexture.dispose();
  }, [skyboxTexture]);

  return (
    <div style={{ width: '100%', height, minHeight, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(12,10,18,0.55)' }}>
      {!texturesReady ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.9)' }}>
            <div style={{ width: 24, height: 24, border: '3px solid rgba(255,255,255,0.28)', borderTopColor: '#fff', borderRadius: '50%', animation: 'modeltexspin 0.7s linear infinite' }} />
            <div style={{ fontSize: '0.8rem' }}>Loading textures...</div>
          </div>
          <style>{`
            @keyframes modeltexspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      ) : (
        <WebGLErrorBoundary>
          <Canvas
            dpr={[1, 1.25]}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: 'low-power',
              preserveDrawingBuffer: false,
              depth: true,
              stencil: false,
              failIfMajorPerformanceCaveat: false,
            }}
            onCreated={({ gl }) => {
              const canvas = gl.domElement;
              canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
            }}
          >
            <SceneBackground texture={skyboxTexture} enabled={showSkybox} />
            <PerspectiveCamera makeDefault position={[3.2, 2.2, 3.2]} fov={45} />
            <CameraAutoFit modelData={modelData} controlsRef={controlsRef} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 5, 2]} intensity={1.2} />
            <directionalLight position={[-3, 2, -2]} intensity={0.35} />
            <Grid args={[14, 14]} cellSize={1} cellThickness={0.7} sectionSize={7} sectionThickness={1} />
            {showGroundTexture && groundTexture && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[520, 520]} />
                <meshStandardMaterial map={groundTexture} />
              </mesh>
            )}
            <axesHelper args={[2]} />
            <ModelMesh
              modelData={modelData}
              visibleSubmeshes={visibleSubmeshes}
              wireframe={wireframe}
              flatLighting={flatLighting}
              showSkeleton={showSkeleton}
              skeletonSegments={skeletonSegments}
              skinningMatrices={skinningMatrices}
              textureCache={textureCache}
            />
            <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </div>
  );
}
