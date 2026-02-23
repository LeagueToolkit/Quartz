import { openAssetPreview } from '../../utils/assets/assetPreviewEvent';
import { processDataURL } from '../../utils/assets/rgbaDataURL';
import { OPEN_SCB_INSPECT_EVENT } from '../model-inspect/ScbInspectModalHost';
import { OPEN_INLINE_MODEL_INSPECT_EVENT } from '../model-inspect/InlineModelInspectHost';

const closeTimers = new Map();
const CONTEXT_MENU_ID = 'shared-texture-hover-context-menu';
const SCB_RENDER_BOOT_ID = '__scb_renderer_boot';
const MESH_TEXTURE_PREF_KEY = 'textureHoverMeshShowTexture';

let threeModulePromise = null;
let scbModulePromise = null;
let sknModulePromise = null;

function isMeshTexturePreviewEnabled() {
  try {
    return localStorage.getItem(MESH_TEXTURE_PREF_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function setMeshTexturePreviewEnabled(enabled) {
  try {
    localStorage.setItem(MESH_TEXTURE_PREF_KEY, enabled ? '1' : '0');
  } catch (_) {
    // Ignore storage failures.
  }
}

const getThreeModule = async () => {
  if (!threeModulePromise) {
    threeModulePromise = import('three');
  }
  return threeModulePromise;
};

const getScbCtor = async () => {
  if (!scbModulePromise) {
    scbModulePromise = import('../../jsritofile/scb.js');
  }
  const mod = await scbModulePromise;
  return mod?.SCB || null;
};

const getSknCtor = async () => {
  if (!sknModulePromise) {
    sknModulePromise = import('../../jsritofile/skn.js');
  }
  const mod = await sknModulePromise;
  return mod?.SKN || null;
};

async function mountScbPreview(hostEl, meshItem) {
  if (!hostEl || !meshItem) return () => { };

  const resolvedPath = meshItem.resolvedDiskPath || meshItem.path;
  if (!resolvedPath || !window.require) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">MESH NOT FOUND</div>';
    return () => { };
  }

  const fs = window.require('fs');
  if (!fs?.existsSync(resolvedPath)) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">MESH FILE MISSING</div>';
    return () => { };
  }

  hostEl.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.55);font-family:'JetBrains Mono',monospace;">Loading mesh...</div>`;

  const THREE = await getThreeModule();
  const SCB = await getScbCtor();
  if (!SCB) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">SCB UNAVAILABLE</div>';
    return () => { };
  }

  const width = Math.max(64, Math.floor(hostEl.clientWidth || 180));
  const height = Math.max(64, Math.floor(hostEl.clientHeight || 140));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  hostEl.innerHTML = '';
  hostEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);

  const amb = new THREE.AmbientLight(0xffffff, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 0.95);
  dir.position.set(2, 3, 4);
  scene.add(amb, dir);

  const scb = new SCB();
  scb.read(resolvedPath);

  const flatIndices = Array.isArray(scb.indices) ? scb.indices : [];
  const positions = Array.isArray(scb.positions) ? scb.positions : [];
  const uvs = Array.isArray(scb.uvs) ? scb.uvs : [];

  if (flatIndices.length === 0 || positions.length === 0) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">EMPTY MESH</div>';
    renderer.dispose();
    return () => { };
  }

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

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0,
    depthWrite: true,
  });

  let hasTextureMap = false;
  if (isMeshTexturePreviewEnabled()) {
    const previewTextureDataUrl = meshItem.texturePreviewDataUrl || meshItem.dataUrl || '';
    if (previewTextureDataUrl) {
      try {
        const tex = new THREE.TextureLoader().load(processDataURL(previewTextureDataUrl));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.premultiplyAlpha = false;
        material.map = tex;
        material.needsUpdate = true;
        hasTextureMap = true;
      } catch (_) {
        // Ignore texture load failure; keep shaded mesh.
      }
    }
  }
  material.alphaTest = hasTextureMap ? 0.08 : 0;

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const bb = geometry.boundingBox;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bb.getCenter(center);
  bb.getSize(size);
  mesh.position.sub(center);

  const radius = Math.max(size.length() * 0.5, 0.5);
  camera.position.set(radius * 1.45, radius * 0.92, radius * 2.15);
  camera.lookAt(0, 0, 0);

  let rafId = 0;
  let disposed = false;

  const tick = () => {
    if (disposed) return;
    mesh.rotation.y += 0.006;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };

  tick();

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    geometry.dispose();
    material.map?.dispose?.();
    material.dispose();
    renderer.dispose();
    if (renderer.domElement?.parentNode === hostEl) {
      hostEl.removeChild(renderer.domElement);
    }
  };
}

