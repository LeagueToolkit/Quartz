/* Unified texture preview — a single DOM-injected floating panel shared by
   Port, Paint, and the Bin Editor. Promoted from Port's textureHoverPreview,
   generalized to a normalized texture/model input and theme-tokened CSS
   classes (see texturePreview.css).

   Texture tiles decode through the shared image pipeline; SCB/SCO/SKN tiles use
   the native model projection and shared Three.js scene. Right-click exposes
   type-appropriate actions, including model inspection.

   Hardened against hover storms: show is debounced, every async step is guarded
   by a staleness token so stale hovers can't paint into a newer panel. */

import type React from 'react';
import { portResolveAssetPath } from '@/lib/api/wad';
import { explorerReveal, explorerOpenWith } from '@/lib/api/explorer';
import { revealInFileManager } from '@/components/explorer/useFileExplorer';
import { openModelInspect } from '@/lib/model/modelInspectEvent';
import { resolveDiskTextureDataUrl, resolveTextureDataUrl } from './resolveTextureDataUrl';
import './texturePreview.css';

const PREVIEW_ID = 'shared-texture-preview';
const MENU_ID = 'shared-texture-preview-menu';
/* Slight cooldown so brushing past a trigger doesn't flash the preview. */
const DEFAULT_SHOW_DELAY = 320;
/* How far outside the anchor/panel the pointer may stray before we auto-close. */
const CLOSE_SLACK = 24;
/* Show at most this many tiles so a pathological emitter can't spawn 100 decodes. */
const MAX_TILES = 8;

export interface PreviewTexture {
    path: string;
    label?: string;
    kind?: 'texture' | 'model';
    /** Texture to apply to a model preview (asset-relative or absolute). */
    texturePath?: string;
}

export interface TexturePreviewOpts {
    /** Enable the right-click context menu (Reveal / Open in ImgRecolor). */
    contextMenu?: boolean;
    /** Debounce before the panel appears (default 320ms). */
    showDelay?: number;
    /** When set, each tile caption gets an edit (pencil) affordance; clicking it
     *  turns the caption into an input. Committing calls this with the tile's
     *  original path and the new one. The consumer persists the change. */
    onEditPath?: (oldPath: string, newPath: string) => void;
}

/* onEditPath for the panel currently on screen (set on each show). */
let activeEditHandler: ((oldPath: string, newPath: string) => void) | null = null;
let activeContextMenu = false;
let activeBinPath = '';
/* True while a caption is being edited, so hover-out doesn't close the panel. */
let editing = false;

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
/* Bumped whenever the panel is (re)opened or closed; async tile work compares
   its captured token after each await and bails when stale. */
let hoverToken = 0;
/* The element the current panel is anchored to (its trigger). The watchdog
   keeps the panel open while the pointer is over it or the panel, and closes
   otherwise — this is the reliable close path (mouseleave chains are fragile
   because the panel opens in a separate DOM subtree next to the trigger). */
let anchorEl: HTMLElement | null = null;
let watchdogActive = false;
const modelDisposers = new Map<number, () => void>();

function isModelAsset(asset: PreviewTexture): boolean {
    if (asset.kind === 'model') return true;
    return /\.(?:scb|sco|skn)$/i.test(asset.path);
}

function disposeModels(): void {
    for (const dispose of modelDisposers.values()) {
        try { dispose(); } catch { /* best-effort GPU cleanup */ }
    }
    modelDisposers.clear();
}

function cancelShow() {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
}

/* Is the pointer within CLOSE_SLACK px of the anchor or the panel? */
function pointerNear(x: number, y: number): boolean {
    const panel = document.getElementById(PREVIEW_ID);
    const menu = document.getElementById(MENU_ID);
    const rects: DOMRect[] = [];
    if (anchorEl) rects.push(anchorEl.getBoundingClientRect());
    if (panel) rects.push(panel.getBoundingClientRect());
    if (menu) rects.push(menu.getBoundingClientRect());
    return rects.some(
        (r) =>
            x >= r.left - CLOSE_SLACK &&
            x <= r.right + CLOSE_SLACK &&
            y >= r.top - CLOSE_SLACK &&
            y <= r.bottom + CLOSE_SLACK,
    );
}

