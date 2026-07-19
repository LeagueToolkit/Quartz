import type { CSSProperties, MouseEvent } from 'react';
import { List } from 'react-window';
import {
    Box, ChevronDown, ChevronRight, File, FileCode2, FileMusic,
    Folder, FolderOpen, Image, Layers3, Search,
} from 'lucide-react';
import type { WadTreeRow } from './types';
import { formatBytes, wadDisplayName } from './tree';

interface SelectionState { checked: boolean; indeterminate: boolean; disabled?: boolean }

interface TreeRowProps {
    rows: WadTreeRow[];
    selectionMode: boolean;
    selectedKey: string;
    fontSize: number;
    iconSize: number;
    onActivate: TreeProps['onActivate'];
    onContextMenu: TreeProps['onContextMenu'];
    selectionState: TreeProps['selectionState'];
    onToggleSelection: TreeProps['onToggleSelection'];
}

interface TreeProps {
    rows: WadTreeRow[];
    search: string;
    onSearch: (value: string) => void;
    selectionMode: boolean;
    onToggleSelectionMode: () => void;
    selectedKey: string;
    rowHeight: number;
    fontSize: number;
    iconSize: number;
    onActivate: (row: WadTreeRow, event: MouseEvent) => void;
    onContextMenu: (row: WadTreeRow, event: MouseEvent) => void;
    selectionState: (row: WadTreeRow) => SelectionState;
    onToggleSelection: (row: WadTreeRow) => void;
}

function FileIcon({ extension, size }: { extension: string; size: number }) {
    const props = { size, className: 'wad-tree__file-icon' };
    if (['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga'].includes(extension)) return <Image {...props} data-kind="image" />;
    if (['skn', 'skl', 'scb', 'sco', 'anm'].includes(extension)) return <Box {...props} data-kind="model" />;
    if (['ogg', 'wav', 'wem', 'mp3', 'bnk', 'wpk'].includes(extension)) return <FileMusic {...props} data-kind="audio" />;
    if (['bin', 'inibin', 'troybin', 'luabin', 'luabin64', 'luaobj', 'lua'].includes(extension)) return <FileCode2 {...props} data-kind="code" />;
    return <File {...props} />;
}

function Check({ state, onClick }: { state: SelectionState; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`wad-check ${state.checked || state.indeterminate ? 'is-on' : ''}`}
            disabled={state.disabled}
            onClick={(event) => { event.stopPropagation(); onClick(); }}
            aria-label="Toggle extraction selection"
        >
            {state.checked ? '✓' : state.indeterminate ? '−' : ''}
        </button>
    );
}

