import { useState, useCallback, useMemo } from 'react';

// Flatten the nested tree into a visible node list for react-window.
// expandedPaths is a Set<string> of directory paths that are open.
function flattenTree(nodes, expandedPaths, depth = 0) {
  const result = [];
  for (const node of nodes) {
    result.push({ ...node, depth, hasChildren: node.type === 'dir' && node.children?.length > 0 });
    if (node.type === 'dir' && expandedPaths.has(node.path) && node.children?.length > 0) {
      const childFlat = flattenTree(node.children, expandedPaths, depth + 1);
      for (const c of childFlat) result.push(c);
    }
  }
  return result;
}

// Filter tree nodes by search query (case-insensitive path match).
// Returns a new tree with only matching branches.
function filterTree(nodes, query) {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const result = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.path.toLowerCase().includes(q)) result.push(node);
    } else {
      const filteredChildren = filterTree(node.children || [], q);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

export function useWadTree() {
  const [tree, setTree] = useState(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState(null);

  const mount = useCallback(async (wadPath, hashPath) => {
    setLoading(true);
    setError(null);
    setTree(null);
    setExpandedPaths(new Set());
    setSearch('');
    setSelectedPath(null);
    try {
      const result = await window.electronAPI.wad.mountTree({ wadPath, hashPath });
      if (result.error) throw new Error(result.error);
      setTree(result.tree);
      setChunkCount(result.chunkCount);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleExpand = useCallback((nodePath) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(nodePath)) next.delete(nodePath);
      else next.add(nodePath);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!tree) return;
    const paths = new Set();
    function collect(nodes) {
      for (const n of nodes) {
        if (n.type === 'dir') {
          paths.add(n.path);
          if (n.children) collect(n.children);
        }
      }
    }
    collect(tree);
    setExpandedPaths(paths);
  }, [tree]);

  const collapseAll = useCallback(() => setExpandedPaths(new Set()), []);

  // When searching, auto-expand everything so matches are visible
  const activeTree = useMemo(() => {
    if (!tree) return [];
    return search ? filterTree(tree, search) : tree;
  }, [tree, search]);

  const flatTree = useMemo(() => {
    const expanded = search ? 'all' : expandedPaths;
    if (search) {
      // With search active, flatten fully expanded
      function flatAll(nodes, depth = 0) {
        const out = [];
        for (const n of nodes) {
          out.push({ ...n, depth, hasChildren: n.type === 'dir' && n.children?.length > 0 });
          if (n.type === 'dir' && n.children?.length > 0) {
            for (const c of flatAll(n.children, depth + 1)) out.push(c);
          }
        }
        return out;
      }
      return flatAll(activeTree);
    }
    return flattenTree(activeTree, expandedPaths);
  }, [activeTree, expandedPaths, search]);

  return {
    tree,
    flatTree,
    chunkCount,
    loading,
    error,
    expandedPaths,
    search,
    setSearch,
    selectedPath,
    setSelectedPath,
    mount,
    toggleExpand,
    expandAll,
    collapseAll,
  };
}
