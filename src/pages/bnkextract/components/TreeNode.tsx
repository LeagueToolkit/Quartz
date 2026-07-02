import React from 'react';
import { Box, Typography } from '@mui/material';
import { ExpandMore, ChevronRight, VolumeUp, ArrowForward } from '@mui/icons-material';
import { log } from '@/lib/util/logger';
import type { BnkNode, DroppedFile, Pane } from '../types';

const formatSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};

interface TreeNodeProps {
    node: BnkNode;
    level?: number;
    selectedNodes: Set<string>;
    isSelected?: boolean;
    onSelect: (node: BnkNode, ctrl: boolean, shift: boolean, pane: Pane) => void;
    onPlay: (node: BnkNode) => void;
    onContextMenu: (e: React.MouseEvent, node: BnkNode, pane: Pane) => void;
    expandedNodes?: Set<string>;
    isExpanded?: boolean;
    onToggleExpand: (id: string, shift: boolean, pane: Pane) => void;
    pane?: Pane;
    onDropReplace: (ids: string[], targetId: string) => void;
    onExternalFileDrop: (files: DroppedFile[], targetId: string, pane: Pane) => void;
    renderChildren?: boolean;
}

const TreeNode = React.memo<TreeNodeProps>(({
    node,
    level = 0,
    selectedNodes,
    isSelected: isSelectedProp,
    onSelect,
    onPlay,
    onContextMenu,
    expandedNodes,
    isExpanded: isExpandedProp,
    onToggleExpand,
    pane = 'left',
    onDropReplace,
    onExternalFileDrop,
    renderChildren = true,
}) => {
    const isExpanded = typeof isExpandedProp === 'boolean' ? isExpandedProp : expandedNodes?.has(node.id);
    const isSelected = typeof isSelectedProp === 'boolean' ? isSelectedProp : selectedNodes?.has(node.id);
    const hasChildren = !!(node.children && node.children.length > 0);
    const isAudioFile = node.audioData != null;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node, e.ctrlKey || e.metaKey, e.shiftKey, pane);
        if (isAudioFile) {
            onPlay(node);
        }
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleExpand(node.id, e.shiftKey, pane);
    };

    const handleDragStart = (e: React.DragEvent) => {
        if (!isAudioFile && !hasChildren) return;
        e.stopPropagation();
        const sourceIds = selectedNodes.has(node.id) ? Array.from(selectedNodes) : [node.id];
        e.dataTransfer.setData('sourceNode', JSON.stringify({ ids: sourceIds, pane }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!isAudioFile && !hasChildren) return;

        const isExternal = e.dataTransfer?.types?.includes('Files');
        const isInternalNode = e.dataTransfer?.types?.some((t) => t.toLowerCase() === 'sourcenode');

        if (pane === 'right' && !isExternal) return;
        if (!isExternal && !isInternalNode) return;

        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add('bnk-drop-over');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.stopPropagation();
        e.currentTarget.classList.remove('bnk-drop-over');
    };

    const handleDrop = (e: React.DragEvent) => {
        if (!isAudioFile && !hasChildren) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('bnk-drop-over');

        if (e.dataTransfer?.files?.length > 0) {
            const VALID_EXTS = ['wem', 'wav', 'mp3', 'ogg'];
            // Tauri delivers real absolute paths through the webview file-drop event;
            // this DOM drop just stamps the target node so that event can route them.
            const validFiles: DroppedFile[] = Array.from(e.dataTransfer.files)
                .filter((f) => VALID_EXTS.includes((f.name.toLowerCase().split('.').pop() ?? '')))
                .map((f) => ({ path: (f as File & { path?: string }).path ?? f.name, name: f.name }));
            if (validFiles.length > 0) {
                onExternalFileDrop(validFiles, node.id, pane);
            }
            return;
        }

        if (pane === 'right') return;
        const sourceData = e.dataTransfer.getData('sourceNode');
        if (sourceData) {
            try {
                const sourceInfo = JSON.parse(sourceData) as { ids?: string[]; id?: string; pane: Pane };
                if (sourceInfo.pane === 'right') {
                    const ids = sourceInfo.ids || (sourceInfo.id ? [sourceInfo.id] : []);
                    onDropReplace(ids, node.id);
                }
            } catch (err) {
                log.error('[TreeNode] Drop failed:', err);
            }
        }
    };

    return (
        <Box>
            <Box
                draggable={isAudioFile || hasChildren}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node, pane)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    paddingLeft: `${level * 18 + 6}px`,
                    cursor: 'pointer',
                    borderRadius: '5px',
                    border: isSelected ? '1px solid color-mix(in oklab, var(--accent-primary) 38%, transparent)' : '1px solid transparent',
                    background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 16%, transparent)' : 'transparent',
                    marginBottom: '2px',
                    transition: 'background-color 80ms ease, border-color 80ms ease',
                    position: 'relative',
                    '&.bnk-drop-over': {
                        border: '2px dashed var(--accent-primary)',
                        background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                    },
                    '&:hover': {
                        background: isSelected ? 'color-mix(in oklab, var(--accent-primary) 22%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 10%, transparent)',
                        borderColor: isSelected ? 'color-mix(in oklab, var(--accent-primary) 50%, transparent)' : 'color-mix(in oklab, var(--accent-primary) 25%, transparent)',
                    },
                }}
            >
                {hasChildren ? (
                    <Box
                        role="button"
                        onClick={handleToggle}
                        sx={{
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px',
                            color: isExpanded ? 'var(--accent-primary)' : 'var(--text-muted)',
                            '&:hover': { color: 'var(--accent-primary)' },
                            borderRadius: '4px',
                        }}
                    >
                        {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                    </Box>
                ) : (
                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isAudioFile && <VolumeUp sx={{ fontSize: 12, color: 'var(--accent-primary)', opacity: isSelected ? 1 : 0.6 }} />}
                        {!isAudioFile && !hasChildren && <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)' }} />}
                    </Box>
                )}
                <Typography
                    sx={{
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-mono)',
                        color: isAudioFile ? 'var(--accent-primary)' : (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        marginLeft: '8px',
                        userSelect: 'none',
                        fontWeight: (isSelected || !isAudioFile) ? 600 : 400,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        flex: 1,
                    }}
                >
                    {node.name}
                </Typography>

                {isAudioFile && node.audioData && node.audioData.length !== undefined && (
                    <Typography
                        sx={{
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            ml: 1,
                            mr: 1,
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        [{formatSize(node.audioData.length)}]
                    </Typography>
                )}

                {isSelected && pane === 'right' && (
                    <ArrowForward sx={{ fontSize: 10, ml: 'auto', opacity: 0.5, color: 'var(--accent-primary)' }} titleAccess="Drag to Main Bank" />
                )}
            </Box>
            {renderChildren && hasChildren && isExpanded && (
                <Box>
                    {node.children!.map((child, index) => (
                        <TreeNode
                            key={child.id || index}
                            node={child}
                            level={level + 1}
                            selectedNodes={selectedNodes}
                            onSelect={onSelect}
                            onPlay={onPlay}
                            onContextMenu={onContextMenu}
                            expandedNodes={expandedNodes}
                            onToggleExpand={onToggleExpand}
                            pane={pane}
                            onDropReplace={onDropReplace}
                            onExternalFileDrop={onExternalFileDrop}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
}, (prev, next) => (
    prev.node === next.node
    && prev.level === next.level
    && prev.isSelected === next.isSelected
    && prev.isExpanded === next.isExpanded
    && prev.pane === next.pane
    && prev.renderChildren === next.renderChildren
    && prev.selectedNodes === next.selectedNodes
));

TreeNode.displayName = 'TreeNode';

export default TreeNode;
