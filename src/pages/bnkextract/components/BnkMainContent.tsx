import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, Divider, Slider } from '@mui/material';
import {
    Search, Close, SortByAlpha, Download, Upload, VolumeOff, Save, PlayArrow, Stop, VolumeUp, Settings, AutoFixHigh,
} from '@mui/icons-material';
import type { SxProps, Theme } from '@mui/material';
import TreeNode from './TreeNode';
import type { BnkNode, DroppedFile, LastSelected, Pane, SortMode, ViewMode } from '../types';

const ROW_HEIGHT = 30;
const OVERSCAN = 6;

interface FlatRow { node: BnkNode; level: number; rowKey: string }

function flattenVisibleTree(nodes: BnkNode[], expandedNodes: Set<string>, level = 0, out: FlatRow[] = [], trail = 'root'): FlatRow[] {
    nodes.forEach((node, index) => {
        const rowKey = `${trail}/${node.id || node.name || 'node'}#${index}`;
        out.push({ node, level, rowKey });
        if (node.children?.length && expandedNodes.has(node.id)) {
            flattenVisibleTree(node.children, expandedNodes, level + 1, out, rowKey);
        }
    });
    return out;
}

interface VirtualTreeListProps {
    rows: FlatRow[];
    expandedNodes: Set<string>;
    selectedNodes: Set<string>;
    setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
    setLastSelectedId: (v: LastSelected) => void;
    handleNodeSelect: (node: BnkNode, ctrl: boolean, shift: boolean, pane: Pane) => void;
    playAudio: (node: BnkNode) => void;
    handleContextMenu: (e: React.MouseEvent, node: BnkNode, pane: Pane) => void;
    handleToggleExpand: (id: string, shift: boolean, pane: Pane) => void;
    onDropReplace: (ids: string[], targetId: string) => void;
    onExternalFileDrop: (files: DroppedFile[], targetId: string, pane: Pane) => void;
    pane: Pane;
    emptyText: string;
}

