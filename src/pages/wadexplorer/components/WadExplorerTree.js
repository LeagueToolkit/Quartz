import React, { useRef, useEffect, useState } from 'react';
import { List } from 'react-window';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileText, Music, Image, Box, Layers, Cpu, File, Search,
} from 'lucide-react';
import * as S from '../styles.js';

function RowCheckbox({ checked, indeterminate, disabled, onChange, title, symbolSize }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const boxSize = Math.max(11, Math.min(20, symbolSize + 1));

  return (
    <label
      title={title}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        width: boxSize,
        height: boxSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={onChange}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          margin: 0,
          cursor: disabled ? 'default' : 'pointer',
        }}
      />
      <span
        style={{
          width: boxSize,
          height: boxSize,
          borderRadius: 3,
          boxSizing: 'border-box',
          border: `1px solid ${disabled ? 'rgba(255,255,255,0.16)' : (checked || indeterminate ? 'var(--accent)' : 'rgba(255,255,255,0.34)')}`,
          background: checked || indeterminate
            ? 'color-mix(in srgb, var(--accent), transparent 72%)'
            : 'rgba(255,255,255,0.03)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          fontSize: Math.max(9, symbolSize - 2),
          lineHeight: 1,
          fontWeight: 800,
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        {checked ? '✓' : indeterminate ? '−' : ''}
      </span>
    </label>
  );
}

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

function getFileIcon(ext, symbolSize) {
  switch ((ext || '').toLowerCase()) {
    case 'ogg': case 'wav': case 'mp3': case 'wem':
      return <Music size={symbolSize} style={{ color: '#f59e0b', flexShrink: 0 }} />;
    case 'dds': case 'png': case 'jpg': case 'tga': case 'tex':
      return <Image size={symbolSize} style={{ color: '#06b6d4', flexShrink: 0 }} />;
    case 'skn': case 'skl': case 'scb': case 'sco': case 'scw':
      return <Box size={symbolSize} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
    case 'anm':
      return <Layers size={symbolSize} style={{ color: '#10b981', flexShrink: 0 }} />;
    case 'bin': case 'inibin':
      return <File size={symbolSize} style={{ color: '#3b82f6', flexShrink: 0 }} />;
    case 'luaobj': case 'lua':
      return <FileText size={symbolSize} style={{ color: '#a78bfa', flexShrink: 0 }} />;
    default:
      return <File size={symbolSize} style={{ opacity: 0.4, flexShrink: 0 }} />;
  }
}

