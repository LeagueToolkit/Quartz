import React from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { loadImageAsDataURL } from '../../filetypes/index.js';

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

const readGameTextureAsPngDataUrl = async (absolutePath) => {
  if (typeof window === 'undefined' || !window.require) return null;
  const fs = window.require('fs');
  const nodeBuffer = fs.readFileSync(absolutePath);
  const arrayBuffer = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength
  );
  const lower = absolutePath.toLowerCase();
  const fileType = lower.endsWith('.dds') ? 'dds' : 'tex';
  return loadImageAsDataURL(arrayBuffer, fileType);
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
  skeletonSegments = null,
  skinningMatrices = null,
  height = '100%',
  minHeight = 460,
}) {
  const controlsRef = React.useRef(null);
  const textureLoader = React.useMemo(() => new THREE.TextureLoader(), []);
  const [textureCache, setTextureCache] = React.useState(new Map());
  const [texturesReady, setTexturesReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

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
          const source = await resolveTextureSource(textureUrl);
          if (!source) continue;
          const texture = await textureLoader.loadAsync(source);
          texture.flipY = false;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.needsUpdate = true;
          loaded.set(submeshId, texture);
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
        <Canvas gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
        }}>
          <color attach="background" args={['#0c0a12']} />
          <PerspectiveCamera makeDefault position={[3.2, 2.2, 3.2]} fov={45} />
          <CameraAutoFit modelData={modelData} controlsRef={controlsRef} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[3, 5, 2]} intensity={1.2} />
          <directionalLight position={[-3, 2, -2]} intensity={0.35} />
          <Grid args={[14, 14]} cellSize={1} cellThickness={0.7} sectionSize={7} sectionThickness={1} />
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
      )}
    </div>
  );
}
