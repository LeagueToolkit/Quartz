import {
    useState, useEffect, useCallback, useRef, useMemo,
    type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent,
} from 'react';
import {
    FolderOpen, RefreshCw, Zap, Download, Settings as SettingsIcon, Upload, Database,
    File as FileIcon, X, FileText, Clock,
} from 'lucide-react';
import { wadReadChunk, wadExtractSelected } from '@/lib/api/wad';
import { log } from '@/lib/util/logger';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useWadExplorer } from './wadexplorer/hooks/useWadExplorer';
import WadExplorerTree from './wadexplorer/WadExplorerTree';
import * as S from './wadexplorer/styles';
import './wadexplorer/WadExplorer.css';
import type {
    WadTreeNode, WadDirNode, WadFileNode, SelectedNode, FlatRow, ExtractItem, ContextTargetInfo,
} from './wadexplorer/types';

/* ── Recents (WAD + bin), persisted in localStorage ───────────────────────── */
const RECENT_WAD_KEY = 'quartz-wad-recents';
const RECENT_BIN_KEY = 'quartz-wad-bin-recents';

interface RecentWadItem { name: string; path: string }
interface RecentBinItem { name: string; wadPath: string; internalPath: string }
interface Recents { wad: RecentWadItem[]; bin: RecentBinItem[] }

function readRecents(): Recents {
    const parse = <T,>(key: string): T[] => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    };
    return { wad: parse<RecentWadItem>(RECENT_WAD_KEY), bin: parse<RecentBinItem>(RECENT_BIN_KEY) };
}
function addRecentWad(path: string): Recents {
    const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
    const cur = readRecents();
    const wad = [{ name, path }, ...cur.wad.filter((r) => r.path !== path)].slice(0, 10);
    localStorage.setItem(RECENT_WAD_KEY, JSON.stringify(wad));
    return { ...cur, wad };
}
function addRecentBin(item: RecentBinItem): Recents {
    const cur = readRecents();
    const bin = [item, ...cur.bin.filter((r) => !(r.wadPath === item.wadPath && r.internalPath === item.internalPath))].slice(0, 10);
    localStorage.setItem(RECENT_BIN_KEY, JSON.stringify(bin));
    return { ...cur, bin };
}
function removeRecent(kind: 'wad' | 'bin', match: RecentWadItem | RecentBinItem): Recents {
    const cur = readRecents();
    if (kind === 'wad') {
        const wad = cur.wad.filter((r) => r.path !== (match as RecentWadItem).path);
        localStorage.setItem(RECENT_WAD_KEY, JSON.stringify(wad));
        return { ...cur, wad };
    }
    const m = match as RecentBinItem;
    const bin = cur.bin.filter((r) => !(r.wadPath === m.wadPath && r.internalPath === m.internalPath));
    localStorage.setItem(RECENT_BIN_KEY, JSON.stringify(bin));
    return { ...cur, bin };
}