function GroupRow({ row, style, toggleGroup, fontSize, symbolSize }) {
  return (
    <div
      style={{ ...style, ...S.groupHeader, paddingLeft: 10, fontSize: Math.max(10, fontSize - 1) }}
      onClick={() => toggleGroup(row.key)}
    >
      {row.open
        ? <ChevronDown size={Math.max(10, symbolSize - 1)} style={{ opacity: 0.5, flexShrink: 0 }} />
        : <ChevronRight size={Math.max(10, symbolSize - 1)} style={{ opacity: 0.5, flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{row.key}</span>
      <span style={S.badge}>{row.count}</span>
    </div>
  );
}

function WadRow({ row, style, toggleWad, onWadContextMenu, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode }) {
  const state = getExtractSelectionState(row);
  return (
    <div
      style={{ ...style, ...S.unifiedWadRow, color: row.entry?.isVoiceover ? 'var(--text-2)' : 'var(--text)', fontStyle: row.entry?.isVoiceover ? 'italic' : 'normal' }}
      onClick={(e) => toggleWad(row.entry, { recursive: e.shiftKey })}
      onContextMenu={(e) => { e.preventDefault(); onWadContextMenu?.(e, row.entry); }}
      title={row.entry?.path}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {selectionMode ? (
        <RowCheckbox
          checked={state.checked}
          indeterminate={state.indeterminate}
          disabled={state.disabled}
          onChange={(e) => toggleExtractSelection(row, e.target.checked)}
          title={state.disabled ? 'Load this WAD tree first to select files' : 'Select files in this WAD'}
          symbolSize={symbolSize}
        />
      ) : null}
      {row.open
        ? <ChevronDown size={symbolSize} style={{ flexShrink: 0, opacity: 0.55 }} />
        : <ChevronRight size={symbolSize} style={{ flexShrink: 0, opacity: 0.55 }} />}
      <Folder size={symbolSize + 1} style={{ flexShrink: 0, color: '#fbbf24', opacity: 0.85 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize }}>
        {row.displayName}
      </span>
    </div>
  );
}

function WadStatusRow({ row, style, fontSize }) {
  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 34, fontSize: Math.max(10, fontSize - 1), boxSizing: 'border-box' }}>
      {row.isLoading && <div style={{ ...S.spinner, width: 12, height: 12, borderWidth: 1.5 }} />}
      <span style={{ color: row.isError ? '#ef4444' : 'var(--text-2)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.label}
      </span>
    </div>
  );
}

function DirRow({ row, style, toggleDir, isSelected, onSelect, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode }) {
  const indent = 10 + row.depth * 14;
  const state = getExtractSelectionState(row);
  return (
    <div
      style={{ ...style, ...S.treeRow, paddingLeft: indent, background: isSelected ? 'rgba(120,80,255,0.15)' : 'transparent', color: isSelected ? 'var(--accent)' : 'var(--text)' }}
      onClick={(e) => { toggleDir(row.wadPath, row.node.path, row.node, { recursive: e.shiftKey }); onSelect(row); }}
      title={row.node.path}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(120,80,255,0.15)' : 'transparent'; }}
    >
      {selectionMode ? (
        <RowCheckbox
          checked={state.checked}
          indeterminate={state.indeterminate}
          disabled={state.disabled}
          onChange={(e) => toggleExtractSelection(row, e.target.checked)}
          title={state.disabled ? 'No extractable files in this folder' : 'Select files in this folder'}
          symbolSize={symbolSize}
        />
      ) : null}
      {row.hasChildren
        ? (row.expanded
          ? <ChevronDown size={symbolSize} style={{ flexShrink: 0, opacity: 0.55 }} />
          : <ChevronRight size={symbolSize} style={{ flexShrink: 0, opacity: 0.55 }} />)
        : <span style={{ width: symbolSize, flexShrink: 0 }} />}
      {row.expanded
        ? <FolderOpen size={symbolSize + 1} style={{ color: '#fbbf24', flexShrink: 0 }} />
        : <Folder size={symbolSize + 1} style={{ color: '#fbbf24', flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize }}>
        {row.compactParts?.length > 1 ? (
          row.compactParts.map((seg, idx, arr) => (
            <React.Fragment key={idx}>
              <span style={{ color: idx === 0 ? 'var(--text)' : 'var(--text-2)', opacity: idx === 0 ? 1 : 0.8 }}>{seg}</span>
              {idx < arr.length - 1 && <span style={{ color: 'var(--text-2)', opacity: 0.5, padding: '0 1px' }}>/</span>}
            </React.Fragment>
          ))
        ) : row.node.name}
      </span>
      {row.hasChildren && (
        <span style={{ ...S.badge, fontSize: 10, marginRight: 4 }}>{row.node.children?.length}</span>
      )}
    </div>
  );
}

function FileRow({ row, style, isSelected, onSelect, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode }) {
  const indent = 10 + row.depth * 14;
  const ext = row.node.extension || row.node.name.split('.').pop() || '';
  const state = getExtractSelectionState(row);
  return (
    <div
      style={{ ...style, ...S.treeRow, paddingLeft: indent, background: isSelected ? 'rgba(120,80,255,0.15)' : 'transparent', color: isSelected ? 'var(--accent)' : 'var(--text)' }}
      onClick={() => onSelect(row)}
      title={row.node.path}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(120,80,255,0.15)' : 'transparent'; }}
    >
      {selectionMode ? (
        <RowCheckbox
          checked={state.checked}
          indeterminate={false}
          disabled={state.disabled}
          onChange={(e) => toggleExtractSelection(row, e.target.checked)}
          title={state.disabled ? 'File not extractable from index-only row' : 'Select this file'}
          symbolSize={symbolSize}
        />
      ) : null}
      <span style={{ width: symbolSize, flexShrink: 0 }} />
      {getFileIcon(ext, symbolSize)}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize }}>
        {row.node.name}
      </span>
      {row.node.decompressedSize > 0 && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0, paddingLeft: 6, paddingRight: 4 }}>
          {fmtSize(row.node.decompressedSize)}
        </span>
      )}
    </div>
  );
}

function fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
  if (bytes >= 1024)    return Math.round(bytes / 1024) + 'KB';
  return bytes + 'B';
}

const Row = React.memo(({ index, style, flatRows, toggleGroup, toggleWad, toggleDir, selectedNode, setSelectedNode, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode, onWadContextMenu }) => {
  const row = flatRows[index];
  if (!row) return null;

  const nodeKey = row.node?.path && row.wadPath ? row.wadPath + '||' + row.node.path : null;
  const selKey = selectedNode?.node?.path && selectedNode?.wadPath ? selectedNode.wadPath + '||' + selectedNode.node.path : null;
  const isSelected = !!(nodeKey && nodeKey === selKey);

  switch (row.type) {
    case 'group':
      return <GroupRow row={row} style={style} toggleGroup={toggleGroup} fontSize={fontSize} symbolSize={symbolSize} />;
    case 'wad':
      return <WadRow row={row} style={style} toggleWad={toggleWad} onWadContextMenu={onWadContextMenu} getExtractSelectionState={getExtractSelectionState} toggleExtractSelection={toggleExtractSelection} fontSize={fontSize} symbolSize={symbolSize} selectionMode={selectionMode} />;
    case 'wad-status':
      return <WadStatusRow row={row} style={style} fontSize={fontSize} />;
    case 'dir':
      return <DirRow row={row} style={style} toggleDir={toggleDir} isSelected={isSelected} onSelect={setSelectedNode} getExtractSelectionState={getExtractSelectionState} toggleExtractSelection={toggleExtractSelection} fontSize={fontSize} symbolSize={symbolSize} selectionMode={selectionMode} />;
    case 'file':
      return <FileRow row={row} style={style} isSelected={isSelected} onSelect={setSelectedNode} getExtractSelectionState={getExtractSelectionState} toggleExtractSelection={toggleExtractSelection} fontSize={fontSize} symbolSize={symbolSize} selectionMode={selectionMode} />;
    default:
      return null;
  }
});

export default function WadExplorerTree({
  flatRows,
  search,
  setSearch,
  toggleGroup,
  toggleWad,
  toggleDir,
  selectedNode,
  setSelectedNode,
  loading,
  getExtractSelectionState,
  toggleExtractSelection,
  onWadContextMenu = null,
  rowHeight = 24,
  fontSize = 12,
  panelWidth = 320,
  symbolSize = 12,
  selectionMode = false,
  onToggleSelectionMode = null,
}) {
  const rowProps = { flatRows, toggleGroup, toggleWad, toggleDir, selectedNode, setSelectedNode, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode, onWadContextMenu };

  return (
    <div style={{ ...S.leftPanel, width: panelWidth }}>
      {/* Search bar */}
      <div style={{ padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', opacity: 0.38, pointerEvents: 'none' }} />
        <input
          style={{ ...S.searchInput, width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 70 }}
          placeholder="Filter files…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onToggleSelectionMode}
          title={selectionMode ? 'Hide selection checkboxes' : 'Show selection checkboxes'}
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 24,
            padding: '0 8px',
            borderRadius: 6,
            border: `1px solid ${selectionMode ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
            background: selectionMode ? 'color-mix(in srgb, var(--accent), transparent 85%)' : 'rgba(255,255,255,0.04)',
            color: selectionMode ? 'var(--accent)' : 'var(--text-2)',
            fontSize: 11,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Select
        </button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ ...S.emptyState, height: '100%' }}>
            <div style={S.spinner} />
            <span style={{ opacity: 0.5, fontSize: 12 }}>Scanning…</span>
          </div>
        ) : flatRows.length === 0 ? (
          <div style={{ ...S.emptyState, height: '100%' }}>
            <span style={{ opacity: 0.35, fontSize: 12 }}>
              {search ? 'No files match' : 'No WADs found'}
            </span>
          </div>
        ) : (
          <AutoSizer>
            {({ width, height }) => (
              <List
                width={width}
                height={height}
                rowCount={flatRows.length}
                rowHeight={rowHeight}
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
