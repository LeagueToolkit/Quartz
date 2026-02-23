import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { SCB } from '../../jsritofile/scb.js';
import { convertTextureToPNG, findActualTexturePath } from '../../utils/assets/textureConverter.js';
import { processDataURL } from '../../utils/assets/rgbaDataURL.js';

/* ── tiny reusable premium components ── */

function Toggle({ checked, onChange, label }) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.76rem', color: 'rgba(255,255,255,0.88)' }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: 34, height: 18, borderRadius: 9, position: 'relative',
        background: checked ? 'var(--accent2)' : 'rgba(255,255,255,0.1)',
        boxShadow: checked ? '0 0 10px color-mix(in srgb, var(--accent2), transparent 60%)' : 'none',
        transition: 'all 0.2s ease', flexShrink: 0,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', position: 'absolute', top: 2,
          left: checked ? 18 : 2, transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: '0.7rem', color: 'var(--accent2)', textTransform: 'uppercase',
      letterSpacing: '0.06em', fontWeight: 700, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Section({ children, style }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)', padding: 12, marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function GhostButton({ children, onClick, style, accent }) {
  const [hovered, setHovered] = useState(false);
  const accentVar = accent ? 'var(--accent)' : null;
  const accent2Var = accent === 2 ? 'var(--accent2)' : null;
  const colorVar = accent2Var || accentVar;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
        border: colorVar
          ? `1px solid ${hovered ? `color-mix(in srgb, ${colorVar}, transparent 40%)` : `color-mix(in srgb, ${colorVar}, transparent 70%)`}`
          : `1px solid ${hovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
        background: colorVar
          ? `color-mix(in srgb, ${colorVar}, transparent ${hovered ? '75%' : '88%'})`
          : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        color: colorVar || 'rgba(255,255,255,0.85)',
        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hovered && colorVar ? `0 0 14px color-mix(in srgb, ${colorVar}, transparent 65%)` : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── helper functions ── */

export function buildGeometryFromScb(scb) {
  const flatIndices = Array.isArray(scb?.indices) ? scb.indices : [];
  const positions = Array.isArray(scb?.positions) ? scb.positions : [];
  const uvs = Array.isArray(scb?.uvs) ? scb.uvs : [];

  if (!flatIndices.length || !positions.length) return null;

  const vertexCount = flatIndices.length;
  const posArr = new Float32Array(vertexCount * 3);
  const uvArr = new Float32Array(vertexCount * 2);

  for (let i = 0; i < flatIndices.length; i++) {
    const sourceIndex = Number(flatIndices[i] || 0);
    const p = positions[sourceIndex] || { x: 0, y: 0, z: 0 };
    const uv = uvs[i] || { x: 0, y: 0 };

    posArr[i * 3 + 0] = Number(p.x || 0);
    posArr[i * 3 + 1] = Number(p.y || 0);
    posArr[i * 3 + 2] = Number(p.z || 0);
    uvArr[i * 2 + 0] = Number(uv.x || 0);
    uvArr[i * 2 + 1] = Number(uv.y || 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function MeshScene({ geometry, textureUrl, wireframe, autoRotate, flatLighting, showTexture }) {
  const texture = useMemo(() => {
    if (!textureUrl || !showTexture) return null;
    const t = new THREE.TextureLoader().load(textureUrl);
    t.flipY = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = false;
    return t;
  }, [textureUrl, showTexture]);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: (showTexture && texture) ? texture : null,
      roughness: 0.66,
      metalness: 0.03,
      wireframe,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: (showTexture && texture) ? 0.08 : 0,
      depthWrite: true,
    });
  }, [texture, wireframe, showTexture]);

  useEffect(() => {
    return () => {
      material.map?.dispose?.();
      material.dispose();
    };
  }, [material]);

  const cameraPos = useMemo(() => {
    if (!geometry?.boundingBox) return [3, 2, 5];
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const radius = Math.max(size.length() * 0.5, 0.6);
    return [radius * 1.55, radius * 1.0, radius * 2.2];
  }, [geometry]);

  return (
    <>
      {flatLighting ? (
        <ambientLight intensity={2.0} />
      ) : (
        <>
          <ambientLight intensity={0.95} />
          <directionalLight intensity={1.0} position={[3, 4, 5]} />
          <directionalLight intensity={0.45} position={[-3, 2, -4]} />
        </>
      )}
      <PerspectiveCamera makeDefault position={cameraPos} fov={42} near={0.01} far={5000} />
      <OrbitControls enablePan enableZoom enableRotate autoRotate={autoRotate} autoRotateSpeed={1.2} />
      {geometry && <mesh geometry={geometry} material={material} />}
    </>
  );
}

export default function ScbInspectModal({
  open,
  filePath,
  texturePath = '',
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [geometry, setGeometry] = useState(null);
  const [stats, setStats] = useState({ vertices: 0, triangles: 0, material: '' });
  const [textureUrl, setTextureUrl] = useState('');
  const [wireframe, setWireframe] = useState(false);
  const [showTexture, setShowTexture] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [flatLighting, setFlatLighting] = useState(true);
  const [closeHover, setCloseHover] = useState(false);

  useEffect(() => {
    if (!open || !filePath) return;
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      setGeometry(null);
      setTextureUrl('');

      try {
        const scb = new SCB();
        scb.read(filePath);
        if (!alive) return;

        const geom = buildGeometryFromScb(scb);
        if (!geom) throw new Error('Invalid or empty SCB mesh');

        setGeometry(geom);
        const matName = String(scb.material || '');
        setStats({
          vertices: Array.isArray(scb.positions) ? scb.positions.length : 0,
          triangles: Array.isArray(scb.indices) ? Math.floor(scb.indices.length / 3) : 0,
          material: matName,
        });

        let resolvedTexturePath = texturePath;

        // If no texture provided, try to find one automatically
        if (!resolvedTexturePath && filePath) {
          const scbDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')));
          const scbBase = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
          const scbNameNoExt = scbBase.replace(/\.scb$/i, '');

          // 1. Try same name as SCB but with .dds or .png in same folder
          const candidates = [
            `${scbDir}/${scbNameNoExt}.dds`,
            `${scbDir}/${scbNameNoExt}.png`,
            `${scbDir}/${scbNameNoExt}.tga`, // though not supported by converter, good for search
          ];

          // Also try common "Texture" subfolders or variations if needed

          for (const cand of candidates) {
            const pathResult = findActualTexturePath(cand);
            if (pathResult) {
              resolvedTexturePath = pathResult;
              break;
            }
          }

          // 2. Fallback: try to find by material name
          if (!resolvedTexturePath && matName) {
            resolvedTexturePath = findActualTexturePath(matName, null, null, scbDir);
          }
        }

        if (resolvedTexturePath) {
          try {
            const dataUrl = await convertTextureToPNG(resolvedTexturePath, null, null, null);
            if (alive && dataUrl) {
              const displayUrl = processDataURL(dataUrl);
              setTextureUrl(displayUrl);
            }
          } catch (_) { }
        }
      } catch (e) {
        if (alive) setError(e?.message || 'Failed to load SCB');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
      setGeometry((prev) => {
        prev?.dispose?.();
        return null;
      });
    };
  }, [open, filePath, texturePath]);

  if (!open) return null;

  const fileName = String(filePath || '').split(/[\\/]/).pop() || '';

  return (
    <div
      style={{
        position: 'fixed',
        top: 32,
        left: 60,
        right: 0,
        bottom: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.78)',
        }}
      />

      {/* modal container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'calc(100% - 32px)',
          maxWidth: 1400,
          maxHeight: 'calc(100% - 32px)',
          overflow: 'hidden',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* accent bar */}
        <div style={{
          height: 3,
          borderRadius: '16px 16px 0 0',
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0 16px' }}>
          <h2 style={{ margin: 0, fontSize: '0.92rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)' }}>
            SCB Inspect
          </h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            style={{
              width: 28, height: 28, borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.08)',
              background: closeHover ? 'color-mix(in srgb, var(--accent2), transparent 75%)' : 'rgba(255,255,255,0.04)',
              color: closeHover ? 'var(--accent2)' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: closeHover ? '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '12px 16px 16px 16px', position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 340px',
              gap: 14,
              alignItems: 'stretch',
              height: 'calc(100vh - 160px)',
              maxHeight: 700,
            }}
          >
            {/* Viewport Area */}
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(8,8,14,0.4)' }}>
              {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,0.85)', fontSize: '0.86rem', zIndex: 2, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
                  <div style={{ width: 30, height: 30, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Loading SCB Model...
                </div>
              )}
              {error ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8a8a', padding: 20, textAlign: 'center' }}>
                  {error}
                </div>
              ) : (
                <Canvas style={{ width: '100%', height: '100%' }} gl={{ antialias: true, alpha: true }}>
                  <MeshScene
                    geometry={geometry}
                    textureUrl={textureUrl}
                    wireframe={wireframe}
                    showTexture={showTexture}
                    autoRotate={autoRotate}
                    flatLighting={flatLighting}
                  />
                </Canvas>
              )}
            </div>

            {/* Sidebar */}
            <div style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
              overflowY: 'auto',
              padding: 14,
            }}>
              <Section>
                <SectionTitle>File</SectionTitle>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.95)', marginBottom: 4, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>{filePath}</div>
              </Section>

              <Section>
                <SectionTitle>Stats</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    ['Vertices', stats.vertices.toLocaleString()],
                    ['Triangles', stats.triangles.toLocaleString()],
                  ].map(([label, val]) => (
                    <div key={label} style={{
                      borderRadius: 6, padding: '6px 8px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                    </div>
                  ))}
                </div>
                {stats.material && (
                  <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Material</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 600, wordBreak: 'break-all' }}>{stats.material}</div>
                  </div>
                )}
              </Section>

              <Section>
                <SectionTitle>Render Options</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Toggle checked={showTexture} onChange={setShowTexture} label="Show Texture" />
                  <Toggle checked={flatLighting} onChange={setFlatLighting} label="Flat Lighting" />
                  <Toggle checked={wireframe} onChange={setWireframe} label="Wireframe" />
                  <Toggle checked={autoRotate} onChange={setAutoRotate} label="Auto Rotate" />
                </div>
              </Section>

              <div style={{ marginTop: 14, fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, fontStyle: 'italic', textAlign: 'center' }}>
                Scroll: zoom · Drag: rotate · Right-drag: pan
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
