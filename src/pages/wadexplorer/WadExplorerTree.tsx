import {
    useRef, useEffect, useState, useMemo, memo, Fragment,
    type CSSProperties, type ChangeEvent, type MouseEvent as ReactMouseEvent,
} from 'react';
import {
    ChevronRight, ChevronDown, Folder, FolderOpen,
    FileText, Music, Image as ImageIcon, Box, Layers, File as FileIcon, Search,
} from 'lucide-react';
import * as S from './styles';
import type {
    FlatRow, SelectedNode, ExtractSelectionState, WadScanEntry, WadTreeNode,
} from './types';

interface RowCheckboxProps {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    title: string;
    symbolSize: number;
}

function RowCheckbox({ checked, indeterminate, disabled, onChange, title, symbolSize }: RowCheckboxProps) {
    const ref = useRef<HTMLInputElement>(null);
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
                style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: disabled ? 'default' : 'pointer' }}
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

// Lightweight windowed list — replaces react-window so no extra dependency is
// needed. Renders only the rows in (and a small overscan around) the viewport.
interface VirtualListProps {
    rowCount: number;
    rowHeight: number;
    renderRow: (index: number, style: CSSProperties) => React.ReactNode;
    scrollToIndex?: number | null;
    scrollAlign?: 'auto' | 'center';
}

function VirtualList({ rowCount, rowHeight, renderRow, scrollToIndex, scrollAlign }: VirtualListProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver((entries) => {
            const e = entries[0];
            if (e) setHeight(e.contentRect.height);
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (scrollToIndex == null || scrollToIndex < 0) return;
        const el = containerRef.current;
        if (!el) return;
        const viewH = el.clientHeight || 0;
        const itemTop = scrollToIndex * rowHeight;
        let next = itemTop;
        if (scrollAlign === 'center') {
            next = itemTop - viewH / 2 + rowHeight / 2;
        } else {
            const cur = el.scrollTop;
            if (itemTop >= cur && itemTop + rowHeight <= cur + viewH) return;
            if (itemTop < cur) next = itemTop;
            else next = itemTop - viewH + rowHeight;
        }
        el.scrollTop = Math.max(0, next);
    }, [scrollToIndex, scrollAlign, rowHeight]);

    const overscan = 8;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil((height || 0) / rowHeight) + overscan * 2;
    const end = Math.min(rowCount, start + visibleCount);

    const rows: React.ReactNode[] = [];
    for (let i = start; i < end; i++) {
        rows.push(renderRow(i, { position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }));
    }

    return (
        <div
            ref={containerRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
        >
            <div style={{ height: rowCount * rowHeight, position: 'relative' }}>{rows}</div>
        </div>
    );
}

function getFileIcon(ext: string, symbolSize: number) {
    switch ((ext || '').toLowerCase()) {
        case 'ogg': case 'wav': case 'mp3': case 'wem':
            return <Music size={symbolSize} style={{ color: '#f59e0b', flexShrink: 0 }} />;
        case 'dds': case 'png': case 'jpg': case 'tga': case 'tex':
            return <ImageIcon size={symbolSize} style={{ color: '#06b6d4', flexShrink: 0 }} />;
        case 'skn': case 'skl': case 'scb': case 'sco': case 'scw':
            return <Box size={symbolSize} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
        case 'anm':
            return <Layers size={symbolSize} style={{ color: '#10b981', flexShrink: 0 }} />;
        case 'bin': case 'inibin':
            return <FileIcon size={symbolSize} style={{ color: '#3b82f6', flexShrink: 0 }} />;
        case 'luaobj': case 'lua':
            return <FileText size={symbolSize} style={{ color: '#a78bfa', flexShrink: 0 }} />;
        default:
            return <FileIcon size={symbolSize} style={{ opacity: 0.4, flexShrink: 0 }} />;
    }
}

function fmtSize(bytes: number) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + 'KB';
    return bytes + 'B';
}

type GroupRowT = Extract<FlatRow, { type: 'group' }>;
type WadRowT = Extract<FlatRow, { type: 'wad' }>;
type WadStatusRowT = Extract<FlatRow, { type: 'wad-status' }>;
type DirRowT = Extract<FlatRow, { type: 'dir' }>;
type FileRowT = Extract<FlatRow, { type: 'file' }>;

interface CommonRowProps {
    toggleGroup: (key: string) => void;
    toggleWad: (entry: WadScanEntry, options?: { recursive?: boolean } | null) => void;
    toggleDir: (wadPath: string, dirPath: string, dirNode?: WadTreeNode | null, options?: { recursive?: boolean } | null) => void;
    setSelectedNode: (row: FlatRow) => void;
    getExtractSelectionState: (row: FlatRow) => ExtractSelectionState;
    toggleExtractSelection: (row: FlatRow, forceChecked?: boolean | null) => void;
    onWadContextMenu?: ((e: ReactMouseEvent, row: FlatRow) => void) | null;
    fontSize: number;
    symbolSize: number;
    selectionMode: boolean;
}

