import React from 'react';
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
} from '@mui/icons-material';
import TreeNode from './TreeNode';

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
        setShowSettingsModal,
    } = props;

    return (
        <Box sx={mainContentStyle}>
            <Box className="bnk-extract-tree" sx={{
                ...treeViewStyle,
                border: viewMode === 'split' && activePane === 'left' ? '1px solid var(--accent)' : treeViewStyle.border,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
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

                <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} onClick={() => { setSelectedNodes(new Set()); setLastSelectedId({ id: null, pane: 'left' }); }}>
                    {filteredLeftTree.length === 0 ? (
                        <Typography sx={{
                            textAlign: 'center',
                            marginTop: '3rem',
                            fontSize: '0.8rem',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontWeight: 500,
                        }}>
                            {leftSearchQuery ? 'No matches' : 'Select a .bnk or .wpk file and click "Parse"'}
                        </Typography>
                    ) : (
                        filteredLeftTree.map((node, index) => (
                            <TreeNode
                                key={node.id || index}
                                node={node}
                                level={0}
                                selectedNodes={selectedNodes}
                                onSelect={handleNodeSelect}
                                onPlay={playAudio}
                                onContextMenu={handleContextMenu}
                                expandedNodes={expandedNodes}
                                onToggleExpand={handleToggleExpand}
                                pane="left"
                                onDropReplace={handleDropReplace}
                                onExternalFileDrop={handleExternalFileDrop}
                            />
                        ))
                    )}
                </Box>

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

                    <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} onClick={() => { setRightSelectedNodes(new Set()); setLastSelectedId({ id: null, pane: 'right' }); }}>
                        {filteredRightTree.length === 0 ? (
                            <Typography component="div" sx={{
                                textAlign: 'center',
                                marginTop: '3rem',
                                fontSize: '0.8rem',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontWeight: 500,
                            }}>
                                {rightSearchQuery ? 'No matches' : (
                                    <>
                                        <Box sx={{ mb: 1, opacity: 0.6 }}>📁</Box>
                                        Drop .wem .wav .mp3 files here, autoconvert
                                        <Box sx={{ fontSize: '0.65rem', mt: 0.5, opacity: 0.5 }}>
                                            or load banks to drag replacement audio
                                        </Box>
                                    </>
                                )}
                            </Typography>
                        ) : (
                            filteredRightTree.map((node, index) => (
                                <TreeNode
                                    key={node.id || index}
                                    node={node}
                                    level={0}
                                    selectedNodes={rightSelectedNodes}
                                    onSelect={handleNodeSelect}
                                    onPlay={playAudio}
                                    onContextMenu={handleContextMenu}
                                    expandedNodes={rightExpandedNodes}
                                    onToggleExpand={handleToggleExpand}
                                    pane="right"
                                    onDropReplace={handleDropReplace}
                                    onExternalFileDrop={handleExternalFileDrop}
                                />
                            ))
                        )}
                    </Box>

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

