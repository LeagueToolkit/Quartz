import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// Merge single-child directory chains into one row (like Flint's compactNode)
function compactDir(node) {
  let current = node;
  const parts = [current.name];
  while (
    current.type === 'dir' &&
    current.children?.length === 1 &&
    current.children[0].type === 'dir'
  ) {
    current = current.children[0];
    parts.push(current.name);
  }
  return { compactParts: parts, effectiveNode: current };
}

function flattenInto(rows, nodes, wadPath, expandedDirs, depth) {
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

function buildFilteredTree(nodes, q) {
  const out = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.path.toLowerCase().includes(q)) out.push(node);
      continue;
    }
    if (node.type !== 'dir') continue;
    const childFiltered = node.children?.length ? buildFilteredTree(node.children, q) : [];
    const selfMatches = node.path.toLowerCase().includes(q);
    if (!selfMatches && childFiltered.length === 0) continue;
    out.push({ ...node, children: childFiltered });
  }
  return out;
}

function buildTreeFromPaths(paths) {
  const root = { children: new Map() };
  for (const raw of paths) {
    const p = String(raw || '').replace(/\\/g, '/');
    if (!p) continue;
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        const dirPath = parts.slice(0, i + 1).join('/');
        node.children.set(part, {
          type: 'dir',
          name: part,
          path: dirPath,
          children: new Map(),
        });
      }
      node = node.children.get(part);
    }
    const fileName = parts[parts.length - 1];
    const dot = fileName.lastIndexOf('.');
    node.children.set(fileName + '\0' + p, {
      type: 'file',
      name: fileName,
      path: p,
      hash: p,
      extension: dot > 0 ? fileName.slice(dot + 1).toLowerCase() : null,
      compressedSize: null,
      decompressedSize: null,
      compressionType: null,
      pathHash: null,
    });
  }

  function toArray(parent) {
    const dirs = [];
    const files = [];
    for (const child of parent.children.values()) {
      if (child.type === 'dir') dirs.push({ ...child, children: toArray(child) });
      else files.push(child);
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  return toArray(root);
}

function toExtractItemFromFileNode(wadPath, fileNode) {
  const pathHash = String(fileNode?.pathHash || '').trim();
  const relPath = String(fileNode?.path || '').replace(/\\/g, '/');
  if (!wadPath || !pathHash || !relPath) return null;
  return { wadPath, pathHash, relPath };
}

function itemKey(item) {
  return `${item.wadPath}||${item.pathHash}||${item.relPath}`;
}

function collectExtractItemsFromNodes(wadPath, nodes, out) {
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

function collectExtractItemsFromRow(row) {
  const out = [];
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

export function useWadExplorer({ hashPath, indexReady = true }) {
  const [groups, setGroups] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [total, setTotal] = useState(0);

  const [openGroups, setOpenGroups] = useState({});
  const [openWads, setOpenWads] = useState(new Set());
  const [wadData, setWadData] = useState(new Map());
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [selectedExtractMap, setSelectedExtractMap] = useState(new Map());

  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const hashPathRef = useRef(hashPath);
  useEffect(() => {
    hashPathRef.current = hashPath;
  }, [hashPath]);

  const startedIndexLoads = useRef(new Set());
  const startedTreeLoads = useRef(new Set());
  const pendingRecursiveOpen = useRef(new Set());
  const pendingSelectAllWads = useRef(new Set());
  const pendingPathSelections = useRef(new Map());

  const collectAllDirKeys = useCallback((wadPath, nodes) => {
    const out = [];
    const walk = (items) => {
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

  useEffect(() => {
    if (!indexReady || !groups) return;

    const allEntries = Object.values(groups).flat();
    if (allEntries.length === 0) return;
    let cancelled = false;

    const wadPaths = [];
    for (const entry of allEntries) {
      const wadPath = entry.path;
      if (startedIndexLoads.current.has(wadPath)) continue;
      startedIndexLoads.current.add(wadPath);
      wadPaths.push(wadPath);
    }
    if (wadPaths.length === 0) return;

    const INDEX_TIMEOUT_MS = 25000;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setWadData(prev => {
        const next = new Map(prev);
        for (const wadPath of wadPaths) {
          const current = next.get(wadPath);
          if (!current || current.status !== 'indexing') continue;
          next.set(wadPath, {
            status: 'error',
            error: 'Index timeout',
            paths: current.paths || [],
            tree: current.tree || null,
            chunkCount: current.chunkCount || 0,
            hydrated: current.hydrated === true,
          });
        }
        return next;
      });
    }, INDEX_TIMEOUT_MS);

    setWadData(prev => {
      const next = new Map(prev);
      for (const wadPath of wadPaths) {
        const existing = next.get(wadPath);
        if (!existing) next.set(wadPath, { status: 'indexing', paths: null, tree: null, chunkCount: 0, hydrated: false });
      }
      return next;
    });

    const runBatch = async () => {
      const api = window.electronAPI?.wad;
      const applyResults = (results) => {
        setWadData(prev => {
          const next = new Map(prev);
          for (const r of results) {
            const wadPath = r?.path;
            if (!wadPath) continue;
            const existing = next.get(wadPath);
            if (existing?.status === 'loaded' || existing?.status === 'tree-loading') continue;
            if (r?.error) {
              next.set(wadPath, {
                status: 'error',
                error: r.error,
                paths: existing?.paths || null,
                tree: null,
                chunkCount: existing?.chunkCount || 0,
                hydrated: existing?.hydrated === true,
              });
            } else {
              next.set(wadPath, {
                status: 'indexed',
                paths: Array.isArray(r?.paths) ? r.paths : [],
                tree: null,
                chunkCount: r?.chunkCount || 0,
                hydrated: false,
              });
            }
          }
          return next;
        });
      };

      if (typeof api?.loadAllIndexes === 'function') {
        const result = await api.loadAllIndexes({ wadPaths, hashPath: hashPathRef.current, concurrency: 3 });
        if (cancelled) return;
        if (result?.error) throw new Error(result.error);
        const raw = Array.isArray(result?.results) ? result.results : [];
        const byPath = new Map();
        for (const r of raw) {
          if (!r?.path || byPath.has(r.path)) continue;
          byPath.set(r.path, r);
        }
        const normalized = wadPaths.map((p) => {
          const r = byPath.get(p);
          if (!r) return { path: p, error: 'Missing index result', paths: [], chunkCount: 0 };
          return {
            path: p,
            error: r.error || null,
            paths: Array.isArray(r.paths) ? r.paths : [],
            chunkCount: Number(r.chunkCount || 0),
          };
        });
        applyResults(normalized);
        return;
      }

      for (const wadPath of wadPaths) {
        if (cancelled) return;
        try {
          const result = await window.electronAPI.wad.mountTree({
            wadPath,
            hashPath: hashPathRef.current,
            flatOnly: true,
          });
          if (cancelled) return;
          if (result.error) throw new Error(result.error);
          applyResults([{ path: wadPath, error: null, paths: Array.isArray(result.paths) ? result.paths : [], chunkCount: result.chunkCount || 0 }]);
        } catch (e) {
          if (cancelled) return;
          applyResults([{ path: wadPath, error: e.message, paths: [], chunkCount: 0 }]);
        }
      }
    };

    runBatch().catch((e) => {
      if (cancelled) return;
      for (const wadPath of wadPaths) {
        setWadData(prev => {
          const next = new Map(prev);
          const existing = next.get(wadPath);
          if (existing?.status === 'loaded' || existing?.status === 'tree-loading') return prev;
          next.set(wadPath, {
            status: 'error',
            error: e.message,
            paths: existing?.paths || null,
            tree: null,
            chunkCount: existing?.chunkCount || 0,
            hydrated: existing?.hydrated === true,
          });
          return next;
        });
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      // In React StrictMode (dev), effects mount/cleanup twice.
      // If a batch gets cancelled, release these paths so next run can index them.
      for (const wadPath of wadPaths) {
        startedIndexLoads.current.delete(wadPath);
      }
    };
  }, [groups, indexReady]);

  const indexingProgress = useMemo(() => {
    if (!groups) return null;
    const all = Object.values(groups).reduce((s, items) => s + items.length, 0);
    if (all === 0) return null;
    let done = 0;
    for (const d of wadData.values()) {
      if (d.status === 'indexed' || d.status === 'tree-loading' || d.status === 'loaded' || d.status === 'error') done++;
    }
    return { done, total: all, active: done < all };
  }, [groups, wadData]);

  const scan = useCallback(async (gamePath) => {
    if (!gamePath) return;
    setScanLoading(true);
    setScanError(null);
    startedIndexLoads.current = new Set();
    startedTreeLoads.current = new Set();
    setWadData(new Map());
    setSelectedExtractMap(new Map());
    try {
      const result = await window.electronAPI.wad.scanAll({ gamePath });
      if (result.error) throw new Error(result.error);
      setGroups(result.groups);
      setTotal(result.total || 0);
      const open = {};
      for (const key of Object.keys(result.groups)) open[key] = false;
      setOpenGroups(open);
    } catch (e) {
      setScanError(e.message);
      setGroups(null);
    } finally {
      setScanLoading(false);
    }
  }, []);
  const reloadWad = useCallback((wadPath) => {
    startedTreeLoads.current.delete(wadPath);
    setWadData(prev => {
      const next = new Map(prev);
      const existing = next.get(wadPath);
      if (existing) next.set(wadPath, { ...existing, status: 'indexed', hydrated: false, tree: null });
      return next;
    });
  }, []);

  const toggleWad = useCallback((entry, options = null) => {
    const wadPath = entry.path;
    const recursive = options?.recursive === true;
    const forceLoad = options?.forceLoad === true;
    const isOpen = openWads.has(wadPath);
    const willOpen = forceLoad ? true : !isOpen;

    if (recursive && !willOpen) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        for (const k of Array.from(next)) {
          if (k.startsWith(wadPath + '||')) next.delete(k);
        }
        return next;
      });
    }

    if (!forceLoad) {
      setOpenWads(prev => {
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
          setExpandedDirs(prev => {
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
    setWadData(prev => {
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

    window.electronAPI.wad.mountTree({ wadPath, hashPath: hashPathRef.current })
      .then((result) => {
        if (result.error) throw new Error(result.error);
        setWadData(prev => {
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
          const all = [];
          collectExtractItemsFromNodes(wadPath, result.tree, all);
          if (all.length > 0) {
            setSelectedExtractMap(prev => {
              const next = new Map(prev);
              for (const item of all) next.set(itemKey(item), item);
              return next;
            });
          }
        }
        const pendingForWad = pendingPathSelections.current.get(wadPath);
        if (Array.isArray(pendingForWad) && pendingForWad.length > 0) {
          pendingPathSelections.current.delete(wadPath);
          const findByPath = (nodes, target, out = null) => {
            if (!Array.isArray(nodes)) return out;
            for (const n of nodes) {
              if (!n) continue;
              if (n.path === target) return n;
              if (n.type === 'dir') {
                const f = findByPath(n.children, target, out);
                if (f) return f;
              }
            }
            return out;
          };
          setSelectedExtractMap(prev => {
            const next = new Map(prev);
            for (const task of pendingForWad) {
              if (!task?.path) continue;
              const node = findByPath(result.tree, task.path, null);
              if (!node) continue;
              const items = [];
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
            setExpandedDirs(prev => {
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
        setWadData(prev => {
          const next = new Map(prev);
          const existing = next.get(wadPath);
          next.set(wadPath, {
            status: 'error',
            error: e.message,
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
  }, [collectAllDirKeys, openWads, wadData]);


  const loadSingleWad = useCallback((wadPath) => {
    if (!wadPath) return;
    const name = wadPath.replace(/\\/g, '/').split('/').pop() || wadPath;
    const entry = { path: wadPath, name, isCustom: true };

    setScanError(null);
    setScanLoading(false);

    setGroups(prev => {
      if (!prev) return { Custom: [entry] };
      const next = { ...prev };
      if (!next.Custom) next.Custom = [];
      if (!next.Custom.some(x => x.path === wadPath)) {
        next.Custom = [entry, ...next.Custom];
      }
      return next;
    });

    setTotal(prev => prev + 1);
    setOpenGroups(prev => ({ ...prev, Custom: true }));
    setOpenWads(prev => {
      const next = new Set(prev);
      next.add(wadPath);
      return next;
    });

    // Trigger tree load
    toggleWad(entry, { forceLoad: true });
  }, [toggleWad]);

  const toggleGroup = useCallback((key) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);



  const toggleDir = useCallback((wadPath, dirPath, dirNode = null, options = null) => {
    const key = wadPath + '||' + dirPath;
    const recursive = options?.recursive === true;
    setExpandedDirs(prev => {
      const next = new Set(prev);
      const inSearchMode = debouncedSearch.trim().length > 0;

      if (!dirNode || dirNode.type !== 'dir') {
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }

      const keys = [];
      if (recursive) {
        const collectAllDirs = (node) => {
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

  const flatRows = useMemo(() => {
    if (!groups) return [];
    const q = debouncedSearch.trim().toLowerCase();
    const inSearchMode = q.length > 0;

    const groupKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Champions') return -1;
      if (b === 'Champions') return 1;
      return a.localeCompare(b);
    });

    const rows = [];
    for (const key of groupKeys) {
      const items = groups[key];
      if (!items || items.length === 0) continue;
      const isGroupOpen = inSearchMode ? true : (openGroups[key] !== false);

      rows.push({ type: 'group', key, count: items.length, open: isGroupOpen });
      if (!isGroupOpen) continue;

      for (const entry of items) {
        const displayName = entry.name.replace(/\.wad\.client$/i, '');
        const isWadOpen = openWads.has(entry.path);
        const data = wadData.get(entry.path) || { status: 'idle', paths: null, tree: null };

        if (inSearchMode) {
          const wadMatches = displayName.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q);
          let filteredTree = [];
          if ((data.status === 'loaded' || data.status === 'tree-loading') && data.tree) {
            filteredTree = buildFilteredTree(data.tree, q);
          } else if (Array.isArray(data.paths) && data.paths.length > 0) {
            const matchingPaths = data.paths.filter(p => typeof p === 'string' && p.toLowerCase().includes(q));
            filteredTree = buildTreeFromPaths(matchingPaths);
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
        } else if ((data.status === 'loaded' || data.status === 'tree-loading') && data.tree) {
          flattenInto(rows, data.tree, entry.path, expandedDirs, 1);
        }
      }
    }
    return rows;
  }, [groups, openGroups, openWads, wadData, expandedDirs, debouncedSearch]);

  const extractSelectedItems = useMemo(
    () => Array.from(selectedExtractMap.values()),
    [selectedExtractMap]
  );

  const extractSelectedCount = extractSelectedItems.length;

  const clearExtractSelection = useCallback(() => {
    setSelectedExtractMap(new Map());
  }, []);

  const getExtractSelectionState = useCallback((row) => {
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

  const toggleExtractSelection = useCallback((row, forceChecked = null) => {
    const items = collectExtractItemsFromRow(row);
    if ((row?.type === 'file' || row?.type === 'dir') && items.length === 0) {
      const wadPath = row?.wadPath;
      const targetPath = row?.node?.path;
      if (!wadPath || !targetPath) return;
      const shouldSelect = forceChecked == null ? true : !!forceChecked;

      const queue = pendingPathSelections.current.get(wadPath) || [];
      queue.push({
        type: row.type,
        path: targetPath,
        select: shouldSelect,
      });
      pendingPathSelections.current.set(wadPath, queue);

      let entry = null;
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
        setSelectedExtractMap(prev => {
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
    setSelectedExtractMap(prev => {
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

  return {
    groups,
    scanLoading,
    scanError,
    total,
    scan,
    loadSingleWad,
    openGroups,
    toggleGroup,
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
  };
}
