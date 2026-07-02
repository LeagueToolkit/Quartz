/*
 * Texture hover preview — DOM-injected floating panel.
 *
 * The Electron build converted .tex/.dds to PNG through a native helper. That
 * converter is not available on the Tauri surface, so this preview lists the
 * emitter's texture/mesh paths and attempts an inline image when the asset
 * resolves to a readable image on disk (png/jpg/etc.) via readFileBase64.
 */

import { readFileBase64 } from '@/lib/api';

const PREVIEW_ID = 'shared-texture-hover-preview';
let closeTimer: ReturnType<typeof setTimeout> | null = null;

interface TexInfo {
    label: string;
    path: string;
    resolvedDiskPath?: string;
}

function ensureRoot(): HTMLDivElement {
    let root = document.getElementById(PREVIEW_ID) as HTMLDivElement | null;
    if (!root) {
        root = document.createElement('div');
        root.id = PREVIEW_ID;
        root.style.position = 'fixed';
        root.style.zIndex = '10000';
        root.style.maxWidth = '320px';
        root.style.padding = '10px';
        root.style.borderRadius = '10px';
        root.style.background = 'var(--glass-bg, rgba(18,18,24,0.96))';
        root.style.border = '1px solid var(--glass-border, rgba(255,255,255,0.12))';
        root.style.boxShadow = '0 18px 44px rgba(0,0,0,0.5)';
        root.style.fontFamily = 'var(--font-mono)';
        root.style.fontSize = '11px';
        root.style.color = 'var(--text, #fff)';
        root.style.pointerEvents = 'auto';
        root.addEventListener('mouseenter', cancelTextureHoverClose);
        root.addEventListener('mouseleave', () => scheduleTextureHoverClose(400));
        document.body.appendChild(root);
    }
    return root;
}

function position(root: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = root.offsetWidth || 320;
    let left = rect.right + 8;
    if (left + w + 8 > vw) left = Math.max(8, rect.left - w - 8);
    const top = Math.max(8, Math.min(window.innerHeight - (root.offsetHeight || 200) - 8, rect.top));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
}

export function cancelTextureHoverClose(): void {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
}

export function scheduleTextureHoverClose(delay = 500): void {
    cancelTextureHoverClose();
    closeTimer = setTimeout(removeTextureHoverPreview, delay);
}

export function removeTextureHoverPreview(): void {
    const root = document.getElementById(PREVIEW_ID);
    if (root) root.remove();
}

const IMG_EXT = /\.(png|jpg|jpeg|gif|webp|bmp)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

export async function showTextureHoverPreview(textures: TexInfo[], meshes: { label: string; path: string }[], anchor: HTMLElement, binPath: string): Promise<void> {
    cancelTextureHoverClose();
    const root = ensureRoot();
    root.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'Assets';
    title.style.color = 'var(--accent)';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    root.appendChild(title);

    const binDir = binPath.replace(/[\\/][^\\/]+$/, '');

    const addRow = (label: string, path: string) => {
        const row = document.createElement('div');
        row.style.marginBottom = '4px';
        row.style.wordBreak = 'break-all';
        const labelSpan = document.createElement('span');
        labelSpan.style.color = 'var(--accent2, #8b5cf6)';
        labelSpan.textContent = `${label}: `;
        row.appendChild(labelSpan);
        row.appendChild(document.createTextNode(path));
        root.appendChild(row);
        return row;
    };

    for (const tex of textures) {
        addRow(tex.label, tex.path);
        if (IMG_EXT.test(tex.path)) {
            const candidate = `${binDir}/${tex.path}`.replace(/\\/g, '/');
            try {
                const b64 = await readFileBase64(candidate);
                const ext = (tex.path.match(IMG_EXT)?.[1] || 'png').toLowerCase();
                const img = document.createElement('img');
                img.src = `data:${MIME[ext] || 'image/png'};base64,${b64}`;
                img.style.maxWidth = '100%';
                img.style.borderRadius = '6px';
                img.style.marginTop = '4px';
                img.style.imageRendering = 'pixelated';
                root.appendChild(img);
            } catch {
                /* asset not on disk in a readable form — path text already shown */
            }
        }
    }

    for (const mesh of meshes) {
        addRow(mesh.label, mesh.path);
    }

    if (textures.length === 0 && meshes.length === 0) {
        const none = document.createElement('div');
        none.textContent = 'No textures or meshes';
        none.style.opacity = '0.5';
        root.appendChild(none);
    }

    position(root, anchor);
}
