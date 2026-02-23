/**
 * Flint - WAD Browser Panel
 * Left-panel component for browsing WAD file chunks in extract mode.
 * Replaces the FileTree panel when a WAD extract session is active.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { useAppState } from '../lib/state';
import * as api from '../lib/api';
import { open } from '@tauri-apps/plugin-dialog';
import { getIcon, getFileIcon } from '../lib/fileIcons';
import type { WadChunk, ExtractSession } from '../lib/types';

// =============================================================================
// Virtual Tree Types
// =============================================================================

interface WadTreeFolder {
    type: 'folder';
    name: string;
    fullPath: string;
    children: WadTreeNode[];
}

interface WadTreeFile {
    type: 'file';
    name: string;
    chunk: WadChunk;
}

type WadTreeNode = WadTreeFolder | WadTreeFile;

// =============================================================================
// Tree Construction
// =============================================================================

function getAllChunkHashes(nodes: WadTreeNode[]): string[] {
    const hashes: string[] = [];
    for (const node of nodes) {
        if (node.type === 'file') {
            hashes.push(node.chunk.hash);
        } else {
            hashes.push(...getAllChunkHashes(node.children));
        }
    }
    return hashes;
}

function buildWadTree(chunks: WadChunk[], searchQuery: string): WadTreeNode[] {
    const query = searchQuery.toLowerCase().trim();

    const filtered = query
        ? chunks.filter(c =>
            (c.path?.toLowerCase().includes(query)) ||
            (!c.path && c.hash.toLowerCase().includes(query))
          )
        : chunks;

    const folderMap = new Map<string, WadTreeFolder>();
    const rootNodes: WadTreeNode[] = [];

    const getOrCreateFolder = (folderPath: string): WadTreeFolder => {
        if (folderMap.has(folderPath)) return folderMap.get(folderPath)!;

        const parts = folderPath.split('/');
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');

        const folder: WadTreeFolder = { type: 'folder', name, fullPath: folderPath, children: [] };
        folderMap.set(folderPath, folder);

        if (parentPath === '') {
            rootNodes.push(folder);
        } else {
            getOrCreateFolder(parentPath).children.push(folder);
        }

        return folder;
    };

    for (const chunk of filtered) {
        if (!chunk.path) continue;

        const normalizedPath = chunk.path.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        const dirParts = parts.slice(0, -1);

        const fileNode: WadTreeFile = { type: 'file', name: fileName, chunk };

        if (dirParts.length === 0) {
            rootNodes.push(fileNode);
        } else {
            getOrCreateFolder(dirParts.join('/')).children.push(fileNode);
        }
    }

    // Unresolved hashes → grouped at the bottom
    const unresolved = filtered.filter(c => !c.path);
    if (unresolved.length > 0) {
        rootNodes.push({
            type: 'folder',
            name: '[Unknown Hashes]',
            fullPath: '__unknown__',
            children: unresolved.map(c => ({ type: 'file' as const, name: c.hash, chunk: c })),
        });
    }

    // Sort: folders first, then alphabetically
    const sort = (nodes: WadTreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        nodes.forEach(n => { if (n.type === 'folder') sort(n.children); });
    };
    sort(rootNodes);

    return rootNodes;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// =============================================================================
// TreeNode Component
// =============================================================================

interface TreeNodeProps {
    node: WadTreeNode;
    depth: number;
    session: ExtractSession;
    onPreview: (hash: string) => void;
    onToggleChunk: (hash: string) => void;
    onToggleFolder: (folderPath: string) => void;
    onToggleFolderSelection: (nodes: WadTreeNode[]) => void;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(({
    node, depth, session, onPreview, onToggleChunk, onToggleFolder, onToggleFolderSelection,
}) => {
    const indent = depth * 14;

    if (node.type === 'folder') {
        const isExpanded = session.expandedFolders.has(node.fullPath);
        const childHashes = getAllChunkHashes(node.children);
        const allSelected = childHashes.length > 0 && childHashes.every(h => session.selectedHashes.has(h));
        const someSelected = !allSelected && childHashes.some(h => session.selectedHashes.has(h));

        return (
            <>
                <div
                    className="file-tree__item"
                    style={{ paddingLeft: `${8 + indent}px` }}
                    onClick={() => onToggleFolder(node.fullPath)}
                >
                    <input
                        type="checkbox"
                        className="wad-browser__checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={e => { e.stopPropagation(); onToggleFolderSelection(node.children); }}
                        onClick={e => e.stopPropagation()}
                        title={`Select all in ${node.name}`}
                    />
                    <span
                        className="file-tree__chevron"
                        dangerouslySetInnerHTML={{ __html: getIcon(isExpanded ? 'chevronDown' : 'chevronRight') }}
                    />
                    <span
                        className="file-tree__icon"
                        dangerouslySetInnerHTML={{ __html: getIcon(isExpanded ? 'folderOpen' : 'folder') }}
                    />
                    <span className="file-tree__name">{node.name}</span>
                    <span className="file-tree__count" style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', paddingRight: '4px' }}>
                        {childHashes.length}
                    </span>
                </div>

                {isExpanded && node.children.map((child) => (
                    <TreeNode
                        key={child.type === 'file' ? child.chunk.hash : child.fullPath}
                        node={child}
                        depth={depth + 1}
                        session={session}
                        onPreview={onPreview}
                        onToggleChunk={onToggleChunk}
                        onToggleFolder={onToggleFolder}
                        onToggleFolderSelection={onToggleFolderSelection}
                    />
                ))}
            </>
        );
    }

    // File node
    const isSelected = session.selectedHashes.has(node.chunk.hash);
    const isPreviewing = session.previewHash === node.chunk.hash;
    return (
        <div
            className={`file-tree__item ${isPreviewing ? 'file-tree__item--selected' : ''}`}
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={() => onPreview(node.chunk.hash)}
            title={node.chunk.path || node.chunk.hash}
        >
            <input
                type="checkbox"
                className="wad-browser__checkbox"
                checked={isSelected}
                onChange={() => onToggleChunk(node.chunk.hash)}
                onClick={e => e.stopPropagation()}
                title="Select for extraction"
            />
            <span style={{ width: '16px', flexShrink: 0 }} />
            <span
                className="file-tree__icon"
                dangerouslySetInnerHTML={{ __html: getFileIcon(node.name, false) }}
            />
            <span className="file-tree__name" style={{ flex: 1, minWidth: 0 }}>{node.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingRight: '4px', flexShrink: 0 }}>
                {formatSize(node.chunk.size)}
            </span>
        </div>
    );
});
TreeNode.displayName = 'WadTreeNode';

// =============================================================================
// WadBrowserPanel — main export
// =============================================================================

export const WadBrowserPanel: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const { state, dispatch, showToast } = useAppState();
    const [isExtracting, setIsExtracting] = useState(false);

    const session = state.extractSessions.find(s => s.id === state.activeExtractId);

    const tree = useMemo(() => {
        if (!session) return [];
        return buildWadTree(session.chunks, session.searchQuery);
    }, [session?.chunks, session?.searchQuery]);

    const onPreview = useCallback((hash: string) => {
        if (!session) return;
        dispatch({ type: 'SET_EXTRACT_PREVIEW', payload: { sessionId: session.id, hash } });
    }, [dispatch, session?.id]);

    const onToggleChunk = useCallback((hash: string) => {
        if (!session) return;
        dispatch({ type: 'TOGGLE_EXTRACT_CHUNK', payload: { sessionId: session.id, hash } });
    }, [dispatch, session?.id]);

    const onToggleFolder = useCallback((folderPath: string) => {
        if (!session) return;
        dispatch({ type: 'TOGGLE_EXTRACT_FOLDER', payload: { sessionId: session.id, folderPath } });
    }, [dispatch, session?.id]);

    const onToggleFolderSelection = useCallback((nodes: WadTreeNode[]) => {
        if (!session) return;
        const hashes = getAllChunkHashes(nodes);
        const allSelected = hashes.every(h => session.selectedHashes.has(h));
        // If all selected, deselect all; otherwise select all
        for (const hash of hashes) {
            const isCurrentlySelected = session.selectedHashes.has(hash);
            if (allSelected && isCurrentlySelected) {
                dispatch({ type: 'TOGGLE_EXTRACT_CHUNK', payload: { sessionId: session.id, hash } });
            } else if (!allSelected && !isCurrentlySelected) {
                dispatch({ type: 'TOGGLE_EXTRACT_CHUNK', payload: { sessionId: session.id, hash } });
            }
        }
    }, [dispatch, session]);

    const handleExtractSelected = useCallback(async () => {
        if (!session || session.selectedHashes.size === 0) return;

        try {
            const destDir = await open({ title: 'Choose Extraction Folder', directory: true });
            if (!destDir) return;

            setIsExtracting(true);
            const hashes = [...session.selectedHashes];
            const result = await api.extractWad(session.wadPath, destDir as string, hashes);
            showToast('success', `Extracted ${result.extracted} file${result.extracted !== 1 ? 's' : ''}`);
        } catch (err) {
            console.error('[WadBrowser] Extract failed:', err);
            showToast('error', 'Extraction failed');
        } finally {
            setIsExtracting(false);
        }
    }, [session, showToast]);

    const onSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!session) return;
        dispatch({ type: 'SET_EXTRACT_SEARCH', payload: { sessionId: session.id, query: e.target.value } });
    }, [dispatch, session?.id]);

    if (!session) {
        return (
            <div className="left-panel" style={style}>
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No WAD file open.
                </div>
            </div>
        );
    }

    const totalChunks = session.chunks.length;
    const selectedCount = session.selectedHashes.size;

    return (
        <div className="left-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', ...style }}>
            {/* Header */}
            <div className="left-panel__header" style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span dangerouslySetInnerHTML={{ __html: getIcon('wad') }} />
                    <span
                        style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={session.wadPath}
                    >
                        {session.wadName}
                    </span>
                </div>

                {/* Search */}
                <div className="file-tree__search" style={{ position: 'relative' }}>
                    <span
                        style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }}
                        dangerouslySetInnerHTML={{ __html: getIcon('search') }}
                    />
                    <input
                        type="text"
                        className="file-tree__search-input"
                        placeholder="Filter files..."
                        value={session.searchQuery}
                        onChange={onSearchChange}
                        style={{ paddingLeft: '26px' }}
                    />
                </div>
            </div>

            {/* Tree */}
            <div className="file-tree" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {session.loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '12px' }}>Reading WAD...</div>
                    </div>
                ) : tree.length === 0 ? (
                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {session.searchQuery ? 'No files match your filter.' : 'WAD file is empty.'}
                    </div>
                ) : (
                    tree.map(node => (
                        <TreeNode
                            key={node.type === 'file' ? node.chunk.hash : node.fullPath}
                            node={node}
                            depth={0}
                            session={session}
                            onPreview={onPreview}
                            onToggleChunk={onToggleChunk}
                            onToggleFolder={onToggleFolder}
                            onToggleFolderSelection={onToggleFolderSelection}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            <div
                style={{
                    flexShrink: 0,
                    borderTop: '1px solid var(--border)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}
            >
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1 }}>
                    {totalChunks.toLocaleString()} files{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                </span>
                <button
                    className="btn btn--primary btn--sm"
                    onClick={handleExtractSelected}
                    disabled={selectedCount === 0 || isExtracting}
                    title={selectedCount === 0 ? 'Select files to extract' : `Extract ${selectedCount} selected file${selectedCount !== 1 ? 's' : ''}`}
                >
                    <span dangerouslySetInnerHTML={{ __html: getIcon('export') }} />
                    <span>{isExtracting ? 'Extracting...' : `Extract${selectedCount > 0 ? ` (${selectedCount})` : ''}`}</span>
                </button>
            </div>
        </div>
    );
};
