import { useEffect, useMemo, useState } from 'react';
import { Box, Download, Eye, FileCode2, Image, Info, X } from 'lucide-react';
import {
    wadExplorerPrepareModel, wadExplorerText, wadExplorerTexture,
    type WadPreparedPreview,
} from '@/lib/api/wad';
import { openModelInspect } from '@/lib/model/modelInspectEvent';
import { ModelViewport } from '@/components/model-inspect/ModelViewport';
import type { SelectedWadNode, WadFileNode, WadRuntimeState } from './types';
import { findNode, flattenFiles, formatBytes } from './tree';
import { BinTextViewer } from './BinTextViewer';

const MODEL_EXTENSIONS = new Set(['skn', 'skl', 'anm', 'scb', 'sco']);
const DIRECT_MODEL_EXTENSIONS = new Set(['skn', 'scb', 'sco']);
const TEXT_EXTENSIONS = new Set([
    'bin', 'inibin', 'troybin', 'luabin', 'luabin64', 'luaobj', 'lua',
    'txt', 'json', 'xml', 'ini', 'cfg', 'yaml', 'yml', 'csv', 'shader', 'hlsl',
]);
const IMAGE_EXTENSIONS = new Set(['dds', 'tex']);
const PREVIEW_LIMIT = 20 * 1024 * 1024;
const FOLDER_PREVIEW_COUNT = 24;

function pngUrl(bytes: ArrayBuffer): string {
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

function dirname(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    return normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
}

function stem(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1] || path;
    return name.includes('.') ? name.slice(0, name.lastIndexOf('.')).toLowerCase() : name.toLowerCase();
}

function skinRoot(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    return normalized.match(/^(.*\/characters\/[^/]+\/skins\/[^/]+)/i)?.[1] || dirname(normalized);
}

function skinIdentity(path: string): string | null {
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/\/characters\/([^/]+)\/skins\/(skin\d+|base)(?:\/|\.bin(?:$)|$)/i);
    if (!match) return null;
    const numeric = match[2].toLowerCase() === 'base'
        ? 0
        : Number(match[2].replace(/\D/g, ''));
    return `${match[1].toLowerCase()}:skin${Number.isFinite(numeric) ? numeric : 0}`;
}