function onWatchdogMove(e: PointerEvent) {
    if (editing) return; // don't fight an in-progress caption edit
    if (!pointerNear(e.clientX, e.clientY)) removePreview();
}

function startWatchdog() {
    if (watchdogActive) return;
    watchdogActive = true;
    document.addEventListener('pointermove', onWatchdogMove, true);
}

function stopWatchdog() {
    if (!watchdogActive) return;
    watchdogActive = false;
    document.removeEventListener('pointermove', onWatchdogMove, true);
}

function removeMenu() {
    document.getElementById(MENU_ID)?.remove();
}

function removePreview() {
    hoverToken++;
    cancelShow();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    stopWatchdog();
    anchorEl = null;
    removeMenu();
    activeEditHandler = null;
    editing = false;
    activeContextMenu = false;
    activeBinPath = '';
    disposeModels();
    document.getElementById(PREVIEW_ID)?.remove();
}

/** Close the preview immediately (e.g. on click). */
export function closeTexturePreview(): void {
    removePreview();
}

/** Close after a short delay, cancellable by re-hovering the panel/anchor. Also
 *  cancels a pending show so leaving before the cooldown elapses never flashes
 *  the panel. */
export function scheduleTexturePreviewClose(delay = 250): void {
    cancelShow();
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        if (editing) return; // keep open while a caption is being edited
        if (document.getElementById(MENU_ID)) return; // keep open while menu is up
        removePreview();
    }, delay);
}

