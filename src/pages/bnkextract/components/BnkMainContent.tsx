import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, Divider, Slider } from '@mui/material';
import {
    SortByAlpha, Download, Upload, VolumeOff, Save, PlayArrow, Stop, VolumeUp, Settings, AutoFixHigh, FolderOpen,
} from '@mui/icons-material';
import type { SxProps, Theme } from '@mui/material';
import TreeNode from './TreeNode';
import PaneLoadBlock from './PaneLoadBlock';
import BnkAddFilesModal from './BnkAddFilesModal';
import { SearchInput } from '@/pages/port/components/common/Inputs';
import { DropOverlay } from '@/components/ui';
import type { BnkNode, DroppedFile, LastSelected, Pane, SortMode, ViewMode } from '../types';
import type { PathSet } from '../../BnkExtract';

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
    setActivePane: (p: Pane) => void;
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
    leftDragOver: boolean;
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
    // Per-pane file loading (Port-style empty-state block inside each pane).
    leftPaths: PathSet;
    rightPaths: PathSet;
    onSelectFile: (pane: Pane, kind: keyof PathSet) => void;
    onSetPath: (pane: Pane, kind: keyof PathSet, value: string) => void;
    onParse: (pane: Pane) => void;
    isLoading: boolean;
}

export default function BnkMainContent(props: Props) {
    const {
        mainContentStyle, treeViewStyle, sidebarStyle,
        viewMode, activePane, setActivePane,
        leftSearchQuery, setLeftSearchQuery, filteredLeftTree,
        selectedNodes, setSelectedNodes, setLastSelectedId, handleNodeSelect, playAudio,
        handleContextMenu, expandedNodes, handleToggleExpand, handleDropReplace,
        handleAutoMatchByEventName, handleExternalFileDrop,
        rightPaneDragOver, leftDragOver, handleRightPaneDragOver, handleRightPaneDragLeave, handleRightPaneFileDrop,
        rightSearchQuery, setRightSearchQuery, rightSortMode, setRightSortMode, leftSortMode, setLeftSortMode,
        filteredRightTree, rightSelectedNodes, setRightSelectedNodes, rightExpandedNodes,
        handleExtract, handleReplace, hasAudioSelection, handleMakeSilent, handleSave, hasRootSelection,
        handlePlaySelected, stopAudio, volume, setVolume, treeData, rightTreeData,
        setShowSettingsModal,
        leftPaths, rightPaths, onSelectFile, onSetPath, onParse, isLoading,
    } = props;

    const treeBorder = treeViewStyle.border as string;
    const treeBackground = treeViewStyle.background as string;
    // Which pane's "add more files" modal is open (null = closed).
    const [addFilesPane, setAddFilesPane] = useState<Pane | null>(null);

    /* The OS drag-drop listener in BnkExtract hit-tests the cursor position to
       both drive the drag-over highlight (leftDragOver/rightPaneDragOver props)
       and route real dropped paths. The pane DOM drop handlers only preventDefault. */
    const handleLeftDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleRightDrop = useCallback((e: React.DragEvent) => {
        handleRightPaneFileDrop?.(e);
    }, [handleRightPaneFileDrop]);

    const leftRows = useMemo(() => flattenVisibleTree(filteredLeftTree, expandedNodes), [filteredLeftTree, expandedNodes]);
    const rightRows = useMemo(() => flattenVisibleTree(filteredRightTree, rightExpandedNodes), [filteredRightTree, rightExpandedNodes]);

    return (
        <Box className="bnk-extract-main" sx={mainContentStyle}>
            <Box
                className="bnk-extract-tree"
                onDrop={handleLeftDrop}
                onMouseDownCapture={viewMode === 'split' ? () => setActivePane('left') : undefined}
                sx={{
                    ...treeViewStyle,
                    border: leftDragOver ? '1px dashed var(--accent-primary)' : treeBorder,
                    background: leftDragOver ? 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' : treeBackground,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s, background 0.15s',
                    // Active pane gets an accent top rule so it's obvious which side
                    // the sidebar actions target.
                    ...(viewMode === 'split' && activePane === 'left' ? {
                        boxShadow: 'inset 0 2px 0 0 var(--accent-primary)',
                    } : {}),
                }}
            >
                {treeData.length === 0 ? (
                    <PaneLoadBlock
                        pane="left"
                        paths={leftPaths}
                        onSelectFile={onSelectFile}
                        onSetPath={onSetPath}
                        onParse={onParse}
                        isLoading={isLoading}
                    />
                ) : (
                    <>
                        <div className="bnk-toolbar-row">
                            <button
                                className="dl-btn dl-btn--secondary dl-btn--icon"
                                onClick={() => setAddFilesPane('left')}
                                title="Add more files to Main bank"
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </button>
                            <SearchInput
                                initialValue={leftSearchQuery}
                                placeholder="Filter by name"
                                onChange={setLeftSearchQuery}
                                trailing={(
                                    <button
                                        type="button"
                                        className={`bnk-search-sort${leftSortMode !== 'none' ? ' is-active' : ''}`}
                                        onClick={() => setLeftSortMode((prev) => prev === 'none' ? 'name-asc' : (prev === 'name-asc' ? 'name-desc' : 'none'))}
                                        title={`Sort alphabetically: ${leftSortMode === 'none' ? 'Off' : (leftSortMode === 'name-asc' ? 'A to Z' : 'Z to A')}`}
                                    >
                                        <SortByAlpha sx={{ fontSize: 15, transform: leftSortMode === 'name-desc' ? 'scaleY(-1)' : 'none' }} />
                                    </button>
                                )}
                            />
                        </div>

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
                            emptyText={leftSearchQuery ? 'No matches' : 'Drag & drop a mod folder here'}
                        />
                    </>
                )}

                {leftDragOver && <DropOverlay label="Drop a mod folder to load" />}
            </Box>

            {/* Single center divider splitting the two halves (Port-style). */}
            {viewMode === 'split' && (
                <Box sx={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
            )}

            {viewMode === 'split' && (
                <Box
                    className="bnk-extract-tree-right"
                    onDragOver={handleRightPaneDragOver}
                    onDragLeave={handleRightPaneDragLeave}
                    onDrop={handleRightDrop}
                    onMouseDownCapture={() => setActivePane('right')}
                    sx={{
                        ...treeViewStyle,
                        border: rightPaneDragOver ? '1px dashed var(--accent-primary)' : treeBorder,
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        background: rightPaneDragOver ? 'color-mix(in oklab, var(--accent-primary) 10%, transparent)' : treeBackground,
                        transition: 'all 0.2s ease',
                        ...(activePane === 'right' ? {
                            boxShadow: 'inset 0 2px 0 0 var(--accent-primary)',
                        } : {}),
                    }}
                >
                    {rightTreeData.length === 0 ? (
                        <PaneLoadBlock
                            pane="right"
                            paths={rightPaths}
                            onSelectFile={onSelectFile}
                            onSetPath={onSetPath}
                            onParse={onParse}
                            isLoading={isLoading}
                        />
                    ) : (
                        <>
                            <div className="bnk-toolbar-row">
                                <button
                                    className="dl-btn dl-btn--secondary dl-btn--icon"
                                    onClick={() => setAddFilesPane('right')}
                                    title="Add more files to Reference bank"
                                >
                                    <FolderOpen sx={{ fontSize: 16 }} />
                                </button>
                                <SearchInput
                                    initialValue={rightSearchQuery}
                                    placeholder="Filter by name"
                                    onChange={setRightSearchQuery}
                                    trailing={(
                                        <button
                                            type="button"
                                            className={`bnk-search-sort${rightSortMode !== 'none' ? ' is-active' : ''}`}
                                            onClick={() => setRightSortMode((prev) => prev === 'none' ? 'name-asc' : (prev === 'name-asc' ? 'name-desc' : 'none'))}
                                            title={`Sort alphabetically: ${rightSortMode === 'none' ? 'Off' : (rightSortMode === 'name-asc' ? 'A to Z' : 'Z to A')}`}
                                        >
                                            <SortByAlpha sx={{ fontSize: 15, transform: rightSortMode === 'name-desc' ? 'scaleY(-1)' : 'none' }} />
                                        </button>
                                    )}
                                />
                            </div>

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
                        </>
                    )}

                    {rightPaneDragOver && <DropOverlay label="Drop .wem / .wav / .mp3 to import" />}
                </Box>
            )}

            <Box className="bnk-extract-sidebar" sx={sidebarStyle}>
                {viewMode === 'split' && (
                    <Box sx={{
                        display: 'flex',
                        p: '3px',
                        mb: 1,
                        borderRadius: '6px',
                        border: '1px solid var(--glass-border)',
                    }}>
                        {(['left', 'right'] as const).map((p) => {
                            const isActive = activePane === p;
                            return (
                                <Box
                                    key={p}
                                    onClick={() => setActivePane(p)}
                                    sx={{
                                        flex: 1,
                                        textAlign: 'center',
                                        fontSize: '0.65rem',
                                        fontFamily: 'var(--font-mono)',
                                        fontWeight: isActive ? 700 : 'normal',
                                        letterSpacing: '0.04em',
                                        py: '5px',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        // Active segment = the translucent "Open Bin" (dl-btn--primary) look.
                                        background: isActive ? 'color-mix(in oklab, var(--accent-primary) 16%, var(--bg-secondary))' : 'transparent',
                                        border: isActive ? '1px solid color-mix(in oklab, var(--accent-primary) 45%, var(--border))' : '1px solid transparent',
                                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' },
                                    }}
                                >
                                    {p === 'left' ? 'MAIN' : 'REFERENCE'}
                                </Box>
                            );
                        })}
                    </Box>
                )}

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

            <BnkAddFilesModal
                open={addFilesPane !== null}
                pane={addFilesPane ?? 'left'}
                paths={addFilesPane === 'right' ? rightPaths : leftPaths}
                isLoading={isLoading}
                onSelectFile={onSelectFile}
                onSetPath={onSetPath}
                onParse={onParse}
                onClose={() => setAddFilesPane(null)}
            />
        </Box>
    );
}
