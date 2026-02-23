/**
 * Flint - WAD Explorer
 *
 * A unified Virtual File System (VFS) browser for all League game assets.
 * WADs are discovered via scan_game_wads then lazily loaded on expand via
 * get_wad_chunks — no chunk bytes are ever read at this stage.
 *
 * Layout mirrors the Mod Project screen:
 *   Left  — resizable VFS tree with debounced regex search
 *   Right — quick-action cards when idle, inline preview when a file is selected
 */

import React, {
    useState, useCallback, useEffect, useRef, useMemo,
} from 'react';
import { useAppState } from '../lib/state';
import * as api from '../lib/api';
import { open } from '@tauri-apps/plugin-dialog';
import { getIcon, getFileIcon } from '../lib/fileIcons';
import type { WadChunk, WadExplorerWad } from '../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icons (fallbacks for any missing icon keys)
// ─────────────────────────────────────────────────────────────────────────────

const ICON_GRID = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// VFS Tree types
// ─────────────────────────────────────────────────────────────────────────────

interface VFSFolder {
    type: 'folder';
    name: string;
    /** Unique key: `${wadPath}::${folderPath}` */
    key: string;
    children: VFSNode[];
}

interface VFSFile {
    type: 'file';
    name: string;
    chunk: WadChunk;
    wadPath: string;
}

type VFSNode = VFSFolder | VFSFile;

// ─────────────────────────────────────────────────────────────────────────────
// VFS tree builder (from chunks)
// ─────────────────────────────────────────────────────────────────────────────

function buildVFSSubtree(chunks: WadChunk[], wadPath: string): VFSNode[] {
    const folderMap = new Map<string, VFSFolder>();
    const roots: VFSNode[] = [];

    const getOrCreate = (folderPath: string): VFSFolder => {
        const key = `${wadPath}::${folderPath}`;
        if (folderMap.has(key)) return folderMap.get(key)!;
        const parts = folderPath.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const folder: VFSFolder = { type: 'folder', name, key, children: [] };
        folderMap.set(key, folder);
        if (parentPath === '') {
            roots.push(folder);
        } else {
            getOrCreate(parentPath).children.push(folder);
        }
        return folder;
    };

    for (const chunk of chunks) {
        if (!chunk.path) continue;
        const normalized = chunk.path.replace(/\\/g, '/');
        const parts = normalized.split('/');
        const fileName = parts[parts.length - 1];
        const dirParts = parts.slice(0, -1);
        const fileNode: VFSFile = { type: 'file', name: fileName, chunk, wadPath };
        if (dirParts.length === 0) {
            roots.push(fileNode);
        } else {
            getOrCreate(dirParts.join('/')).children.push(fileNode);
        }
    }

    // Unknown hashes at the bottom
    const unknown = chunks.filter(c => !c.path);
    if (unknown.length > 0) {
        const key = `${wadPath}::__unknown__`;
        roots.push({
            type: 'folder',
            name: `[Unknown Hashes] (${unknown.length})`,
            key,
            children: unknown.map(c => ({
                type: 'file' as const,
                name: c.hash,
                chunk: c,
                wadPath,
            })),
        });
    }

    const sort = (nodes: VFSNode[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return (a.name ?? '').localeCompare(b.name ?? '');
        });
        for (const n of nodes) {
            if (n.type === 'folder') sort(n.children);
        }
    };
    sort(roots);
    return roots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search helpers
// ─────────────────────────────────────────────────────────────────────────────

