/* VFX Hub client for the .bin-based repo (Vfx-Hub-Rust). Systems are stored as
   one compiled .bin per effect under bins/<category>/<name>.bin, described by a
   top-level index.json, with previews/ and assets/ folders. This replaces the
   old .py-collection client: no ritobin parsing, no py->bin compile. Public
   browse is unauthenticated; uploads use the token from Settings. */

import { useUiPrefsStore } from '@/lib/stores';

const DEFAULT_REPO_URL = 'https://github.com/FrogCsLoL/Vfx-Hub-Rust';
const BRANCH = 'main';

export interface HubSystem {
    /** index.json key = repo-relative bin path, e.g. "bins/aura/Electricity.bin". */
    binFile: string;
    name: string;
    displayName: string;
    description: string;
    category: string;
    emitters: number;
    /** Asset filenames this system references (basenames). */
    assets: string[];
    previewUrl?: string | null;
}

export interface HubAssetBytesInput { relPath: string; base64: string }

interface Creds { owner: string; repo: string; token: string | null }

function getCreds(): Creds {
    const prefs = useUiPrefsStore.getState();
    let repoUrl = (prefs.githubRepoUrl || '').trim() || DEFAULT_REPO_URL;
    // Migrate: the old .py hub URL is incompatible with the .bin format.
    if (/github\.com\/FrogCsLoL\/VFXHub\/?$/i.test(repoUrl)) repoUrl = DEFAULT_REPO_URL;
    const token = (prefs.githubToken || '').trim() || null;
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!m) throw new Error('Invalid GitHub repository URL. Expected https://github.com/owner/repo');
    return { owner: m[1], repo: m[2].replace(/\.git$/, ''), token };
}

// raw.githubusercontent.com 404s on unencoded spaces; encode each segment.
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const rawUrl = (owner: string, repo: string, p: string) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/${encPath(p)}`;
const cleanKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

interface IndexEntry {
    name: string; displayName?: string; description?: string;
    category?: string; emitters?: number; binFile?: string; assets?: string[];
}
interface IndexJson { systems: Record<string, IndexEntry> }

let cache: { systems: HubSystem[]; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** GitHub contents listing for a directory (returns [] on 404). */
async function listDir(dir: string): Promise<{ name: string; path: string; type?: string }[]> {
    const { owner, repo } = getCreds();
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encPath(dir)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    return res.json();
}

async function buildPreviewIndex(): Promise<Record<string, string>> {
    const { owner, repo } = getCreds();
    const files = await listDir('previews').catch(() => []);
    const idx: Record<string, string> = {};
    for (const f of files) {
        if (f.type === 'dir') continue;
        if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)) continue;
        idx[cleanKey(f.name.replace(/\.[^.]+$/, ''))] = rawUrl(owner, repo, f.path);
    }
    return idx;
}

/** Fetch a repo file's TEXT, resilient to raw.githubusercontent CDN staleness
 *  (a fresh push can 404 on the raw edge for a few minutes). Tries raw with a
 *  cache-buster, then falls back to the GitHub contents API (base64). */
async function fetchRepoText(owner: string, repo: string, filePath: string): Promise<string> {
    const bust = `?t=${Math.floor(Date.now() / 30000)}`; // 30s granularity, avoids per-keystroke misses
    const raw = await fetch(rawUrl(owner, repo, filePath) + bust).catch(() => null);
    if (raw && raw.ok) return raw.text();

    // Fallback: contents API returns base64 and is not served by the raw CDN.
    const api = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encPath(filePath)}`);
    if (!api.ok) throw new Error(`Failed to load ${filePath}: ${api.status} ${api.statusText}`);
    const j = (await api.json()) as { content?: string; encoding?: string };
    if (j.encoding === 'base64' && j.content) {
        return decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
    }
    throw new Error(`Unexpected contents response for ${filePath}`);
}

/** Load the hub index (one entry per system) with resolved preview URLs. */
export async function getHubSystems(): Promise<HubSystem[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.systems;
    const { owner, repo } = getCreds();

    const json = JSON.parse(await fetchRepoText(owner, repo, 'index.json')) as IndexJson;

    const previews = await buildPreviewIndex().catch(() => ({} as Record<string, string>));
    const systems: HubSystem[] = Object.entries(json.systems || {}).map(([key, s]) => {
        const binFile = s.binFile || key;
        const previewUrl = previews[cleanKey(s.displayName || s.name)] ?? previews[cleanKey(s.name)] ?? null;
        return {
            binFile,
            name: s.name,
            displayName: s.displayName || s.name,
            description: s.description || '',
            category: s.category || 'general',
            emitters: s.emitters || 0,
            assets: s.assets || [],
            previewUrl,
        };
    });

    cache = { systems, at: Date.now() };
    return systems;
}

