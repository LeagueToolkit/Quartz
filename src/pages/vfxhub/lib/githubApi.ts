/* GitHub-backed VFX Hub catalog, ported from the Electron Quartz
   (src/pages/vfxhub/services/githubApi.js). Browsing uses public
   (unauthenticated) access against the same repository and directory layout
   the old app used: FrogCsLoL/VFXHub — collection/vfx collection/*.py +
   collection/previews + assets. Uploading uses the GitHub contents API with
   the personal access token stored in Settings → GitHub Integration. Runs
   over the browser fetch API (Tauri CSP allows api.github.com and
   raw.githubusercontent.com). */

import { useUiPrefsStore } from '@/lib/stores';
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
    username: string;
    token: string | null;
    isPublicOnly: boolean;
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
    const prefs = useUiPrefsStore.getState();
    const username = (prefs.githubUsername || '').trim();
    const token = (prefs.githubToken || '').trim();
    const repoUrl = (prefs.githubRepoUrl || '').trim() || DEFAULT_REPO_URL;

    const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) throw new Error('Invalid GitHub repository URL format. Expected: https://github.com/owner/repo');
    return {
        owner: urlMatch[1],
        repo: urlMatch[2].replace(/\.git$/, ''),
        repoUrl,
        username: username || 'public',
        token: token || null,
        isPublicOnly: !token,
    };
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

// --- Authenticated upload ---------------------------------------------------

export interface UploadMetadata {
    name: string;
    description?: string;
    category?: string;
    emitters?: number;
}

/* Authenticated request against the GitHub API. The token comes from
   Settings → GitHub Integration; without it uploads are not possible. */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const credentials = await getCredentials();
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Quartz-VFXHub',
        ...(options.headers as Record<string, string> | undefined),
    };
    if (credentials.token) headers.Authorization = `token ${credentials.token}`;

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        const err = new Error(`GitHub API Error: ${response.status} ${response.statusText}`) as Error & { status?: number };
        err.status = response.status;
        if (response.status === 403) {
            err.message = 'Access forbidden: your GitHub token does not have write access to this repository, or you are unauthenticated. Set a token in Settings → GitHub Integration.';
        } else if (response.status === 401) {
            err.message = 'Authentication failed. Check your GitHub token in Settings → GitHub Integration.';
        }
        throw err;
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}

function utf8ToBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/* Create or update a file in the repository. content is plain UTF-8 text
   unless isBinary is set, in which case it must already be base64. */
export async function updateFile(filePath: string, content: string, commitMessage: string, isBinary = false): Promise<void> {
    const { owner, repo } = await getCredentials();

    let sha: string | null = null;
    try {
        const fileInfo = await request<{ sha: string }>(`/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`);
        sha = fileInfo.sha;
    } catch (error) {
        // 404 just means we are creating a new file.
        if ((error as { status?: number }).status !== 404) throw error;
    }

    const encodedContent = isBinary ? content : utf8ToBase64(content);
    const body = JSON.stringify({ message: commitMessage, content: encodedContent, branch: BRANCH, ...(sha ? { sha } : {}) });

    await request(`/repos/${owner}/${repo}/contents/${encodeURI(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

function createMetadataHeader(metadata: UploadMetadata): string {
    const comments: string[] = [];
    if (metadata.name) comments.push(`# VFX_HUB_NAME: ${metadata.name}`);
    if (metadata.description) comments.push(`# VFX_HUB_DESCRIPTION: ${metadata.description}`);
    if (metadata.category) comments.push(`# VFX_HUB_CATEGORY: ${metadata.category}`);
    if (metadata.emitters) comments.push(`# VFX_HUB_EMITTERS: ${metadata.emitters}`);
    return comments.join('\n');
}

// Add the system entry to an existing ResourceResolver's resourceMap, in place.
function addToResolverLines(lines: string[], systemName: string): void {
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('ResourceResolver {')) continue;
        let braceCount = 0;
        let foundResourceMap = false;
        for (let j = i; j < lines.length; j++) {
            const line = lines[j];
            if (line.includes('resourceMap: map[hash,link] = {')) {
                foundResourceMap = true;
                braceCount = 1;
            } else if (foundResourceMap) {
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                if (braceCount === 0) {
                    lines.splice(j, 0, `            "${systemName}" = "${systemName}"`);
                    return;
                }
            }
        }
        return;
    }
}

/* Append a serialized VFX system to a collection .py, mirroring the Electron
   addVFXSystemToCollection: insert after the last system (or before the
   resolver) and wire a resourceMap entry. */