function matchChunk(chunk: WadChunk, re: RegExp | null, plain: string): boolean {
    const haystack = chunk.path?.toLowerCase() ?? chunk.hash;
    return re ? re.test(chunk.path ?? chunk.hash) : haystack.includes(plain);
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-action card config
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { label: 'Textures', regex: /\.(dds|tex|png|jpg|jpeg)$/i, iconHtml: getIcon('texture') },
    { label: 'BIN Files', regex: /\.bin$/i, iconHtml: getIcon('bin') },
    { label: 'Audio', regex: /\.(bnk|wpk)$/i, iconHtml: getIcon('audio') },
    { label: 'Models', regex: /\.(skn|skl|scb|sco)$/i, iconHtml: getIcon('model') },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Inline chunk preview (self-contained, no ExtractSession needed)
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewData {
    fileType: string;
    bytes: Uint8Array;
    imageUrl: string | null;
    text: string | null;
    dims: [number, number] | null;
}

function detectType(bytes: Uint8Array, pathHint: string | null): string {
    const ext = pathHint?.split('.').pop()?.toLowerCase() ?? '';
    if (bytes.length >= 4) {
        const b = bytes;
        if (b[0] === 0x54 && b[1] === 0x45 && b[2] === 0x58 && b[3] === 0x00) return 'image/tex';
        if (b[0] === 0x44 && b[1] === 0x44 && b[2] === 0x53 && b[3] === 0x20) return 'image/dds';
        if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
        if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
        const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
        if (magic === 'PROP' || magic === 'PTCH') return 'application/x-bin';
    }
    const extMap: Record<string, string> = {
        dds: 'image/dds', tex: 'image/tex', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        bin: 'application/x-bin', json: 'application/json', txt: 'text/plain', lua: 'text/x-lua',
        xml: 'application/xml', js: 'text/javascript', ts: 'text/typescript',
        skn: 'model/x-lol-skn', skl: 'model/x-lol-skl', scb: 'model/x-lol-scb',
        anm: 'animation/x-lol-anm', bnk: 'audio/x-wwise-bnk', wpk: 'audio/x-wwise-wpk',
    };
    return extMap[ext] ?? 'application/octet-stream';
}

const ChunkPreview: React.FC<{
    wadPath: string;
    chunk: WadChunk;
    onClose: () => void;
}> = ({ wadPath, chunk, onClose }) => {
    const { showToast } = useAppState();
    const [data, setData] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [zoom, setZoom] = useState<'fit' | number>('fit');
    const [extracting, setExtracting] = useState(false);
    const blobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
        setLoading(true); setErr(null); setData(null); setZoom('fit');

        (async () => {
            try {
                const bytes = await api.readWadChunkData(wadPath, chunk.hash);
                if (cancelled) return;
                const fileType = detectType(bytes, chunk.path);
                let imageUrl: string | null = null;
                let text: string | null = null;
                let dims: [number, number] | null = null;

                if (fileType === 'image/dds' || fileType === 'image/tex') {
                    const decoded = await api.decodeBytesToPng(bytes);
                    if (!cancelled) { imageUrl = `data:image/png;base64,${decoded.data}`; dims = [decoded.width, decoded.height]; }
                } else if (fileType === 'image/png' || fileType === 'image/jpeg') {
                    const mime = fileType === 'image/png' ? 'image/png' : 'image/jpeg';
                    const buf = new ArrayBuffer(bytes.byteLength);
                    new Uint8Array(buf).set(bytes);
                    const url = URL.createObjectURL(new Blob([buf], { type: mime }));
                    blobUrlRef.current = url;
                    if (!cancelled) imageUrl = url;
                } else if (fileType === 'application/x-bin') {
                    if (!cancelled) text = await api.convertBinToText(bytes);
                } else if (fileType.startsWith('text/') || fileType === 'application/json' || fileType === 'application/xml') {
                    if (!cancelled) text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                }

                if (!cancelled) setData({ fileType, bytes, imageUrl, text, dims });
            } catch (e) {
                if (!cancelled) setErr((e as Error).message ?? 'Failed to load preview');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [wadPath, chunk.hash]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); }, []);

    const handleExtract = async () => {
        try {
            const dest = await open({ title: 'Choose Extraction Folder', directory: true });
            if (!dest) return;
            setExtracting(true);
            const res = await api.extractWad(wadPath, dest as string, [chunk.hash]);
            showToast('success', `Extracted ${res.extracted} file`);
        } catch { showToast('error', 'Extraction failed'); }
        finally { setExtracting(false); }
    };

    const fileName = chunk.path
        ? (chunk.path.split('/').pop() ?? chunk.path.split('\\').pop() ?? chunk.path)
        : chunk.hash;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div className="preview-panel__toolbar" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <button className="btn btn--sm" onClick={onClose} title="Close preview" style={{ padding: '2px 6px' }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
                {data?.imageUrl && (
                    <>
                        {(['fit', 1, 2] as const).map(z => (
                            <button key={String(z)} className={`btn btn--sm ${zoom === z ? 'btn--active' : ''}`} onClick={() => setZoom(z)}>
                                {z === 'fit' ? 'Fit' : `${(z as number) * 100}%`}
                            </button>
                        ))}
                        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 2px' }} />
                    </>
                )}
                <span className="preview-panel__filename" style={{ fontSize: '12px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fileName}
                </span>
                <button className="btn btn--sm btn--primary" onClick={handleExtract} disabled={extracting} title="Extract file to folder">
                    <span dangerouslySetInnerHTML={{ __html: getIcon('export') }} />
                    <span>{extracting ? 'Extracting…' : 'Extract'}</span>
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {loading && (
                    <div className="preview-panel__loading"><div className="spinner" /><span>Loading…</span></div>
                )}
                {err && (
                    <div className="preview-panel__error">
                        <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                        <span>{err}</span>
                    </div>
                )}
                {data && !loading && !err && (() => {
                    const { fileType, bytes, imageUrl, text, dims } = data;

                    if (imageUrl) {
                        const imgStyle: React.CSSProperties = zoom === 'fit'
                            ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                            : { width: `${(dims?.[0] ?? 0) * (zoom as number)}px` };
                        return (
                            <div
                                className="image-preview"
                                onWheel={e => {
                                    e.preventDefault();
                                    const cur = zoom === 'fit' ? 1 : (zoom as number);
                                    setZoom(Math.max(0.1, Math.min(5, cur + (e.deltaY > 0 ? -0.1 : 0.1))));
                                }}
                                style={{ overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
                            >
                                <img src={imageUrl} alt={fileName} draggable={false} style={imgStyle}
                                    onLoad={e => {
                                        if (!dims) {
                                            const img = e.currentTarget;
                                            setData(p => p ? { ...p, dims: [img.naturalWidth, img.naturalHeight] } : p);
                                        }
                                    }}
                                />
                            </div>
                        );
                    }

                    if (text !== null) {
                        return (
                            <pre style={{ margin: 0, padding: '12px 16px', overflow: 'auto', height: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px', lineHeight: '1.6', color: 'var(--text-primary)', background: 'var(--bg-secondary)', boxSizing: 'border-box', whiteSpace: 'pre-wrap' }}>
                                {text}
                            </pre>
                        );
                    }

                    if (fileType.startsWith('model/') || fileType.startsWith('audio/') || fileType.startsWith('animation/')) {
                        return (
                            <div className="preview-panel__empty">
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                    <div style={{ marginBottom: '12px', opacity: 0.6 }}>{fileType}</div>
                                    <button className="btn btn--primary btn--sm" onClick={handleExtract} disabled={extracting}>
                                        <span dangerouslySetInnerHTML={{ __html: getIcon('export') }} />
                                        <span>Extract to preview</span>
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    // Hex dump
                    const slice = bytes.slice(0, 16 * 256);
                    const rows = [];
                    for (let i = 0; i < slice.length; i += 16) {
                        const row = slice.slice(i, i + 16);
                        const hex = Array.from(row).map(b => b.toString(16).padStart(2, '0')).join(' ');
                        const ascii = Array.from(row).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
                        rows.push(
                            <div key={i} style={{ display: 'flex', gap: '16px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5' }}>
                                <span style={{ color: 'var(--text-muted)', minWidth: '56px' }}>{i.toString(16).padStart(8, '0')}</span>
                                <span style={{ color: 'var(--text-primary)', flex: 1 }}>{hex}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{ascii}</span>
                            </div>
                        );
                    }
                    return (
                        <div style={{ padding: '12px', overflow: 'auto', height: '100%', background: 'var(--bg-secondary)' }}>
                            {rows}
                            {bytes.length > slice.length && (
                                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                                    … {(bytes.length - slice.length).toLocaleString()} more bytes
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Info bar */}
            {data && (
                <div className="preview-panel__info-bar" style={{ display: 'flex', gap: '12px', padding: '4px 10px', fontSize: '11px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                    <span><span style={{ opacity: 0.6 }}>Size: </span>{formatBytes(data.bytes.length)}</span>
                    {data.dims && <span><span style={{ opacity: 0.6 }}>Dims: </span>{data.dims[0]}×{data.dims[1]}</span>}
                    <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: '10px' }}>{chunk.hash}</span>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// VFS tree node (recursive)
// ─────────────────────────────────────────────────────────────────────────────

interface VFSNodeProps {
    node: VFSNode;
    depth: number;
    expandedFolders: Set<string>;
    selectedHash: string | null;
    onSelectFile: (wadPath: string, chunk: WadChunk) => void;
    onToggleFolder: (key: string) => void;
    onDeepToggleFolder: (keys: string[], expand: boolean) => void;
    onContextMenu: (chunk: WadChunk, wadPath: string, x: number, y: number) => void;
}

// Compact folders: merge single-child VFS folder chains into one label
function compactVFSNode(node: VFSFolder): { displayPath: string; effectiveNode: VFSFolder } {
    let current = node;
    const parts = [current.name];
    while (
        current.children.length === 1 &&
        current.children[0].type === 'folder'
    ) {
        current = current.children[0];
        parts.push(current.name);
    }
    return { displayPath: parts.join('/'), effectiveNode: current };
}

// Collect all descendant folder keys for deep expand/collapse
function collectAllVFSFolderKeys(node: VFSNode): string[] {
    if (node.type !== 'folder') return [];
    const result = [node.key];
    for (const child of node.children) {
        result.push(...collectAllVFSFolderKeys(child));
    }
    return result;
}

const VFSNodeRow: React.FC<VFSNodeProps> = React.memo(({
    node, depth, expandedFolders, selectedHash, onSelectFile, onToggleFolder, onDeepToggleFolder, onContextMenu,
}) => {
    const indent = depth * 14;

    if (node.type === 'folder') {
        // Apply compact-folder merging
        const { displayPath, effectiveNode } = compactVFSNode(node);
        const isExp = expandedFolders.has(effectiveNode.key);

        const handleFolderClick = (e: React.MouseEvent) => {
            if (e.shiftKey) {
                // Deep expand/collapse
                const allKeys = collectAllVFSFolderKeys(effectiveNode);
                onDeepToggleFolder(allKeys, !isExp);
            } else {
                onToggleFolder(effectiveNode.key);
            }
        };

        return (
            <>
                <div
                    className="file-tree__item"
                    style={{ paddingLeft: `${8 + indent}px` }}
                    onClick={handleFolderClick}
                >
                    <span className="file-tree__chevron" dangerouslySetInnerHTML={{ __html: getIcon(isExp ? 'chevronDown' : 'chevronRight') }} />
                    <span className="file-tree__icon" dangerouslySetInnerHTML={{ __html: getIcon(isExp ? 'folderOpen' : 'folder') }} />
                    <span className="file-tree__name">
                        {displayPath.includes('/') ? (
                            displayPath.split('/').map((segment, idx, arr) => (
                                <React.Fragment key={idx}>
                                    <span className="file-tree__compact-segment">{segment}</span>
                                    {idx < arr.length - 1 && <span className="file-tree__compact-separator">/</span>}
                                </React.Fragment>
                            ))
                        ) : (
                            displayPath
                        )}
                    </span>
                </div>
                {isExp && effectiveNode.children.map(child => (
                    <VFSNodeRow
                        key={child.type === 'file' ? `${child.wadPath}::${child.chunk.hash}` : child.key}
                        node={child}
                        depth={depth + 1}
                        expandedFolders={expandedFolders}
                        selectedHash={selectedHash}
                        onSelectFile={onSelectFile}
                        onToggleFolder={onToggleFolder}
                        onDeepToggleFolder={onDeepToggleFolder}
                        onContextMenu={onContextMenu}
                    />
                ))}
            </>
        );
    }

    // File node
    const isSelected = node.chunk.hash === selectedHash;
    const tooltip = node.chunk.path
        ? `${node.chunk.path}\nHash: ${node.chunk.hash}\nSize: ${formatBytes(node.chunk.size)}`
        : `Hash: ${node.chunk.hash}\nSize: ${formatBytes(node.chunk.size)}`;

    return (
        <div
            className={`file-tree__item ${isSelected ? 'file-tree__item--selected' : ''}`}
            style={{ paddingLeft: `${8 + indent + 16}px` }}
            title={tooltip}
            onClick={() => onSelectFile(node.wadPath, node.chunk)}
            onContextMenu={e => { e.preventDefault(); onContextMenu(node.chunk, node.wadPath, e.clientX, e.clientY); }}
        >
            <span className="file-tree__icon" dangerouslySetInnerHTML={{ __html: getFileIcon(node.name, false) }} />
            <span className="file-tree__name" style={{ flex: 1, minWidth: 0 }}>{node.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingRight: '4px', flexShrink: 0 }}>
                {formatBytes(node.chunk.size)}
            </span>
        </div>
    );
});
VFSNodeRow.displayName = 'VFSNodeRow';

// ─────────────────────────────────────────────────────────────────────────────
// Search result row (flat list, used when query is non-empty)
// ─────────────────────────────────────────────────────────────────────────────

const SearchResultRow: React.FC<{
    chunk: WadChunk;
    wadPath: string;
    wadName: string;
    isSelected: boolean;
    onSelect: () => void;
    onContextMenu: (x: number, y: number) => void;
}> = React.memo(({ chunk, wadPath: _wadPath, wadName, isSelected, onSelect, onContextMenu }) => {
    const name = chunk.path ? (chunk.path.split('/').pop() ?? chunk.hash) : chunk.hash;
    const tooltip = `${wadName}\n${chunk.path ?? chunk.hash}\n${formatBytes(chunk.size)}`;
    return (
        <div
            className={`file-tree__item ${isSelected ? 'file-tree__item--selected' : ''}`}
            style={{ paddingLeft: '8px' }}
            title={tooltip}
            onClick={onSelect}
            onContextMenu={e => { e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
        >
            <span className="file-tree__icon" dangerouslySetInnerHTML={{ __html: getFileIcon(name, false) }} />
            <span className="file-tree__name" style={{ flex: 1, minWidth: 0 }}>{name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingRight: '4px', flexShrink: 0, opacity: 0.7 }}>
                {wadName.replace('.wad.client', '')}
            </span>
        </div>
    );
});
SearchResultRow.displayName = 'SearchResultRow';

// ─────────────────────────────────────────────────────────────────────────────
// Quick-action cards (shown when no file is previewed)
// ─────────────────────────────────────────────────────────────────────────────

interface QuickActionPanelProps {
    wads: WadExplorerWad[];
    onSetFilter: (query: string) => void;
}

const QuickActionPanel: React.FC<QuickActionPanelProps> = ({ wads, onSetFilter }) => {
    const loadedChunks = useMemo(() => {
        const all: WadChunk[] = [];
        for (const w of wads) {
            if (w.status === 'loaded') all.push(...w.chunks);
        }
        return all;
    }, [wads]);

    const counts = useMemo(() =>
        QUICK_ACTIONS.map(qa => ({
            ...qa,
            count: loadedChunks.filter(c => c.path && qa.regex.test(c.path)).length,
        })),
        [loadedChunks]
    );

    const totalLoaded = wads.filter(w => w.status === 'loaded').length;
    const totalWads = wads.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '32px', padding: '32px' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ opacity: 0.4, marginBottom: '8px' }} dangerouslySetInnerHTML={{ __html: ICON_GRID }} />
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>WAD Explorer</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {totalWads === 0
                        ? 'Scanning game directory…'
                        : totalLoaded < totalWads
                            ? `Loading WADs… ${totalLoaded} / ${totalWads}`
                            : `${totalWads} WADs loaded — select a file to preview`}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', maxWidth: '480px' }}>
                {counts.map(qa => (
                    <button
                        key={qa.label}
                        className="btn btn--secondary"
                        onClick={() => onSetFilter(qa.regex.source)}
                        title={`Filter to ${qa.label} (${qa.count.toLocaleString()} in loaded WADs)`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 12px', height: 'auto' }}
                    >
                        <span dangerouslySetInnerHTML={{ __html: qa.iconHtml }} />
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{qa.label}</span>
                        {qa.count > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {qa.count.toLocaleString()}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main WadExplorer component
// ─────────────────────────────────────────────────────────────────────────────

export const WadExplorer: React.FC = () => {
    const { state, dispatch, showToast } = useAppState();
    const { wadExplorer } = state;

    // ── Local UI state ───────────────────────────────────────────────────────
    const [leftWidth, setLeftWidth] = useState(320);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const isResizingRef = useRef(false);

    const handleToggleCategory = useCallback((cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    }, []);

    // Search input (debounced → global state)
    const [inputValue, setInputValue] = useState(wadExplorer.searchQuery);
    const [isRegex, setIsRegex] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // ── Derived search state ─────────────────────────────────────────────────
    const trimmed = inputValue.trim();
    let searchRe: RegExp | null = null;
    let regexError = false;
    if (isRegex && trimmed) {
        try { searchRe = new RegExp(trimmed, 'i'); } catch { regexError = true; }
    }
    const plainLower = trimmed.toLowerCase();

    // ── Scan on mount if not yet scanned ────────────────────────────────────
    useEffect(() => {
        if (wadExplorer.scanStatus !== 'idle') return;

        const gamePath = state.leaguePath ? `${state.leaguePath}/Game` : null;
        if (!gamePath) {
            // Let the user provide the path inline
            return;
        }
        runScan(gamePath);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const runScan = async (gamePath: string) => {
        dispatch({ type: 'SET_WAD_EXPLORER_SCAN', payload: { status: 'scanning' } });
        try {
            const wads = await api.scanGameWads(gamePath);
            dispatch({ type: 'SET_WAD_EXPLORER_SCAN', payload: { status: 'ready', wads } });
        } catch (e) {
            dispatch({ type: 'SET_WAD_EXPLORER_SCAN', payload: { status: 'error', error: (e as Error).message } });
            showToast('error', 'Failed to scan WAD directory');
        }
    };

    const handlePickGamePath = async () => {
        const picked = await open({ title: 'Select League Game/ Folder', directory: true });
        if (!picked) return;
        await runScan(picked as string);
    };

    // ── Batch WAD loading (Obsidian-style): one Rust call loads all WADs ──────
    // Rust uses rayon to read all WAD indexes in parallel, then returns them in
    // a single IPC round-trip. This is far faster than N individual calls.
    const loadWad = useCallback(async (wadPath: string) => {
        // Fallback used only when a user expands a WAD that somehow stayed 'idle'
        dispatch({ type: 'SET_WAD_EXPLORER_WAD_STATUS', payload: { wadPath, status: 'loading' } });
        try {
            const chunks = await api.getWadChunks(wadPath);
            dispatch({ type: 'SET_WAD_EXPLORER_WAD_STATUS', payload: { wadPath, status: 'loaded', chunks } });
        } catch (e) {
            dispatch({ type: 'SET_WAD_EXPLORER_WAD_STATUS', payload: { wadPath, status: 'error', error: (e as Error).message } });
        }
    }, [dispatch]);

    const handleToggleWad = useCallback((wadPath: string) => {
        dispatch({ type: 'TOGGLE_WAD_EXPLORER_WAD', payload: wadPath });
        const wad = wadExplorer.wads.find(w => w.path === wadPath);
        if (wad?.status === 'idle') loadWad(wadPath);
    }, [dispatch, loadWad, wadExplorer.wads]);

    // Single batch call once scan is ready — marks all as 'loading', fires one
    // Rust command, then dispatches all results in one state update.
    useEffect(() => {
        if (wadExplorer.scanStatus !== 'ready') return;
        const idlePaths = wadExplorer.wads.filter(w => w.status === 'idle').map(w => w.path);
        if (idlePaths.length === 0) return;

        // Mark all as loading in one dispatch
        dispatch({
            type: 'BATCH_SET_WAD_STATUSES',
            payload: idlePaths.map(p => ({ wadPath: p, status: 'loading' })),
        });

        api.loadAllWadChunks(idlePaths).then(batches => {
            dispatch({
                type: 'BATCH_SET_WAD_STATUSES',
                payload: batches.map(b => ({
                    wadPath: b.path,
                    status: b.error ? 'error' : 'loaded',
                    chunks: b.chunks,
                    error: b.error ?? undefined,
                })),
            });
        }).catch(e => {
            // Fallback: mark all as error
            dispatch({
                type: 'BATCH_SET_WAD_STATUSES',
                payload: idlePaths.map(p => ({ wadPath: p, status: 'error', error: (e as Error).message })),
            });
        });
    }, [wadExplorer.scanStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleToggleFolder = useCallback((key: string) => {
        dispatch({ type: 'TOGGLE_WAD_EXPLORER_FOLDER', payload: key });
    }, [dispatch]);

    const handleDeepToggleFolder = useCallback((keys: string[], expand: boolean) => {
        dispatch({ type: 'BULK_SET_WAD_EXPLORER_FOLDERS', payload: { keys, expand } });
    }, [dispatch]);

    const handleSelectFile = useCallback((wadPath: string, chunk: WadChunk) => {
        dispatch({ type: 'SET_WAD_EXPLORER_SELECTED', payload: { wadPath, hash: chunk.hash } });
    }, [dispatch]);

    // ── Search ───────────────────────────────────────────────────────────────
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            dispatch({ type: 'SET_WAD_EXPLORER_SEARCH', payload: val });
        }, 300);
    }, [dispatch]);

    // Ctrl+F → focus search; Escape → clear search
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f' && state.currentView === 'wad-explorer') {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
            if (e.key === 'Escape' && document.activeElement === searchRef.current) {
                setInputValue('');
                dispatch({ type: 'SET_WAD_EXPLORER_SEARCH', payload: '' });
                searchRef.current?.blur();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dispatch, state.currentView]);

    // ── Context menu ─────────────────────────────────────────────────────────
    const handleContextMenu = useCallback((chunk: WadChunk, wadPath: string, x: number, y: number) => {
        const options = [];
        if (chunk.path) {
            options.push({ label: 'Copy Path', icon: 'copy', onClick: () => navigator.clipboard.writeText(chunk.path!) });
        }
        options.push({ label: 'Copy Hash', icon: 'copy', onClick: () => navigator.clipboard.writeText(chunk.hash) });
        options.push({
            label: 'Extract File…', icon: 'export',
            onClick: async () => {
                try {
                    const dest = await open({ title: 'Choose Extraction Folder', directory: true });
                    if (!dest) return;
                    const res = await api.extractWad(wadPath, dest as string, [chunk.hash]);
                    showToast('success', `Extracted ${res.extracted} file`);
                } catch { showToast('error', 'Extraction failed'); }
            },
        });
        dispatch({ type: 'OPEN_CONTEXT_MENU', payload: { x, y, options } });
    }, [dispatch, showToast]);

    // ── Resizer ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            setLeftWidth(Math.min(600, Math.max(200, e.clientX)));
        };
        const onUp = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, []);

    // ── Current selection ────────────────────────────────────────────────────
    const selectedWad = wadExplorer.selected
        ? wadExplorer.wads.find(w => w.path === wadExplorer.selected!.wadPath)
        : null;
    const selectedChunk = selectedWad?.status === 'loaded'
        ? selectedWad.chunks.find(c => c.hash === wadExplorer.selected!.hash) ?? null
        : null;

    // ── Search results (flat) ────────────────────────────────────────────────
    const searchResults = useMemo(() => {
        if (!trimmed) return null;
        const results: Array<{ chunk: WadChunk; wadPath: string; wadName: string }> = [];
        for (const w of wadExplorer.wads) {
            if (w.status !== 'loaded') continue;
            for (const chunk of w.chunks) {
                if (matchChunk(chunk, searchRe, plainLower)) {
                    results.push({ chunk, wadPath: w.path, wadName: w.name });
                }
            }
        }
        return results.slice(0, 5000); // cap DOM size
    }, [wadExplorer.wads, trimmed, isRegex, inputValue]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Grouped WAD categories for tree ─────────────────────────────────────
    const categories = useMemo(() => {
        const map = new Map<string, WadExplorerWad[]>();
        for (const w of wadExplorer.wads) {
            const list = map.get(w.category) ?? [];
            list.push(w);
            map.set(w.category, list);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [wadExplorer.wads]);

    // ── WAD subtrees (memoized per wad) ─────────────────────────────────────
    const wadSubtrees = useMemo(() => {
        const m = new Map<string, VFSNode[]>();
        for (const w of wadExplorer.wads) {
            if (w.status === 'loaded') {
                m.set(w.path, buildVFSSubtree(w.chunks, w.path));
            }
        }
        return m;
    }, [wadExplorer.wads]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* ── LEFT: VFS tree ── */}
            <div className="left-panel" style={{ width: leftWidth, minWidth: 200, maxWidth: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                {/* Header */}
                <div className="left-panel__header" style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span dangerouslySetInnerHTML={{ __html: getIcon('wad') }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, flex: 1 }}>WAD Explorer</span>
                        {wadExplorer.scanStatus === 'scanning' && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 }}>Scanning…</span>
                        )}
                        {wadExplorer.scanStatus === 'idle' && !state.leaguePath && (
                            <button className="btn btn--sm" onClick={handlePickGamePath} title="Select game folder" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                Pick folder
                            </button>
                        )}
                    </div>
                    {/* Search */}
                    <div className="file-tree__search" style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }}
                            dangerouslySetInnerHTML={{ __html: getIcon('search') }} />
                        <input
                            ref={searchRef}
                            type="text"
                            className="file-tree__search-input"
                            placeholder={isRegex ? 'Regex filter… (Ctrl+F)' : 'Filter files… (Ctrl+F)'}
                            value={inputValue}
                            onChange={handleInputChange}
                            style={{ paddingLeft: '26px', paddingRight: '28px', borderColor: regexError ? 'var(--error, #f44)' : undefined }}
                        />
                        <button
                            className={`btn btn--sm ${isRegex ? 'btn--active' : ''}`}
                            onClick={() => setIsRegex(v => !v)}
                            title={isRegex ? 'Regex mode (click for plain text)' : 'Plain text (click for regex)'}
                            style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '1px 4px', fontSize: '10px', fontFamily: 'monospace' }}
                        >.*</button>
                    </div>
                </div>

                {/* Tree / scan states */}
                <div className="file-tree" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {wadExplorer.scanStatus === 'idle' && state.leaguePath && (
                        <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>Preparing scan…</div>
                    )}
                    {wadExplorer.scanStatus === 'scanning' && (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div className="spinner" style={{ margin: '0 auto 8px' }} />
                            <div style={{ fontSize: '12px' }}>Scanning game directory…</div>
                        </div>
                    )}
                    {wadExplorer.scanStatus === 'error' && (
                        <div style={{ padding: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--error, #f44)', marginBottom: '8px' }}>{wadExplorer.scanError}</div>
                            <button className="btn btn--sm" onClick={handlePickGamePath}>Pick game folder</button>
                        </div>
                    )}
                    {wadExplorer.scanStatus === 'idle' && !state.leaguePath && (
                        <div style={{ padding: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>No League path configured.</div>
                            <button className="btn btn--sm btn--primary" onClick={handlePickGamePath}>Select Game Folder</button>
                        </div>
                    )}

                    {/* Search results (flat) */}
                    {wadExplorer.scanStatus === 'ready' && searchResults !== null && (
                        <>
                            {regexError && (
                                <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--error, #f44)' }}>Invalid regex pattern</div>
                            )}
                            {searchResults.length === 0 && !regexError && (
                                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    No matches found.
                                </div>
                            )}
                            {searchResults.map(({ chunk, wadPath, wadName }) => (
                                <SearchResultRow
                                    key={`${wadPath}::${chunk.hash}`}
                                    chunk={chunk}
                                    wadPath={wadPath}
                                    wadName={wadName}
                                    isSelected={wadExplorer.selected?.hash === chunk.hash && wadExplorer.selected?.wadPath === wadPath}
                                    onSelect={() => handleSelectFile(wadPath, chunk)}
                                    onContextMenu={(x, y) => handleContextMenu(chunk, wadPath, x, y)}
                                />
                            ))}
                        </>
                    )}

                    {/* Normal tree */}
                    {wadExplorer.scanStatus === 'ready' && searchResults === null && categories.map(([cat, wads]) => {
                        const isCatCollapsed = collapsedCategories.has(cat);
                        const loadedInCat = wads.filter(w => w.status === 'loaded').length;
                        return (
                            <div key={cat}>
                                {/* Category label — clickable to collapse */}
                                <div
                                    className="file-tree__item"
                                    style={{ padding: '4px 8px 2px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', userSelect: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleToggleCategory(cat)}
                                >
                                    <span dangerouslySetInnerHTML={{ __html: getIcon(isCatCollapsed ? 'chevronRight' : 'chevronDown') }} />
                                    <span style={{ flex: 1 }}>{cat}</span>
                                    <span style={{ fontSize: '9px', opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                                        {loadedInCat}/{wads.length}
                                    </span>
                                </div>
                                {!isCatCollapsed && wads.map(wad => {
                                    const isExp = wadExplorer.expandedWads.has(wad.path);
                                    const subtree = wadSubtrees.get(wad.path) ?? [];
                                    return (
                                        <div key={wad.path}>
                                            {/* WAD row */}
                                            <div
                                                className="file-tree__item"
                                                style={{ paddingLeft: '8px' }}
                                                onClick={() => handleToggleWad(wad.path)}
                                                title={wad.path}
                                            >
                                                <span className="file-tree__chevron" dangerouslySetInnerHTML={{ __html: getIcon(isExp ? 'chevronDown' : 'chevronRight') }} />
                                                <span className="file-tree__icon" dangerouslySetInnerHTML={{ __html: getIcon('wad') }} />
                                                <span className="file-tree__name" style={{ flex: 1 }}>{wad.name}</span>
                                                {wad.status === 'loading' && (
                                                    <span style={{ fontSize: '10px', opacity: 0.5, marginRight: '4px' }}>···</span>
                                                )}
                                                {wad.status === 'loaded' && (
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '4px' }}>
                                                        {wad.chunks.length.toLocaleString()}
                                                    </span>
                                                )}
                                                {wad.status === 'error' && (
                                                    <span style={{ fontSize: '10px', color: 'var(--error, #f44)', marginRight: '4px' }} title={wad.error}>!</span>
                                                )}
                                            </div>

                                            {/* WAD subtree */}
                                            {isExp && wad.status === 'loading' && (
                                                <div style={{ paddingLeft: '24px', padding: '8px 24px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    <div className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', marginRight: '6px', verticalAlign: 'middle' }} />
                                                    Loading chunks…
                                                </div>
                                            )}
                                            {isExp && wad.status === 'error' && (
                                                <div style={{ paddingLeft: '24px', fontSize: '11px', color: 'var(--error, #f44)', padding: '6px 24px' }}>
                                                    {wad.error ?? 'Failed to load'}
                                                </div>
                                            )}
                                            {isExp && wad.status === 'loaded' && subtree.map(node => (
                                                <VFSNodeRow
                                                    key={node.type === 'file' ? `${node.wadPath}::${node.chunk.hash}` : node.key}
                                                    node={node}
                                                    depth={1}
                                                    expandedFolders={wadExplorer.expandedFolders}
                                                    selectedHash={wadExplorer.selected?.wadPath === wad.path ? wadExplorer.selected.hash : null}
                                                    onSelectFile={handleSelectFile}
                                                    onToggleFolder={handleToggleFolder}
                                                    onDeepToggleFolder={handleDeepToggleFolder}
                                                    onContextMenu={handleContextMenu}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* Footer stats */}
                {wadExplorer.scanStatus === 'ready' && (
                    <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                        <span>{wadExplorer.wads.length.toLocaleString()} WADs</span>
                        <span>·</span>
                        <span>{wadExplorer.wads.filter(w => w.status === 'loaded').length} loaded</span>
                        {searchResults && <><span>·</span><span>{searchResults.length.toLocaleString()} matches</span></>}
                    </div>
                )}
            </div>

            {/* ── RESIZER ── */}
            <div
                className="panel-resizer"
                style={{ cursor: 'col-resize', flexShrink: 0 }}
                onMouseDown={() => {
                    isResizingRef.current = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                }}
            />

            {/* ── RIGHT: preview or quick-action cards ── */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {wadExplorer.selected && selectedChunk ? (
                    <ChunkPreview
                        key={`${wadExplorer.selected.wadPath}::${wadExplorer.selected.hash}`}
                        wadPath={wadExplorer.selected.wadPath}
                        chunk={selectedChunk}
                        onClose={() => dispatch({ type: 'SET_WAD_EXPLORER_SELECTED', payload: null })}
                    />
                ) : (
                    <QuickActionPanel
                        wads={wadExplorer.wads}
                        onSetFilter={query => {
                            setInputValue(query);
                            setIsRegex(true);
                            dispatch({ type: 'SET_WAD_EXPLORER_SEARCH', payload: query });
                            searchRef.current?.focus();
                        }}
                    />
                )}
            </div>
        </div>
    );
};