function GroupRow({ row, style, toggleGroup, fontSize, symbolSize }: { row: GroupRowT; style: CSSProperties } & Pick<CommonRowProps, 'toggleGroup' | 'fontSize' | 'symbolSize'>) {
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

function WadRow({ row, style, toggleWad, onWadContextMenu, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode }: { row: WadRowT; style: CSSProperties } & CommonRowProps) {
    const state = getExtractSelectionState(row);
    return (
        <div
            style={{ ...style, ...S.unifiedWadRow, color: row.entry?.isVoiceover ? 'var(--text-2)' : 'var(--text)', fontStyle: row.entry?.isVoiceover ? 'italic' : 'normal' }}
            onClick={(e) => toggleWad(row.entry, { recursive: e.shiftKey })}
            onContextMenu={(e) => { e.preventDefault(); onWadContextMenu?.(e, row); }}
            title={row.entry?.path}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
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

function WadStatusRow({ row, style, fontSize }: { row: WadStatusRowT; style: CSSProperties; fontSize: number }) {
    return (
        <div style={{ ...style, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 34, fontSize: Math.max(10, fontSize - 1), boxSizing: 'border-box' }}>
            {row.isLoading && <div style={{ ...S.spinner, width: 12, height: 12, borderWidth: 1.5 }} />}
            <span style={{ color: row.isError ? '#ef4444' : 'var(--text-2)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
            </span>
        </div>
    );
}

function DirRow({ row, style, toggleDir, isSelected, setSelectedNode, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode, onWadContextMenu }: { row: DirRowT; style: CSSProperties; isSelected: boolean } & CommonRowProps) {
    const indent = 10 + row.depth * 14;
    const state = getExtractSelectionState(row);
    return (
        <div
            style={{ ...style, ...S.treeRow, paddingLeft: indent, background: isSelected ? 'rgba(120,80,255,0.15)' : 'transparent', color: isSelected ? 'var(--accent)' : 'var(--text)' }}
            onClick={(e) => { toggleDir(row.wadPath, row.node.path, row.node, { recursive: e.shiftKey }); setSelectedNode(row); }}
            onContextMenu={(e) => { e.preventDefault(); setSelectedNode(row); onWadContextMenu?.(e, row); }}
            title={row.node.path}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(120,80,255,0.15)' : 'transparent'; }}
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
                {row.compactParts && row.compactParts.length > 1 ? (
                    row.compactParts.map((seg, idx, arr) => (
                        <Fragment key={idx}>
                            <span style={{ color: idx === 0 ? 'var(--text)' : 'var(--text-2)', opacity: idx === 0 ? 1 : 0.8 }}>{seg}</span>
                            {idx < arr.length - 1 && <span style={{ color: 'var(--text-2)', opacity: 0.5, padding: '0 1px' }}>/</span>}
                        </Fragment>
                    ))
                ) : row.node.name}
            </span>
            {row.hasChildren && (
                <span style={{ ...S.badge, fontSize: 10, marginRight: 4 }}>{row.node.children?.length}</span>
            )}
        </div>
    );
}

function FileRow({ row, style, isSelected, setSelectedNode, getExtractSelectionState, toggleExtractSelection, fontSize, symbolSize, selectionMode, onWadContextMenu }: { row: FileRowT; style: CSSProperties; isSelected: boolean } & CommonRowProps) {
    const indent = 10 + row.depth * 14;
    const ext = row.node.extension || row.node.name.split('.').pop() || '';
    const state = getExtractSelectionState(row);
    return (
        <div
            style={{ ...style, ...S.treeRow, paddingLeft: indent, background: isSelected ? 'rgba(120,80,255,0.15)' : 'transparent', color: isSelected ? 'var(--accent)' : 'var(--text)' }}
            onClick={() => setSelectedNode(row)}
            onContextMenu={(e) => { e.preventDefault(); setSelectedNode(row); onWadContextMenu?.(e, row); }}
            title={row.node.path}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(120,80,255,0.15)' : 'transparent'; }}
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
            {(row.node.decompressedSize ?? 0) > 0 && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0, paddingLeft: 6, paddingRight: 4 }}>
                    {fmtSize(row.node.decompressedSize ?? 0)}
                </span>
            )}
        </div>
    );
}

interface RowProps extends CommonRowProps {
    row: FlatRow;
    style: CSSProperties;
    selectedNode: SelectedNode | null;
}

const Row = memo(({ row, style, selectedNode, ...rest }: RowProps) => {
    if (!row) return null;

    const nodeKey = (row.type === 'file' || row.type === 'dir') && row.node?.path && row.wadPath ? row.wadPath + '||' + row.node.path : null;
    const selKey = selectedNode?.node?.path && selectedNode?.wadPath ? selectedNode.wadPath + '||' + selectedNode.node.path : null;
    const isSelected = !!(nodeKey && nodeKey === selKey);

    switch (row.type) {
        case 'group':
            return <GroupRow row={row} style={style} toggleGroup={rest.toggleGroup} fontSize={rest.fontSize} symbolSize={rest.symbolSize} />;
        case 'wad':
            return <WadRow row={row} style={style} {...rest} />;
        case 'wad-status':
            return <WadStatusRow row={row} style={style} fontSize={rest.fontSize} />;
        case 'dir':
            return <DirRow row={row} style={style} isSelected={isSelected} {...rest} />;
        case 'file':
            return <FileRow row={row} style={style} isSelected={isSelected} {...rest} />;
        default:
            return null;
    }
});
Row.displayName = 'WadTreeRow';

interface WadExplorerTreeProps {
    flatRows: FlatRow[];
    search: string;
    setSearch: (v: string) => void;
    toggleGroup: (key: string) => void;
    toggleWad: (entry: WadScanEntry, options?: { recursive?: boolean } | null) => void;
    toggleDir: (wadPath: string, dirPath: string, dirNode?: WadTreeNode | null, options?: { recursive?: boolean } | null) => void;
    selectedNode: SelectedNode | null;
    setSelectedNode: (row: FlatRow | null) => void;
    loading: boolean;
    getExtractSelectionState: (row: FlatRow) => ExtractSelectionState;
    toggleExtractSelection: (row: FlatRow, forceChecked?: boolean | null) => void;
    onWadContextMenu?: ((e: ReactMouseEvent, row: FlatRow) => void) | null;
    rowHeight?: number;
    fontSize?: number;
    panelWidth?: number;
    symbolSize?: number;
    selectionMode?: boolean;
    onToggleSelectionMode?: (() => void) | null;
    scrollTargetKey?: string | null;
}

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
    scrollTargetKey = null,
}: WadExplorerTreeProps) {
    const [scrollReq, setScrollReq] = useState<{ index: number; align: 'auto' | 'center'; nonce: number } | null>(null);

    // Scroll-into-view when scrollTargetKey changes AND the matching row exists.
    useEffect(() => {
        if (!scrollTargetKey) return;
        const idx = flatRows.findIndex((r) => {
            if (r.type === 'wad' && r.entry) return r.entry.path === scrollTargetKey;
            if ((r.type === 'file' || r.type === 'dir') && r.wadPath && r.node) {
                return `${r.wadPath}||${r.node.path}` === scrollTargetKey;
            }
            return false;
        });
        if (idx >= 0) setScrollReq({ index: idx, align: 'center', nonce: Date.now() });
    }, [scrollTargetKey, flatRows]);

    const renderRow = useMemo(() => (index: number, style: CSSProperties) => (
        <Row
            row={flatRows[index]}
            style={style}
            selectedNode={selectedNode}
            toggleGroup={toggleGroup}
            toggleWad={toggleWad}
            toggleDir={toggleDir}
            setSelectedNode={setSelectedNode}
            getExtractSelectionState={getExtractSelectionState}
            toggleExtractSelection={toggleExtractSelection}
            onWadContextMenu={onWadContextMenu}
            fontSize={fontSize}
            symbolSize={symbolSize}
            selectionMode={selectionMode}
        />
    ), [flatRows, selectedNode, toggleGroup, toggleWad, toggleDir, setSelectedNode, getExtractSelectionState, toggleExtractSelection, onWadContextMenu, fontSize, symbolSize, selectionMode]);

    return (
        <div style={{ ...S.leftPanel, width: panelWidth }}>
            {/* Search bar */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', opacity: 0.38, pointerEvents: 'none' }} />
                <input
                    style={{ ...S.searchInput, width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 70 }}
                    placeholder="Filter files…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            const isDown = e.key === 'ArrowDown';
                            const selKey = selectedNode ? (selectedNode.wadPath + '||' + (selectedNode.node?.path || '')) : null;
                            const curIdx = flatRows.findIndex((r) => {
                                if (r.type === 'file' || r.type === 'dir') return (r.wadPath + '||' + r.node.path) === selKey;
                                return false;
                            });
                            const step = isDown ? 1 : -1;
                            for (let i = 1; i <= flatRows.length; i++) {
                                const target = (curIdx + i * step + flatRows.length) % flatRows.length;
                                const row = flatRows[target];
                                if (row && (row.type === 'file' || row.type === 'dir')) {
                                    setSelectedNode(row);
                                    setScrollReq({ index: target, align: 'auto', nonce: Date.now() });
                                    break;
                                }
                            }
                        }
                        if (e.key === 'Enter') {
                            if (selectedNode) {
                                if (selectedNode.type === 'dir') {
                                    toggleDir(selectedNode.wadPath, selectedNode.node.path, selectedNode.node);
                                }
                            } else if (flatRows.length > 0) {
                                const first = flatRows.find((r) => r.type === 'file' || r.type === 'dir' || r.type === 'wad');
                                if (first) {
                                    if (first.type === 'wad') toggleWad(first.entry);
                                    else setSelectedNode(first);
                                }
                            }
                        }
                    }}
                    spellCheck={false}
                />
                <button
                    type="button"
                    onClick={() => onToggleSelectionMode?.()}
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
                    <VirtualList
                        rowCount={flatRows.length}
                        rowHeight={rowHeight}
                        renderRow={renderRow}
                        scrollToIndex={scrollReq?.index ?? null}
                        scrollAlign={scrollReq?.align}
                    />
                )}
            </div>
        </div>
    );
}