async function mountSknPreview(hostEl, meshItem) {
  if (!hostEl || !meshItem) return () => { };

  const resolvedPath = meshItem.resolvedDiskPath || meshItem.path;
  if (!resolvedPath || !window.require) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">MESH NOT FOUND</div>';
    return () => { };
  }

  const fs = window.require('fs');
  if (!fs?.existsSync(resolvedPath)) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">MESH FILE MISSING</div>';
    return () => { };
  }

  hostEl.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.55);font-family:'JetBrains Mono',monospace;">Loading skinned mesh...</div>`;

  const THREE = await getThreeModule();
  const SKN = await getSknCtor();
  if (!SKN) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">SKN UNAVAILABLE</div>';
    return () => { };
  }

  const skn = new SKN();
  skn.read(resolvedPath);

  const vertices = Array.isArray(skn.vertices) ? skn.vertices : [];
  const indices = Array.isArray(skn.indices) ? skn.indices : [];
  if (vertices.length === 0 || indices.length === 0) {
    hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">EMPTY MESH</div>';
    return () => { };
  }

  const width = Math.max(64, Math.floor(hostEl.clientWidth || 180));
  const height = Math.max(64, Math.floor(hostEl.clientHeight || 140));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  hostEl.innerHTML = '';
  hostEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.95);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const posArr = new Float32Array(vertices.length * 3);
  const uvArr = new Float32Array(vertices.length * 2);
  const normalArr = new Float32Array(vertices.length * 3);

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i] || {};
    const p = v.position || { x: 0, y: 0, z: 0 };
    const uv = v.uv || { x: 0, y: 0 };
    const n = v.normal || { x: 0, y: 1, z: 0 };

    posArr[i * 3 + 0] = Number(p.x || 0);
    posArr[i * 3 + 1] = Number(p.y || 0);
    posArr[i * 3 + 2] = Number(p.z || 0);
    uvArr[i * 2 + 0] = Number(uv.x || 0);
    uvArr[i * 2 + 1] = Number(uv.y || 0);
    normalArr[i * 3 + 0] = Number(n.x || 0);
    normalArr[i * 3 + 1] = Number(n.y || 1);
    normalArr[i * 3 + 2] = Number(n.z || 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normalArr, 3));
  geometry.setIndex(Array.from(indices, (v) => Number(v || 0)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0,
    depthWrite: true,
  });

  let hasTextureMap = false;
  if (isMeshTexturePreviewEnabled()) {
    if (meshItem.texturePreviewDataUrl) {
      try {
        const tex = new THREE.TextureLoader().load(processDataURL(meshItem.texturePreviewDataUrl));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.premultiplyAlpha = false;
        material.map = tex;
        material.needsUpdate = true;
        hasTextureMap = true;
      } catch (_) {
        // Ignore texture decode failures.
      }
    }
  }
  material.alphaTest = hasTextureMap ? 0.08 : 0;

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const bb = geometry.boundingBox;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bb.getCenter(center);
  bb.getSize(size);
  mesh.position.sub(center);

  const radius = Math.max(size.length() * 0.5, 0.5);
  camera.position.set(radius * 1.45, radius * 0.92, radius * 2.15);
  camera.lookAt(0, 0, 0);

  let rafId = 0;
  let disposed = false;
  const tick = () => {
    if (disposed) return;
    mesh.rotation.y += 0.006;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  tick();

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    geometry.dispose();
    material.map?.dispose?.();
    material.dispose();
    renderer.dispose();
    if (renderer.domElement?.parentNode === hostEl) hostEl.removeChild(renderer.domElement);
  };
}

function removeTextureContextMenu() {
  const existing = document.getElementById(CONTEXT_MENU_ID);
  if (existing) existing.remove();
}

function openTextureInExternalApp(resolvedPath) {
  if (!resolvedPath || !window.require) return;
  try {
    const { shell } = window.require('electron');
    if (shell) shell.openPath(resolvedPath);
  } catch (err) {
    console.error('Error opening external app:', err);
  }
}

