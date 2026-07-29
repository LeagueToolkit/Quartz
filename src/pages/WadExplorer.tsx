import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
    BookOpen, Database, Download, File, FolderOpen, RefreshCw, Search,
    Settings, Upload, Zap,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { listen } from '@tauri-apps/api/event';
import {
    wadExplorerEntries, wadExplorerExtract, wadExplorerExtractHashes,
    wadExplorerIndex, wadExplorerIndexMany, wadExplorerPrepareModel, wadExplorerScan,
    wadExplorerSearch, wadExplorerUnmount, wadExplorerUnmountAll,
    type ScannedWad, type WadExplorerIndex,
} from '@/lib/api/wad';
import { downloadHashes, getHashStatus, type HashStatus } from '@/lib/api/hashes';
import { useConfigStore, useUiPrefsStore } from '@/lib/stores';
import { RecentBinsList } from '@/components/ui';
import { useExistingRecentBins } from '@/lib/util/useExistingRecentBins';
import { openBinInJade } from '@/lib/jade/jadeInterop';
import { WadTree } from './wadexplorer/WadTree';
import { WadPreview } from './wadexplorer/WadPreview';
import { WadCheatSheet, WadNotice, WadSettingsModal } from './wadexplorer/WadExplorerModals';
import {
    buildWadTree, collectFiles, filterTree, findNode,
    flattenFiles, wadDisplayName,
} from './wadexplorer/tree';
import type { SelectedWadNode, WadFileNode, WadNode, WadRuntimeState, WadTreeRow } from './wadexplorer/types';
import './wadexplorer/WadExplorer.css';

const SETTINGS_KEY = 'quartz-wad-explorer-settings';
const GAME_PATH_KEY = 'quartz-wad-explorer-game-path';
const PANEL_WIDTH_KEY = 'quartz-wad-explorer-panel-width';

interface TreeSettings { rowHeight: number; fontSize: number; iconSize: number }
interface IndexProgress { done: number; total: number }
interface ExtractProgress { done: number; total: number }