function Row({
    index, style, rows, selectionMode, selectedKey, fontSize, iconSize,
    onActivate, onContextMenu, selectionState, onToggleSelection,
}: { index: number; style: CSSProperties } & TreeRowProps) {
    const row = rows[index];
    if (!row) return null;
    const key = row.kind === 'file' || row.kind === 'directory' ? `${row.wad.path}||${row.node.path}` : '';
    const active = !!key && key === selectedKey;
    const common = {
        style: { ...style, fontSize },
        onClick: (event: MouseEvent<HTMLDivElement>) => onActivate(row, event),
        onContextMenu: (event: MouseEvent<HTMLDivElement>) => { event.preventDefault(); onContextMenu(row, event); },
    };

    if (row.kind === 'group') {
        return (
            <div {...common} className="wad-tree__group">
                {row.open ? <ChevronDown size={iconSize} /> : <ChevronRight size={iconSize} />}
                <span>{row.key}</span><small>{row.count}</small>
            </div>
        );
    }
    if (row.kind === 'status') {
        return <div style={style} className={`wad-tree__status ${row.error ? 'is-error' : ''}`}><span className="wad-spinner" />{row.label}</div>;
    }
    if (row.kind === 'wad') {
        if (row.state.status === 'indexing') {
            return (
                <div style={{ ...style, fontSize }} className="wad-tree__row wad-tree__row--wad wad-tree__wad-skeleton" aria-hidden="true">
                    <i className="wad-tree__skeleton-caret" />
                    <i className="wad-tree__skeleton-folder" />
                    <span><i /></span>
                    <small />
                </div>
            );
        }
        const state = selectionState(row);
        const busy = row.state.status === 'loading';
        return (
            <div {...common} className={`wad-tree__row wad-tree__row--wad ${row.wad.isVoiceover ? 'is-voice' : ''}`} title={row.wad.path}>
                {selectionMode && <Check state={state} onClick={() => onToggleSelection(row)} />}
                {busy ? <i className="wad-spinner" /> : row.open ? <ChevronDown size={iconSize} /> : <ChevronRight size={iconSize} />}
                <Folder size={iconSize + 1} className="wad-tree__folder" />
                <span>{wadDisplayName(row.wad.name)}</span>
                {row.state.index && <small>{row.state.index.chunkCount.toLocaleString()}</small>}
            </div>
        );
    }
    const state = selectionState(row);
    const padding = 12 + row.depth * 15;
    if (row.kind === 'directory') {
        return (
            <div {...common} className={`wad-tree__row ${active ? 'is-active' : ''}`} style={{ ...style, paddingLeft: padding, fontSize }} title={row.node.path}>
                {selectionMode && <Check state={state} onClick={() => onToggleSelection(row)} />}
                {row.node.children.length ? (row.open ? <ChevronDown size={iconSize} /> : <ChevronRight size={iconSize} />) : <i className="wad-tree__spacer" />}
                {row.open ? <FolderOpen size={iconSize + 1} className="wad-tree__folder" /> : <Folder size={iconSize + 1} className="wad-tree__folder" />}
                <span>{row.node.name}</span><small>{row.node.children.length}</small>
            </div>
        );
    }
    return (
        <div {...common} className={`wad-tree__row ${active ? 'is-active' : ''}`} style={{ ...style, paddingLeft: padding, fontSize }} title={row.node.path}>
            {selectionMode && <Check state={state} onClick={() => onToggleSelection(row)} />}
            <i className="wad-tree__spacer" />
            <FileIcon extension={row.node.extension} size={iconSize + 1} />
            <span>{row.node.name}</span>
            {!!row.node.size && <small>{formatBytes(row.node.size)}</small>}
        </div>
    );
}

export function WadTree(props: TreeProps) {
    return (
        <aside className="wad-tree">
            <div className="wad-tree__search">
                <Search size={14} />
                <input
                    className="dl-input"
                    value={props.search}
                    placeholder="Filter WADs and files…"
                    spellCheck={false}
                    onChange={(event) => props.onSearch(event.target.value)}
                />
                <button type="button" className={`dl-btn dl-btn--sm ${props.selectionMode ? 'dl-btn--active' : 'dl-btn--ghost'}`} onClick={props.onToggleSelectionMode}>
                    <Layers3 size={13} /> Select
                </button>
            </div>
            <div className="wad-tree__list">
                {props.rows.length ? (
                    <List<TreeRowProps>
                        rowCount={props.rows.length}
                        rowHeight={props.rowHeight}
                        rowComponent={Row}
                        rowProps={{
                            rows: props.rows,
                            selectionMode: props.selectionMode,
                            selectedKey: props.selectedKey,
                            fontSize: props.fontSize,
                            iconSize: props.iconSize,
                            onActivate: props.onActivate,
                            onContextMenu: props.onContextMenu,
                            selectionState: props.selectionState,
                            onToggleSelection: props.onToggleSelection,
                        }}
                        overscanCount={10}
                        style={{ height: '100%', width: '100%' }}
                    />
                ) : (
                    <div className="wad-tree__empty">No WADs or files match.</div>
                )}
            </div>
        </aside>
    );
}