function openTextureInImgRecolor(resolvedPath, onClosePreview) {
  if (!resolvedPath) return;
  try {
    if (onClosePreview) onClosePreview();
    const pathNode = window.require?.('path');
    const dirPath = pathNode ? pathNode.dirname(resolvedPath) : null;
    if (!dirPath) return;

    sessionStorage.setItem('imgRecolorAutoOpen', JSON.stringify({
      autoLoadPath: dirPath,
      autoSelectFile: resolvedPath,
    }));
    window.location.hash = '#/img-recolor';
  } catch (err) {
    console.error('Error opening in ImgRecolor:', err);
  }
}

function isModelFile(pathValue) {
  const lower = String(pathValue || '').toLowerCase();
  return lower.endsWith('.scb') || lower.endsWith('.sco') || lower.endsWith('.skn');
}

function isStaticMeshFile(pathValue) {
  const lower = String(pathValue || '').toLowerCase();
  return lower.endsWith('.scb') || lower.endsWith('.sco');
}

function isSkinnedMeshFile(pathValue) {
  const lower = String(pathValue || '').toLowerCase();
  return lower.endsWith('.skn');
}

function scoreTextureCandidate(tex) {
  const path = String(tex?.resolvedDiskPath || tex?.path || '').toLowerCase();
  const label = String(tex?.label || '').toLowerCase();
  const text = `${label} ${path}`;
  let score = 0;

  if (label.includes('main texture')) score += 200;
  if (text.includes('diffuse')) score += 120;
  if (text.includes('_tx_cm')) score += 110;
  if (text.includes('base') && text.includes('tx')) score += 70;
  if (text.includes('albedo')) score += 90;
  if (path.endsWith('.tex') || path.endsWith('.dds') || path.endsWith('.png')) score += 20;

  if (text.includes('erosion')) score -= 180;
  if (text.includes('mask')) score -= 140;
  if (text.includes('noise')) score -= 120;
  if (text.includes('gradient')) score -= 100;
  if (text.includes('distort')) score -= 100;
  if (text.includes('alpha')) score -= 70;

  return score;
}

function pickBestTexture(textureData = []) {
  if (!Array.isArray(textureData) || textureData.length === 0) return null;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tex of textureData) {
    const s = scoreTextureCandidate(tex);
    if (s > bestScore) {
      best = tex;
      bestScore = s;
    }
  }
  return best || textureData[0] || null;
}

function openInScbInspect(pathValue, texturePath, onClosePreview) {
  if (!pathValue) return;
  try {
    if (onClosePreview) onClosePreview();
    window.dispatchEvent(new CustomEvent(OPEN_SCB_INSPECT_EVENT, {
      detail: {
        path: pathValue,
        texturePath: texturePath || '',
      },
    }));
  } catch (err) {
    console.error('Error opening SCB inspect modal:', err);
  }
}

function openInInlineModelInspect(data, onClosePreview) {
  if (!data) return;
  const modelPath = data.resolvedDiskPath || data.path;
  if (!modelPath) return;
  try {
    if (onClosePreview) onClosePreview();
    window.dispatchEvent(new CustomEvent(OPEN_INLINE_MODEL_INSPECT_EVENT, {
      detail: {
        modelPath,
        skeletonPath: data.resolvedSkeletonPath || data.skeletonPath || '',
        animationPath: data.resolvedAnimationPath || data.animationPath || '',
        texturePath: data.texturePath || '',
      },
    }));
  } catch (err) {
    console.error('Error opening inline model inspect modal:', err);
  }
}

