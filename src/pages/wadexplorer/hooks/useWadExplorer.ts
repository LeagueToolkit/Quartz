import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { wadMount, wadList, type WadEntry } from '@/lib/api';
import { log } from '@/lib/util/logger';
import type {
    WadTreeNode, WadDirNode, WadFileNode, SelectedNode, WadGroups, WadScanEntry,
    WadDataEntry, ExtractItem, FlatRow, ExtractSelectionState, ContextTargetInfo,
} from '../types';

/* Map the backend's compression-type string to the numeric index the old UI
   used for its compression label/colour tables. */
const COMP_TYPE_INDEX: Record<string, number> = {
    None: 0, Gzip: 1, Satellite: 2, Sat: 2, Zstd: 3, ZstdMulti: 4, ZstdC: 4,
};

function extOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/* Build the directory tree client-side from a flat WadEntry list. This is the
   port of useWadTree's tree-building, fed by wad_list instead of mountTree. */
function buildTreeFromEntries(entries: WadEntry[]): WadTreeNode[] {
    const root = { children: new Map<string, { type: 'dir'; name: string; path: string; children: Map<string, unknown> } | WadFileNode> } as unknown as {
        children: Map<string, RawDir | WadFileNode>;
    };
    root.children = new Map();

    interface RawDir {
        type: 'dir';
        name: string;
        path: string;
        children: Map<string, RawDir | WadFileNode>;
    }

    for (const e of entries) {
        const p = String(e.path || '').replace(/\\/g, '/');
        if (!p) continue;
        const parts = p.split('/').filter(Boolean);
        if (parts.length === 0) continue;
        let node = root as unknown as RawDir;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!node.children.has(part)) {
                const dirPath = parts.slice(0, i + 1).join('/');
                node.children.set(part, { type: 'dir', name: part, path: dirPath, children: new Map() });
            }
            node = node.children.get(part) as RawDir;
        }
        const fileName = parts[parts.length - 1];
        node.children.set(fileName + '\0' + p, {
            type: 'file',
            name: fileName,
            path: p,
            pathHash: e.pathHash,
            extension: extOf(fileName) || null,
            compressionType: COMP_TYPE_INDEX[e.type] ?? 0,
            compressedSize: e.compressedSize,
            decompressedSize: e.size,
        });
    }

    const toArray = (parent: RawDir | { children: Map<string, RawDir | WadFileNode> }): WadTreeNode[] => {
        const dirs: WadDirNode[] = [];
        const files: WadFileNode[] = [];
        for (const child of parent.children.values()) {
            if ((child as RawDir).type === 'dir') {
                const d = child as RawDir;
                dirs.push({ type: 'dir', name: d.name, path: d.path, children: toArray(d) });
            } else {
                files.push(child as WadFileNode);
            }
        }
        dirs.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));
        return [...dirs, ...files];
    };

    return toArray(root as unknown as RawDir);
}

// Merge single-child directory chains into one row (like Flint's compactNode).
function compactDir(node: WadDirNode): { compactParts: string[]; effectiveNode: WadDirNode } {
    let current = node;
    const parts = [current.name];
    while (
        current.type === 'dir' &&
        current.children?.length === 1 &&
        current.children[0].type === 'dir'
    ) {
        current = current.children[0] as WadDirNode;
        parts.push(current.name);
    }
    return { compactParts: parts, effectiveNode: current };
}

function flattenInto(rows: FlatRow[], nodes: WadTreeNode[], wadPath: string, expandedDirs: Set<string>, depth: number): void {
    for (const node of nodes) {
        if (node.type === 'dir') {
            const { compactParts, effectiveNode } = compactDir(node);
            const dirKey = wadPath + '||' + effectiveNode.path;
            const expanded = expandedDirs.has(dirKey);
            rows.push({
                type: 'dir',
                node: effectiveNode,
                depth,
                wadPath,
                expanded,
                hasChildren: (effectiveNode.children?.length ?? 0) > 0,
                compactParts,
            });
            if (expanded && effectiveNode.children?.length > 0) {
                flattenInto(rows, effectiveNode.children, wadPath, expandedDirs, depth + 1);
            }
        } else {
            rows.push({
                type: 'file',
                node,
                depth,
                wadPath,
                expanded: false,
                hasChildren: false,
            });
        }
    }
}

