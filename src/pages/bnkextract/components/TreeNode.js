import React from 'react';
import { Box, Typography } from '@mui/material';
import {
    ExpandMore,
    ChevronRight,
    VolumeUp,
    ArrowForward,
} from '@mui/icons-material';

const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};

const TreeNode = React.memo(({
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
    const hasChildren = node.children && node.children.length > 0;
    const isAudioFile = node.audioData !== null;

    const handleClick = (e) => {
        e.stopPropagation();
        onSelect(node, e.ctrlKey || e.metaKey, e.shiftKey, pane);
        if (isAudioFile) {
            onPlay(node);
        }
    };

    const handleToggle = (e) => {
        e.stopPropagation();
        onToggleExpand(node.id, e.shiftKey, pane);
    };

    const handleDragStart = (e) => {
        if (!isAudioFile && !hasChildren) return;
        e.stopPropagation();
        const sourceIds = selectedNodes.has(node.id) ? Array.from(selectedNodes) : [node.id];
        e.dataTransfer.setData('sourceNode', JSON.stringify({
            ids: sourceIds,
            pane,
        }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e) => {
        if (!isAudioFile && !hasChildren) return;

        const isExternal = e.dataTransfer?.types?.includes('Files');
        const isInternalNode = e.dataTransfer?.types?.some((t) => t.toLowerCase() === 'sourcenode');

        if (pane === 'right' && !isExternal) return;
        if (!isExternal && !isInternalNode) return;

        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add('bnk-drop-over');
    };

    const handleDragLeave = (e) => {
        e.stopPropagation();
        e.currentTarget.classList.remove('bnk-drop-over');
    };

    const handleDrop = (e) => {
        if (!isAudioFile && !hasChildren) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('bnk-drop-over');

        if (e.dataTransfer?.files?.length > 0) {
            const VALID_EXTS = ['wem', 'wav', 'mp3', 'ogg'];
            const validFiles = Array.from(e.dataTransfer.files)
                .filter((f) => VALID_EXTS.includes(f.name.toLowerCase().split('.').pop()))
                .map((f) => ({ path: f.path, name: f.name }));
            if (validFiles.length > 0) {
                onExternalFileDrop(validFiles, node.id, pane);
            }
            return;
        }

        if (pane === 'right') return;
        const sourceData = e.dataTransfer.getData('sourceNode');
        if (sourceData) {
            try {
                const sourceInfo = JSON.parse(sourceData);
                if (sourceInfo.pane === 'right') {
                    const ids = sourceInfo.ids || [sourceInfo.id];
                    onDropReplace(ids, node.id);
                }
            } catch (err) {
                console.error('[TreeNode] Drop failed:', err);
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
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    background: isSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                    marginBottom: '2px',
                    transition: 'background-color 80ms ease, border-color 80ms ease',
                    position: 'relative',
                    '&.bnk-drop-over': {
                        border: '2px dashed var(--accent)',
                        background: 'rgba(var(--accent-rgb), 0.08)',
                    },
                    '&:hover': {
                        background: isSelected ? 'rgba(var(--accent-rgb), 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        borderColor: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
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
                            color: isExpanded ? 'var(--accent)' : 'rgba(255, 255, 255, 0.4)',
                            '&:hover': { color: 'var(--accent)' },
                            borderRadius: '4px',
                        }}
                    >
                        {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                    </Box>
                ) : (
                    <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isAudioFile && <VolumeUp sx={{ fontSize: 12, color: 'var(--accent)', opacity: isSelected ? 1 : 0.6 }} />}
                        {!isAudioFile && !hasChildren && <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />}
                    </Box>
                )}
                <Typography
                    sx={{
                        fontSize: '0.8rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: isAudioFile ? 'var(--accent)' : (isSelected ? 'white' : 'rgba(255, 255, 255, 0.7)'),
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
                            color: 'rgba(255, 255, 255, 0.35)',
                            ml: 1,
                            mr: 1,
                            fontFamily: 'JetBrains Mono, monospace',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        [{formatSize(node.audioData.length)}]
                    </Typography>
                )}

                {isSelected && pane === 'right' && (
                    <ArrowForward sx={{ fontSize: 10, ml: 'auto', opacity: 0.5, color: 'var(--accent)' }} titleAccess="Drag to Main Bank" />
                )}
            </Box>
            {renderChildren && hasChildren && isExpanded && (
                <Box>
                    {node.children.map((child, index) => (
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

export default TreeNode;