function showTextureContextMenu({ x, y, data, onClosePreview, onRefreshPreview, previewId = 'shared-texture-hover-preview' }) {
  removeTextureContextMenu();
  if (!data) return;

  const menu = document.createElement('div');
  menu.id = CONTEXT_MENU_ID;
  menu.style.cssText = `
    position: fixed;
    z-index: 11050;
    min-width: 210px;
    background: rgba(12, 12, 18, 0.98);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
    padding: 6px;
    font-family: 'JetBrains Mono', monospace;
    color: rgba(255, 255, 255, 0.92);
  `;

  const makeItem = (label, onClick, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.disabled = disabled;
    item.style.cssText = `
      width: 100%;
      display: block;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 7px;
      color: ${disabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)'};
      padding: 8px 10px;
      font-size: 11px;
      letter-spacing: 0.03em;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
    `;
    if (!disabled) {
      item.onmouseenter = () => { item.style.background = 'rgba(255,255,255,0.08)'; };
      item.onmouseleave = () => { item.style.background = 'transparent'; };
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeTextureContextMenu();
        onClick();
      };
    }
    return item;
  };

  const resolvedPath = data.resolvedDiskPath || data.path;
  const canUseExternal = Boolean(resolvedPath);
  const canInspectModel = isModelFile(resolvedPath);

  if (!canInspectModel) {
    menu.appendChild(makeItem('Open in External App', () => {
      openTextureInExternalApp(resolvedPath);
    }, !canUseExternal));

    menu.appendChild(makeItem('Open in ImgRecolor', () => {
      openTextureInImgRecolor(resolvedPath, onClosePreview);
    }, !resolvedPath));
  }

  menu.appendChild(makeItem('Open in Asset Preview', () => {
    if (onClosePreview) onClosePreview();
    openAssetPreview(resolvedPath, data.dataUrl);
  }, !resolvedPath));

  if (canInspectModel) {
    if (data?.type === 'mesh') {
      menu.appendChild(makeItem(
        `${isMeshTexturePreviewEnabled() ? '☑' : '☐'} Show Texture (Mesh Preview)`,
        () => {
          const next = !isMeshTexturePreviewEnabled();
          setMeshTexturePreviewEnabled(next);
          if (typeof onRefreshPreview === 'function') onRefreshPreview();
        }
      ));
    }

    menu.appendChild(makeItem('Inspect Model', () => {
      if (isSkinnedMeshFile(resolvedPath)) {
        openInInlineModelInspect(data, onClosePreview);
      } else {
        openInScbInspect(resolvedPath, data.texturePath || '', onClosePreview);
      }
    }, !resolvedPath));
  }

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
  if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;
  if (left < 10) left = 10;
  if (top < 10) top = 10;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const closeMenu = () => {
    removeTextureContextMenu();
    const previewEl = document.getElementById(previewId);
    if (previewEl && !previewEl.matches(':hover')) {
      scheduleTextureHoverClose(previewId, 120);
    }
  };
  const onMouseDown = (e) => {
    if (!menu.contains(e.target)) closeMenu();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeMenu();
  };

  setTimeout(() => {
    document.addEventListener('mousedown', onMouseDown, { once: true });
    document.addEventListener('contextmenu', onMouseDown, { once: true });
    document.addEventListener('keydown', onKeyDown, { once: true });
    window.addEventListener('scroll', closeMenu, { once: true });
    window.addEventListener('resize', closeMenu, { once: true });
  }, 0);
}

export function cancelTextureHoverClose(previewId = 'shared-texture-hover-preview') {
  const timer = closeTimers.get(previewId);
  if (timer) {
    clearTimeout(timer);
    closeTimers.delete(previewId);
  }
}

export function scheduleTextureHoverClose(previewId = 'shared-texture-hover-preview', delay = 500) {
  cancelTextureHoverClose(previewId);
  const timer = setTimeout(() => {
    if (document.getElementById(CONTEXT_MENU_ID)) {
      closeTimers.delete(previewId);
      return;
    }
    removeTextureHoverPreview(previewId);
    closeTimers.delete(previewId);
  }, delay);
  closeTimers.set(previewId, timer);
}

export function removeTextureHoverPreview(previewId = 'shared-texture-hover-preview') {
  cancelTextureHoverClose(previewId);
  removeTextureContextMenu();
  const existing = document.getElementById(previewId);
  if (existing) {
    const cleanups = existing[SCB_RENDER_BOOT_ID];
    if (Array.isArray(cleanups)) {
      for (const dispose of cleanups) {
        try { if (typeof dispose === 'function') dispose(); } catch (_) { }
      }
    }
    existing.remove();
  }
}