function createSearchMatcher(query: string): (value: string | null | undefined) => boolean {
    const trimmed = String(query || '').trim();
    if (!trimmed) return () => true;
    try {
        const re = new RegExp(trimmed, 'i');
        return (value) => re.test(String(value || ''));
    } catch {
        const lower = trimmed.toLowerCase();
        return (value) => String(value || '').toLowerCase().includes(lower);
    }
}

function buildFilteredTree(nodes: WadTreeNode[], matches: (v: string | null | undefined) => boolean): WadTreeNode[] {
    const out: WadTreeNode[] = [];
    for (const node of nodes) {
        if (node.type === 'file') {
            if (matches(node.path)) out.push(node);
            continue;
        }
        const childFiltered = node.children?.length ? buildFilteredTree(node.children, matches) : [];
        const selfMatches = matches(node.path);
        if (!selfMatches && childFiltered.length === 0) continue;
        out.push({ ...node, children: childFiltered });
    }
    return out;
}

function toExtractItemFromFileNode(wadPath: string, fileNode: WadFileNode): ExtractItem | null {
    const pathHash = String(fileNode?.pathHash || '').trim();
    const relPath = String(fileNode?.path || '').replace(/\\/g, '/');
    if (!wadPath || !pathHash || !relPath) return null;
    return { wadPath, pathHash, relPath };
}

function itemKey(item: ExtractItem): string {
    return `${item.wadPath}||${item.pathHash}||${item.relPath}`;
}

function collectExtractItemsFromNodes(wadPath: string, nodes: WadTreeNode[] | undefined, out: ExtractItem[]): void {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
        if (!node) continue;
        if (node.type === 'file') {
            const item = toExtractItemFromFileNode(wadPath, node);
            if (item) out.push(item);
            continue;
        }
        if (node.type === 'dir' && Array.isArray(node.children)) {
            collectExtractItemsFromNodes(wadPath, node.children, out);
        }
    }
}

function collectExtractItemsFromRow(row: FlatRow | null): ExtractItem[] {
    const out: ExtractItem[] = [];
    if (!row) return out;
    if (row.type === 'file') {
        const item = toExtractItemFromFileNode(row.wadPath, row.node);
        if (item) out.push(item);
        return out;
    }
    if (row.type === 'dir') {
        collectExtractItemsFromNodes(row.wadPath, row.node?.children || [], out);
        return out;
    }
    if (row.type === 'wad') {
        if (row.status === 'loaded' && Array.isArray(row.tree)) {
            collectExtractItemsFromNodes(row.entry?.path, row.tree, out);
        }
        return out;
    }
    return out;
}

function describeExtractTarget(row: FlatRow | null): ContextTargetInfo | null {
    const basename = (value: string | undefined): string => {
        const normalized = String(value || '').replace(/\\/g, '/');
        const parts = normalized.split('/').filter(Boolean);
        return parts[parts.length - 1] || normalized || '';
    };

    if (!row) return null;
    if (row.type === 'wad') {
        return {
            type: 'wad',
            name: basename(row.entry?.path) || row.displayName || row.entry?.name || 'WAD',
            title: row.entry?.path || row.displayName || row.entry?.name || 'WAD',
        };
    }
    if (row.type === 'dir') {
        return {
            type: 'dir',
            name: basename(row.node?.path) || row.node?.name || 'Folder',
            title: row.node?.path || row.node?.name || 'Folder',
        };
    }
    if (row.type === 'file') {
        return {
            type: 'file',
            name: basename(row.node?.path) || row.node?.name || 'File',
            title: row.node?.path || row.node?.name || 'File',
        };
    }
    return null;
}

interface ToggleWadOptions {
    recursive?: boolean;
    forceLoad?: boolean;
    forceMount?: boolean;
}

