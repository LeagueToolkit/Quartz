/* Emitter texture hover preview + context menu (Tauri port of the original
   textureHoverPreview.js). On hover over an emitter's preview button we resolve
   its texture rel path to a disk file, decode it to RGBA via the imgrecolor
   backend, and float a small thumbnail. Right-click opens a context menu with
   the actions that make sense in Tauri (reveal in file manager, open in
   ImgRecolor). Mesh/3D previews from the original are out of scope here.

   Hardened against hover storms: the show is debounced, every async step is
   guarded by a staleness token, decodes run one at a time through a queue that
   skips stale requests, results are cached per disk path, and oversized
   textures are refused instead of blocking the main thread on huge base64
   payloads. */

import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { imgRecolorDecodeTexture } from '@/lib/api/imgrecolor';
import { portResolveAssetPath } from '@/lib/api/wad';
import type { VfxEmitter } from '../model';

const PREVIEW_ID = 'port-texture-hover-preview';
const MENU_ID = 'port-texture-hover-context-menu';
const SHOW_DELAY = 180;
/* Base64 length cap (~36MB raw RGBA, comfortably fits 2048x2048). Bigger
   buffers take seconds to convert on the main thread. */
const MAX_RGBA_B64 = 48_000_000;
const CACHE_CAP = 24;

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
/* Bumped whenever the preview is (re)opened or closed; async work compares its
   captured token after every await and bails when stale. */
let hoverToken = 0;
/* Serializes decode invokes: one in flight, stale entries skip themselves. */
let decodeChain: Promise<void> = Promise.resolve();
/* diskPath -> data URL, or null when decode failed / texture too large. */
const dataUrlCache = new Map<string, string | null>();

interface HoverState {
    texturePath: string;
    diskPath: string | null;
}

const lastHover = new Map<string, HoverState>();

function cancelShow() {
    if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
    }
}

function removeMenu() {
    document.getElementById(MENU_ID)?.remove();
}

function removePreview() {
    hoverToken++;
    cancelShow();
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

function rememberInCache(diskPath: string, url: string | null) {
    if (dataUrlCache.size >= CACHE_CAP) {
        const oldest = dataUrlCache.keys().next().value;
        if (oldest !== undefined) dataUrlCache.delete(oldest);
    }
    dataUrlCache.set(diskPath, url);
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

function pickTexturePaths(emitter: VfxEmitter): string[] {
    // Show every texture the emitter references, deduped, capped so a pathological
    // emitter can't spawn a hundred decodes.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of emitter.textures || []) {
        const key = t.toLowerCase();
        if (t && !seen.has(key)) {
            seen.add(key);
            out.push(t);
        }
        if (out.length >= 8) break;
    }
    return out;
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

function applyResult(host: HTMLElement, url: string | null) {
    if (!url) {
        host.textContent = 'PREVIEW UNAVAILABLE';
        return;
    }
    host.textContent = '';
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    host.appendChild(img);
}

/* One tile per texture: a slot id we can find again after the async decode
   plus the caption. */
function tileId(index: number): string {
    return `${PREVIEW_ID}-img-${index}`;
}

function buildPreviewDom(texturePaths: string[], anchor: DOMRect): void {
    const preview = document.createElement('div');
    preview.id = PREVIEW_ID;
    preview.style.cssText = `
        position: fixed; z-index: 10000; width: 260px; max-height: 80vh; overflow-y: auto;
        background: rgba(15,15,20,0.96);
        backdrop-filter: blur(12px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
        padding: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        display: flex; flex-direction: column; gap: 10px; pointer-events: auto;`;

    const header = texturePaths.length > 1 ? `PREVIEW (${texturePaths.length})` : 'PREVIEW';
    const tiles = texturePaths
        .map((path, i) => {
            const short = path.split(/[/\\]/).pop() || path;
            return `
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <div id="${tileId(i)}" style="width: 100%; height: 150px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background-image: linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px; color: rgba(255,255,255,0.4); font-size: 11px; font-family: 'var(--font-mono)', monospace;">LOADING...</div>
            <div style="font-family: 'var(--font-mono)', monospace; font-size: 9px; color: rgba(255,255,255,0.5); word-break: break-all; line-height: 1.35;" title="${escapeHtml(path)}">${escapeHtml(short)}</div>
        </div>`;
        })
        .join('');

    preview.innerHTML = `
        <div style="color: var(--accent); font-family: 'var(--font-mono)', monospace; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em;">${header}</div>
        ${tiles}`;
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
}

/* Resolve + decode one texture into its tile. Guarded by the hover token and
   the per-disk-path cache; decodes are serialized through decodeChain. */
async function loadTile(index: number, texturePath: string, binPath: string, token: number): Promise<void> {
    const diskPath = await portResolveAssetPath(texturePath, binPath).catch(() => null);
    if (token !== hoverToken) return;
    if (index === 0) lastHover.set(PREVIEW_ID, { texturePath, diskPath });

    const host = document.getElementById(tileId(index));
    if (!host) return;
    if (!diskPath) {
        host.textContent = 'NOT ON DISK';
        return;
    }

    const cached = dataUrlCache.get(diskPath);
    if (cached !== undefined) {
        applyResult(host, cached);
        return;
    }

    decodeChain = decodeChain.then(async () => {
        if (token !== hoverToken) return;
        let url: string | null = null;
        try {
            const decoded = await imgRecolorDecodeTexture(diskPath);
            if (decoded.rgba.length <= MAX_RGBA_B64) {
                url = rgbaToDataUrl(decoded.rgba, decoded.width, decoded.height);
            }
        } catch {
            /* decode failed; cache the miss so re-hovers do not retry */
        }
        rememberInCache(diskPath, url);
        if (token !== hoverToken) return;
        const liveHost = document.getElementById(tileId(index));
        if (liveHost) applyResult(liveHost, url);
    });
}

async function showPreview(texturePaths: string[], binPath: string, anchor: DOMRect): Promise<void> {
    removePreview();
    const token = hoverToken;
    buildPreviewDom(texturePaths, anchor);
    for (let i = 0; i < texturePaths.length; i++) {
        if (token !== hoverToken) return;
        void loadTile(i, texturePaths[i], binPath, token);
    }
}

export function handleEmitterTextureMouseEnter(
    event: React.MouseEvent,
    emitter: VfxEmitter,
    binPath: string,
) {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    cancelShow();
    const texturePaths = pickTexturePaths(emitter);
    if (texturePaths.length === 0) return;

    // Capture the anchor now; currentTarget is gone once the handler returns.
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showTimer = setTimeout(() => {
        showTimer = null;
        void showPreview(texturePaths, binPath, anchor).catch(() => {});
    }, SHOW_DELAY);
}

export function handleEmitterTextureMouseLeave() {
    cancelShow();
    scheduleClose(250);
}

export function handleEmitterTextureContextMenu(
    event: React.MouseEvent,
    emitter: VfxEmitter,
    binPath: string,
) {
    event.preventDefault();
    event.stopPropagation();
    cancelShow();
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }

    // Context menu acts on the first texture (reveal / open in ImgRecolor).
    const texturePath = pickTexturePaths(emitter)[0];
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
        font-family: 'var(--font-mono)', monospace; color: rgba(255,255,255,0.92);`;

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

    const clientX = event.clientX;
    const clientY = event.clientY;

    void (async () => {
        try {
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
            let left = clientX + 2;
            let top = clientY - 4;
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
        } catch {
            /* menu construction is best-effort */
        }
    })();
}

export function closeTextureHoverPreview() {
    removePreview();
}