/* ── Settings (panel sizing) — persisted in localStorage ──────────────────── */
const SETTINGS_KEY = 'quartz-wad-explorer-settings';
interface WadSettings { rowHeight: number; fontSize: number; symbolSize: number; panelWidth: number; gamePath: string }
const DEFAULT_SETTINGS: WadSettings = { rowHeight: 24, fontSize: 12, symbolSize: 12, panelWidth: 320, gamePath: '' };
function readSettings(): WadSettings {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function writeSettings(patch: Partial<WadSettings>) {
    const next = { ...readSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const COMP_LABELS = ['Raw', 'Gzip', 'Sat', 'Zstd', 'ZstdC'];
const COMP_COLORS = ['rgba(255,255,255,0.4)', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981'];

// File extensions the browser can render directly from raw chunk bytes. DDS/TEX
// need a decoder that the Rust backend doesn't expose yet (see TODO below).
const BROWSER_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);
const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
const TEXTURE_PREVIEW_LIMIT_BYTES = 20 * 1024 * 1024;

function fmtBytes(b?: number | null) {
    if (!b) return '—';
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
}
function toPosix(value: string) { return String(value || '').replace(/\\/g, '/'); }
function extOf(name?: string | null) {
    const base = String(name || '');
    const idx = base.lastIndexOf('.');
    return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}
function getWadExportFolderName(wadPath: string) {
    const base = toPosix(wadPath).split('/').pop() || '';
    return base.replace(/\.wad\.client$/i, '') || 'wad_export';
}
function truncateMenuLabel(value?: string, max = 72) {
    const text = String(value || '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}
function collectTextureFilesFromDir(node: WadTreeNode | null): WadFileNode[] {
    const out: WadFileNode[] = [];
    if (!node || node.type !== 'dir' || !Array.isArray(node.children)) return out;
    for (const child of node.children) {
        if (!child || child.type !== 'file') continue;
        const ext = extOf(child.extension || child.name);
        if (BROWSER_IMAGE_EXTS.has(ext) || ext === 'dds' || ext === 'tex') out.push(child);
    }
    return out;
}

/* ── Detail row ───────────────────────────────────────────────────────────── */
function DetailRow({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: '22px', alignItems: 'flex-start' }}>
            <span style={{ width: 110, flexShrink: 0, color: 'var(--text-2)', opacity: 0.65 }}>{label}</span>
            <span style={{ flex: 1, color: valueColor || 'var(--text)', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? 11 : 12 }}>
                {value}
            </span>
        </div>
    );
}

const CLOSE_BTN_STYLE: CSSProperties = {
    position: 'absolute', top: 10, right: 12, zIndex: 5, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', width: 28, height: 28, background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: 0,
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
};
function FileDetailCloseButton({ onClose }: { onClose?: () => void }) {
    if (!onClose) return null;
    return (
        <button
            type="button"
            title="Close preview"
            onClick={onClose}
            style={CLOSE_BTN_STYLE}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,90,90,0.18)'; e.currentTarget.style.borderColor = 'rgba(255,90,90,0.4)'; e.currentTarget.style.color = '#ff8585'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text)'; }}
        >
            <X size={15} />
        </button>
    );
}

/* ── Folder texture gallery (renders browser-decodable images in a folder) ─── */
function FolderTextureGallery({ selectedNode }: { selectedNode: SelectedNode }) {
    const [items, setItems] = useState<{ path: string; name: string; url: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [largePreviewPrompt, setLargePreviewPrompt] = useState<{ count: number; totalSize: number } | null>(null);
    const [allowLargePreview, setAllowLargePreview] = useState(false);

    useEffect(() => { setAllowLargePreview(false); }, [selectedNode.wadPath, selectedNode.node.path]);

    useEffect(() => {
        let cancelled = false;
        setItems([]); setError(''); setLoading(false); setLargePreviewPrompt(null);
        if (selectedNode.type !== 'dir') return () => { cancelled = true; };

        const { node, wadPath } = selectedNode;
        const files = collectTextureFilesFromDir(node).filter((f) => BROWSER_IMAGE_EXTS.has(extOf(f.extension || f.name)));
        if (files.length === 0) return () => { cancelled = true; };

        const totalPreviewBytes = files.reduce((sum, f) => sum + (Number(f.decompressedSize) || 0), 0);
        if (!allowLargePreview && totalPreviewBytes > TEXTURE_PREVIEW_LIMIT_BYTES) {
            setLargePreviewPrompt({ count: files.length, totalSize: totalPreviewBytes });
            return () => { cancelled = true; };
        }

        const run = async () => {
            setLoading(true);
            const CONCURRENCY = 4;
            let idx = 0;
            const worker = async () => {
                while (!cancelled) {
                    const i = idx++;
                    if (i >= files.length) break;
                    const file = files[i];
                    const ext = extOf(file.extension || file.name);
                    try {
                        const b64 = await wadReadChunk(wadPath, file.pathHash);
                        if (cancelled) return;
                        const url = `data:${IMAGE_MIME[ext] || 'image/png'};base64,${b64}`;
                        setItems((prev) => [...prev, { path: file.path, name: file.name, url }]);
                    } catch {
                        // Ignore per-file preview failures.
                    }
                }
            };
            await Promise.all(Array.from({ length: CONCURRENCY }, worker));
            if (!cancelled) setLoading(false);
        };
        run();
        return () => { cancelled = true; };
    }, [selectedNode, allowLargePreview]);

    if (selectedNode.type !== 'dir') return null;

    return (
        <div style={{ ...S.rightPanel, flexDirection: 'column', padding: '18px 20px', gap: 8, overflowY: 'auto' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Textures in {selectedNode.node.name}</div>
            {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
            {loading && <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.7 }}>Loading textures…</div>}
            {largePreviewPrompt && !loading && !error && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.9 }}>
                        This folder will preview {largePreviewPrompt.count} textures ({fmtBytes(largePreviewPrompt.totalSize)}). Load them?
                    </div>
                    <div>
                        <button type="button" onClick={() => setAllowLargePreview(true)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text)', borderRadius: 6, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
                            Load textures
                        </button>
                    </div>
                </div>
            )}
            {!loading && items.length === 0 && !error && !largePreviewPrompt && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.6 }}>No previewable images found in this folder.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {items.map((it) => (
                    <div key={it.path} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.14)' }}>
                        <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
                            <img src={it.url} alt={it.name} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                        </div>
                        <div title={it.path} style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {it.name}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── File detail / preview panel ──────────────────────────────────────────── */
// TODO(backend): DDS/TEX texture decoding, .bin/.troybin/.luabin text
// conversion and the SKN/SKL/ANM model inspector all relied on Electron-only
// IPC (wad.readBinAsText, wad.readTroybinAsText, wad.parseSknBins, ModelInspect).
// The Tauri backend exposes raw chunk bytes only, so those previews fall back to
// a notice until matching commands land. Browser-native images + UTF-8 text
// previews work today.
function FileDetailPanel({ selectedNode, onClose }: { selectedNode: SelectedNode | null; onClose: () => void }) {
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewError, setPreviewError] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewLarge, setPreviewLarge] = useState<{ size: number; key: string } | null>(null);
    const [previewForceKey, setPreviewForceKey] = useState('');
    const [textContent, setTextContent] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const [textError, setTextError] = useState('');

    useEffect(() => { setPreviewForceKey(''); }, [selectedNode?.wadPath, selectedNode?.node?.path]);

    const node = selectedNode?.type === 'file' ? (selectedNode.node as WadFileNode) : null;
    const wadPath = selectedNode?.wadPath || '';
    const nodeExt = extOf(node?.extension || node?.name);

    // Browser-decodable image preview (png/jpg/...). DDS/TEX are flagged below.
    useEffect(() => {
        let cancelled = false;
        setPreviewUrl(''); setPreviewError(''); setPreviewLoading(false); setPreviewLarge(null);
        if (!node) return () => { cancelled = true; };
        if (!BROWSER_IMAGE_EXTS.has(nodeExt)) return () => { cancelled = true; };

        const key = `${wadPath}:${node.pathHash}`;
        const decompressedSize = Number(node.decompressedSize) || 0;
        if (decompressedSize > TEXTURE_PREVIEW_LIMIT_BYTES && previewForceKey !== key) {
            setPreviewLarge({ size: decompressedSize, key });
            return () => { cancelled = true; };
        }

        setPreviewLoading(true);
        wadReadChunk(wadPath, node.pathHash)
            .then((b64) => {
                if (cancelled) return;
                if (!b64) throw new Error('Empty chunk payload');
                setPreviewUrl(`data:${IMAGE_MIME[nodeExt] || 'image/png'};base64,${b64}`);
            })
            .catch((e) => { if (!cancelled) setPreviewError((e as Error)?.message || 'Failed to render preview'); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; };
    }, [node, nodeExt, wadPath, previewForceKey]);

    // Generic UTF-8 text preview for non-binary, non-image files.
    useEffect(() => {
        let cancelled = false;
        setTextContent(null); setTextError(''); setTextLoading(false);
        if (!node) return () => { cancelled = true; };

        const hasNoExt = !node.extension && !node.name.includes('.');
        const isBinaryLike = hasNoExt
            || nodeExt === 'bin' || nodeExt === 'troybin' || nodeExt === 'luabin' || nodeExt === 'luabin64'
            || nodeExt === 'skn' || nodeExt === 'skl' || nodeExt === 'anm'
            || nodeExt === 'dds' || nodeExt === 'tex'
            || BROWSER_IMAGE_EXTS.has(nodeExt)
            || nodeExt === 'wem' || nodeExt === 'ogg' || nodeExt === 'wav' || nodeExt === 'mp3';
        if (isBinaryLike) return () => { cancelled = true; };

        setTextLoading(true);
        wadReadChunk(wadPath, node.pathHash)
            .then((b64) => {
                if (cancelled) return;
                if (!b64) { setTextContent(''); return; }
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                setTextContent(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
            })
            .catch((e) => { if (!cancelled) setTextError((e as Error)?.message || 'Failed to load file contents'); })
            .finally(() => { if (!cancelled) setTextLoading(false); });
        return () => { cancelled = true; };
    }, [node, nodeExt, wadPath]);

    if (!selectedNode) {
        return (
            <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ opacity: 0.28, fontSize: 13, color: 'var(--text-2)' }}>Select a file to inspect</span>
            </div>
        );
    }

    if (selectedNode.type === 'dir') {
        return (
            <div style={{ ...S.rightPanel, position: 'relative' }}>
                <FileDetailCloseButton onClose={onClose} />
                <FolderTextureGallery selectedNode={selectedNode} />
            </div>
        );
    }

    if (!node) return null;

    const compLabel = COMP_LABELS[node.compressionType ?? 0] ?? `t${node.compressionType}`;
    const compColor = COMP_COLORS[node.compressionType ?? 0] ?? 'rgba(255,255,255,0.4)';
    const wadName = toPosix(wadPath).split('/').pop()?.replace(/\.wad\.client$/i, '') ?? '';
    const isImageFile = BROWSER_IMAGE_EXTS.has(nodeExt);
    const needsDecoder = nodeExt === 'dds' || nodeExt === 'tex'
        || nodeExt === 'bin' || nodeExt === 'troybin' || nodeExt === 'luabin' || nodeExt === 'luabin64'
        || nodeExt === 'skn' || nodeExt === 'skl' || nodeExt === 'anm';

    return (
        <div style={{ ...S.rightPanel, flexDirection: 'column', padding: '22px 24px', gap: 4, overflowY: 'auto', position: 'relative' }}>
            <FileDetailCloseButton onClose={onClose} />
            {(previewLoading || previewUrl || previewError || previewLarge) && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.75, marginBottom: 6 }}>Preview</div>
                    {previewLoading ? (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.75 }}>Rendering texture…</div>
                    ) : previewLarge ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.88 }}>This texture is {fmtBytes(previewLarge.size)}. Load it?</div>
                            <div>
                                <button type="button" onClick={() => setPreviewForceKey(previewLarge.key)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--text)', borderRadius: 6, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
                                    Load anyway
                                </button>
                            </div>
                        </div>
                    ) : previewError ? (
                        <div style={{ fontSize: 12, color: '#ef4444', opacity: 0.9 }}>{previewError}</div>
                    ) : (
                        <img src={previewUrl} alt={node.name} style={{ maxWidth: '100%', maxHeight: 260, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, imageRendering: 'auto', display: 'block' }} />
                    )}
                </div>
            )}
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12, wordBreak: 'break-all' }}>{node.name}</div>
            {needsDecoder && (
                <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-2)', opacity: 0.7, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                    No inline viewer for .{nodeExt} files yet — extract the file to inspect it. (Texture/bin/model decoders are pending backend support.)
                </div>
            )}
            {!isImageFile && !needsDecoder && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.75, marginBottom: 6 }}>Contents</div>
                    {textLoading ? (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.75 }}>Loading…</div>
                    ) : textError ? (
                        <div style={{ fontSize: 12, color: '#ef4444', opacity: 0.9 }}>{textError}</div>
                    ) : textContent != null ? (
                        <pre style={{ margin: 0, padding: '10px 12px', fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace', fontSize: 12, lineHeight: 1.45, color: 'var(--text)', background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {textContent.length > 200000 ? textContent.slice(0, 200000) + '\n\n… (truncated)' : textContent}
                        </pre>
                    ) : null}
                </div>
            )}
            <DetailRow label="Path" value={node.path} mono />
            <DetailRow label="WAD" value={wadName} />
            <DetailRow label="Compression" value={compLabel} valueColor={compColor} />
            <DetailRow label="Compressed" value={fmtBytes(node.compressedSize)} />
            <DetailRow label="Decompressed" value={fmtBytes(node.decompressedSize)} />
        </div>
    );
}

