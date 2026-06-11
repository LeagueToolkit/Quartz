/* GitHub-backed VFX Hub catalog, ported from the Electron Quartz
   (src/pages/vfxhub/services/githubApi.js). Uses public (unauthenticated)
   access against the same repository and directory layout the old app used:
   FrogCsLoL/VFXHub — collection/vfx collection/*.py + collection/previews + assets.
   Runs over the browser fetch API (Tauri CSP allows api.github.com and
   raw.githubusercontent.com). Token-authenticated upload is out of scope. */

import { getSettings } from '@/lib/api';
import { parseCompleteVFXSystems, getShortSystemName, type ParsedVfxSystem } from './vfxSystemParser';
import type { HubAsset } from './vfxEmitterParser';

const DEFAULT_REPO_URL = 'https://github.com/FrogCsLoL/VFXHub';
const BRANCH = 'main';

export interface HubVfxSystem {
    name: string;
    displayName: string;
    emitterCount: number;
    description: string;
    category: string;
    previewImage?: string;
    demoVideo?: string;
    tags: string[];
    assets: string[];
    fullContent: string;
    isValid: boolean;
    validationError: string | null;
    startLine: number;
    endLine: number;
    previewUrl?: string | null;
    // Attached by the flattening step in useGitHubCollections.
    collection?: string;
}

export interface HubCollection {
    name: string;
    category: string;
    description: string;
    systems: HubVfxSystem[];
    filePath: string;
    downloadUrl?: string;
}

interface GitHubCredentials {
    owner: string;
    repo: string;
    repoUrl: string;
}

interface DownloadedVfxSystem {
    system: ParsedVfxSystem;
    assets: HubAsset[];
    pythonContent: string;
}

interface CacheEntry {
    data: { collections: HubCollection[]; index: Record<string, unknown> };
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const cacheTimeout = 5 * 60 * 1000;

async function getCredentials(): Promise<GitHubCredentials> {
    let repoUrl = DEFAULT_REPO_URL;
    try {
        const settings = await getSettings();
        const configured = (settings as unknown as Record<string, unknown>)?.GitHubRepoUrl;
        if (typeof configured === 'string' && configured.trim()) repoUrl = configured.trim();
    } catch {
        // Settings unavailable — fall back to the default public repo.
    }
    const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) throw new Error('Invalid GitHub repository URL format. Expected: https://github.com/owner/repo');
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, ''), repoUrl };
}

