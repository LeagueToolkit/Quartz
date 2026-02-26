import React, { useRef, useEffect, useState } from 'react';
import { List } from 'react-window';
import { Search, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import WadTreeNode from './WadTreeNode.js';
import * as S from '../styles.js';

const ROW_HEIGHT = 26;

// ResizeObserver-based sizer — same pattern as Paint2/SystemList
const AutoSizer = ({ children }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      {size.height > 0 && children(size)}
    </div>
  );
};

// Row component — receives index + style from react-window v2, plus rowProps
const Row = React.memo(({ index, style, flatTree, expandedPaths, selectedPath, toggleExpand, setSelectedPath }) => {
  const node = flatTree[index];
  if (!node) return null;
  return (
    <WadTreeNode
      node={node}
      isExpanded={expandedPaths.has(node.path)}
      isSelected={selectedPath === node.path}
      onToggle={toggleExpand}
      onSelect={(n) => setSelectedPath(n.path)}
      style={style}
    />
  );
});

export default function WadTreeView({
  flatTree,
  chunkCount,
  loading,
  error,
  expandedPaths,
  search,
  setSearch,
  selectedPath,
  setSelectedPath,
  toggleExpand,
  expandAll,
  collapseAll,
  wadName,
}) {
  if (!wadName && !loading) {
    return (
      <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ opacity: 0.35, fontSize: 13, color: 'var(--text-2)' }}>Select a WAD to explore</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center' }}>
        <div style={S.spinner} />
        <span style={{ opacity: 0.5, fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>Parsing WAD…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#ef4444', fontSize: 12 }}>Error: {error}</span>
      </div>
    );
  }

  const rowProps = { flatTree, expandedPaths, selectedPath, toggleExpand, setSelectedPath };

  return (
    <div style={S.rightPanel}>
      {/* Toolbar */}
      <div style={S.treeHeader}>
        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {wadName ?? ''}
        </span>
        <span style={{ opacity: 0.4, fontSize: 11 }}>{chunkCount.toLocaleString()} chunks</span>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} />
          <input
            style={{ ...S.searchInput, paddingLeft: 24 }}
            placeholder="Filter files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            spellCheck={false}
          />
        </div>
        <button style={{ ...S.iconBtn, padding: '3px 6px' }} onClick={expandAll} title="Expand all">
          <ChevronsUpDown size={13} />
        </button>
        <button style={{ ...S.iconBtn, padding: '3px 6px' }} onClick={collapseAll} title="Collapse all">
          <ChevronsDownUp size={13} />
        </button>
      </div>

      {/* Virtualized list */}
      <div style={S.treeArea}>
        {flatTree.length === 0 ? (
          <div style={{ ...S.emptyState, height: '100%' }}>
            <span style={{ opacity: 0.35, fontSize: 12 }}>
              {search ? 'No files match' : 'Empty WAD'}
            </span>
          </div>
        ) : (
          <AutoSizer>
            {({ width, height }) => (
              <List
                width={width}
                height={height}
                rowCount={flatTree.length}
                rowHeight={ROW_HEIGHT}
                rowComponent={Row}
                rowProps={rowProps}
                style={{ overflowX: 'hidden' }}
              />
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
}