function basename(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

function readJson<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

function gamePathFromLeague(path: string): string {
    const clean = path.replace(/[\\/]+$/, '');
    return /[\\/]game$/i.test(clean) ? clean : clean ? `${clean}\\Game` : '';
}

function selectionKey(wadPath: string, hash: string): string {
    return `${wadPath}||${hash}`;
}

function flattenRows(
    nodes: WadNode[],
    wad: ScannedWad,
    expanded: Set<string>,
    rows: WadTreeRow[],
    depth: number,
) {
    for (const node of nodes) {
        if (node.kind === 'file') rows.push({ kind: 'file', wad, node, depth });
        else {
            const key = `${wad.path}||${node.path}`;
            const open = expanded.has(key);
            rows.push({ kind: 'directory', wad, node, depth, open });
            if (open) flattenRows(node.children, wad, expanded, rows, depth + 1);
        }
    }
}

export default function WadExplorer() {
    const configuredLeaguePath = useConfigStore((state) => state.settings.leaguePath) || '';

    const [gamePath, setGamePath] = useState(() => localStorage.getItem(GAME_PATH_KEY) || gamePathFromLeague(configuredLeaguePath));
    const [groups, setGroups] = useState<Record<string, ScannedWad[]>>({});
    const [runtime, setRuntime] = useState<Record<string, WadRuntimeState>>({});
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
    const [openWads, setOpenWads] = useState<Set<string>>(new Set());
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<SelectedWadNode | null>(null);
    const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);
    const [search, setSearch] = useState('');
    const [searchTrees, setSearchTrees] = useState<Record<string, WadNode[]>>({});
    const [scanBusy, setScanBusy] = useState(false);
    const [scanError, setScanError] = useState('');
    const [indexProgress, setIndexProgress] = useState<IndexProgress>({ done: 0, total: 0 });
    const [extractBusy, setExtractBusy] = useState(false);
    const [extractProgress, setExtractProgress] = useState<ExtractProgress>({ done: 0, total: 0 });
    const [isDragOver, setIsDragOver] = useState(false);
    const [hashStatus, setHashStatus] = useState<HashStatus | null>(null);
    const [hashBusy, setHashBusy] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [cheatOpen, setCheatOpen] = useState(false);
    const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
    const [context, setContext] = useState<{ x: number; y: number; row: WadTreeRow } | null>(null);
    const [treeSettings, setTreeSettings] = useState<TreeSettings>(() => readJson(SETTINGS_KEY, { rowHeight: 24, fontSize: 12, iconSize: 12 }));
    const [panelWidth, setPanelWidth] = useState(() => Math.max(270, Math.min(720, Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 340)));
    const [resizing, setResizing] = useState(false);

    const runtimeRef = useRef(runtime);
    const indexPromises = useRef(new Map<string, Promise<WadExplorerIndex>>());
    const scanGeneration = useRef(0);
    const searchGeneration = useRef(0);
    const resizeStart = useRef({ x: 0, width: 340 });
    useEffect(() => { runtimeRef.current = runtime; }, [runtime]);

    useEffect(() => {
        if (!gamePath && configuredLeaguePath) setGamePath(gamePathFromLeague(configuredLeaguePath));
    }, [configuredLeaguePath, gamePath]);

    useEffect(() => {
        void getHashStatus().then(setHashStatus).catch(() => setHashStatus(null));
        let stop: (() => void) | undefined;
        void listen<{ done: number; total: number }>('wad-explorer-progress', (event) => setExtractProgress(event.payload))
            .then((unlisten) => { stop = unlisten; });
        return () => stop?.();
    }, []);

    const updateRuntime = useCallback((path: string, patch: Partial<WadRuntimeState>) => {
        setRuntime((current) => {
            const previous: WadRuntimeState = current[path] ?? { status: 'idle' };
            const next = { ...current, [path]: { ...previous, ...patch } as WadRuntimeState };
            runtimeRef.current = next;
            return next;
        });
    }, []);

    const ensureIndexed = useCallback((wad: ScannedWad): Promise<WadExplorerIndex> => {
        const existing = runtimeRef.current[wad.path]?.index;
        if (existing) return Promise.resolve(existing);
        const pending = indexPromises.current.get(wad.path);
        if (pending) return pending;
        updateRuntime(wad.path, { status: 'indexing', error: undefined });
        const promise = wadExplorerIndex(wad.path)
            .then((index) => { updateRuntime(wad.path, { status: 'indexed', index, error: undefined }); return index; })
            .catch((reason) => { updateRuntime(wad.path, { status: 'error', error: errorMessage(reason) }); throw reason; })
            .finally(() => indexPromises.current.delete(wad.path));
        indexPromises.current.set(wad.path, promise);
        return promise;
    }, [updateRuntime]);

    const ensureLoaded = useCallback(async (wad: ScannedWad) => {
        const current = runtimeRef.current[wad.path];
        if (current?.tree && current.entries) return current.tree;
        const index = await ensureIndexed(wad);
        updateRuntime(wad.path, { status: 'loading' });
        try {
            const entries = await wadExplorerEntries(index.mountId);
            const tree = buildWadTree(entries);
            updateRuntime(wad.path, { status: 'loaded', entries, tree, error: undefined });
            return tree;
        } catch (reason) {
            updateRuntime(wad.path, { status: 'error', error: errorMessage(reason) });
            throw reason;
        }
    }, [ensureIndexed, updateRuntime]);

    const indexAll = useCallback(async (wads: ScannedWad[], generation: number) => {
        setIndexProgress({ done: 0, total: wads.length });
        if (!wads.length) return;
        setRuntime((current) => {
            const next = { ...current };
            for (const wad of wads) next[wad.path] = { status: 'indexing' };
            runtimeRef.current = next;
            return next;
        });
        try {
            const results = await wadExplorerIndexMany(wads.map((wad) => wad.path));
            if (scanGeneration.current !== generation) return;
            const byPath: Record<string, WadRuntimeState> = {};
            for (const result of results) {
                if (result.error || result.mountId === null) {
                    byPath[result.path] = { status: 'error', error: result.error || 'Could not index WAD' };
                    continue;
                }
                byPath[result.path] = {
                    status: 'indexed',
                    index: {
                        mountId: result.mountId,
                        path: result.path,
                        name: result.name,
                        version: result.version,
                        chunkCount: result.chunkCount,
                        paths: result.paths,
                    },
                };
            }
            setRuntime((current) => {
                const next = { ...current, ...byPath };
                runtimeRef.current = next;
                return next;
            });
        } catch (reason) {
            if (scanGeneration.current === generation) {
                const message = `TOC index failed: ${errorMessage(reason)}`;
                setScanError(message);
                setRuntime((current) => {
                    const next = { ...current };
                    for (const wad of wads) next[wad.path] = { ...next[wad.path], status: 'error', error: message };
                    runtimeRef.current = next;
                    return next;
                });
            }
        } finally {
            if (scanGeneration.current === generation) setIndexProgress({ done: wads.length, total: wads.length });
        }
    }, []);

    const scanGame = useCallback(async (path = gamePath) => {
        const value = path.trim();
        if (!value) return;
        const generation = ++scanGeneration.current;
        setScanBusy(true); setScanError(''); setSelected(null); setSelectedHashes(new Set());
        setSearchTrees({});
        // One bulk reset is essential here. Unmounting archives individually
        // rebuilds the global search index after every removal (quadratic), and
        // the old fire-and-forget calls raced the replacement index pass.
        indexPromises.current.clear(); setRuntime({}); runtimeRef.current = {};
        try {
            await wadExplorerUnmountAll();
            if (scanGeneration.current !== generation) return;
            const result = await wadExplorerScan(value);
            if (scanGeneration.current !== generation) return;
            setGroups(result.groups);
            setOpenGroups(new Set(Object.keys(result.groups).filter((key) => key === 'Champions')));
            setOpenWads(new Set()); setExpandedDirs(new Set());
            localStorage.setItem(GAME_PATH_KEY, value);
            const wads = Object.values(result.groups).flat();
            // Keep the scan gate active until the batch mount is actually
            // complete. Otherwise Rescan can start a second mount pass while
            // the first one still owns and mutates the native index.
            await indexAll(wads, generation);
        } catch (reason) {
            if (scanGeneration.current !== generation) return;
            setGroups({}); setScanError(errorMessage(reason));
        } finally {
            if (scanGeneration.current === generation) setScanBusy(false);
        }
    }, [gamePath, indexAll]);

    useEffect(() => {
        const query = search.trim();
        const generation = ++searchGeneration.current;
        if (!query) {
            setSearchTrees({});
            return;
        }
        if (indexProgress.total > 0 && indexProgress.done < indexProgress.total) {
            return;
        }

        const timer = window.setTimeout(() => {
            void wadExplorerSearch(query)
                .then((result) => {
                    if (searchGeneration.current !== generation) return;
                    const trees: Record<string, WadNode[]> = {};
                    for (const group of result.groups) {
                        trees[group.wadPath] = buildWadTree(group.entries);
                    }
                    setSearchTrees(trees);
                })
                .catch(() => {
                    if (searchGeneration.current === generation) {
                        setSearchTrees({});
                    }
                });
        }, 40);
        return () => window.clearTimeout(timer);
    }, [indexProgress.done, indexProgress.total, search]);

    const openWadFiles = useCallback(async (paths?: string | string[]) => {
        let chosen = paths ? (Array.isArray(paths) ? paths : [paths]) : [];
        if (!chosen.length) {
            const result = await open({ title: 'Open WAD Files', multiple: true, filters: [{ name: 'League WAD', extensions: ['client', 'wad'] }] });
            chosen = Array.isArray(result) ? result : typeof result === 'string' ? [result] : [];
        }
        const validPaths = [...new Set(chosen.filter((path) => /\.wad(?:\.client)?$/i.test(path)))];
        if (!validPaths.length) {
            setNotice({ title: 'Unsupported File', message: 'Choose a .wad or .wad.client archive.' });
            return;
        }
        // Remember user-opened WADs (not indexed game files) for the landing.
        validPaths.forEach((path) => useUiPrefsStore.getState().pushRecentWad(path));
        const wads: ScannedWad[] = validPaths.map((path) => ({ path, name: basename(path), relPath: basename(path), size: 0, isVoiceover: false }));
        const selectedPaths = new Set(validPaths);
        setGroups((current) => ({ ...current, Custom: [...wads, ...(current.Custom || []).filter((item) => !selectedPaths.has(item.path))] }));
        setOpenGroups((current) => new Set(current).add('Custom'));
        setRuntime((current) => {
            const next = { ...current };
            for (const wad of wads) next[wad.path] = { status: 'indexing' };
            runtimeRef.current = next;
            return next;
        });
        try {
            const results = await wadExplorerIndexMany(validPaths);
            const nextStates: Record<string, WadRuntimeState> = {};
            for (const result of results) {
                nextStates[result.path] = result.error || result.mountId === null
                    ? { status: 'error', error: result.error || 'Could not index WAD' }
                    : {
                        status: 'indexed',
                        index: {
                            mountId: result.mountId,
                            path: result.path,
                            name: result.name,
                            version: result.version,
                            chunkCount: result.chunkCount,
                            paths: result.paths,
                        },
                    };
            }
            setRuntime((current) => {
                const next = { ...current, ...nextStates };
                runtimeRef.current = next;
                return next;
            });
        } catch (reason) {
            const message = errorMessage(reason);
            setRuntime((current) => {
                const next = { ...current };
                for (const wad of wads) next[wad.path] = { status: 'error', error: message };
                runtimeRef.current = next;
                return next;
            });
            setNotice({ title: 'Could Not Open WADs', message });
        }
    }, []);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        void getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type === 'enter' || event.payload.type === 'over') setIsDragOver(true);
            else if (event.payload.type === 'leave') setIsDragOver(false);
            else if (event.payload.type === 'drop') {
                setIsDragOver(false);
                const wads = event.payload.paths.filter((path) => /\.wad(?:\.client)?$/i.test(path));
                if (wads.length) void openWadFiles(wads);
            }
        }).then((stop) => { if (cancelled) stop(); else unlisten = stop; }).catch(() => undefined);
        return () => { cancelled = true; unlisten?.(); };
    }, [openWadFiles]);

    const rows = useMemo(() => {
        const output: WadTreeRow[] = [];
        const query = search.trim();
        const keys = Object.keys(groups).sort((a, b) => {
            if (a === 'Custom') return -1;
            if (b === 'Custom') return 1;
            if (a === 'Champions') return -1;
            if (b === 'Champions') return 1;
            return a.localeCompare(b);
        });
        for (const key of keys) {
            const groupRows: WadTreeRow[] = [];
            for (const wad of groups[key] || []) {
                const state = runtime[wad.path] || { status: 'idle' };
                const sourceTree = state.tree || (query ? searchTrees[wad.path] || [] : []);
                const filtered = query && state.tree ? filterTree(sourceTree, query) : sourceTree;
                const wadMatches = !query || wad.name.toLowerCase().includes(query.toLowerCase()) || filtered.length > 0;
                if (!wadMatches) continue;
                const openWad = openWads.has(wad.path);
                groupRows.push({ kind: 'wad', wad, open: openWad, state });
                if (!openWad) continue;
                if ((state.status === 'indexing' || state.status === 'loading') && !sourceTree.length) groupRows.push({ kind: 'status', wad, label: state.status === 'loading' ? 'Loading archive tree…' : 'Indexing paths…' });
                else if (state.status === 'error' && !sourceTree.length) groupRows.push({ kind: 'status', wad, label: state.error || 'Could not read WAD', error: true });
                else flattenRows(filtered, wad, expandedDirs, groupRows, 1);
            }
            if (!groupRows.length) continue;
            const openGroup = !!query || openGroups.has(key);
            output.push({ kind: 'group', key, count: groups[key].length, open: openGroup });
            if (openGroup) output.push(...groupRows);
        }
        return output;
    }, [expandedDirs, groups, openGroups, openWads, runtime, search, searchTrees]);

    const resolveNode = useCallback(async (wad: ScannedWad, node: WadNode) => {
        if (node.kind === 'file' && node.pathHash) return node;
        const tree = await ensureLoaded(wad);
        return findNode(tree, node.path);
    }, [ensureLoaded]);

    const activateRow = useCallback((row: WadTreeRow, event: MouseEvent) => {
        if (row.kind === 'group') {
            setOpenGroups((current) => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; });
            return;
        }
        if (row.kind === 'wad') {
            const opening = !openWads.has(row.wad.path);
            setOpenWads((current) => { const next = new Set(current); if (opening) next.add(row.wad.path); else next.delete(row.wad.path); return next; });
            if (opening) void ensureLoaded(row.wad).catch(() => undefined);
            if (event.shiftKey && opening) void ensureLoaded(row.wad).then((tree) => {
                const keys = flattenFiles(tree, []).map(() => '');
                if (keys.length) {
                    const next = new Set(expandedDirs);
                    const addDirs = (nodes: WadNode[]) => nodes.forEach((node) => { if (node.kind === 'directory') { next.add(`${row.wad.path}||${node.path}`); addDirs(node.children); } });
                    addDirs(tree); setExpandedDirs(next);
                }
            });
            return;
        }
        if (row.kind === 'status') return;
        if (row.kind === 'file') {
            setSelected({ wad: row.wad, node: row.node });
            return;
        }

        const key = `${row.wad.path}||${row.node.path}`;
        const opening = !expandedDirs.has(key);
        const recursive = event.shiftKey;
        const applyDirectoryChain = (next: Set<string>, directory: WadNode, add: boolean) => {
            if (directory.kind !== 'directory') return;
            const directoryKey = `${row.wad.path}||${directory.path}`;
            if (add) next.add(directoryKey); else next.delete(directoryKey);
            if (recursive) for (const child of directory.children) applyDirectoryChain(next, child, add);
        };
        setSelected({ wad: row.wad, node: row.node });
        setExpandedDirs((current) => {
            const next = new Set(current);
            applyDirectoryChain(next, row.node, opening);
            return next;
        });
        // A search result may contain only the matching branch. Resolve the
        // resident full tree in the background so Shift+click opens the whole
        // real folder chain and the texture gallery sees every texture.
        void resolveNode(row.wad, row.node).then((resolved) => {
            if (!resolved || resolved.kind !== 'directory') return;
            setSelected({ wad: row.wad, node: resolved });
            if (recursive) setExpandedDirs((current) => {
                const next = new Set(current);
                applyDirectoryChain(next, resolved, opening);
                return next;
            });
        });
    }, [ensureLoaded, expandedDirs, openWads, resolveNode]);

    const filesForRow = useCallback((row: WadTreeRow): WadFileNode[] => {
        if (row.kind === 'file') return row.node.pathHash ? [row.node] : [];
        if (row.kind === 'directory') return collectFiles(row.node).filter((file) => file.pathHash);
        if (row.kind === 'wad') return runtimeRef.current[row.wad.path]?.tree ? flattenFiles(runtimeRef.current[row.wad.path].tree!, []) : [];
        return [];
    }, []);

    const rowSelectionState = useCallback((row: WadTreeRow) => {
        const files = filesForRow(row);
        if (!files.length) return { checked: false, indeterminate: false, disabled: row.kind !== 'wad' && row.kind !== 'file' && row.kind !== 'directory' };
        const wadPath = row.kind === 'wad' ? row.wad.path : row.kind === 'file' || row.kind === 'directory' ? row.wad.path : '';
        const count = files.filter((file) => selectedHashes.has(selectionKey(wadPath, file.pathHash))).length;
        return { checked: count === files.length, indeterminate: count > 0 && count < files.length };
    }, [filesForRow, selectedHashes]);

    const toggleSelection = useCallback((row: WadTreeRow) => {
        if (row.kind !== 'wad' && row.kind !== 'file' && row.kind !== 'directory') return;
        const perform = (files: WadFileNode[]) => {
            const keys = files.map((file) => selectionKey(row.wad.path, file.pathHash));
            setSelectedHashes((current) => {
                const next = new Set(current);
                const select = keys.some((key) => !next.has(key));
                for (const key of keys) if (select) next.add(key); else next.delete(key);
                return next;
            });
        };
        const files = filesForRow(row);
        if (files.length) perform(files);
        else void ensureLoaded(row.wad).then((tree) => {
            const target = row.kind === 'wad' ? tree : findNode(tree, row.node.path);
            if (Array.isArray(target)) perform(flattenFiles(target, []));
            else if (target) perform(collectFiles(target));
        });
    }, [ensureLoaded, filesForRow]);

    const selectedGroups = useCallback(() => {
        const result = new Map<string, { wad: ScannedWad; files: WadFileNode[] }>();
        for (const list of Object.values(groups)) for (const wad of list) {
            const files = (runtimeRef.current[wad.path]?.entries || [])
                .filter((entry) => selectedHashes.has(selectionKey(wad.path, entry.pathHash)))
                .map((entry) => {
                    const parts = entry.path.split('.');
                    return { ...entry, kind: 'file' as const, name: basename(entry.path), extension: entry.path.includes('.') ? parts[parts.length - 1].toLowerCase() : '' };
                });
            if (files.length) result.set(wad.path, { wad, files });
        }
        return [...result.values()];
    }, [groups, selectedHashes]);

    const runExtraction = useCallback(async (sets: { wad: ScannedWad; files: WadFileNode[]; subfolder?: string }[], preservePaths: boolean) => {
        if (!sets.length || extractBusy) return;
        const chosen = await open({ title: 'Choose extraction folder', directory: true, multiple: false });
        if (typeof chosen !== 'string') return;
        setExtractBusy(true); setExtractProgress({ done: 0, total: sets.reduce((sum, set) => sum + set.files.length, 0) });
        let written = 0; let skipped = 0; let errors = 0;
        try {
            for (const set of sets) {
                const outputDir = set.subfolder ? `${chosen}\\${set.subfolder}` : chosen;
                const result = await wadExplorerExtract({
                    wadPath: set.wad.path,
                    hashes: set.files.map((file) => file.pathHash),
                    outputDir,
                    replaceExisting: true,
                    preservePaths,
                });
                written += result.written; skipped += result.skipped; errors += result.errors;
            }
            setSelectedHashes(new Set());
            setNotice({ title: errors ? 'Extraction Finished With Errors' : 'Extraction Complete', message: `${written.toLocaleString()} files written, ${skipped.toLocaleString()} skipped${errors ? `, ${errors.toLocaleString()} failed` : ''}.` });
        } catch (reason) {
            setNotice({ title: 'Extraction Failed', message: errorMessage(reason) });
        } finally { setExtractBusy(false); }
    }, [extractBusy]);

    const extractSelected = useCallback(() => void runExtraction(selectedGroups(), true), [runExtraction, selectedGroups]);

    const reloadWad = useCallback(async (wad: ScannedWad) => {
        const current = runtimeRef.current[wad.path];
        if (current?.index) await wadExplorerUnmount(current.index.mountId).catch(() => false);
        indexPromises.current.delete(wad.path);
        updateRuntime(wad.path, { status: 'idle', index: undefined, entries: undefined, tree: undefined, error: undefined });
        await ensureLoaded(wad);
    }, [ensureLoaded, updateRuntime]);

    const showCheatWad = useCallback(async (wadName: string, innerPath?: string) => {
        const normalizedName = wadName.toLowerCase();
        let match: { group: string; wad: ScannedWad } | null = null;
        for (const [group, list] of Object.entries(groups)) {
            const wad = list.find((item) => item.name.toLowerCase() === normalizedName || item.relPath.toLowerCase().endsWith(normalizedName));
            if (wad) { match = { group, wad }; break; }
        }
        if (!match) {
            setSearch(wadName.replace(/\.wad(?:\.client)?$/i, ''));
            setNotice({ title: 'WAD Not Indexed Yet', message: `${wadName} is not in the current WAD list. Index the game or open that WAD, then try Show WAD again.` });
            return;
        }

        setSearch('');
        setOpenGroups((current) => new Set(current).add(match.group));
        setOpenWads((current) => new Set(current).add(match!.wad.path));
        try {
            const tree = await ensureLoaded(match.wad);
            const cleaned = (innerPath || '').replace(/<[^>]+>|\*/g, '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
            if (!cleaned) return;

            const parts = cleaned.split('/').filter(Boolean);
            const expanded = new Set<string>();
            for (let index = 1; index <= parts.length; index += 1) {
                expanded.add(`${match.wad.path}||${parts.slice(0, index).join('/')}`);
            }
            setExpandedDirs((current) => new Set([...current, ...expanded]));

            let target: WadNode | null = findNode(tree, cleaned);
            if (!target) {
                let best: WadNode | null = null;
                const visit = (nodes: WadNode[]) => {
                    for (const node of nodes) {
                        const path = node.path.toLowerCase();
                        if (cleaned.startsWith(path) || path.startsWith(cleaned)) best = node;
                        if (node.kind === 'directory') visit(node.children);
                    }
                };
                visit(tree);
                target = best;
            }
            if (target) setSelected({ wad: match.wad, node: target });
        } catch (reason) {
            setNotice({ title: 'Could Not Open WAD', message: errorMessage(reason) });
        }
    }, [ensureLoaded, groups]);

    const contextAction = useCallback(async (action: 'whole' | 'hashes' | 'reload' | 'flat' | 'paths' | 'copy-path' | 'copy-hash') => {
        const row = context?.row;
        setContext(null);
        if (!row || row.kind === 'group' || row.kind === 'status') return;
        if (action === 'copy-path') {
            const value = row.kind === 'wad' ? row.wad.path : row.node.path;
            await navigator.clipboard.writeText(value); return;
        }
        if (action === 'copy-hash' && row.kind === 'file') { await navigator.clipboard.writeText(row.node.pathHash); return; }
        if (row.kind === 'wad') {
            if (action === 'hashes') {
                const previous = runtimeRef.current[row.wad.path] || { status: 'indexed' as const };
                updateRuntime(row.wad.path, { status: 'loading', error: undefined });
                try {
                    await wadExplorerExtractHashes(row.wad.path);
                    await reloadWad(row.wad);
                } catch (reason) {
                    updateRuntime(row.wad.path, { ...previous, status: previous.tree ? 'loaded' : 'indexed', error: undefined });
                    setNotice({ title: 'Hash Extraction Failed', message: errorMessage(reason) });
                }
            } else if (action === 'reload') await reloadWad(row.wad).catch((reason) => setNotice({ title: 'Reload Failed', message: errorMessage(reason) }));
            else if (action === 'whole') {
                const tree = await ensureLoaded(row.wad);
                void runExtraction([{ wad: row.wad, files: flattenFiles(tree, []), subfolder: wadDisplayName(row.wad.name) }], true);
            }
            return;
        }
        const resolved = await resolveNode(row.wad, row.node);
        if (!resolved) return;
        const files = collectFiles(resolved);
        if (action === 'flat' || action === 'paths') void runExtraction([{ wad: row.wad, files }], action === 'paths');
    }, [context, ensureLoaded, reloadWad, resolveNode, runExtraction, updateRuntime]);

    // A WAD entry has no disk path, so extract it first; Jade opens the
    // resulting file.
    const openBinInJadeFromWad = useCallback(async (file: WadFileNode) => {
        if (!selected) return;
        try {
            const prepared = await wadExplorerPrepareModel({
                wadPath: selected.wad.path,
                files: [{ pathHash: file.pathHash, path: file.path }],
                primaryPath: file.path,
            });
            await openBinInJade(prepared.primaryPath);
        } catch (reason) { setNotice({ title: 'Could Not Open In Jade', message: errorMessage(reason) }); }
    }, [selected]);

    const extractOne = useCallback((file: WadFileNode) => {
        if (selected) void runExtraction([{ wad: selected.wad, files: [file] }], true);
    }, [runExtraction, selected]);

    useEffect(() => {
        if (!resizing) return;
        const move = (event: globalThis.MouseEvent) => setPanelWidth(Math.max(270, Math.min(720, resizeStart.current.width + event.clientX - resizeStart.current.x)));
        const up = () => { setResizing(false); localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [panelWidth, resizing]);

    const saveTreeSettings = (value: TreeSettings) => { setTreeSettings(value); localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); };
    const selectedKey = selected ? `${selected.wad.path}||${selected.node.path}` : '';
    const totalWads = Object.values(groups).reduce((sum, list) => sum + list.length, 0);

    return (
        <div className={`wad-explorer${resizing ? ' is-resizing' : ''}${totalWads ? '' : ' is-empty'}`}>
            {extractBusy && (
                <div className="wad-progress">
                    <span>{`Extracting ${extractProgress.done.toLocaleString()} / ${extractProgress.total.toLocaleString()}`}</span>
                    <div><i
                        style={{ width: `${Math.round(100 * extractProgress.done / Math.max(1, extractProgress.total))}%` }}
                    /></div>
                </div>
            )}
            <main className="wad-body">
                <div className="wad-tree-wrap" style={{ width: panelWidth }}>
                    <WadTree
                        rows={rows}
                        search={search}
                        onSearch={setSearch}
                        selectionMode={selectionMode}
                        onToggleSelectionMode={() => setSelectionMode((value) => !value)}
                        selectedKey={selectedKey}
                        rowHeight={treeSettings.rowHeight}
                        fontSize={treeSettings.fontSize}
                        iconSize={treeSettings.iconSize}
                        onActivate={activateRow}
                        onContextMenu={(row, event) => setContext({ x: event.clientX, y: event.clientY, row })}
                        selectionState={rowSelectionState}
                        onToggleSelection={toggleSelection}
                    />
                </div>
                <div className="wad-resizer" onMouseDown={(event) => { resizeStart.current = { x: event.clientX, width: panelWidth }; setResizing(true); }} />
                <section className="wad-stage">
                    {selected ? (
                        <WadPreview
                            selected={selected}
                            runtime={runtime[selected.wad.path] || { status: 'idle' }}
                            onClose={() => setSelected(null)}
                            onOpenInJade={openBinInJadeFromWad}
                            onExtract={extractOne}
                        />
                    ) : (
                        <Landing
                            scanBusy={scanBusy}
                            scanError={scanError}
                            totalWads={totalWads}
                            hashStatus={hashStatus}
                            hashBusy={hashBusy}
                            onOpenWad={() => void openWadFiles()}
                            onOpenPath={(path) => void openWadFiles(path)}
                            onIndexGame={() => gamePath ? void scanGame() : undefined}
                            onDownloadHashes={() => {
                                setHashBusy(true);
                                void downloadHashes(false).then(() => getHashStatus()).then(setHashStatus)
                                    .catch((reason) => setNotice({ title: 'Hash Download Failed', message: errorMessage(reason) }))
                                    .finally(() => setHashBusy(false));
                            }}
                        />
                    )}
                    {isDragOver && <div className="wad-drop"><div><Upload size={28} /><strong>Drop to open WAD</strong><span>.wad or .wad.client</span></div></div>}
                </section>
            </main>

            <footer className="wad-toolbar">
                <div className="wad-toolbar__game">
                    <span className="wad-toolbar__label">Game</span>
                    <input
                        className="dl-input wad-toolbar__path"
                        value={gamePath}
                        placeholder="C:\\Riot Games\\League of Legends\\Game"
                        spellCheck={false}
                        onChange={(event) => setGamePath(event.target.value)}
                        onBlur={() => localStorage.setItem(GAME_PATH_KEY, gamePath.trim())}
                        onKeyDown={(event) => { if (event.key === 'Enter') void scanGame(); }}
                    />
                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--secondary" title="Choose Game folder" onClick={async () => {
                        const chosen = await open({ title: 'Choose League Game folder', directory: true, multiple: false });
                        if (typeof chosen === 'string') { setGamePath(chosen); void scanGame(chosen); }
                    }}><FolderOpen size={14} /></button>
                    <button className="dl-btn dl-btn--sm dl-btn--icon dl-btn--secondary" title="Rescan" disabled={!gamePath || scanBusy} onClick={() => void scanGame()}><RefreshCw size={14} className={scanBusy ? 'is-spinning' : ''} /></button>
                </div>
                <div className="wad-toolbar__actions">
                    <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => setCheatOpen(true)}><BookOpen size={14} />Cheat Sheet</button>
                    <button className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => setSettingsOpen(true)}><Settings size={14} />Settings</button>
                    <button className="dl-btn dl-btn--sm dl-btn--primary" disabled={!selectedHashes.size || extractBusy} onClick={extractSelected}><Download size={14} />{extractBusy ? 'Extracting…' : `Extract Selected${selectedHashes.size ? ` (${selectedHashes.size})` : ''}`}</button>
                </div>
            </footer>

            {settingsOpen && <WadSettingsModal values={treeSettings} onChange={saveTreeSettings} onClose={() => setSettingsOpen(false)} />}
            {cheatOpen && <WadCheatSheet onSearch={setSearch} onShowWad={showCheatWad} onClose={() => setCheatOpen(false)} />}
            {notice && <WadNotice {...notice} onClose={() => setNotice(null)} />}
            {context && <ContextMenu context={context} close={() => setContext(null)} action={contextAction} />}
        </div>
    );
}