function cleanPreviewKey(s: string): string {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function deriveCategoryFromFilename(filename: string): string {
    let base = filename.toLowerCase().replace(/\.py$/, '').replace(/vfxs?$/, '').trim().replace(/[_\s]+/g, '');
    const pluralMap: Record<string, string> = { aura: 'auras', missile: 'missiles', explosion: 'explosions' };
    return pluralMap[base] || base;
}

function parseVFXSystemsFromContent(content: string): HubVfxSystem[] {
    try {
        const systems = parseCompleteVFXSystems(content);
        return systems.map((system) => ({
            name: system.name,
            displayName: system.displayName || getShortSystemName(system.name),
            emitterCount: system.emitterCount,
            description: system.metadata.description || '',
            category: system.metadata.category || 'general',
            previewImage: system.metadata.previewImage,
            demoVideo: system.metadata.demoVideo,
            tags: system.metadata.tags || [],
            assets: system.assets,
            fullContent: system.fullContent,
            isValid: system.isValid,
            validationError: system.validationError,
            startLine: system.startLine,
            endLine: system.endLine,
        }));
    } catch {
        return [];
    }
}

async function getPreviewsIndexPublic(): Promise<Record<string, string>> {
    try {
        const { owner, repo } = await getCredentials();
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/collection/previews`);
        if (!response.ok) return {};
        const files = (await response.json()) as { type?: string; name?: string; path: string }[];
        const index: Record<string, string> = {};
        for (const f of files) {
            if (f.type !== 'file') continue;
            const name = f.name || '';
            if (!name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) continue;
            const base = name.replace(/\.[^.]+$/, '');
            index[cleanPreviewKey(base)] = `https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/${f.path}`;
        }
        return index;
    } catch {
        return {};
    }
}

function attachPreviews(systems: HubVfxSystem[], previewsIndex: Record<string, string>): HubVfxSystem[] {
    return systems.map((sys) => {
        const keysToTry = [String(sys.displayName || ''), String(sys.name || '').split('/').pop() || String(sys.name || '')];
        let previewUrl: string | null = null;
        for (const k of keysToTry) {
            const key = cleanPreviewKey(k);
            if (previewsIndex[key]) {
                previewUrl = previewsIndex[key];
                break;
            }
        }
        return { ...sys, previewUrl };
    });
}

export async function testConnection(): Promise<{ success: boolean; user?: string; repository?: string; error?: string }> {
    try {
        const { owner, repo } = await getCredentials();
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!response.ok) throw new Error(`Repository not accessible: ${response.status} ${response.statusText}`);
        return { success: true, user: 'public', repository: `${owner}/${repo}` };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function getVFXCollectionsPublic(): Promise<{ collections: HubCollection[]; index: Record<string, unknown> }> {
    const { owner, repo } = await getCredentials();
    const cacheKey = `collections_${owner}_${repo}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTimeout) return cached.data;

    let collectionFiles: { name: string; path: string; download_url?: string }[] = [];
    const dirResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/collection/vfx collection`);
    if (dirResponse.ok) {
        collectionFiles = await dirResponse.json();
    } else if (dirResponse.status === 404) {
        collectionFiles = [];
    } else {
        const err = new Error(`GitHub API Error: ${dirResponse.status} ${dirResponse.statusText}`) as Error & { status?: number };
        err.status = dirResponse.status;
        throw err;
    }

    let index: Record<string, unknown> = {};
    try {
        const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/index.json`);
        if (response.ok) index = JSON.parse(await response.text());
    } catch {
        // index.json is optional.
    }

    const previewsIndex = await getPreviewsIndexPublic();
    const collections: HubCollection[] = [];

    for (const file of Array.isArray(collectionFiles) ? collectionFiles : []) {
        if (!file.name.endsWith('.py')) continue;
        const category = deriveCategoryFromFilename(file.name);
        try {
            const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/${file.path}`);
            if (!response.ok) continue;
            const content = await response.text();
            const systems = attachPreviews(parseVFXSystemsFromContent(content), previewsIndex);
            collections.push({
                name: file.name,
                category,
                description: `${category.charAt(0).toUpperCase() + category.slice(1)} VFX Collection`,
                systems,
                filePath: file.path,
                downloadUrl: file.download_url,
            });
        } catch {
            // Skip collection files that fail to parse.
        }
    }

    const result = { collections, index };
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
}

export async function getVFXCollections(): Promise<{ collections: HubCollection[]; index: Record<string, unknown> }> {
    return getVFXCollectionsPublic();
}

async function getRawFile(filePath: string): Promise<string> {
    const { owner, repo } = await getCredentials();
    const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/${filePath}`);
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    return response.text();
}

async function listDirectory(dirPath: string): Promise<{ name: string; path: string; size?: number; type?: string; download_url?: string }[]> {
    const { owner, repo } = await getCredentials();
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`);
    if (!response.ok) throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    return response.json();
}

async function getPublicDownloadUrl(filePath: string): Promise<string | null> {
    try {
        const { owner, repo } = await getCredentials();
        return `https://raw.githubusercontent.com/${owner}/${repo}/${BRANCH}/${filePath}`;
    } catch {
        return null;
    }
}