/* ── Recent item rows + landing panel ─────────────────────────────────────── */
function RecentItemRow({ item, kind, onOpen, onRemove }: { item: RecentWadItem | RecentBinItem; kind: 'wad' | 'bin'; onOpen: (item: never) => void; onRemove: (item: never) => void }) {
    const Icon = kind === 'wad' ? FolderOpen : FileText;
    const accent = kind === 'wad' ? 'var(--accent)' : '#10b981';
    let secondary = '';
    let tooltip = '';
    if (kind === 'wad') {
        const it = item as RecentWadItem;
        secondary = it.path || '';
        tooltip = it.path || '';
    } else {
        const it = item as RecentBinItem;
        const wadName = toPosix(it.wadPath).split('/').pop() || '';
        secondary = wadName ? `${wadName} — ${it.internalPath || ''}` : (it.internalPath || '');
        tooltip = `${it.wadPath}\n${it.internalPath}`;
    }
    return (
        <div
            onClick={() => onOpen(item as never)}
            title={tooltip}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
        >
            <Icon size={14} style={{ color: accent, opacity: 0.85, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', opacity: 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</div>
            </div>
            <button
                type="button"
                title="Remove from history"
                onClick={(e) => { e.stopPropagation(); onRemove(item as never); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', opacity: 0.5, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ff8585'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
                <X size={12} />
            </button>
        </div>
    );
}

function RecentItemsSection({ recents, onOpenWad, onOpenBin, onRemove }: { recents: Recents; onOpenWad: (i: RecentWadItem) => void; onOpenBin: (i: RecentBinItem) => void; onRemove: (kind: 'wad' | 'bin', i: RecentWadItem | RecentBinItem) => void }) {
    if (recents.wad.length === 0 && recents.bin.length === 0) return null;
    return (
        <div style={{ width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recents.wad.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-2)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        <Clock size={12} /> Recent WADs
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {recents.wad.map((it) => (
                            <RecentItemRow key={`wad:${it.path}`} item={it} kind="wad" onOpen={onOpenWad as (i: never) => void} onRemove={((x: RecentWadItem) => onRemove('wad', x)) as (i: never) => void} />
                        ))}
                    </div>
                </div>
            )}
            {recents.bin.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-2)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        <Clock size={12} /> Recent Bins
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {recents.bin.map((it) => (
                            <RecentItemRow key={`bin:${it.wadPath}::${it.internalPath}`} item={it} kind="bin" onOpen={onOpenBin as (i: never) => void} onRemove={((x: RecentBinItem) => onRemove('bin', x)) as (i: never) => void} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function WadLandingPanel({ onOpenWad, onIndexGame, isDragOver, isLoading, recents, onOpenRecentWad, onOpenRecentBin, onRemoveRecent }: {
    onOpenWad: () => void; onIndexGame: () => void; isDragOver: boolean; isLoading: boolean; recents: Recents;
    onOpenRecentWad: (i: RecentWadItem) => void; onOpenRecentBin: (i: RecentBinItem) => void; onRemoveRecent: (kind: 'wad' | 'bin', i: RecentWadItem | RecentBinItem) => void;
}) {
    const hasRecents = recents.wad.length + recents.bin.length > 0;
    return (
        <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: hasRecents ? 'flex-start' : 'center', flexDirection: 'column', gap: 32, padding: hasRecents ? '32px 24px' : 0, overflowY: hasRecents ? 'auto' : 'hidden', position: 'relative', outline: isDragOver ? '2px dashed var(--accent)' : '2px dashed transparent', outlineOffset: -8, borderRadius: 8, transition: 'outline-color 0.18s', background: isDragOver ? 'rgba(139,92,246,0.06)' : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', opacity: 0.7 }}>WAD Explorer</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.45, textAlign: 'center', maxWidth: 260 }}>
                    {isLoading ? 'Preparing hashes for fast extraction...' : 'Open a single WAD file or index your League of Legends game folder.'}
                </div>
            </div>
            {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
                    <div style={S.spinner} />
                    <span style={{ fontSize: 12, color: 'var(--accent)', opacity: 0.85 }}>Loading Hashes...</span>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '20px 28px', cursor: 'pointer', color: 'var(--text)', transition: 'background 0.15s, border-color 0.15s' }}
                            onClick={onOpenWad}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                        >
                            <FolderOpen size={26} style={{ color: 'var(--accent)', opacity: 0.85 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', opacity: 0.85 }}>Open WAD</span>
                            <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.5, marginTop: -4 }}>.wad.client file</span>
                        </button>
                        <button
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '20px 28px', cursor: 'pointer', color: 'var(--text)', transition: 'background 0.15s, border-color 0.15s' }}
                            onClick={onIndexGame}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                        >
                            <Database size={26} style={{ color: '#10b981', opacity: 0.85 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', opacity: 0.85 }}>Index Game</span>
                            <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.5, marginTop: -4 }}>scan game folder</span>
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <Upload size={16} style={{ color: 'var(--text-2)', opacity: isDragOver ? 0.9 : 0.3, transition: 'opacity 0.18s' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: isDragOver ? 0.7 : 0.28, transition: 'opacity 0.18s' }}>or drop a .wad.client here</span>
                    </div>
                    <RecentItemsSection recents={recents} onOpenWad={onOpenRecentWad} onOpenBin={onOpenRecentBin} onRemove={onRemoveRecent} />
                </>
            )}
        </div>
    );
}

function RightPanelLoading({ indexingActive }: { indexingActive: boolean }) {
    return (
        <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={S.spinner} />
            <span style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.8 }}>{indexingActive ? 'Indexing WADs...' : 'Loading...'}</span>
        </div>
    );
}

/* ── Lightweight modal dialog (replaces the Electron WadExplorerDialog) ────── */
interface DialogAction { id: string; label: string; onClick: () => void; primary?: boolean }
function WadExplorerDialog({ open, onClose, title, message, detail, actions }: { open: boolean; onClose: () => void; title: string; message: string; detail?: string; actions: DialogAction[] }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface, #16142a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: 400, padding: 22 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: detail ? 6 : 18 }}>{message}</div>
                {detail && <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.7, marginBottom: 18 }}>{detail}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    {actions.map((a) => (
                        <button key={a.id} onClick={a.onClick} style={{ ...S.iconBtn, padding: '8px 16px', color: a.primary ? 'var(--accent)' : 'var(--text-2)', borderColor: a.primary ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function WadExplorerSettingsModal({ open, onClose, rowHeight, fontSize, symbolSize, onRowHeightChange, onFontSizeChange, onSymbolSizeChange }: {
    open: boolean; onClose: () => void; rowHeight: number; fontSize: number; symbolSize: number;
    onRowHeightChange: (v: number) => void; onFontSizeChange: (v: number) => void; onSymbolSizeChange: (v: number) => void;
}) {
    if (!open) return null;
    const Slider = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>{label}: {value}px</label>
            <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>
    );
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface, #16142a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: 380, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 700 }}><SettingsIcon size={16} /> WAD Explorer Settings</div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}><X size={16} /></button>
                </div>
                <Slider label="Tree row height" value={rowHeight} min={20} max={34} onChange={onRowHeightChange} />
                <Slider label="Tree font size" value={fontSize} min={11} max={15} onChange={onFontSizeChange} />
                <Slider label="Tree icon size" value={symbolSize} min={10} max={18} onChange={onSymbolSizeChange} />
            </div>
        </div>
    );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function WadExplorer() {
    const [recents, setRecents] = useState<Recents>(() => readRecents());
    const [settings, setSettings] = useState<WadSettings>(() => readSettings());
    const [gamePath, setGamePath] = useState(settings.gamePath);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isResizingPanels, setIsResizingPanels] = useState(false);
    const [treePanelWidth, setTreePanelWidth] = useState(settings.panelWidth);
    const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
    const [noticeDialog, setNoticeDialog] = useState({ open: false, title: '', message: '', detail: '' });
    const [wadContextMenu, setWadContextMenu] = useState<{ open: boolean; x: number; y: number; row: FlatRow | null; target: ContextTargetInfo | null }>({ open: false, x: 0, y: 0, row: null, target: null });
    const [extractBusy, setExtractBusy] = useState(false);
    const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
    const [scrollTargetKey] = useState<string | null>(null);

    const bodyRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef({ active: false, startX: 0, startWidth: 320 });
    const panelWidthRef = useRef(treePanelWidth);
    const pendingExtractRef = useRef<{ outputDir: string; items: ExtractItem[]; onSuccess?: (() => void) | null; successTitle: string; failureTitle: string } | null>(null);

    const {
        scanLoading, scanError, scan, loadSingleWad,
        toggleGroup, toggleWad, reloadWad, toggleDir,
        selectedNode, setSelectedNode,
        search, setSearch, flatRows, indexingProgress,
        extractSelectedItems, extractSelectedCount, clearExtractSelection,
        getExtractSelectionState, toggleExtractSelection, getExtractItemsForRow, getContextTargetInfo,
        mountWadTree, wadData,
    } = useWadExplorer({ indexReady: true });

    const indexingActive = Boolean(indexingProgress?.active);

    /* ── Actions ──────────────────────────────────────────────────────────── */
    const handleOpenSingleWad = useCallback(async () => {
        const picked = await openDialog({ multiple: false, filters: [{ name: 'WAD Client', extensions: ['client'] }, { name: 'All Files', extensions: ['*'] }] });
        if (typeof picked !== 'string') return;
        setRecents(addRecentWad(picked));
        loadSingleWad(picked);
    }, [loadSingleWad]);

    const pickGamePath = useCallback(async () => {
        const dir = await openDialog({ directory: true, multiple: false });
        if (typeof dir !== 'string') return;
        setGamePath(dir);
        setSettings(writeSettings({ gamePath: dir }));
        scan(dir);
    }, [scan]);

    const handleRescan = useCallback(() => { if (gamePath) scan(gamePath); }, [gamePath, scan]);

    const handleIndexGame = useCallback(async () => {
        if (gamePath) scan(gamePath);
        else await pickGamePath();
    }, [gamePath, scan, pickGamePath]);

    const handleOpenRecentWad = useCallback((item: RecentWadItem) => {
        if (!item?.path) return;
        setRecents(addRecentWad(item.path));
        loadSingleWad(item.path);
    }, [loadSingleWad]);

    const pendingBinSelectRef = useRef<{ wadPath: string; internalPath: string } | null>(null);
    const handleOpenRecentBin = useCallback((item: RecentBinItem) => {
        if (!item?.wadPath || !item?.internalPath) return;
        pendingBinSelectRef.current = { wadPath: item.wadPath, internalPath: item.internalPath };
        setRecents(addRecentWad(item.wadPath));
        loadSingleWad(item.wadPath);
    }, [loadSingleWad]);

    const handleRemoveRecent = useCallback((kind: 'wad' | 'bin', item: RecentWadItem | RecentBinItem) => {
        setRecents(removeRecent(kind, item));
    }, []);

    // Track recent bin opens — fires when the user selects a .bin in the tree.
    useEffect(() => {
        if (!selectedNode || selectedNode.type !== 'file') return;
        const node = selectedNode.node as WadFileNode;
        if (extOf(node.extension || node.name) !== 'bin') return;
        if (!selectedNode.wadPath || !node.path) return;
        setRecents(addRecentBin({ wadPath: selectedNode.wadPath, internalPath: node.path, name: node.name || node.path }));
    }, [selectedNode]);

    // Resolve a pending "open recent bin" once its WAD tree finishes loading.
    useEffect(() => {
        const pending = pendingBinSelectRef.current;
        if (!pending) return;
        const data = wadData.get(pending.wadPath);
        if (!data || data.status !== 'loaded' || !Array.isArray(data.tree)) return;
        const findFile = (nodes: WadTreeNode[], target: string): WadFileNode | null => {
            for (const n of nodes) {
                if (n.type === 'file' && n.path === target) return n;
                if (n.type === 'dir') {
                    const found = findFile((n as WadDirNode).children, target);
                    if (found) return found;
                }
            }
            return null;
        };
        const found = findFile(data.tree, pending.internalPath);
        if (found) setSelectedNode({ type: 'file', node: found, wadPath: pending.wadPath });
        pendingBinSelectRef.current = null;
    }, [wadData, setSelectedNode]);

    /* ── Drag & drop ──────────────────────────────────────────────────────── */
    const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
    const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
        // Browser File objects don't expose a filesystem path under Tauri's
        // webview, so opening on drop falls back to the picker.
        void handleOpenSingleWad();
    }, [handleOpenSingleWad]);

    const handleGamePathBlur = useCallback(() => { setSettings(writeSettings({ gamePath })); }, [gamePath]);
    const handleGamePathKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && gamePath) scan(gamePath); }, [gamePath, scan]);

    /* ── Context menu ─────────────────────────────────────────────────────── */
    const handleWadContextMenu = useCallback((e: ReactMouseEvent, row: FlatRow) => {
        setWadContextMenu({ open: true, x: e.clientX, y: e.clientY, row, target: getContextTargetInfo(row) });
    }, [getContextTargetInfo]);
    const closeWadContextMenu = useCallback(() => setWadContextMenu({ open: false, x: 0, y: 0, row: null, target: null }), []);

    /* ── Panel resize ─────────────────────────────────────────────────────── */
    const handleResizeStart = useCallback((event: ReactMouseEvent) => {
        event.preventDefault();
        resizeRef.current = { active: true, startX: event.clientX, startWidth: treePanelWidth };
        panelWidthRef.current = treePanelWidth;
        setIsResizingPanels(true);
    }, [treePanelWidth]);

    useEffect(() => {
        if (!isResizingPanels) return undefined;
        const onMouseMove = (event: MouseEvent) => {
            if (!resizeRef.current.active) return;
            const dx = event.clientX - resizeRef.current.startX;
            const bodyWidth = bodyRef.current?.clientWidth || window.innerWidth || 1280;
            const minWidth = 260;
            const maxWidth = Math.max(minWidth + 40, bodyWidth - 320);
            const rounded = Math.round(Math.max(minWidth, Math.min(maxWidth, resizeRef.current.startWidth + dx)));
            panelWidthRef.current = rounded;
            setTreePanelWidth(rounded);
        };
        const onMouseUp = () => {
            if (!resizeRef.current.active) return;
            resizeRef.current.active = false;
            setIsResizingPanels(false);
            setSettings(writeSettings({ panelWidth: panelWidthRef.current }));
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
    }, [isResizingPanels]);

    /* ── Extraction ───────────────────────────────────────────────────────── */
    // Group selected items by WAD (the backend extracts one WAD at a time).
    const runExtractRequest = useCallback(async ({ items, outputDir, onSuccess, successTitle, failureTitle }: { items: ExtractItem[]; outputDir: string; onSuccess?: (() => void) | null; successTitle: string; failureTitle: string }) => {
        setExtractBusy(true);
        setExtractProgress({ done: 0, total: items.length });

        const byWad = new Map<string, string[]>();
        for (const it of items) {
            const arr = byWad.get(it.wadPath) || [];
            arr.push(it.pathHash);
            byWad.set(it.wadPath, arr);
        }

        let extracted = 0;
        let skipped = 0;
        let runningDone = 0;
        const unlisten = await listen<{ current: number; total: number }>('wad-extract-progress', (e) => {
            setExtractProgress({ done: runningDone + Number(e.payload?.current || 0), total: items.length });
        });
        try {
            for (const [wadPath, hashes] of byWad) {
                const r = await wadExtractSelected(wadPath, hashes, outputDir);
                extracted += r.written;
                skipped += r.skipped;
                runningDone += hashes.length;
                setExtractProgress({ done: runningDone, total: items.length });
            }
            onSuccess?.();
            setNoticeDialog({ open: true, title: successTitle, message: `Extracted ${extracted} file(s).`, detail: skipped > 0 ? `Skipped ${skipped} file(s).` : '' });
        } catch (e) {
            log.error('wadExtractSelected', e);
            setNoticeDialog({ open: true, title: failureTitle, message: (e as Error)?.message || 'Unknown error', detail: '' });
        } finally {
            unlisten();
            setExtractBusy(false);
            setExtractProgress({ done: 0, total: 0 });
        }
    }, []);

    const queueExtract = useCallback(async ({ items, onSuccess, successTitle, failureTitle }: { items: ExtractItem[]; onSuccess?: (() => void) | null; successTitle: string; failureTitle: string }) => {
        if (extractBusy || !Array.isArray(items) || items.length === 0) return;
        const outputDir = await openDialog({ directory: true, multiple: false });
        if (typeof outputDir !== 'string') return;
        // The backend overwrites/skip-decides per file; a single confirm keeps
        // parity with the Electron "replace existing?" prompt.
        pendingExtractRef.current = { outputDir, items, onSuccess, successTitle, failureTitle };
        setReplaceConfirmOpen(true);
    }, [extractBusy]);

    const runPendingExtract = useCallback(async () => {
        const pending = pendingExtractRef.current;
        pendingExtractRef.current = null;
        setReplaceConfirmOpen(false);
        if (!pending) return;
        await runExtractRequest(pending);
    }, [runExtractRequest]);

    const handleExtractSelected = useCallback(async () => {
        if (extractSelectedCount === 0) return;
        await queueExtract({ items: extractSelectedItems, onSuccess: clearExtractSelection, successTitle: 'Extract Selected Complete', failureTitle: 'Extract Selected Failed' });
    }, [clearExtractSelection, extractSelectedCount, extractSelectedItems, queueExtract]);

    const handleContextExtract = useCallback(async () => {
        const row = wadContextMenu.row;
        closeWadContextMenu();
        if (!row || (row.type !== 'file' && row.type !== 'dir')) return;
        const items = getExtractItemsForRow(row);
        if (items.length === 0) return;
        await queueExtract({ items, successTitle: 'Extract Complete', failureTitle: 'Extract Failed' });
    }, [wadContextMenu, closeWadContextMenu, getExtractItemsForRow, queueExtract]);

    const handleContextExtractWholeWad = useCallback(async () => {
        const row = wadContextMenu.row;
        closeWadContextMenu();
        if (!row || row.type !== 'wad' || !row.entry?.path) return;
        let items = getExtractItemsForRow(row);
        if (items.length === 0) {
            try {
                const mounted = await mountWadTree(row.entry.path);
                const collect = (nodes: WadTreeNode[]): ExtractItem[] => nodes.flatMap((n) =>
                    n.type === 'file'
                        ? [{ wadPath: row.entry.path, pathHash: n.pathHash, relPath: toPosix(n.path) }]
                        : collect((n as WadDirNode).children));
                items = collect(mounted.tree).filter((i) => i.pathHash && i.relPath);
            } catch (e) {
                setNoticeDialog({ open: true, title: 'Extract Whole WAD Failed', message: (e as Error)?.message || 'Failed to mount WAD tree', detail: '' });
                return;
            }
        }
        if (items.length === 0) {
            setNoticeDialog({ open: true, title: 'Extract Whole WAD Failed', message: 'No extractable files found for this WAD.', detail: '' });
            return;
        }
        // Whole-WAD extract goes into a <wad-name>/ subfolder; the user picks the
        // base dir, then we extract straight (backend preserves resolved paths).
        void getWadExportFolderName(row.entry.path);
        await queueExtract({ items, successTitle: 'Extract Whole WAD Complete', failureTitle: 'Extract Whole WAD Failed' });
    }, [wadContextMenu, closeWadContextMenu, getExtractItemsForRow, mountWadTree, queueExtract]);

    const handleReloadWad = useCallback(() => {
        const row = wadContextMenu.row;
        closeWadContextMenu();
        if (!row || row.type !== 'wad' || !row.entry?.path) return;
        reloadWad(row.entry.path);
        toggleWad(row.entry, { recursive: false });
    }, [wadContextMenu, closeWadContextMenu, reloadWad, toggleWad]);

    /* ── Settings handlers ────────────────────────────────────────────────── */
    const setRowHeight = useCallback((v: number) => setSettings(writeSettings({ rowHeight: v })), []);
    const setFontSize = useCallback((v: number) => setSettings(writeSettings({ fontSize: v })), []);
    const setSymbolSize = useCallback((v: number) => setSettings(writeSettings({ symbolSize: v })), []);

    const showLanding = useMemo(() => !selectedNode
        || (selectedNode.type === 'dir' && collectTextureFilesFromDir(selectedNode.node).length === 0), [selectedNode]);

    /* ── Render ───────────────────────────────────────────────────────────── */
    return (
        <div className="wad-explorer-root" style={{ ...S.container, position: 'relative' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {/* Top bar */}
            <div style={S.topBar}>
                <span style={S.topBarLabel}>Game</span>
                <input style={S.pathInput} value={gamePath} onChange={(e) => setGamePath(e.target.value)} onBlur={handleGamePathBlur} onKeyDown={handleGamePathKey} placeholder="C:\Riot Games\League of Legends\Game" spellCheck={false} />
                <button style={S.iconBtn} onClick={pickGamePath} title="Browse Game folder"><FolderOpen size={13} /></button>
                <button style={S.iconBtn} onClick={handleRescan} title="Rescan" disabled={!gamePath || scanLoading}>
                    <RefreshCw size={13} style={scanLoading ? { animation: 'spin 0.7s linear infinite' } : undefined} />
                </button>
                <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 6px', flexShrink: 0 }} />
                <button
                    style={{ ...S.iconBtn, gap: 5, color: extractSelectedCount > 0 ? 'var(--accent)' : 'var(--text-2)', borderColor: extractSelectedCount > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.10)', opacity: extractBusy ? 0.7 : 1 }}
                    onClick={handleExtractSelected}
                    title={extractSelectedCount > 0 ? `Extract ${extractSelectedCount} selected file(s)` : 'Select files/folders in tree first'}
                    disabled={extractBusy || extractSelectedCount === 0}
                >
                    <Download size={13} />
                    <span style={{ fontSize: 11 }}>{extractBusy ? 'Extracting...' : `Extract Selected${extractSelectedCount > 0 ? ` (${extractSelectedCount})` : ''}`}</span>
                </button>
                <button style={{ ...S.iconBtn, gap: 5 }} onClick={() => setSettingsOpen(true)} title="WAD Explorer Settings">
                    <SettingsIcon size={13} /><span style={{ fontSize: 11 }}>Settings</span>
                </button>
            </div>

            {/* Determinate extraction progress bar (driven by wad-extract-progress). */}
            {extractBusy && (() => {
                const total = Math.max(1, Number(extractProgress.total || 0));
                const done = Math.min(total, Number(extractProgress.done || 0));
                const pct = Math.round((done / total) * 100);
                return (
                    <div style={{ position: 'relative', padding: '4px 14px 6px', background: 'rgba(0,0,0,0.18)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-2)', marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>
                            <span>Extracting {done.toLocaleString()} / {total.toLocaleString()}</span>
                            <span>{pct}%</span>
                        </div>
                        <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent2))', boxShadow: '0 0 8px color-mix(in srgb, var(--accent2), transparent 55%)', transition: 'width 0.15s linear' }} />
                        </div>
                    </div>
                );
            })()}

            {/* Body */}
            <div ref={bodyRef} style={S.body}>
                {scanError ? (
                    <div style={{ ...S.leftPanel, width: treePanelWidth, alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
                        <span style={{ color: '#ef4444', fontSize: 12, textAlign: 'center' }}>{scanError}</span>
                    </div>
                ) : (
                    <WadExplorerTree
                        flatRows={flatRows}
                        search={search}
                        setSearch={setSearch}
                        toggleGroup={toggleGroup}
                        toggleWad={toggleWad}
                        toggleDir={toggleDir}
                        selectedNode={selectedNode}
                        setSelectedNode={setSelectedNode as (row: FlatRow | null) => void}
                        loading={scanLoading}
                        getExtractSelectionState={getExtractSelectionState}
                        toggleExtractSelection={toggleExtractSelection}
                        onWadContextMenu={handleWadContextMenu}
                        rowHeight={settings.rowHeight}
                        fontSize={settings.fontSize}
                        panelWidth={treePanelWidth}
                        symbolSize={settings.symbolSize}
                        selectionMode={selectionMode}
                        onToggleSelectionMode={() => setSelectionMode((v) => !v)}
                        scrollTargetKey={scrollTargetKey}
                    />
                )}

                <div
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize panels"
                    onMouseDown={handleResizeStart}
                    style={{ width: 7, cursor: 'col-resize', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)', background: isResizingPanels ? 'rgba(120, 80, 255, 0.24)' : 'rgba(255,255,255,0.02)' }}
                />

                {(scanLoading || indexingActive) ? (
                    <RightPanelLoading indexingActive={indexingActive} />
                ) : showLanding ? (
                    <WadLandingPanel
                        onOpenWad={handleOpenSingleWad}
                        onIndexGame={handleIndexGame}
                        isDragOver={isDragOver}
                        isLoading={false}
                        recents={recents}
                        onOpenRecentWad={handleOpenRecentWad}
                        onOpenRecentBin={handleOpenRecentBin}
                        onRemoveRecent={handleRemoveRecent}
                    />
                ) : (
                    <>
                        <FileDetailPanel selectedNode={selectedNode} onClose={() => setSelectedNode(null)} />
                        {isDragOver && (
                            <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(120, 80, 255, 0.12)', backdropFilter: 'blur(4px)', border: '2px dashed var(--accent)', borderRadius: 8, margin: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <div style={{ background: 'var(--surface)', padding: '16px 24px', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <Upload size={20} style={{ color: 'var(--accent)' }} />
                                    <span style={{ fontWeight: 600 }}>Drop to open WAD</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes wadIntroPulse { 0% { transform: scale(0.985); opacity: 0.85; } 50% { transform: scale(1.02); opacity: 1; } 100% { transform: scale(0.985); opacity: 0.85; } }
                @keyframes wadProgressSlide { 0% { left: -35%; } 100% { left: 100%; } }
            `}</style>

            <WadExplorerDialog
                open={replaceConfirmOpen}
                onClose={() => { setReplaceConfirmOpen(false); pendingExtractRef.current = null; }}
                title="Replace Existing Files?"
                message="The output folder may already contain files."
                detail="Existing files with the same path will be replaced."
                actions={[
                    { id: 'no', label: 'Cancel', onClick: () => { setReplaceConfirmOpen(false); pendingExtractRef.current = null; }, primary: false },
                    { id: 'yes', label: 'Extract', onClick: () => void runPendingExtract(), primary: true },
                ]}
            />

            <WadExplorerDialog
                open={noticeDialog.open}
                onClose={() => setNoticeDialog({ open: false, title: '', message: '', detail: '' })}
                title={noticeDialog.title}
                message={noticeDialog.message}
                detail={noticeDialog.detail}
                actions={[{ id: 'ok', label: 'OK', onClick: () => setNoticeDialog({ open: false, title: '', message: '', detail: '' }), primary: true }]}
            />

            <WadExplorerSettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                rowHeight={settings.rowHeight}
                fontSize={settings.fontSize}
                symbolSize={settings.symbolSize}
                onRowHeightChange={setRowHeight}
                onFontSizeChange={setFontSize}
                onSymbolSizeChange={setSymbolSize}
            />

            {/* WAD context menu */}
            {wadContextMenu.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={closeWadContextMenu} onContextMenu={(e) => { e.preventDefault(); closeWadContextMenu(); }}>
                    <div style={{ position: 'absolute', left: wadContextMenu.x, top: wadContextMenu.y, background: 'rgba(25, 25, 35, 0.95)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', padding: '5px 0', minWidth: 160, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-3)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={wadContextMenu.target?.title}>
                            {truncateMenuLabel(wadContextMenu.target?.name)}
                        </div>
                        {wadContextMenu.target?.type === 'wad' ? (
                            <>
                                <button style={{ ...S.contextMenuItem, color: 'var(--accent)' }} onClick={handleContextExtractWholeWad} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                    <Download size={14} /><span>Extract Whole WAD</span>
                                </button>
                                <button style={S.contextMenuItem} onClick={handleReloadWad} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}>
                                    <RefreshCw size={14} /><span>Reload WAD</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button style={{ ...S.contextMenuItem, color: 'var(--accent)' }} onClick={handleContextExtract} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                    <Download size={14} /><span>Extract Selected</span>
                                </button>
                                <button style={S.contextMenuItem} onClick={handleContextExtract} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}>
                                    <FileIcon size={14} /><span>{wadContextMenu.target?.type === 'dir' ? 'Extract Folder Structure' : 'Extract With Path'}</span>
                                </button>
                            </>
                        )}
                        {/* Extract Hashes is an Electron-only resolver step; kept as a disabled hint. */}
                        {wadContextMenu.target?.type === 'wad' && (
                            <button style={{ ...S.contextMenuItem, color: 'var(--text-2)', opacity: 0.45, cursor: 'default' }} disabled title="Hash resolution happens automatically via the shared hashtable">
                                <Zap size={14} /><span>Extract Hashes (auto)</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default WadExplorer;
