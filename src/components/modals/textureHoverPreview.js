import { openAssetPreview } from '../../utils/assets/assetPreviewEvent';
import { processDataURL } from '../../utils/assets/rgbaDataURL';

const closeTimers = new Map();
const CONTEXT_MENU_ID = 'shared-texture-hover-context-menu';

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

function showTextureContextMenu({ x, y, data, onClosePreview, previewId = 'shared-texture-hover-preview' }) {
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

  menu.appendChild(makeItem('Open in External App', () => {
    openTextureInExternalApp(resolvedPath);
  }, !canUseExternal));

  menu.appendChild(makeItem('Open in ImgRecolor', () => {
    openTextureInImgRecolor(resolvedPath, onClosePreview);
  }, !resolvedPath));

  menu.appendChild(makeItem('Open in Asset Preview', () => {
    if (onClosePreview) onClosePreview();
    openAssetPreview(resolvedPath, data.dataUrl);
  }, !resolvedPath));

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
  if (existing) existing.remove();
}

export function showTextureHoverPreview({
  previewId = 'shared-texture-hover-preview',
  textureData = [],
  buttonElement,
  colorData = [],
}) {
  if (!buttonElement || !textureData.length) return;

  removeTextureHoverPreview(previewId);

  const rect = buttonElement.getBoundingClientRect();
  const textureCount = textureData.length;

  let cols = 1;
  let previewWidth = 260;
  let itemSize = '200px';
  if (textureCount === 2) { cols = 2; previewWidth = 380; itemSize = '150px'; }
  else if (textureCount <= 4) { cols = 2; previewWidth = 400; itemSize = '160px'; }
  else if (textureCount <= 6) { cols = 3; previewWidth = 520; itemSize = '140px'; }
  else if (textureCount > 6) { cols = 3; previewWidth = 560; itemSize = '130px'; }

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

  const gridStyle = textureCount === 1
    ? 'display: flex; justify-content: center;'
    : `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px;`;

  const itemsHtml = textureData.map((data, idx) => {
    const fileName = (data.path || '').split(/[/\\]/).pop();
    return `
      <div class="texture-item" data-idx="${idx}" title="Left-click: Asset Preview | Right-click: More actions" style="cursor: pointer; display: flex; flex-direction: column; gap: 8px; align-items: center; transition: all 0.2s ease; min-width: 0;">
        <div style="width: 100%; height: ${itemSize}; background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%), linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          ${data.dataUrl
            ? `<img src="${processDataURL(data.dataUrl)}" style="width: 100%; height: 100%; object-fit: contain;" />`
            : `<div style="color: rgba(255,255,255,0.2); font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 500;">LOADING...</div>`
          }
        </div>
        <div style="width: 100%; text-align: center; font-family: 'JetBrains Mono', monospace; color: var(--accent); overflow: hidden;">
          <div style="font-size: 8px; opacity: 0.5; margin-bottom: 2px; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName || ''}</div>
          <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.08em; opacity: 0.9;">${(data.label || '').toUpperCase()}</div>
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
        TEXTURE PREVIEW (${textureCount})
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

  preview.querySelectorAll('.texture-item').forEach((el) => {
    el.onclick = (event) => {
      event.stopPropagation();
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      const data = textureData[idx];
      if (data) {
        preview.remove();
        openAssetPreview(data.resolvedDiskPath || data.path, data.dataUrl);
      }
    };

    el.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelTextureHoverClose(previewId);
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      const data = textureData[idx];
      showTextureContextMenu({
        x: event.clientX + 2,
        y: event.clientY - 4,
        data,
        previewId,
        onClosePreview: () => preview.remove(),
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