export function showTextureHoverPreview({
  previewId = 'shared-texture-hover-preview',
  textureData = [],
  meshData = [],
  buttonElement,
  colorData = [],
}) {
  if (!buttonElement || (!textureData.length && !meshData.length)) return;

  removeTextureHoverPreview(previewId);

  const rect = buttonElement.getBoundingClientRect();
  const textureCount = textureData.length;
  const totalCount = textureCount + meshData.length;

  let cols = 1;
  let previewWidth = 260;
  let itemSize = '200px';
  if (totalCount === 2) { cols = 2; previewWidth = 380; itemSize = '150px'; }
  else if (totalCount <= 4) { cols = 2; previewWidth = 400; itemSize = '160px'; }
  else if (totalCount <= 6) { cols = 3; previewWidth = 520; itemSize = '140px'; }
  else if (totalCount > 6) { cols = 3; previewWidth = 560; itemSize = '130px'; }

  const preview = document.createElement('div');
  preview.id = previewId;
  preview.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: rgba(15, 15, 20, 0.96);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    gap: 14px;
    pointer-events: auto;
    width: ${previewWidth}px;
    max-height: ${window.innerHeight - 40}px;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
    transition: opacity 0.2s ease;
  `;

  const gridStyle = totalCount === 1
    ? 'display: flex; justify-content: center;'
    : `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px;`;

  const bestTexture = pickBestTexture(textureData);
  const fallbackTexturePath = bestTexture?.resolvedDiskPath || bestTexture?.path || '';
  const fallbackTextureDataUrl = bestTexture?.dataUrl || '';
  const previewItems = [
    ...textureData.map((data) => ({ type: 'texture', ...data })),
    ...meshData.map((data) => ({
      type: 'mesh',
      ...data,
      texturePath: fallbackTexturePath || data.texturePath || '',
      texturePreviewDataUrl: fallbackTextureDataUrl || data.texturePreviewDataUrl || '',
    })),
  ];

  const itemsHtml = previewItems.map((data, idx) => {
    const fileName = (data.path || '').split(/[/\\]/).pop();
    const imageOrMesh = data.type === 'mesh'
      ? `<div class="mesh-preview-host" data-mesh-idx="${idx}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 40%, rgba(0,0,0,0.12) 100%);"></div>`
      : (data.dataUrl
        ? `<img src="${processDataURL(data.dataUrl)}" style="width: 100%; height: 100%; object-fit: contain;" />`
        : `<div style="color: rgba(255,255,255,0.2); font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 500;">LOADING...</div>`);

    return `
      <div class="texture-item" data-idx="${idx}" title="Left-click: Asset Preview | Right-click: More actions" style="cursor: pointer; display: flex; flex-direction: column; gap: 8px; align-items: center; transition: all 0.2s ease; min-width: 0;">
        <div style="width: 100%; height: ${itemSize}; background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%), linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          ${imageOrMesh}
        </div>
        <div style="width: 100%; text-align: center; font-family: 'JetBrains Mono', monospace; color: var(--accent); overflow: hidden;">
          <div style="font-size: 8px; opacity: 0.5; margin-bottom: 2px; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName || ''}</div>
          <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.08em; opacity: 0.9;">${(data.label || (data.type === 'mesh' ? 'Mesh' : '')).toUpperCase()}</div>
        </div>
      </div>
    `;
  }).join('');

  let colorSwatches = '';
  if (Array.isArray(colorData) && colorData.length > 0) {
    const colors = [];
    colorData.forEach((c) => {
      if (Array.isArray(c.colors) && c.colors.length > 0) colors.push(...c.colors);
    });
    const unique = Array.from(new Set(colors)).slice(0, 8);
    if (unique.length > 0) {
      colorSwatches = `
        <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); margin-top: 4px;">
          ${unique.map((col) => `<div style="width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.25); background: ${col}; box-shadow: 0 2px 6px rgba(0,0,0,0.5);" title="${col}"></div>`).join('')}
        </div>
      `;
    }
  }

  preview.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="text-align: left; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.12em; display: flex; align-items: center; gap: 10px; opacity: 0.9;">
        <span style="width: 8px; height: 8px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 8px var(--accent);"></span>
        PREVIEW (${totalCount})
      </div>
      <div style="${gridStyle}">
        ${itemsHtml}
      </div>
      ${colorSwatches}
    </div>
  `;

  document.body.appendChild(preview);

  preview.onmouseenter = () => {
    cancelTextureHoverClose(previewId);
  };
  preview.onmouseleave = () => {
    if (document.getElementById(CONTEXT_MENU_ID)) return;
    scheduleTextureHoverClose(previewId, 300);
  };

  preview[SCB_RENDER_BOOT_ID] = [];
  const mountAllMeshHosts = async () => {
    const previous = preview[SCB_RENDER_BOOT_ID];
    if (Array.isArray(previous)) {
      for (const dispose of previous) {
        try { if (typeof dispose === 'function') dispose(); } catch (_) { }
      }
    }
    preview[SCB_RENDER_BOOT_ID] = [];

    const meshHosts = preview.querySelectorAll('.mesh-preview-host');
    meshHosts.forEach(async (hostEl) => {
      const idx = Number(hostEl.getAttribute('data-mesh-idx'));
      const item = previewItems[idx];
      if (!item || item.type !== 'mesh') return;
      try {
        const pathValue = item.path || item.resolvedDiskPath || '';
        const dispose = isSkinnedMeshFile(pathValue)
          ? await mountSknPreview(hostEl, item)
          : await mountScbPreview(hostEl, item);
        if (Array.isArray(preview[SCB_RENDER_BOOT_ID])) {
          preview[SCB_RENDER_BOOT_ID].push(dispose);
        }
      } catch (_) {
        hostEl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.45);font-family:JetBrains Mono,monospace;">FAILED TO LOAD MESH</div>';
      }
    });
  };

  mountAllMeshHosts();

  preview.querySelectorAll('.texture-item').forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      const data = previewItems[idx];
      if (data) {
        removeTextureHoverPreview(previewId);
        openAssetPreview(data.resolvedDiskPath || data.path, data.dataUrl);
      }
    };

    el.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelTextureHoverClose(previewId);
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      const data = previewItems[idx];
      showTextureContextMenu({
        x: event.clientX + 2,
        y: event.clientY - 4,
        data,
        previewId,
        onClosePreview: () => removeTextureHoverPreview(previewId),
        onRefreshPreview: mountAllMeshHosts,
      });
    };

    el.onmouseenter = () => {
      el.style.transform = 'translateY(-2px)';
      const imgCont = el.querySelector('div');
      if (imgCont) {
        imgCont.style.borderColor = 'var(--accent)';
        imgCont.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
      }
    };

    el.onmouseleave = () => {
      el.style.transform = 'translateY(0)';
      const imgCont = el.querySelector('div');
      if (imgCont) {
        imgCont.style.borderColor = 'rgba(255,255,255,0.08)';
        imgCont.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      }
    };
  });

  const previewRect = preview.getBoundingClientRect();
  let previewTop = rect.top + (rect.height / 2) - (previewRect.height / 2);
  let previewLeft = rect.left - previewWidth - 14;

  if (previewLeft < 10) previewLeft = rect.right + 14;
  if (previewLeft + previewRect.width > window.innerWidth - 10) previewLeft = window.innerWidth - previewRect.width - 10;
  if (previewTop < 10) previewTop = 10;
  if (previewTop + previewRect.height > window.innerHeight - 10) previewTop = window.innerHeight - previewRect.height - 10;

  preview.style.top = `${previewTop}px`;
  preview.style.left = `${previewLeft}px`;
}

export function showTextureHoverError({
  previewId = 'shared-texture-hover-preview',
  texturePath,
  buttonElement,
}) {
  if (!buttonElement) return;

  removeTextureHoverPreview(previewId);

  const rect = buttonElement.getBoundingClientRect();
  const preview = document.createElement('div');
  preview.id = previewId;
  preview.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    color: #ef4444;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    max-width: 250px;
    pointer-events: auto;
  `;
  preview.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
      <div style="font-weight:bold;">Failed to load texture</div>
      <div style="font-size:10px; opacity:0.7; word-break:break-all; text-align:center;">${texturePath || 'Unknown texture'}</div>
    </div>
  `;
  document.body.appendChild(preview);
  preview.onmouseenter = () => {
    cancelTextureHoverClose(previewId);
  };
  preview.onmouseleave = () => {
    scheduleTextureHoverClose(previewId, 300);
  };

  const previewRect = preview.getBoundingClientRect();
  let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
  let left = rect.left - previewRect.width - 14;
  if (left < 10) left = rect.right + 14;
  if (top < 10) top = 10;
  if (top + previewRect.height > window.innerHeight - 10) top = window.innerHeight - previewRect.height - 10;
  preview.style.top = `${top}px`;
  preview.style.left = `${left}px`;
}