export function clearHubCache() { cache = null; }

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
        const { owner, repo } = getCreds();
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!res.ok) throw new Error(`Repository not accessible: ${res.status}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

async function fetchBase64(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return btoa(bin);
    } catch {
        return null;
    }
}

export interface DownloadedHubSystem { binBase64: string; assets: HubAssetBytesInput[] }

/**
 * Download a system's .bin and the assets it references (per index.json's asset
 * list, matched by filename against the assets/ folder). Missing assets are
 * skipped (porting warns on missing assets already).
 */
export async function downloadHubSystem(system: HubSystem): Promise<DownloadedHubSystem> {
    const { owner, repo } = getCreds();
    const binBase64 = await fetchBase64(rawUrl(owner, repo, system.binFile));
    if (!binBase64) throw new Error(`Failed to download ${system.binFile}`);

    const wanted = new Set(system.assets.map((a) => a.toLowerCase()));
    const assets: HubAssetBytesInput[] = [];
    if (wanted.size) {
        const assetFiles = await listDir('assets').catch(() => []);
        const pick = assetFiles.filter((f) => {
            const n = f.name.toLowerCase();
            if (wanted.has(n)) return true;
            // Tolerate the League "<name>.<skinref>.<ext>" collapsed form.
            const parts = n.split('.');
            if (parts.length >= 3) {
                const collapsed = `${parts.slice(0, parts.length - 2).join('.')}.${parts[parts.length - 1]}`;
                if (wanted.has(collapsed)) return true;
            }
            return false;
        });
        for (const f of pick) {
            const b64 = await fetchBase64(rawUrl(owner, repo, f.path));
            if (b64) assets.push({ relPath: f.name, base64: b64 });
        }
    }
    return { binBase64, assets };
}

// ── Upload (bin) ──────────────────────────────────────────────────────────

async function ghRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { token } = getCreds();
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Quartz-VFXHub',
        ...(options.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `token ${token}`;
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
        if (res.status === 401) throw new Error('Authentication failed. Check your GitHub token in Settings.');
        if (res.status === 403) throw new Error('Access forbidden: your token lacks write access to this repo.');
        throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    }
    return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

/** Create/update a repo file. `contentBase64` is already base64 (bin or image). */
async function putFile(filePath: string, contentBase64: string, message: string): Promise<void> {
    const { owner, repo } = getCreds();
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encPath(filePath)}`;
    let sha: string | null = null;
    try {
        const info = await ghRequest<{ sha: string }>(api);
        sha = info.sha;
    } catch (e) {
        if (!(e instanceof Error) || !e.message.includes('404')) { /* create path */ }
    }
    await ghRequest(api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: contentBase64, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
}

export interface HubUploadInput {
    name: string;
    category: string;
    description: string;
    binBase64: string;
    emitters: number;
    previewBase64?: string | null;
    previewExt?: string;
}

/** Upload a compiled .bin (+ optional preview) and update index.json. */
export async function uploadHubSystem(input: HubUploadInput): Promise<string> {
    const { token } = getCreds();
    if (!token) throw new Error('A GitHub token is required to upload. Set one in Settings.');

    const cat = (input.category || 'general').toLowerCase().replace(/[^a-z0-9._-]+/g, '_') || 'general';
    const base = (input.name || 'system').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'system';
    const binFile = `bins/${cat}/${base}.bin`;

    await putFile(binFile, input.binBase64, `Add VFX system: ${input.name}`);

    if (input.previewBase64) {
        const ext = (input.previewExt || 'png').toLowerCase();
        await putFile(`previews/${cleanKey(input.name)}.${ext}`, input.previewBase64, `Add preview for ${input.name}`);
    }

    // Update index.json (read current, merge, write back).
    const { owner, repo } = getCreds();
    let index: IndexJson = { systems: {} };
    try {
        const res = await fetch(rawUrl(owner, repo, 'index.json'));
        if (res.ok) index = (await res.json()) as IndexJson;
    } catch { /* fresh index */ }
    index.systems[binFile] = {
        name: input.name,
        displayName: input.name,
        description: input.description || '',
        category: cat,
        emitters: input.emitters,
        binFile,
    };
    const indexB64 = btoa(unescape(encodeURIComponent(JSON.stringify(index, null, 2))));
    await putFile('index.json', indexB64, `Index: ${input.name}`);

    clearHubCache();
    return binFile;
}