async function getAssetsForSystem(systemContent: string | null): Promise<HubAsset[]> {
    try {
        let assetFiles: { name: string; path: string; size?: number; download_url?: string }[] = [];
        try {
            assetFiles = await listDirectory('collection/assets/vfxhub');
        } catch {
            try {
                assetFiles = await listDirectory('collection/assets');
            } catch {
                return [];
            }
        }

        const requiredAssets: string[] = [];
        if (systemContent) {
            const assetPatterns = [
                /texture:\s*string\s*=\s*"([^"]+)"/gi,
                /mSimpleMeshName:\s*string\s*=\s*"([^"]+)"/gi,
                /erosionMapName:\s*string\s*=\s*"([^"]+)"/gi,
                /particleColorTexture:\s*string\s*=\s*"([^"]+)"/gi,
                /"([^"]*\.(dds|tex|png|jpg|jpeg|scb|sco|skn|skl|anm))"/gi,
            ];
            for (const pattern of assetPatterns) {
                let match: RegExpExecArray | null;
                while ((match = pattern.exec(systemContent)) !== null) {
                    const assetPath = match[1];
                    if (assetPath && !requiredAssets.includes(assetPath)) requiredAssets.push(assetPath);
                }
            }
        }

        const requiredFilenames = requiredAssets
            .map((requiredAsset) => requiredAsset.split('/').pop() || requiredAsset.split('\\').pop() || requiredAsset)
            .filter(Boolean);

        const matches = (filename: string): boolean =>
            requiredFilenames.some((requiredFilename) => {
                const assetName = String(filename || '').toLowerCase();
                const required = String(requiredFilename || '').toLowerCase();
                if (!assetName || !required) return false;
                if (assetName === required || assetName.includes(required)) return true;
                const parts = assetName.split('.');
                if (parts.length >= 3) {
                    const collapsed = `${parts.slice(0, parts.length - 2).join('.')}.${parts[parts.length - 1]}`;
                    if (collapsed === required || collapsed.includes(required)) return true;
                }
                const requiredDot = required.lastIndexOf('.');
                if (requiredDot > 0 && requiredDot < required.length - 1) {
                    const stem = required.slice(0, requiredDot);
                    const ext = required.slice(requiredDot + 1);
                    if (assetName.startsWith(`${stem}_`) && assetName.endsWith(`.${ext}`)) return true;
                    if (assetName.startsWith(`${stem}.`) && assetName.endsWith(`.${ext}`)) return true;
                }
                return false;
            });

        const matchingAssets = requiredAssets.length > 0 ? assetFiles.filter((file) => matches(file.name)) : assetFiles;

        const resolveExpectedFilename = (assetName: string): string => {
            if (requiredFilenames.length === 0) return assetName;
            const matched = requiredFilenames.find((requiredFilename) => matches.call(null, requiredFilename) && matchesName(assetName, requiredFilename));
            return matched || assetName;
        };

        const assets: HubAsset[] = [];
        for (const asset of matchingAssets) {
            const downloadUrl = await getPublicDownloadUrl(asset.path);
            assets.push({
                name: resolveExpectedFilename(asset.name),
                sourceName: asset.name,
                path: asset.path,
                downloadUrl: downloadUrl || asset.download_url,
                size: asset.size,
            });
        }
        return assets;
    } catch {
        return [];
    }
}

function matchesName(assetName: string, requiredFilename: string): boolean {
    const a = String(assetName || '').toLowerCase();
    const r = String(requiredFilename || '').toLowerCase();
    if (!a || !r) return false;
    return a === r || a.includes(r);
}

export async function downloadVFXSystem(systemName: string, collectionFile: string): Promise<DownloadedVfxSystem> {
    const fullPath = collectionFile.startsWith('collection/') ? collectionFile : `collection/${collectionFile}`;
    const content = await getRawFile(fullPath);
    const systems = parseCompleteVFXSystems(content);
    const targetSystem = systems.find((sys) => sys.name === systemName);
    if (!targetSystem) throw new Error(`VFX system "${systemName}" not found in ${fullPath}`);
    const assets = await getAssetsForSystem(targetSystem.fullContent);
    return { system: targetSystem, assets, pythonContent: targetSystem.fullContent };
}

export default {
    testConnection,
    getVFXCollections,
    getVFXCollectionsPublic,
    downloadVFXSystem,
};
