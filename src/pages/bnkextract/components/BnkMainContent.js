import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, TextField, IconButton, Tooltip, Button, Divider, Slider } from '@mui/material';
import {
    Search,
    Close,
    Sort,
    Undo,
    Redo,
    Download,
    Upload,
    VolumeOff,
    Save,
    PlayArrow,
    Stop,
    VolumeUp,
    Settings,
    AutoFixHigh,
} from '@mui/icons-material';
import TreeNode from './TreeNode';

const ROW_HEIGHT = 30;
const OVERSCAN = 6;

function flattenVisibleTree(nodes, expandedNodes, level = 0, out = []) {
    for (const node of nodes) {
        out.push({ node, level });
        if (node.children?.length && expandedNodes.has(node.id)) {
            flattenVisibleTree(node.children, expandedNodes, level + 1, out);
        }
    }
    return out;
}

function VirtualTreeList({
    rows,
    expandedNodes,
    selectedNodes,
    setSelectedNodes,
    setLastSelectedId,
    handleNodeSelect,
    playAudio,
    handleContextMenu,
    handleToggleExpand,
    onDropReplace,
    onExternalFileDrop,
    pane,
    emptyText,
}) {
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(500);
    const containerRef = useRef(null);
    const rafRef = useRef(null);

    const onScroll = useCallback((e) => {
        const nextTop = e.currentTarget.scrollTop;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            setScrollTop(nextTop);
            rafRef.current = null;
        });
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            setViewportHeight(el.clientHeight || 500);
        });
        observer.observe(el);
        setViewportHeight(el.clientHeight || 500);
        return () => observer.disconnect();
    }, []);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    const totalHeight = rows.length * ROW_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

    return (
        <Box
            ref={containerRef}
            sx={{ flex: 1, overflowY: 'auto', p: 1 }}
            onScroll={onScroll}
            onClick={() => {
                setSelectedNodes(new Set());
                setLastSelectedId({ id: null, pane });
            }}
        >
            {rows.length === 0 ? (
                <Typography sx={{
                    textAlign: 'center',
                    marginTop: '3rem',
                    fontSize: '0.8rem',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontWeight: 500,
                    whiteSpace: 'pre-line',
                }}>
                    {emptyText}
                </Typography>
            ) : (
                <Box sx={{ position: 'relative', height: `${totalHeight}px` }}>
                    <Box sx={{ position: 'absolute', top: `${startIndex * ROW_HEIGHT}px`, left: 0, right: 0 }}>
                        {visibleRows.map(({ node, level }, idx) => (
                            <TreeNode
                                key={`${node.id || idx}-${pane}`}
                                node={node}
                                level={level}
                                selectedNodes={selectedNodes}
                                isSelected={selectedNodes.has(node.id)}
                                isExpanded={expandedNodes.has(node.id)}
                                onSelect={handleNodeSelect}
                                onPlay={playAudio}
                                onContextMenu={handleContextMenu}
                                onToggleExpand={handleToggleExpand}
                                pane={pane}
                                onDropReplace={onDropReplace}
                                onExternalFileDrop={onExternalFileDrop}
                                renderChildren={false}
                            />
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
}

export default function BnkMainContent(props) {
    const {
        mainContentStyle,
        treeViewStyle,
        sidebarStyle,
        compactButtonStyle,
        buttonStyle,
        viewMode,
        activePane,
        leftSearchQuery,
        setLeftSearchQuery,
        filteredLeftTree,
        selectedNodes,
        setSelectedNodes,
        setLastSelectedId,
        handleNodeSelect,
        playAudio,
        handleContextMenu,
        expandedNodes,
        handleToggleExpand,
        handleDropReplace,
        handleAutoMatchByEventName,
        handleExternalFileDrop,
        rightPaneDragOver,
        handleRightPaneDragOver,
        handleRightPaneDragLeave,
        handleRightPaneFileDrop,
        rightSearchQuery,
        setRightSearchQuery,
        rightSortMode,
        setRightSortMode,
        filteredRightTree,
        rightSelectedNodes,
        setRightSelectedNodes,
        rightExpandedNodes,
        handleUndo,
        undoStack,
        handleRedo,
        redoStack,
        handleExtract,
        handleReplace,
        hasAudioSelection,
        handleMakeSilent,
        handleSave,
        hasRootSelection,
        handlePlaySelected,
        stopAudio,
        volume,
        setVolume,
        treeData,
        rightTreeData,
        setShowSettingsModal,
        onLeftPaneFolderDrop,
    } = props;

    const [leftDragOver, setLeftDragOver] = useState(false);

    const handleLeftDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types?.includes('Files')) setLeftDragOver(true);
    }, []);

    const handleLeftDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setLeftDragOver(false);
    }, []);

    const handleLeftDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setLeftDragOver(false);
        if (!window.require) return;
        const fs = window.require('fs');
        const item = e.dataTransfer?.files?.[0];
        if (!item?.path) return;
        try {
            if (fs.statSync(item.path).isDirectory()) {
                onLeftPaneFolderDrop?.(item.path);
            }
        } catch (_) {}
    }, [onLeftPaneFolderDrop]);

    const leftRows = useMemo(() => flattenVisibleTree(filteredLeftTree, expandedNodes), [filteredLeftTree, expandedNodes]);
    const rightRows = useMemo(() => flattenVisibleTree(filteredRightTree, rightExpandedNodes), [filteredRightTree, rightExpandedNodes]);

    return (
        <Box sx={mainContentStyle}>
            <Box
                className="bnk-extract-tree"
                onDragOver={handleLeftDragOver}
                onDragLeave={handleLeftDragLeave}
                onDrop={handleLeftDrop}
                sx={{
                ...treeViewStyle,
                border: leftDragOver
                    ? '2px dashed var(--accent)'
                    : (viewMode === 'split' && activePane === 'left' ? '1px solid var(--accent)' : treeViewStyle.border),
                background: leftDragOver ? 'rgba(var(--accent-rgb), 0.06)' : treeViewStyle.background,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 0.15s, background 0.15s',
            }}>
                <Box sx={{ p: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                        placeholder="Filter left..."
                        size="small"
                        variant="standard"
                        value={leftSearchQuery}
                        onChange={(e) => setLeftSearchQuery(e.target.value)}
                        InputProps={{
                            disableUnderline: true,
                            startAdornment: <Search sx={{ fontSize: 14, mr: 0.5, color: 'var(--accent)', opacity: 0.5 }} />,
                            endAdornment: leftSearchQuery && (
                                <IconButton size="small" onClick={() => setLeftSearchQuery('')} sx={{ p: 0.2 }}>
                                    <Close sx={{ fontSize: 12, opacity: 0.5 }} />
                                </IconButton>
                            ),
                        }}
                        sx={{
                            flex: 1,
                            background: 'rgba(0,0,0,0.2)',
                            px: 1,
                            py: '2px',
                            borderRadius: '4px',
                            '& .MuiInputBase-input': { fontSize: '0.65rem', fontFamily: 'JetBrains Mono' },
                        }}
                    />
                    {leftSearchQuery && (
                        <Typography sx={{ fontSize: '0.55rem', color: 'var(--accent)', opacity: 0.5, fontWeight: 800 }}>{filteredLeftTree.length}</Typography>
                    )}
                </Box>

                <VirtualTreeList
                    rows={leftRows}
                    expandedNodes={expandedNodes}
                    selectedNodes={selectedNodes}
                    setSelectedNodes={setSelectedNodes}
                    setLastSelectedId={setLastSelectedId}
                    handleNodeSelect={handleNodeSelect}
                    playAudio={playAudio}
                    handleContextMenu={handleContextMenu}
                    handleToggleExpand={handleToggleExpand}
                    onDropReplace={handleDropReplace}
                    onExternalFileDrop={handleExternalFileDrop}
                    pane="left"
                    emptyText={leftSearchQuery ? 'No matches' : 'Select a .bnk or .wpk file and click "Parse"\nor drag & drop a mod folder here'}
                />

                {viewMode === 'split' && (
                    <Box sx={{ position: 'absolute', top: 4, right: 8, zIndex: 5, pointerEvents: 'none' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800, opacity: 0.6 }}>MAIN BANK</Typography>
                    </Box>
                )}
            </Box>

            {viewMode === 'split' && (
                <Box
                    className="bnk-extract-tree-right"
                    onDragOver={handleRightPaneDragOver}
                    onDragLeave={handleRightPaneDragLeave}
                    onDrop={handleRightPaneFileDrop}
                    sx={{
                        ...treeViewStyle,
                        marginLeft: 0,
                        border: rightPaneDragOver
                            ? '2px dashed var(--accent)'
                            : (activePane === 'right' ? '1px solid var(--accent)' : treeViewStyle.border),
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        background: rightPaneDragOver
                            ? 'rgba(var(--accent-rgb), 0.1)'
                            : treeViewStyle.background,
                        transition: 'all 0.2s ease',
                    }}
                >
                    <Box sx={{ p: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            placeholder="Filter right..."
                            size="small"
                            variant="standard"
                            value={rightSearchQuery}
                            onChange={(e) => setRightSearchQuery(e.target.value)}
                            InputProps={{
                                disableUnderline: true,
                                startAdornment: <Search sx={{ fontSize: 14, mr: 0.5, color: 'var(--accent)', opacity: 0.5 }} />,
                                endAdornment: rightSearchQuery && (
                                    <IconButton size="small" onClick={() => setRightSearchQuery('')} sx={{ p: 0.2 }}>
                                        <Close sx={{ fontSize: 12, opacity: 0.5 }} />
                                    </IconButton>
                                ),
                            }}
                            sx={{
                                flex: 1,
                                background: 'rgba(0,0,0,0.2)',
                                px: 1,
                                py: '2px',
                                borderRadius: '4px',
                                '& .MuiInputBase-input': { fontSize: '0.65rem', fontFamily: 'JetBrains Mono' },
                            }}
                        />
                        <Tooltip title={`Sort by size: ${rightSortMode === 'none' ? 'None' : (rightSortMode === 'size-asc' ? 'Low to High' : 'High to Low')}`}>
                            <IconButton
                                size="small"
                                onClick={() => setRightSortMode((prev) => prev === 'none' ? 'size-desc' : (prev === 'size-desc' ? 'size-asc' : 'none'))}
                                sx={{
                                    color: rightSortMode !== 'none' ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
                                    background: rightSortMode !== 'none' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                    p: '4px',
                                }}
                            >
                                <Sort sx={{ fontSize: 14, transform: rightSortMode === 'size-asc' ? 'scaleY(-1)' : 'none' }} />
                            </IconButton>
                        </Tooltip>
                        {rightSearchQuery && (
                            <Typography sx={{ fontSize: '0.55rem', color: 'var(--accent)', opacity: 0.5, fontWeight: 800 }}>{filteredRightTree.length}</Typography>
                        )}
                    </Box>

                    <VirtualTreeList
                        rows={rightRows}
                        expandedNodes={rightExpandedNodes}
                        selectedNodes={rightSelectedNodes}
                        setSelectedNodes={setRightSelectedNodes}
                        setLastSelectedId={setLastSelectedId}
                        handleNodeSelect={handleNodeSelect}
                        playAudio={playAudio}
                        handleContextMenu={handleContextMenu}
                        handleToggleExpand={handleToggleExpand}
                        onDropReplace={handleDropReplace}
                        onExternalFileDrop={handleExternalFileDrop}
                        pane="right"
                        emptyText={rightSearchQuery ? 'No matches' : 'Drop .wem .wav .mp3 files here, autoconvert or load banks to drag replacement audio'}
                    />

                    <Box sx={{ position: 'absolute', top: 4, right: 8, zIndex: 5, pointerEvents: 'none' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800, opacity: 0.6 }}>REFERENCE BANKS</Typography>
                    </Box>
                </Box>
            )}

            <Box sx={sidebarStyle}>
                <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                    <Tooltip title="Undo (Ctrl+Z)">
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={handleUndo}
                            disabled={undoStack.length === 0}
                            sx={{ ...compactButtonStyle, flex: 1, justifyContent: 'center', opacity: undoStack.length > 0 ? 1 : 0.3 }}
                        >
                            <Undo sx={{ fontSize: 16 }} />
                        </Button>
                    </Tooltip>
                    <Tooltip title="Redo (Ctrl+Y)">
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={handleRedo}
                            disabled={redoStack.length === 0}
                            sx={{ ...compactButtonStyle, flex: 1, justifyContent: 'center', opacity: redoStack.length > 0 ? 1 : 0.3 }}
                        >
                            <Redo sx={{ fontSize: 16 }} />
                        </Button>
                    </Tooltip>
                </Box>

                <Button variant="contained" onClick={handleExtract} disabled={selectedNodes.size === 0} startIcon={<Download sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}>
                    Extract
                </Button>
                <Button variant="contained" onClick={handleReplace} disabled={!hasAudioSelection()} startIcon={<Upload sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}>
                    Replace
                </Button>
                <Button
                    variant="contained"
                    onClick={handleAutoMatchByEventName}
                    disabled={!treeData.length || !rightTreeData.length}
                    startIcon={<AutoFixHigh sx={{ fontSize: 12 }} />}
                    sx={{
                        ...buttonStyle,
                        color: 'rgba(255, 255, 255, 0.9)',
                        opacity: (!treeData.length || !rightTreeData.length) ? 0.35 : 1
                    }}
                >
                    Auto Match Names
                </Button>
                <Button variant="contained" onClick={handleMakeSilent} disabled={!hasAudioSelection()} startIcon={<VolumeOff sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}>
                    Make Silent
                </Button>

                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />

                <Button variant="contained" onClick={handleSave} disabled={!hasRootSelection()} startIcon={<Save sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.9)' }}>
                    Save as BNK/WPK
                </Button>

                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />

                <Button variant="contained" onClick={handlePlaySelected} disabled={!hasAudioSelection()} startIcon={<PlayArrow sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'var(--accent)' }}>
                    Play
                </Button>
                <Button variant="contained" onClick={stopAudio} startIcon={<Stop sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.7)' }}>
                    Stop
                </Button>

                <Box sx={{ mt: 'auto', pt: 2 }}>
                    <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', mb: 1.5 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.75rem', px: 0.5 }}>
                        <VolumeUp sx={{ fontSize: 16, opacity: 0.6 }} />
                        <Slider
                            size="small"
                            value={volume}
                            onChange={(e, newValue) => setVolume(newValue)}
                            aria-label="Volume"
                            sx={{
                                color: 'var(--accent)',
                                '& .MuiSlider-thumb': {
                                    width: 12,
                                    height: 12,
                                    backgroundColor: 'var(--accent)',
                                    '&:hover, &.Mui-focusVisible': {
                                        boxShadow: '0 0 0 8px rgba(var(--accent-rgb), 0.16)',
                                    },
                                },
                                '& .MuiSlider-rail': {
                                    opacity: 0.2,
                                },
                            }}
                        />
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', opacity: 0.4, textAlign: 'center', mt: 0.5 }}>
                        Volume: {volume}%
                    </Typography>
                </Box>

                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', margin: '0.25rem 0' }} />
                <Button variant="contained" onClick={() => setShowSettingsModal(true)} startIcon={<Settings sx={{ fontSize: 12 }} />} sx={{ ...buttonStyle, color: 'rgba(255, 255, 255, 0.6)' }}>
                    Settings
                </Button>
            </Box>
        </Box>
    );
}