function VirtualTreeList({
    rows, expandedNodes, selectedNodes, setSelectedNodes, setLastSelectedId,
    handleNodeSelect, playAudio, handleContextMenu, handleToggleExpand,
    onDropReplace, onExternalFileDrop, pane, emptyText,
}: VirtualTreeListProps) {
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(500);
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
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
                <Typography sx={{ textAlign: 'center', marginTop: '3rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'pre-line' }}>
                    {emptyText}
                </Typography>
            ) : (
                <Box sx={{ position: 'relative', height: `${totalHeight}px` }}>
                    <Box sx={{ position: 'absolute', top: `${startIndex * ROW_HEIGHT}px`, left: 0, right: 0 }}>
                        {visibleRows.map(({ node, level, rowKey }) => (
                            <TreeNode
                                key={`${rowKey}-${pane}`}
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

interface Props {
    mainContentStyle: SxProps<Theme>;
    treeViewStyle: Record<string, unknown>;
    sidebarStyle: SxProps<Theme>;
    viewMode: ViewMode;
    activePane: Pane;
    leftSearchQuery: string;
    setLeftSearchQuery: (v: string) => void;
    filteredLeftTree: BnkNode[];
    selectedNodes: Set<string>;
    setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
    setLastSelectedId: (v: LastSelected) => void;
    handleNodeSelect: (node: BnkNode, ctrl: boolean, shift: boolean, pane: Pane) => void;
    playAudio: (node: BnkNode) => void;
    handleContextMenu: (e: React.MouseEvent, node: BnkNode, pane: Pane) => void;
    expandedNodes: Set<string>;
    handleToggleExpand: (id: string, shift: boolean, pane: Pane) => void;
    handleDropReplace: (ids: string[], targetId: string) => void;
    handleAutoMatchByEventName: () => void;
    handleExternalFileDrop: (files: DroppedFile[], targetId: string, pane: Pane) => void;
    rightPaneDragOver: boolean;
    handleRightPaneDragOver: (e: React.DragEvent) => void;
    handleRightPaneDragLeave: (e: React.DragEvent) => void;
    handleRightPaneFileDrop: (e: React.DragEvent) => void;
    rightSearchQuery: string;
    setRightSearchQuery: (v: string) => void;
    rightSortMode: SortMode;
    setRightSortMode: React.Dispatch<React.SetStateAction<SortMode>>;
    leftSortMode: SortMode;
    setLeftSortMode: React.Dispatch<React.SetStateAction<SortMode>>;
    filteredRightTree: BnkNode[];
    rightSelectedNodes: Set<string>;
    setRightSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
    rightExpandedNodes: Set<string>;
    handleExtract: () => void;
    handleReplace: () => void;
    hasAudioSelection: () => boolean;
    handleMakeSilent: () => void;
    handleSave: () => void;
    hasRootSelection: () => boolean;
    handlePlaySelected: () => void;
    stopAudio: () => void;
    volume: number;
    setVolume: (v: number) => void;
    treeData: BnkNode[];
    rightTreeData: BnkNode[];
    setShowSettingsModal: (v: boolean) => void;
    onLeftPaneFolderDrop: (folderPath: string) => void;
    stampDropTarget: (target: 'mod-folder' | 'reference') => void;
}

export default function BnkMainContent(props: Props) {
    const {
        mainContentStyle, treeViewStyle, sidebarStyle,
        viewMode, activePane,
        leftSearchQuery, setLeftSearchQuery, filteredLeftTree,
        selectedNodes, setSelectedNodes, setLastSelectedId, handleNodeSelect, playAudio,
        handleContextMenu, expandedNodes, handleToggleExpand, handleDropReplace,
        handleAutoMatchByEventName, handleExternalFileDrop,
        rightPaneDragOver, handleRightPaneDragOver, handleRightPaneDragLeave, handleRightPaneFileDrop,
        rightSearchQuery, setRightSearchQuery, rightSortMode, setRightSortMode, leftSortMode, setLeftSortMode,
        filteredRightTree, rightSelectedNodes, setRightSelectedNodes, rightExpandedNodes,
        handleExtract, handleReplace, hasAudioSelection, handleMakeSilent, handleSave, hasRootSelection,
        handlePlaySelected, stopAudio, volume, setVolume, treeData, rightTreeData,
        setShowSettingsModal, stampDropTarget,
    } = props;

    const treeBorder = treeViewStyle.border as string;
    const treeBackground = treeViewStyle.background as string;
    const [leftDragOver, setLeftDragOver] = useState(false);

    const handleLeftDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types?.includes('Files')) setLeftDragOver(true);
    }, []);

    const handleLeftDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLeftDragOver(false);
    }, []);

    /* Tauri delivers dropped directory paths through the webview file-drop event,
       not the DOM. The DOM drop stamps the main pane as the target so the webview
       listener can route the real folder path into the auto-extract scan. */
    const handleLeftDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLeftDragOver(false);
        stampDropTarget('mod-folder');
    }, [stampDropTarget]);

    const handleRightDrop = useCallback((e: React.DragEvent) => {
        stampDropTarget('reference');
        handleRightPaneFileDrop?.(e);
    }, [handleRightPaneFileDrop, stampDropTarget]);

    const leftRows = useMemo(() => flattenVisibleTree(filteredLeftTree, expandedNodes), [filteredLeftTree, expandedNodes]);
    const rightRows = useMemo(() => flattenVisibleTree(filteredRightTree, rightExpandedNodes), [filteredRightTree, rightExpandedNodes]);

    return (
        <Box className="bnk-extract-main" sx={mainContentStyle}>
            <Box
                className="bnk-extract-tree"
                onDragOver={handleLeftDragOver}
                onDragLeave={handleLeftDragLeave}
                onDrop={handleLeftDrop}
                sx={{
                    ...treeViewStyle,
                    border: leftDragOver
                        ? '2px dashed var(--accent-primary)'
                        : (viewMode === 'split' && activePane === 'left' ? '1px solid var(--accent-primary)' : treeBorder),
                    background: leftDragOver ? 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' : treeBackground,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s, background 0.15s',
                }}
            >
                <Box sx={{ p: 1.25, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
                    <div className="dl-search" style={{ flex: 1 }}>
                        <span className="dl-icon"><Search sx={{ fontSize: 18 }} /></span>
                        <input
                            className="dl-input"
                            value={leftSearchQuery}
                            onChange={(e) => setLeftSearchQuery(e.target.value)}
                            placeholder="Filter left..."
                        />
                    </div>
                    {leftSearchQuery && (
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost"
                            onClick={() => setLeftSearchQuery('')}
                            title="Clear filter"
                        >
                            <span className="dl-icon"><Close sx={{ fontSize: 14 }} /></span>
                        </button>
                    )}
                    <button
                        className={`dl-btn dl-btn--icon dl-btn--sm ${leftSortMode !== 'none' ? 'dl-btn--primary' : 'dl-btn--ghost'}`}
                        onClick={() => setLeftSortMode((prev) => prev === 'none' ? 'name-asc' : (prev === 'name-asc' ? 'name-desc' : 'none'))}
                        title={`Sort alphabetically: ${leftSortMode === 'none' ? 'Off' : (leftSortMode === 'name-asc' ? 'A to Z' : 'Z to A')}`}
                    >
                        <span className="dl-icon"><SortByAlpha sx={{ fontSize: 16, transform: leftSortMode === 'name-desc' ? 'scaleY(-1)' : 'none' }} /></span>
                    </button>
                    {leftSearchQuery && (
                        <span className="dl-badge">{filteredLeftTree.length}</span>
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
                        <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent-primary)', fontWeight: 800, opacity: 0.6 }}>MAIN BANK</Typography>
                    </Box>
                )}
            </Box>

            {viewMode === 'split' && (
                <Box
                    className="bnk-extract-tree-right"
                    onDragOver={handleRightPaneDragOver}
                    onDragLeave={handleRightPaneDragLeave}
                    onDrop={handleRightDrop}
                    sx={{
                        ...treeViewStyle,
                        marginLeft: 0,
                        border: rightPaneDragOver
                            ? '2px dashed var(--accent-primary)'
                            : (activePane === 'right' ? '1px solid var(--accent-primary)' : treeBorder),
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        background: rightPaneDragOver ? 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' : treeBackground,
                        transition: 'all 0.2s ease',
                    }}
                >
                    <Box sx={{ p: 1.25, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
                        <div className="dl-search" style={{ flex: 1 }}>
                            <span className="dl-icon"><Search sx={{ fontSize: 18 }} /></span>
                            <input
                                className="dl-input"
                                value={rightSearchQuery}
                                onChange={(e) => setRightSearchQuery(e.target.value)}
                                placeholder="Filter right..."
                            />
                        </div>
                        {rightSearchQuery && (
                            <button
                                className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost"
                                onClick={() => setRightSearchQuery('')}
                                title="Clear filter"
                            >
                                <span className="dl-icon"><Close sx={{ fontSize: 14 }} /></span>
                            </button>
                        )}
                        <button
                            className={`dl-btn dl-btn--icon dl-btn--sm ${rightSortMode !== 'none' ? 'dl-btn--primary' : 'dl-btn--ghost'}`}
                            onClick={() => setRightSortMode((prev) => prev === 'none' ? 'name-asc' : (prev === 'name-asc' ? 'name-desc' : 'none'))}
                            title={`Sort alphabetically: ${rightSortMode === 'none' ? 'Off' : (rightSortMode === 'name-asc' ? 'A to Z' : 'Z to A')}`}
                        >
                            <span className="dl-icon"><SortByAlpha sx={{ fontSize: 16, transform: rightSortMode === 'name-desc' ? 'scaleY(-1)' : 'none' }} /></span>
                        </button>
                        {rightSearchQuery && (
                            <span className="dl-badge">{filteredRightTree.length}</span>
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
                        <Typography sx={{ fontSize: '0.6rem', color: 'var(--accent-primary)', fontWeight: 800, opacity: 0.6 }}>REFERENCE BANKS</Typography>
                    </Box>
                </Box>
            )}

            <Box className="bnk-extract-sidebar" sx={sidebarStyle}>
                <button className="dl-btn dl-btn--primary" onClick={handleExtract} disabled={selectedNodes.size === 0}>
                    <span className="dl-icon"><Download sx={{ fontSize: 12 }} /></span>
                    <span>Extract</span>
                </button>
                <button className="dl-btn dl-btn--secondary" onClick={handleReplace} disabled={!hasAudioSelection()}>
                    <span className="dl-icon"><Upload sx={{ fontSize: 12 }} /></span>
                    <span>Replace</span>
                </button>
                <button
                    className="dl-btn dl-btn--secondary"
                    onClick={handleAutoMatchByEventName}
                    disabled={!treeData.length || !rightTreeData.length}
                >
                    <span className="dl-icon"><AutoFixHigh sx={{ fontSize: 12 }} /></span>
                    <span>Auto Match Names</span>
                </button>
                <button className="dl-btn dl-btn--secondary" onClick={handleMakeSilent} disabled={!hasAudioSelection()}>
                    <span className="dl-icon"><VolumeOff sx={{ fontSize: 12 }} /></span>
                    <span>Make Silent</span>
                </button>

                <Divider sx={{ borderColor: 'var(--border)', margin: '0.25rem 0' }} />

                <button className="dl-btn dl-btn--secondary" onClick={handleSave} disabled={!hasRootSelection()}>
                    <span className="dl-icon"><Save sx={{ fontSize: 12 }} /></span>
                    <span>Save as BNK/WPK</span>
                </button>

                <Divider sx={{ borderColor: 'var(--border)', margin: '0.25rem 0' }} />

                <button className="dl-btn dl-btn--primary" onClick={handlePlaySelected} disabled={!hasAudioSelection()}>
                    <span className="dl-icon"><PlayArrow sx={{ fontSize: 12 }} /></span>
                    <span>Play</span>
                </button>
                <button className="dl-btn dl-btn--secondary" onClick={stopAudio}>
                    <span className="dl-icon"><Stop sx={{ fontSize: 12 }} /></span>
                    <span>Stop</span>
                </button>

                <Box sx={{ mt: 'auto', pt: 2 }}>
                    <Divider sx={{ borderColor: 'var(--border)', mb: 1.5 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.75rem', px: 0.5 }}>
                        <VolumeUp sx={{ fontSize: 16, opacity: 0.6 }} />
                        <Slider
                            size="small"
                            value={volume}
                            onChange={(_, newValue) => setVolume(newValue as number)}
                            aria-label="Volume"
                            sx={{
                                color: 'var(--accent-primary)',
                                '& .MuiSlider-thumb': {
                                    width: 12,
                                    height: 12,
                                    backgroundColor: 'var(--accent-primary)',
                                    '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 8px color-mix(in oklab, var(--accent-primary) 16%, transparent)' },
                                },
                                '& .MuiSlider-rail': { opacity: 0.2 },
                            }}
                        />
                    </Box>
                    <Typography sx={{ fontSize: '0.6rem', opacity: 0.4, textAlign: 'center', mt: 0.5 }}>
                        Volume: {volume}%
                    </Typography>
                </Box>

                <Divider sx={{ borderColor: 'var(--border)', margin: '0.25rem 0' }} />
                <button className="dl-btn dl-btn--secondary" onClick={() => setShowSettingsModal(true)}>
                    <span className="dl-icon"><Settings sx={{ fontSize: 12 }} /></span>
                    <span>Settings</span>
                </button>
            </Box>
        </Box>
    );
}