function Landing({
    scanBusy, scanError, totalWads, hashStatus, hashBusy,
    onOpenWad, onOpenPath, onIndexGame, onDownloadHashes,
}: {
    scanBusy: boolean; scanError: string; totalWads: number;
    hashStatus: HashStatus | null; hashBusy: boolean;
    onOpenWad: () => void; onOpenPath: (path: string) => void; onIndexGame: () => void; onDownloadHashes: () => void;
}) {
    const storedRecentWads = useUiPrefsStore((s) => s.recentWads);
    const removeRecentWad = useUiPrefsStore((s) => s.removeRecentWad);
    // Only show WADs whose file still exists; prune vanished ones.
    const recentWads = useExistingRecentBins(storedRecentWads, removeRecentWad);
    return (
        <div className="wad-landing">
            <span className="wad-landing__icon"><Search size={46} /></span>
            <h1>WAD Explorer</h1>
            <p>Browse live game archives, preview their assets, and extract only what you need.</p>
            <div className="wad-landing__actions">
                <button className="dl-btn dl-btn--primary" onClick={onOpenWad}><FolderOpen size={15} />Open WADs</button>
                <button className="dl-btn dl-btn--secondary" onClick={onIndexGame} disabled={scanBusy}><Database size={15} />{scanBusy ? 'Scanning…' : totalWads ? `Rescan Game (${totalWads})` : 'Index Game'}</button>
            </div>
            {scanError && <div className="wad-landing__error">{scanError}</div>}
            {hashStatus && !hashStatus.present && (
                <div className="wad-hash-card"><Zap size={17} /><div><strong>Path hashes are not installed</strong><span>Archives still open, but unresolved files appear as hex.</span></div><button className="dl-btn dl-btn--sm dl-btn--secondary" disabled={hashBusy} onClick={onDownloadHashes}>{hashBusy ? 'Downloading…' : 'Download Hashes'}</button></div>
            )}
            <RecentBinsList bins={recentWads} onOpen={onOpenPath} onRemove={removeRecentWad} title="Recent WADs" />
        </div>
    );
}