function selectModelCompanions(selected: WadFileNode, all: WadFileNode[]) {
    const root = skinRoot(selected.path);
    const inRoot = all.filter((file) => file.path === root || file.path.startsWith(`${root}/`));
    const inDir = inRoot.filter((file) => dirname(file.path) === dirname(selected.path));
    const identity = skinIdentity(selected.path);
    const authoredScope = identity
        ? all.filter((file) => skinIdentity(file.path) === identity)
        : inRoot;
    const models = authoredScope.filter((file) => DIRECT_MODEL_EXTENSIONS.has(file.extension));
    const model = DIRECT_MODEL_EXTENSIONS.has(selected.extension)
        ? selected
        : inDir.find((file) => file.extension === 'skn')
            || models.find((file) => file.extension === 'skn')
            || models[0];
    if (!model) return null;
    const textures = authoredScope.filter((file) => IMAGE_EXTENSIONS.has(file.extension));
    const texture = textures.find((file) => dirname(file.path) === dirname(model.path) && stem(file.path) === stem(model.path))
        || textures.find((file) => dirname(file.path) === dirname(model.path))
        || textures[0]
        || null;
    // Material defs (StaticMaterialDef) that the skin's base/override Material
    // links point to live in the champion DATA bins (data/characters/<champ>/...),
    // NOT under the assets skin folder. Include every data bin for this champion
    // so the native prep can merge them and resolve per-submesh materials.
    const champ = model.path.replace(/\\/g, '/').toLowerCase().match(/\/characters\/([^/]+)\//)?.[1]
        ?? selected.path.replace(/\\/g, '/').toLowerCase().match(/\/characters\/([^/]+)\//)?.[1];
    const dataBinPrefix = champ ? `data/characters/${champ}/` : null;
    const bins = all.filter((file) =>
        file.extension === 'bin'
        && (
            file.path === root || file.path.startsWith(`${root}/`)
            || (dataBinPrefix != null && file.path.replace(/\\/g, '/').toLowerCase().startsWith(dataBinPrefix))
        ));
    // Material samplers can point outside the skin directory (shared champion
    // textures). Supplying TOC metadata is cheap; native preparation still
    // reads and writes only the exact BIN-resolved textures.
    const wadTextures = all.filter((file) => IMAGE_EXTENSIONS.has(file.extension));
    const wadModels = all.filter((file) => DIRECT_MODEL_EXTENSIONS.has(file.extension));
    // Skeleton (beside the .skn) + candidate .anm files. A skin's clips are
    // authored in a linked AnimationGraphData bin and frequently point at the BASE
    // skin's Animations folder (not this skin's), so scope anm candidates to the
    // whole champion asset tree, not just the model's folder. The native prep picks
    // the exact .anm this skin uses from the bin references; these are just what it
    // matches against.
    const modelDir = dirname(model.path).replace(/\\/g, '/').toLowerCase();
    const champAssetPrefix = champ ? `assets/characters/${champ}/` : null;
    const rigging = all.filter((file) => {
        const p = file.path.replace(/\\/g, '/').toLowerCase();
        if (file.extension === 'skl') return dirname(file.path).replace(/\\/g, '/').toLowerCase() === modelDir;
        if (file.extension === 'anm') return champAssetPrefix != null ? p.startsWith(champAssetPrefix) : p.startsWith(`${modelDir}/`) || dirname(p) === modelDir;
        return false;
    });
    const files = [...new Map([...wadModels, ...wadTextures, ...bins, ...rigging].map((file) => [file.path, file])).values()];
    return { model, texture, files };
}

function Loading({ label }: { label: string }) {
    return <div className="wad-preview__state"><span className="wad-spinner" />{label}</div>;
}

function TextureGallery({ files, wadPath }: { files: WadFileNode[]; wadPath: string }) {
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const [loadAll, setLoadAll] = useState(false);
    const autoCount = useMemo(() => {
        let bytes = 0;
        let count = 0;
        for (const file of files) {
            if (count >= FOLDER_PREVIEW_COUNT || (count > 0 && bytes + file.size > PREVIEW_LIMIT)) break;
            bytes += file.size;
            count++;
        }
        return count;
    }, [files]);
    const visibleFiles = useMemo(
        () => loadAll ? files : files.slice(0, autoCount),
        [autoCount, files, loadAll],
    );
    const visibleBytes = visibleFiles.reduce((sum, file) => sum + file.size, 0);
    const remainingFiles = useMemo(() => files.slice(visibleFiles.length), [files, visibleFiles.length]);
    const remainingBytes = remainingFiles.reduce((sum, file) => sum + file.size, 0);

    useEffect(() => setLoadAll(false), [wadPath, files]);

    useEffect(() => {
        let disposed = false;
        const created: string[] = [];
        setUrls({});
        setError('');
        if (!visibleFiles.length) return () => undefined;
        void (async () => {
            const queue = [...visibleFiles];
            const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
                while (!disposed) {
                    const file = queue.shift();
                    if (!file) break;
                    try {
                        const url = pngUrl(await wadExplorerTexture(wadPath, file.pathHash, 320));
                        created.push(url);
                        if (!disposed) setUrls((current) => ({ ...current, [file.path]: url }));
                    } catch { /* a single broken texture should not hide the folder */ }
                }
            });
            await Promise.all(workers);
            if (!disposed && !created.length) setError('None of the textures in this folder could be decoded.');
        })();
        return () => { disposed = true; for (const url of created) URL.revokeObjectURL(url); };
    }, [visibleFiles, wadPath]);

    if (!files.length) return <div className="wad-preview__state">No DDS or TEX files in this folder.</div>;
    return (
        <div className="wad-gallery">
            {visibleFiles.map((file) => (
                <div className="wad-gallery__item" key={file.path} title={file.path}>
                    <div className="wad-gallery__image">
                        {urls[file.path] ? <img src={urls[file.path]} alt={file.name} /> : <span className="wad-spinner" />}
                    </div>
                    <span>{file.name}</span>
                </div>
            ))}
            {!!remainingFiles.length && (
                <div className="wad-gallery__more">
                    <Image size={24} />
                    <strong>{visibleFiles.length} of {files.length} textures shown</strong>
                    <span>{formatBytes(visibleBytes)} loaded. Load {remainingFiles.length} more ({formatBytes(remainingBytes)})?</span>
                    <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => setLoadAll(true)}>Load more</button>
                </div>
            )}
            {error && <div className="wad-preview__error">{error}</div>}
        </div>
    );
}