export function useWadExplorer({ indexReady = true }: { hashPath?: string; indexReady?: boolean }) {
    const [groups, setGroups] = useState<WadGroups | null>(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);

    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
    const [openWads, setOpenWads] = useState<Set<string>>(new Set());
    const [wadData, setWadData] = useState<Map<string, WadDataEntry>>(new Map());
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [selectedExtractMap, setSelectedExtractMap] = useState<Map<string, ExtractItem>>(new Map());

    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    const startedTreeLoads = useRef<Set<string>>(new Set());
    const pendingRecursiveOpen = useRef<Set<string>>(new Set());
    const pendingSelectAllWads = useRef<Set<string>>(new Set());
    const pendingPathSelections = useRef<Map<string, { type: string; path: string; select: boolean }[]>>(new Map());

    const collectAllDirKeys = useCallback((wadPath: string, nodes: WadTreeNode[]): string[] => {
        const out: string[] = [];
        const walk = (items: WadTreeNode[] | undefined) => {
            if (!Array.isArray(items)) return;
            for (const node of items) {
                if (!node || node.type !== 'dir') continue;
                out.push(wadPath + '||' + node.path);
                walk(node.children);
            }
        };
        walk(nodes);
        return out;
    }, []);

    const indexingProgress = useMemo(() => {
        if (!groups) return null;
        const wadPaths = new Set<string>();
        for (const items of Object.values(groups)) {
            for (const entry of items || []) {
                if (entry?.path) wadPaths.add(entry.path);
            }
        }
        const all = wadPaths.size;
        if (all === 0) return null;
        let done = 0;
        for (const wadPath of wadPaths) {
            const d = wadData.get(wadPath);
            if (!d) continue;
            if (d.status === 'indexed' || d.status === 'tree-loading' || d.status === 'loaded' || d.status === 'error') done++;
        }
        return { done, total: all, active: done < all };
    }, [groups, wadData]);

    // Full-game folder scan. The backend has no multi-WAD scan command yet, so
    // this path stays inert until that lands.
    const scan = useCallback(async (gamePath: string) => {
        if (!gamePath) return;
        setScanLoading(true);
        setScanError(null);
        // TODO(backend): a `wad_scan_all(gamePath)` command must enumerate the
        // WADs under DATA/FINAL and group them (Champions/Maps/etc.) the way the
        // Electron `wad.scanAll` IPC did. Until then a full game index is a no-op.
        try {
            setScanError('Full game indexing requires a backend scan command (not yet available). Open a single WAD instead.');
            setGroups(null);
        } finally {
            setScanLoading(false);
        }
    }, []);

    const reloadWad = useCallback((wadPath: string) => {
        startedTreeLoads.current.delete(wadPath);
        setWadData((prev) => {
            const next = new Map(prev);
            const existing = next.get(wadPath);
            if (existing) next.set(wadPath, { ...existing, status: 'indexed', hydrated: false, tree: null });
            return next;
        });
    }, []);

    /* Mount + list a WAD and build its tree client-side (replaces mountTree). */
    const mountWadTree = useCallback(async (wadPath: string): Promise<{ tree: WadTreeNode[]; chunkCount: number }> => {
        const mount = await wadMount(wadPath);
        const entries = await wadList(mount.id);
        return { tree: buildTreeFromEntries(entries), chunkCount: mount.chunkCount };
    }, []);

    const toggleWad = useCallback((entry: WadScanEntry, options: ToggleWadOptions | null = null) => {
        const wadPath = entry.path;
        const recursive = options?.recursive === true;
        const forceLoad = options?.forceLoad === true;
        const isOpen = openWads.has(wadPath);
        const willOpen = forceLoad ? true : !isOpen;

        if (recursive && !willOpen) {
            setExpandedDirs((prev) => {
                const next = new Set(prev);
                for (const k of Array.from(next)) {
                    if (k.startsWith(wadPath + '||')) next.delete(k);
                }
                return next;
            });
        }

        if (!forceLoad) {
            setOpenWads((prev) => {
                const next = new Set(prev);
                if (next.has(wadPath)) next.delete(wadPath);
                else next.add(wadPath);
                return next;
            });
        }

        if (!willOpen) return;

        const current = wadData.get(wadPath);
        if (current?.status === 'loaded' && current?.hydrated !== false) {
            if (recursive && Array.isArray(current?.tree)) {
                const keys = collectAllDirKeys(wadPath, current.tree);
                if (keys.length > 0) {
                    setExpandedDirs((prev) => {
                        const next = new Set(prev);
                        for (const k of keys) next.add(k);
                        return next;
                    });
                }
            }
            return;
        }
        if (current?.status === 'tree-loading') return;
        if (startedTreeLoads.current.has(wadPath)) return;

        if (recursive) pendingRecursiveOpen.current.add(wadPath);

        startedTreeLoads.current.add(wadPath);
        setWadData((prev) => {
            const next = new Map(prev);
            const existing = next.get(wadPath);
            next.set(wadPath, {
                status: 'tree-loading',
                paths: existing?.paths || null,
                tree: existing?.tree || null,
                chunkCount: existing?.chunkCount || 0,
                hydrated: false,
            });
            return next;
        });

        mountWadTree(wadPath)
            .then((result) => {
                setWadData((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(wadPath);
                    next.set(wadPath, {
                        status: 'loaded',
                        paths: existing?.paths || null,
                        tree: result.tree,
                        chunkCount: result.chunkCount || existing?.chunkCount || 0,
                        hydrated: true,
                    });
                    return next;
                });

                if (pendingSelectAllWads.current.has(wadPath)) {
                    pendingSelectAllWads.current.delete(wadPath);
                    const all: ExtractItem[] = [];
                    collectExtractItemsFromNodes(wadPath, result.tree, all);
                    if (all.length > 0) {
                        setSelectedExtractMap((prev) => {
                            const next = new Map(prev);
                            for (const item of all) next.set(itemKey(item), item);
                            return next;
                        });
                    }
                }

                const pendingForWad = pendingPathSelections.current.get(wadPath);
                if (Array.isArray(pendingForWad) && pendingForWad.length > 0) {
                    pendingPathSelections.current.delete(wadPath);
                    const findByPath = (nodes: WadTreeNode[] | undefined, target: string): WadTreeNode | null => {
                        if (!Array.isArray(nodes)) return null;
                        for (const n of nodes) {
                            if (!n) continue;
                            if (n.path === target) return n;
                            if (n.type === 'dir') {
                                const f = findByPath(n.children, target);
                                if (f) return f;
                            }
                        }
                        return null;
                    };
                    setSelectedExtractMap((prev) => {
                        const next = new Map(prev);
                        for (const task of pendingForWad) {
                            if (!task?.path) continue;
                            const node = findByPath(result.tree, task.path);
                            if (!node) continue;
                            const items: ExtractItem[] = [];
                            if (node.type === 'file') {
                                const item = toExtractItemFromFileNode(wadPath, node);
                                if (item) items.push(item);
                            } else if (node.type === 'dir') {
                                collectExtractItemsFromNodes(wadPath, node.children || [], items);
                            }
                            const shouldSelect = task.select !== false;
                            if (shouldSelect) for (const item of items) next.set(itemKey(item), item);
                            else for (const item of items) next.delete(itemKey(item));
                        }
                        return next;
                    });
                }

                if (pendingRecursiveOpen.current.has(wadPath)) {
                    pendingRecursiveOpen.current.delete(wadPath);
                    const keys = collectAllDirKeys(wadPath, result.tree);
                    if (keys.length > 0) {
                        setExpandedDirs((prev) => {
                            const next = new Set(prev);
                            for (const k of keys) next.add(k);
                            return next;
                        });
                    }
                }
            })
            .catch((e) => {
                pendingSelectAllWads.current.delete(wadPath);
                pendingRecursiveOpen.current.delete(wadPath);
                log.error('wad mount/list', e);
                setWadData((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(wadPath);
                    next.set(wadPath, {
                        status: 'error',
                        error: (e as Error)?.message || 'Failed to open WAD',
                        paths: existing?.paths || null,
                        tree: existing?.tree || null,
                        chunkCount: existing?.chunkCount || 0,
                        hydrated: existing?.hydrated === true,
                    });
                    return next;
                });
            })
            .finally(() => {
                startedTreeLoads.current.delete(wadPath);
            });
    }, [collectAllDirKeys, openWads, wadData, mountWadTree]);

    const loadSingleWad = useCallback((wadPath: string) => {
        if (!wadPath) return;
        const name = wadPath.replace(/\\/g, '/').split('/').pop() || wadPath;
        const entry: WadScanEntry = { path: wadPath, name, isCustom: true };

        setScanError(null);
        setScanLoading(false);

        setGroups((prev) => {
            if (!prev) return { Custom: [entry] };
            const next = { ...prev };
            if (!next.Custom) next.Custom = [];
            if (!next.Custom.some((x) => x.path === wadPath)) {
                next.Custom = [entry, ...next.Custom];
            }
            return next;
        });

        setTotal((prev) => prev + 1);
        setOpenGroups((prev) => ({ ...prev, Custom: true }));
        setOpenWads((prev) => {
            const next = new Set(prev);
            next.add(wadPath);
            return next;
        });

        toggleWad(entry, { forceLoad: true });
    }, [toggleWad]);

    const toggleGroup = useCallback((key: string) => {
        setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const openGroup = useCallback((key: string) => {
        setOpenGroups((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    }, []);

    const openDir = useCallback((wadPath: string, dirPath: string) => {
        const key = wadPath + '||' + dirPath;
        setExpandedDirs((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    }, []);

    const toggleDir = useCallback((wadPath: string, dirPath: string, dirNode: WadTreeNode | null = null, options: { recursive?: boolean } | null = null) => {
        const key = wadPath + '||' + dirPath;
        const recursive = options?.recursive === true;
        setExpandedDirs((prev) => {
            const next = new Set(prev);
            const inSearchMode = debouncedSearch.trim().length > 0;

            if (!dirNode || dirNode.type !== 'dir') {
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            }

            const keys: string[] = [];
            if (recursive) {
                const collectAllDirs = (node: WadTreeNode | undefined) => {
                    if (!node || node.type !== 'dir') return;
                    keys.push(wadPath + '||' + node.path);
                    if (!Array.isArray(node.children)) return;
                    for (const child of node.children) collectAllDirs(child);
                };
                collectAllDirs(dirNode);
            } else if (inSearchMode) {
                keys.push(wadPath + '||' + dirNode.path);
                if (Array.isArray(dirNode.children)) {
                    for (const child of dirNode.children) {
                        if (child?.type === 'dir') keys.push(wadPath + '||' + child.path);
                    }
                }
            } else {
                keys.push(key);
            }

            const isExpanded = next.has(key);
            if (isExpanded) for (const k of keys) next.delete(k);
            else for (const k of keys) next.add(k);
            return next;
        });
    }, [debouncedSearch]);

    const flatRows = useMemo<FlatRow[]>(() => {
        if (!groups) return [];
        const searchQuery = debouncedSearch.trim();
        const matchesSearch = createSearchMatcher(searchQuery);
        const inSearchMode = searchQuery.length > 0;

        const groupKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'Champions') return -1;
            if (b === 'Champions') return 1;
            return a.localeCompare(b);
        });

        const rows: FlatRow[] = [];
        for (const key of groupKeys) {
            const items = groups[key];
            if (!items || items.length === 0) continue;
            const isGroupOpen = inSearchMode ? true : (openGroups[key] !== false);

            rows.push({ type: 'group', key, count: items.length, open: isGroupOpen });
            if (!isGroupOpen) continue;

            for (const entry of items) {
                const displayName = entry.name.replace(/\.wad\.client$/i, '');
                const isWadOpen = openWads.has(entry.path);
                const data: WadDataEntry = wadData.get(entry.path) || { status: 'idle', paths: null, tree: null, chunkCount: 0, hydrated: false };

                if (inSearchMode) {
                    const wadMatches = matchesSearch(displayName) || matchesSearch(entry.name);
                    let filteredTree: WadTreeNode[] = [];
                    if ((data.status === 'loaded' || data.status === 'tree-loading') && data.tree) {
                        filteredTree = buildFilteredTree(data.tree, matchesSearch);
                    }
                    if (!wadMatches && filteredTree.length === 0) continue;

                    rows.push({ type: 'wad', entry, displayName, open: isWadOpen, ...data });
                    if (!isWadOpen) continue;

                    if (filteredTree.length > 0) {
                        flattenInto(rows, filteredTree, entry.path, expandedDirs, 1);
                    } else if (data.status === 'error') {
                        rows.push({ type: 'wad-status', wadPath: entry.path, label: data.error, isError: true });
                    }
                    continue;
                }

                rows.push({ type: 'wad', entry, displayName, open: isWadOpen, ...data });
                if (!isWadOpen) continue;

                if (data.status === 'error') {
                    rows.push({ type: 'wad-status', wadPath: entry.path, label: data.error, isError: true });
                } else if (data.status === 'tree-loading' && !data.tree) {
                    rows.push({ type: 'wad-status', wadPath: entry.path, label: 'Loading…', isLoading: true });
                } else if ((data.status === 'loaded' || data.status === 'tree-loading') && data.tree) {
                    flattenInto(rows, data.tree, entry.path, expandedDirs, 1);
                }
            }
        }
        return rows;
    }, [groups, openGroups, openWads, wadData, expandedDirs, debouncedSearch]);

    const extractSelectedItems = useMemo(
        () => Array.from(selectedExtractMap.values()),
        [selectedExtractMap],
    );

    const extractSelectedCount = extractSelectedItems.length;

    const clearExtractSelection = useCallback(() => {
        setSelectedExtractMap(new Map());
    }, []);

    const getExtractSelectionState = useCallback((row: FlatRow): ExtractSelectionState => {
        const items = collectExtractItemsFromRow(row);
        if ((row?.type === 'file' || row?.type === 'dir') && items.length === 0) {
            return { checked: false, indeterminate: false, disabled: false };
        }
        if (row?.type === 'wad' && items.length === 0) {
            const status = String(row?.status || '');
            const canLoad = status === 'idle' || status === 'indexing' || status === 'indexed' || status === 'tree-loading';
            return { checked: false, indeterminate: false, disabled: !canLoad };
        }
        if (items.length === 0) return { checked: false, indeterminate: false, disabled: true };
        let selected = 0;
        for (const item of items) {
            if (selectedExtractMap.has(itemKey(item))) selected++;
        }
        return {
            checked: selected > 0 && selected === items.length,
            indeterminate: selected > 0 && selected < items.length,
            disabled: false,
        };
    }, [selectedExtractMap]);

    const toggleExtractSelection = useCallback((row: FlatRow, forceChecked: boolean | null = null) => {
        const items = collectExtractItemsFromRow(row);
        if ((row?.type === 'file' || row?.type === 'dir') && items.length === 0) {
            const wadPath = row?.wadPath;
            const targetPath = row?.node?.path;
            if (!wadPath || !targetPath) return;
            const shouldSelect = forceChecked == null ? true : !!forceChecked;

            const queue = pendingPathSelections.current.get(wadPath) || [];
            queue.push({ type: row.type, path: targetPath, select: shouldSelect });
            pendingPathSelections.current.set(wadPath, queue);

            let entry: WadScanEntry | null = null;
            if (groups) {
                for (const list of Object.values(groups)) {
                    const found = (list || []).find((x) => x.path === wadPath);
                    if (found) { entry = found; break; }
                }
            }
            if (entry) {
                const status = wadData.get(wadPath)?.status;
                if (!openWads.has(wadPath)) toggleWad(entry);
                else if (status !== 'loaded' && status !== 'tree-loading') toggleWad(entry, { forceLoad: true });
            }
            return;
        }

        if (row?.type === 'wad' && items.length === 0) {
            const wadPath = row?.entry?.path;
            if (!wadPath) return;
            const shouldSelect = forceChecked == null ? true : !!forceChecked;
            if (!shouldSelect) {
                pendingSelectAllWads.current.delete(wadPath);
                setSelectedExtractMap((prev) => {
                    const next = new Map(prev);
                    for (const [k, item] of Array.from(next.entries())) {
                        if (item?.wadPath === wadPath) next.delete(k);
                    }
                    return next;
                });
                return;
            }
            pendingSelectAllWads.current.add(wadPath);
            if (!openWads.has(wadPath)) {
                toggleWad(row.entry);
            } else {
                const status = wadData.get(wadPath)?.status;
                if (status !== 'loaded' && status !== 'tree-loading') toggleWad(row.entry, { forceLoad: true });
            }
            return;
        }

        if (items.length === 0) return;
        setSelectedExtractMap((prev) => {
            const next = new Map(prev);
            let selected = 0;
            for (const item of items) {
                if (next.has(itemKey(item))) selected++;
            }
            const shouldSelect = forceChecked == null ? selected !== items.length : !!forceChecked;
            if (shouldSelect) {
                for (const item of items) next.set(itemKey(item), item);
            } else {
                for (const item of items) next.delete(itemKey(item));
            }
            return next;
        });
    }, [groups, openWads, toggleWad, wadData]);

    const getExtractItemsForRow = useCallback((row: FlatRow) => collectExtractItemsFromRow(row), []);

    const getContextTargetInfo = useCallback((row: FlatRow) => describeExtractTarget(row), []);

    void indexReady;

    return {
        groups,
        scanLoading,
        scanError,
        total,
        scan,
        loadSingleWad,
        openGroups,
        toggleGroup,
        openGroup,
        openDir,
        openWads,
        toggleWad,
        reloadWad,
        wadData,
        toggleDir,
        selectedNode,
        setSelectedNode,
        search,
        setSearch,
        flatRows,
        indexingProgress,
        extractSelectedItems,
        extractSelectedCount,
        clearExtractSelection,
        getExtractSelectionState,
        toggleExtractSelection,
        getExtractItemsForRow,
        getContextTargetInfo,
        mountWadTree,
    };
}