function anchorRect(anchor: DOMRect | HTMLElement): DOMRect {
    return anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
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

function tileId(index: number): string {
    return `${PREVIEW_ID}-tile-${index}`;
}

function applyResult(host: HTMLElement, url: string | null) {
    if (!url) {
        host.textContent = 'PREVIEW UNAVAILABLE';
        return;
    }
    host.textContent = '';
    const img = document.createElement('img');
    img.src = url;
    img.className = 'tex-preview__img';
    host.appendChild(img);
}

/* Swap a caption element into an inline text input to edit the full path. On
   Enter/blur it commits through activeEditHandler; Escape cancels. */
function beginCaptionEdit(caption: HTMLElement, fullPath: string): void {
    const handler = activeEditHandler;
    if (!handler) return;
    editing = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tex-preview__caption-input';
    input.value = fullPath;
    caption.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const commit = (save: boolean) => {
        if (done) return;
        done = true;
        editing = false;
        const next = input.value.trim();
        if (save && next && next !== fullPath) handler(fullPath, next);
        // Close the whole preview; the consumer re-shows with fresh data if it
        // wants (the resident model changed).
        removePreview();
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
        e.stopPropagation();
    };
    input.onblur = () => commit(true);
}

function buildPanel(textures: PreviewTexture[], anchor: DOMRect): void {
    const panel = document.createElement('div');
    panel.id = PREVIEW_ID;
    panel.className = 'tex-preview';

    const header = document.createElement('div');
    header.className = 'tex-preview__header';
    header.textContent = textures.length > 1 ? `PREVIEW (${textures.length})` : 'PREVIEW';
    panel.appendChild(header);

    // 3+ tiles lay out as a 2-column grid instead of a tall scroll list.
    const grid = document.createElement('div');
    grid.className = `tex-preview__grid${textures.length >= 3 ? ' is-grid' : ''}`;
    panel.appendChild(grid);

    const editable = !!activeEditHandler;
    for (let i = 0; i < textures.length; i++) {
        const t = textures[i];
        // Show the ACTUAL texture filename as the primary caption; the slot label
        // (e.g. "Main Texture", "Erosion Map") becomes a small tag above it.
        const fileName = t.path.split(/[/\\]/).pop() || t.path;
        const slotLabel = t.label && t.label.trim() ? t.label.trim() : '';

        const row = document.createElement('div');
        row.className = 'tex-preview__row';
        row.title = activeContextMenu ? 'Right-click for more actions' : t.path;
        if (activeContextMenu) {
            row.oncontextmenu = (event) => {
                event.preventDefault();
                event.stopPropagation();
                openPreviewContextMenu(event.clientX, event.clientY, t, activeBinPath);
            };
        }

        const tile = document.createElement('div');
        tile.id = tileId(i);
        tile.className = 'tex-preview__tile';
        tile.textContent = 'LOADING...';
        row.appendChild(tile);

        // Optional slot tag on its own line (Main Texture / Erosion Map / ...).
        if (slotLabel) {
            const tag = document.createElement('div');
            tag.className = 'tex-preview__slot';
            tag.textContent = slotLabel;
            row.appendChild(tag);
        }

        const captionRow = document.createElement('div');
        captionRow.className = 'tex-preview__caption-row';

        const caption = document.createElement('div');
        const canEdit = editable && !isModelAsset(t);
        caption.className = `tex-preview__caption${canEdit ? ' is-editable' : ''}`;
        caption.title = canEdit ? `${t.path}\n(click to edit path)` : t.path;
        caption.textContent = fileName;
        captionRow.appendChild(caption);

        if (canEdit) {
            const openEditor = () => beginCaptionEdit(caption, t.path);
            caption.onclick = openEditor;
            const pencil = document.createElement('button');
            pencil.type = 'button';
            pencil.className = 'tex-preview__edit';
            pencil.title = 'Edit texture path';
            pencil.textContent = '✎';
            pencil.onclick = (e) => { e.stopPropagation(); openEditor(); };
            captionRow.appendChild(pencil);
        }

        row.appendChild(captionRow);
        grid.appendChild(row);
    }

    document.body.appendChild(panel);
    positionNear(panel, anchor);

    panel.onmouseenter = () => {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    };
    panel.onmouseleave = () => {
        if (document.getElementById(MENU_ID)) return;
        scheduleTexturePreviewClose(250);
    };
}

/* Resolve + decode one texture into its tile, guarded by the hover token. The
   shared resolver owns caching + the serialized decode, so this just paints. */
async function loadTile(index: number, texture: PreviewTexture, binPath: string, token: number): Promise<void> {
    const host = document.getElementById(tileId(index));
    if (!host) return;
    if (isModelAsset(texture)) {
        const diskPath = await portResolveAssetPath(texture.path, binPath).catch(() => null);
        if (token !== hoverToken) return;
        const liveHost = document.getElementById(tileId(index));
        if (!liveHost) return;
        if (!diskPath) {
            liveHost.textContent = 'MODEL NOT ON DISK';
            return;
        }
        try {
            const textureDiskPath = texture.texturePath
                ? await portResolveAssetPath(texture.texturePath, binPath).catch(() => null)
                : null;
            const textureUrl = textureDiskPath
                ? await resolveDiskTextureDataUrl(textureDiskPath)
                : null;
            if (token !== hoverToken || !document.getElementById(tileId(index))) return;
            const { mountModelScene } = await import('@/lib/model/modelScene');
            const mounted = await mountModelScene(liveHost, diskPath, {
                textureUrl,
                interactive: false,
                autoRotate: true,
                showGrid: false,
            });
            if (token !== hoverToken || !document.getElementById(tileId(index))) {
                mounted.dispose();
                return;
            }
            modelDisposers.get(index)?.();
            modelDisposers.set(index, mounted.dispose);
        } catch {
            liveHost.textContent = 'FAILED TO LOAD MODEL';
        }
        return;
    }
    const url = await resolveTextureDataUrl(texture.path, binPath);
    if (token !== hoverToken) return;
    const liveHost = document.getElementById(tileId(index));
    if (!liveHost) return;
    if (url === null) {
        liveHost.textContent = 'NOT ON DISK';
        return;
    }
    applyResult(liveHost, url);
}

function doShow(
    textures: PreviewTexture[],
    binPath: string,
    anchor: DOMRect,
    onEditPath?: (oldPath: string, newPath: string) => void,
    contextMenu = false,
): void {
    const keepAnchor = anchorEl;
    removePreview();
    anchorEl = keepAnchor;
    const token = hoverToken;
    activeEditHandler = onEditPath ?? null;
    activeContextMenu = contextMenu;
    activeBinPath = binPath;
    buildPanel(textures, anchor);
    startWatchdog();
    for (let i = 0; i < textures.length; i++) {
        if (token !== hoverToken) return;
        void loadTile(i, textures[i], binPath, token);
    }
}

/** Show the preview for a set of textures near an anchor. Debounced; call
 *  scheduleTexturePreviewClose() on mouse-leave. Passing an empty array is a
 *  no-op. */
export function showTexturePreview(
    textures: PreviewTexture[],
    anchor: DOMRect | HTMLElement,
    binPath: string,
    opts: TexturePreviewOpts = {},
): void {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    cancelShow();

    // Dedupe by path (case-insensitive) and cap the tile count.
    const seen = new Set<string>();
    const list: PreviewTexture[] = [];
    for (const t of textures) {
        const key = t.path?.toLowerCase();
        if (!t.path || seen.has(key)) continue;
        seen.add(key);
        list.push(t);
        if (list.length >= MAX_TILES) break;
    }
    if (list.length === 0) return;

    // Remember the trigger element so the watchdog can keep the panel open while
    // the pointer is over it (and close once it leaves both anchor and panel).
    anchorEl = anchor instanceof HTMLElement ? anchor : null;
    const rect = anchorRect(anchor);
    const delay = opts.showDelay ?? DEFAULT_SHOW_DELAY;
    const onEditPath = opts.onEditPath;
    showTimer = setTimeout(() => {
        showTimer = null;
        doShow(list, binPath, rect, onEditPath, !!opts.contextMenu);
    }, delay);
}

/** Open the right-click context menu for a single texture (reveal in file
 *  manager / open in ImgRecolor). Opt-in — consumers that want it call this
 *  from onContextMenu. */
export function openTexturePreviewContextMenu(
    event: React.MouseEvent,
    texture: PreviewTexture,
    binPath: string,
): void {
    event.preventDefault();
    event.stopPropagation();
    openPreviewContextMenu(event.clientX, event.clientY, texture, binPath);
}

function openPreviewContextMenu(
    clientX: number,
    clientY: number,
    texture: PreviewTexture,
    binPath: string,
): void {
    cancelShow();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (!texture.path) return;

    removeMenu();
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'tex-preview-menu';

    const makeItem = (label: string, onClick: () => void, disabled = false) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = label;
        item.disabled = disabled;
        item.className = 'tex-preview-menu__item';
        if (!disabled) {
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
        try {
            const diskPath = await portResolveAssetPath(texture.path, binPath).catch(() => null);
            const model = isModelAsset(texture);
            const modelTexturePath = model && texture.texturePath
                ? await portResolveAssetPath(texture.texturePath, binPath).catch(() => null)
                : null;

            menu.appendChild(
                makeItem('Reveal in File Manager', () => {
                    if (diskPath) revealInFileManager(diskPath);
                }, !diskPath),
            );
            menu.appendChild(
                makeItem('Open in Windows Explorer', () => {
                    if (diskPath) void explorerReveal(diskPath).catch(() => {});
                }, !diskPath),
            );
            if (model) {
                menu.appendChild(
                    makeItem('Inspect Model', () => {
                        if (diskPath) openModelInspect(diskPath, modelTexturePath);
                    }, !diskPath),
                );
            } else {
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

                /* Open the file in whatever program Windows associates with its
                   extension — GIMP, Photoshop, whatever the user already set as the
                   default for .dds/.tex. No configuration, no picker. */
                menu.appendChild(
                    makeItem('Open in image editor', () => {
                        if (diskPath) void explorerOpenWith(diskPath).catch(() => {});
                    }, !diskPath),
                );
            }

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