export function WadPreview({ selected, runtime, onClose, onOpenBinEditor, onExtract }: {
    selected: SelectedWadNode;
    runtime: WadRuntimeState;
    onClose: () => void;
    onOpenBinEditor: (file: WadFileNode) => void;
    onExtract: (file: WadFileNode) => void;
}) {
    const node = selected.node;
    const [imageUrl, setImageUrl] = useState('');
    const [text, setText] = useState<string | null>(null);
    const [prepared, setPrepared] = useState<WadPreparedPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const allFiles = useMemo(() => runtime.tree ? flattenFiles(runtime.tree, []) : [], [runtime.tree]);
    const companions = useMemo(
        () => node.kind === 'file' && MODEL_EXTENSIONS.has(node.extension) ? selectModelCompanions(node, allFiles) : null,
        [allFiles, node],
    );

    useEffect(() => {
        let disposed = false;
        let objectUrl = '';
        setImageUrl(''); setText(null); setPrepared(null); setError(''); setLoading(false);
        if (node.kind !== 'file') return () => undefined;

        const run = async () => {
            if (node.size > PREVIEW_LIMIT && !MODEL_EXTENSIONS.has(node.extension) && !IMAGE_EXTENSIONS.has(node.extension)) {
                setError(`Preview skipped because this file is ${formatBytes(node.size)}. Extract it to inspect the full payload.`);
                return;
            }
            setLoading(true);
            if (IMAGE_EXTENSIONS.has(node.extension)) {
                objectUrl = pngUrl(await wadExplorerTexture(selected.wad.path, node.pathHash));
                if (!disposed) setImageUrl(objectUrl);
            } else if (MODEL_EXTENSIONS.has(node.extension)) {
                if (!companions) throw new Error('No SKN, SCB, or SCO model was found beside this asset.');
                const value = await wadExplorerPrepareModel({
                    wadPath: selected.wad.path,
                    files: companions.files.map((file) => ({ pathHash: file.pathHash, path: file.path })),
                    primaryPath: companions.model.path,
                    texturePath: companions.texture?.path,
                });
                console.log('[tex-debug] bins sent=', companions.files.filter((f) => f.extension === 'bin').length,
                    ' texturePath=', value.texturePath, ' texturePaths=', value.texturePaths);
                if (!disposed) setPrepared(value);
            } else if (TEXT_EXTENSIONS.has(node.extension) || !node.extension) {
                const value = await wadExplorerText(selected.wad.path, node.pathHash, node.extension);
                if (!disposed) setText(value);
            }
        };
        void run().catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); })
            .finally(() => { if (!disposed) setLoading(false); });
        return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [companions, node, selected.wad.path]);

    if (node.kind === 'directory') {
        const fullNode = runtime.tree ? findNode(runtime.tree, node.path) : null;
        const previewNode = fullNode?.kind === 'directory' ? fullNode : node;
        const textures = previewNode.children.filter(
            (child): child is WadFileNode => child.kind === 'file' && IMAGE_EXTENSIONS.has(child.extension),
        );
        return (
            <section className="wad-preview">
                <PreviewHeader icon={<FolderOpenIcon />} title={node.name} subtitle={`${textures.length} previewable texture${textures.length === 1 ? '' : 's'}`} onClose={onClose} />
                <div className="wad-preview__content"><TextureGallery files={textures} wadPath={selected.wad.path} /></div>
            </section>
        );
    }
    const binLike = node.extension === 'bin' || node.extension === 'inibin' || !node.extension;

    return (
        <section className="wad-preview">
            <PreviewHeader
                icon={MODEL_EXTENSIONS.has(node.extension) ? <Box size={17} /> : binLike || TEXT_EXTENSIONS.has(node.extension) ? <FileCode2 size={17} /> : <Image size={17} />}
                title={node.name}
                subtitle={node.path}
                onClose={onClose}
            />
            <div className="wad-preview__actions">
                <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => onExtract(node)}><Download size={13} /> Extract</button>
                {binLike && <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => onOpenBinEditor(node)}><FileCode2 size={13} /> Open in Bin Editor</button>}
                {prepared && <button className="dl-btn dl-btn--sm dl-btn--primary" onClick={() => openModelInspect(prepared.primaryPath, prepared.texturePath, prepared.texturePaths, prepared.hiddenSubmeshes, prepared.modelScale, undefined, prepared.anmPaths, prepared.anmClips)}><Eye size={13} /> Full Model Viewer</button>}
            </div>
            <div className="wad-preview__content">
                {loading && <Loading label={MODEL_EXTENSIONS.has(node.extension) ? 'Preparing model assets…' : 'Reading preview…'} />}
                {error && <div className="wad-preview__error">{error}</div>}
                {!loading && prepared && (
                    <div className="wad-preview__model">
                        <ModelViewport
                            path={prepared.primaryPath}
                            texturePath={prepared.texturePath}
                            texturePaths={prepared.texturePaths}
                            hiddenGroups={new Set(prepared.hiddenSubmeshes)}
                            modelScale={prepared.modelScale}
                            autoRotate
                            interactive
                            showGrid
                        />
                    </div>
                )}
                {!loading && imageUrl && <div className="wad-preview__single-image"><img src={imageUrl} alt={node.name} /></div>}
                {!loading && text !== null && <BinTextViewer content={text} />}
                {!loading && !error && !prepared && !imageUrl && text === null && (
                    <div className="wad-preview__state"><Info size={24} />No inline renderer for this file type.</div>
                )}
            </div>
            <footer className="wad-preview__meta">
                <span><b>Hash</b>{node.pathHash}</span>
                <span><b>Size</b>{formatBytes(node.size)}</span>
                <span><b>Stored</b>{formatBytes(node.compressedSize)}</span>
                <span><b>Compression</b>{node.type}</span>
            </footer>
        </section>
    );
}

function PreviewHeader({ icon, title, subtitle, onClose }: { icon: React.ReactNode; title: string; subtitle: string; onClose: () => void }) {
    return (
        <header className="wad-preview__header">
            <span className="wad-preview__mark">{icon}</span>
            <div><strong>{title}</strong><span title={subtitle}>{subtitle}</span></div>
            <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--ghost" title="Close preview" onClick={onClose}><X size={15} /></button>
        </header>
    );
}

function FolderOpenIcon() {
    return <Box size={17} />;
}