function addVFXSystemToCollection(collectionContent: string, systemFullContent: string, metadata: UploadMetadata): string {
    const systemName = metadata.name || 'UnknownSystem';
    if (!systemFullContent) throw new Error('No VFX system content provided for upload');

    let body = systemFullContent;
    const vfxStart = body.indexOf('VfxSystemDefinitionData {');
    if (vfxStart === -1) throw new Error('Could not find VfxSystemDefinitionData in the provided content');
    // Drop any leading "name" = before VfxSystemDefinitionData to avoid duplication.
    if (vfxStart > 0) body = body.slice(vfxStart);
    body = body
        .replace(/particleName:\s*string\s*=\s*"[^"]*"/g, `particleName: string = "${systemName}"`)
        .replace(/particlePath:\s*string\s*=\s*"[^"]*"/g, `particlePath: string = "${systemName}"`);

    const newEntry = `    "${systemName}" = ${body}`;
    const lines = collectionContent.split('\n');

    let lastVFXSystemEnd = -1;
    let bracketCount = 0;
    let inSystem = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('"') && line.includes('= VfxSystemDefinitionData {')) {
            inSystem = true;
            bracketCount = 1;
            continue;
        }
        if (inSystem) {
            bracketCount += (line.match(/{/g) || []).length;
            bracketCount -= (line.match(/}/g) || []).length;
            if (bracketCount === 0) {
                lastVFXSystemEnd = i + 1;
                inSystem = false;
            }
        }
    }

    let insertIndex = lastVFXSystemEnd;
    if (insertIndex === -1) {
        insertIndex = lines.findIndex((l) => l.includes('ResourceResolver {'));
    }
    if (insertIndex === -1) {
        insertIndex = lines.findIndex((l) => l.trim().startsWith('entries: map[hash,embed] = {'));
        if (insertIndex !== -1) insertIndex += 1;
    }
    if (insertIndex === -1) insertIndex = Math.max(0, lines.length - 1);

    const header = createMetadataHeader(metadata);
    const newLines = ['', ...(header ? [header] : []), newEntry, ''];
    lines.splice(insertIndex, 0, ...newLines);

    addToResolverLines(lines, systemName);
    return lines.join('\n');
}

const DEFAULT_COLLECTION_TEMPLATE = `entries: map[hash,embed] = {
    #addvfxsystemswithrightbrackets
    #dontcreatenewresourceresolver
    "Characters/Aurora/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash,link] = {
            #addresourceresolverhere
        }
    }
}`;

export interface UploadSystemInput {
    name: string;
    fullContent: string;
}

/* Push one or more VFX systems into a target collection .py in the hub repo.
   Reads the current collection file, appends each system, then PUTs it back
   with the stored token. Returns the resolved collection filename. */
export async function uploadVFXSystem(
    systems: UploadSystemInput[],
    collectionFile: string,
    metadata: UploadMetadata,
): Promise<string> {
    const credentials = await getCredentials();
    if (credentials.isPublicOnly) {
        throw new Error('Authentication required for uploads. Set a GitHub token in Settings → GitHub Integration.');
    }
    const { owner, repo } = credentials;

    // GitHub paths are case-sensitive; resolve to the exact existing filename.
    let resolvedCollectionFile = collectionFile;
    try {
        const entries = await request<{ type?: string; name?: string }[]>(`/repos/${owner}/${repo}/contents/${encodeURI('collection/vfx collection')}`);
        const matched = Array.isArray(entries)
            ? entries.find((e) => e?.type === 'file' && typeof e.name === 'string' && e.name.toLowerCase() === collectionFile.toLowerCase())
            : null;
        if (matched?.name) resolvedCollectionFile = matched.name;
    } catch {
        // Directory may not exist yet — it will be created on PUT.
    }

    const targetPath = `collection/vfx collection/${resolvedCollectionFile}`;
    let currentContent: string;
    try {
        currentContent = await getRawFile(targetPath);
    } catch {
        currentContent = DEFAULT_COLLECTION_TEMPLATE;
    }

    let updatedContent = currentContent;
    for (const system of systems) {
        updatedContent = addVFXSystemToCollection(updatedContent, system.fullContent, {
            ...metadata,
            name: system.name,
        });
    }

    const label = systems.length === 1 ? systems[0].name : `${systems.length} systems`;
    await updateFile(targetPath, updatedContent, `Add VFX system: ${label}`);
    return resolvedCollectionFile;
}

/* Upload a preview image (base64, no data-URL prefix) to collection/previews,
   keyed by the cleaned effect name. */
export async function uploadPreview(base64Content: string, effectName: string, extension = 'png'): Promise<string> {
    const baseName = String(effectName || 'preview').trim();
    const cleanName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'preview';
    const supported = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    const finalExt = supported.includes(String(extension).toLowerCase()) ? String(extension).toLowerCase() : 'png';
    const pathInRepo = `collection/previews/${cleanName}.${finalExt}`;
    await updateFile(pathInRepo, base64Content, `Add preview for ${baseName}`, true);
    return pathInRepo;
}

export default {
    testConnection,
    getVFXCollections,
    getVFXCollectionsPublic,
    downloadVFXSystem,
    updateFile,
    uploadVFXSystem,
    uploadPreview,
};
