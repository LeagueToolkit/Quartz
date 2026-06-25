/* Emitter texture hover preview + context menu (Tauri port of the original
   textureHoverPreview.js). On hover over an emitter's preview button we resolve
   its texture rel path to a disk file, decode it to RGBA via the imgrecolor
   backend, and float a small thumbnail. Right-click opens a context menu with
   the actions that make sense in Tauri (reveal in file manager, open in
   ImgRecolor). Mesh/3D previews from the original are out of scope here. */

import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { imgRecolorDecodeTexture } from '@/lib/api/imgrecolor';
import { portResolveAssetPath } from '@/lib/api/wad';
import type { VfxEmitter } from './vfxEmitterParser';

const PREVIEW_ID = 'port-texture-hover-preview';
const MENU_ID = 'port-texture-hover-context-menu';
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function removeMenu() {
    document.getElementById(MENU_ID)?.remove();
}

function removePreview() {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    removeMenu();
    document.getElementById(PREVIEW_ID)?.remove();
}

function scheduleClose(delay = 250) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        if (document.getElementById(MENU_ID)) return;
        removePreview();
    }, delay);
}

/* Decode an RGBA buffer into a data URL via an offscreen canvas. */
function rgbaToDataUrl(rgbaB64: string, width: number, height: number): string | null {
    try {
        const bin = atob(rgbaB64);
        const bytes = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.putImageData(new ImageData(bytes, width, height), 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pickTexturePath(emitter: VfxEmitter): string | null {
    if (emitter.texturePath) return emitter.texturePath;
    const all = emitter.allTextures || [];
    const main = all.find((t) => t.label === 'Main Texture');
    return main?.path || all[0]?.path || null;
}

function positionNear(el: HTMLElement, anchor: DOMRect) {
    const rect = el.getBoundingClientRect();
    let top = anchor.top + anchor.height / 2 - rect.height / 2;
    let left = anchor.left - rect.width - 14;
    if (left < 10) left = anchor.right + 14;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
    if (top < 10) top = 10;
    if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
}

interface HoverState {
    texturePath: string;
    diskPath: string | null;
}

const lastHover = new Map<string, HoverState>();

export function handleEmitterTextureMouseEnter(
    event: React.MouseEvent,
    emitter: VfxEmitter,
    binPath: string,
) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    const texturePath = pickTexturePath(emitter);
    if (!texturePath) return;

    const button = event.currentTarget as HTMLElement;
    const anchor = button.getBoundingClientRect();

    removePreview();
    const preview = document.createElement('div');
    preview.id = PREVIEW_ID;
    preview.style.cssText = `
        position: fixed; z-index: 10000; width: 260px;
        background: rgba(15,15,20,0.96);
        backdrop-filter: blur(12px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
        padding: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        display: flex; flex-direction: column; gap: 10px; pointer-events: auto;`;
    preview.innerHTML = `
        <div style="color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em;">PREVIEW</div>
        <div id="${PREVIEW_ID}-img" style="width: 100%; height: 200px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background-image: linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px; color: rgba(255,255,255,0.4); font-size: 11px; font-family: 'JetBrains Mono', monospace;">LOADING...</div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.4); word-break: break-all; line-height: 1.4;">${escapeHtml(texturePath)}</div>`;
    document.body.appendChild(preview);
    positionNear(preview, anchor);

    preview.onmouseenter = () => {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
    };
    preview.onmouseleave = () => {
        if (document.getElementById(MENU_ID)) return;
        scheduleClose(250);
    };

    void (async () => {
        const diskPath = await portResolveAssetPath(texturePath, binPath).catch(() => null);
        lastHover.set(PREVIEW_ID, { texturePath, diskPath });
        const host = document.getElementById(`${PREVIEW_ID}-img`);
        if (!host) return;
        if (!diskPath) {
            host.textContent = 'TEXTURE NOT ON DISK';
            return;
        }
        try {
            const decoded = await imgRecolorDecodeTexture(diskPath);
            const url = rgbaToDataUrl(decoded.rgba, decoded.width, decoded.height);
            if (url) {
                host.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: contain;" />`;
            } else {
                host.textContent = 'DECODE FAILED';
            }
        } catch {
            host.textContent = 'DECODE FAILED';
        }
    })();
}

export function handleEmitterTextureMouseLeave() {
    scheduleClose(250);
}

export function handleEmitterTextureContextMenu(
    event: React.MouseEvent,
    emitter: VfxEmitter,
    binPath: string,
) {
    event.preventDefault();
    event.stopPropagation();
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }

    const texturePath = pickTexturePath(emitter);
    if (!texturePath) return;

    removeMenu();
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.style.cssText = `
        position: fixed; z-index: 11050; min-width: 200px;
        background: rgba(12,12,18,0.98);
        backdrop-filter: blur(10px) saturate(160%);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
        box-shadow: 0 14px 34px rgba(0,0,0,0.45); padding: 6px;
        font-family: 'JetBrains Mono', monospace; color: rgba(255,255,255,0.92);`;

    const makeItem = (label: string, onClick: () => void, disabled = false) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = label;
        item.disabled = disabled;
        item.style.cssText = `
            width: 100%; display: block; text-align: left; background: transparent;
            border: none; border-radius: 7px; padding: 8px 10px; font-size: 11px;
            letter-spacing: 0.03em;
            color: ${disabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)'};
            cursor: ${disabled ? 'not-allowed' : 'pointer'};`;
        if (!disabled) {
            item.onmouseenter = () => (item.style.background = 'rgba(255,255,255,0.08)');
            item.onmouseleave = () => (item.style.background = 'transparent');
            item.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                removePreview();
                onClick();
            };
        }
        return item;
    };

    void (async () => {
        const cached = lastHover.get(PREVIEW_ID);
        const diskPath =
            cached?.texturePath === texturePath && cached.diskPath
                ? cached.diskPath
                : await portResolveAssetPath(texturePath, binPath).catch(() => null);

        menu.appendChild(
            makeItem('Reveal in File Manager', () => {
                if (diskPath) void revealItemInDir(diskPath).catch(() => {});
            }, !diskPath),
        );
        menu.appendChild(
            makeItem('Open in ImgRecolor', () => {
                if (!diskPath) return;
                const dir = diskPath.replace(/[/\\][^/\\]*$/, '');
                sessionStorage.setItem(
                    'imgRecolorAutoOpen',
                    JSON.stringify({ autoLoadPath: dir, autoSelectFile: diskPath }),
                );
                window.location.hash = '#/img-recolor';
            }, !diskPath),
        );

        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        let left = event.clientX + 2;
        let top = event.clientY - 4;
        if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
        if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;
        menu.style.left = `${Math.max(10, left)}px`;
        menu.style.top = `${Math.max(10, top)}px`;

        const close = () => removeMenu();
        setTimeout(() => {
            document.addEventListener('mousedown', (e) => {
                if (!menu.contains(e.target as Node)) close();
            }, { once: true });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') close();
            }, { once: true });
        }, 0);
    })();
}

export function closeTextureHoverPreview() {
    removePreview();
}