function ContextMenu({ context, close, action }: {
    context: { x: number; y: number; row: WadTreeRow };
    close: () => void;
    action: (action: 'whole' | 'hashes' | 'reload' | 'flat' | 'paths' | 'copy-path' | 'copy-hash') => void;
}) {
    const row = context.row;
    const label = row.kind === 'wad' ? row.wad.name : row.kind === 'file' || row.kind === 'directory' ? row.node.name : 'WAD Explorer';
    return (
        <div className="wad-context-backdrop" onMouseDown={close} onContextMenu={(event) => { event.preventDefault(); close(); }}>
            <div className="wad-context" style={{ left: Math.min(context.x, window.innerWidth - 230), top: Math.min(context.y, window.innerHeight - 260) }} onMouseDown={(event) => event.stopPropagation()}>
                <header title={label}>{label}</header>
                {row.kind === 'wad' ? <>
                    <button onClick={() => action('whole')}><Download size={14} />Extract Whole WAD</button>
                    <button onClick={() => action('hashes')}><Zap size={14} />Extract Hashes</button>
                    <button onClick={() => action('reload')}><RefreshCw size={14} />Reload WAD</button>
                </> : row.kind === 'file' || row.kind === 'directory' ? <>
                    <button onClick={() => action('flat')}><Download size={14} />Extract Selected</button>
                    <button onClick={() => action('paths')}><File size={14} />{row.kind === 'directory' ? 'Extract Folder Structure' : 'Extract With Path'}</button>
                    <i />
                    <button onClick={() => action('copy-path')}><BookOpen size={14} />Copy Asset Path</button>
                    {row.kind === 'file' && row.node.pathHash && <button onClick={() => action('copy-hash')}><Zap size={14} />Copy Path Hash</button>}
                </> : null}
            </div>
        </div>
    );
}
