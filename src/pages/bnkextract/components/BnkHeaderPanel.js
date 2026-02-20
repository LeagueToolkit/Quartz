import React from 'react';
import { Box, Typography, Tooltip, Button, IconButton, TextField } from '@mui/material';
import {
    ContentCut,
    ViewStream,
    VerticalSplit,
    FolderOpen,
    Refresh,
    Delete,
    CompareArrows,
    History,
    AutoFixHigh,
} from '@mui/icons-material';

export default function BnkHeaderPanel({
    headerStyle,
    inputStyle,
    buttonStyle,
    statusMessage,
    showAudioSplitter,
    setSplitterInitialFile,
    setShowAudioSplitter,
    viewMode,
    setViewMode,
    activePane,
    setActivePane,
    binPath,
    setBinPath,
    wpkPath,
    setWpkPath,
    bnkPath,
    setBnkPath,
    handleSelectFile,
    handleParseFiles,
    isLoading,
    handleClearPane,
    setHistoryAnchor,
    setAutoExtractOpen,
}) {
    return (
        <>
            <Box className="bnk-extract-header" sx={headerStyle}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    BNK EXTRACT
                    <Box component="span" sx={{ fontSize: '0.6rem', background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)', px: 1, borderRadius: '4px', verticalAlign: 'middle' }}>
                        PRO
                    </Box>
                </Typography>

                <Box sx={{ flex: 1 }} />

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mr: 2 }}>
                    <Tooltip title="Audio Splitter - cut audio into segments">
                        <Button
                            size="small"
                            onClick={() => { setSplitterInitialFile(null); setShowAudioSplitter(true); }}
                            sx={{
                                minWidth: '32px',
                                padding: '4px',
                                background: 'rgba(255,255,255,0.05)',
                                color: showAudioSplitter ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'rgba(255,255,255,0.1)', color: 'var(--accent)' },
                            }}
                        >
                            <ContentCut sx={{ fontSize: 18 }} />
                        </Button>
                    </Tooltip>
                    <Tooltip title={viewMode === 'normal' ? 'Switch to Split View' : 'Switch to Single View'}>
                        <Button
                            size="small"
                            onClick={() => setViewMode((prev) => (prev === 'normal' ? 'split' : 'normal'))}
                            sx={{
                                minWidth: '32px',
                                padding: '4px',
                                background: 'rgba(255,255,255,0.05)',
                                color: viewMode === 'split' ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'rgba(255,255,255,0.1)' },
                            }}
                        >
                            {viewMode === 'normal' ? <ViewStream sx={{ fontSize: 18 }} /> : <VerticalSplit sx={{ fontSize: 18 }} />}
                        </Button>
                    </Tooltip>
                </Box>

                <Typography sx={{ fontSize: '0.65rem', opacity: 0.6, color: 'var(--text-2)' }}>
                    {statusMessage}
                </Typography>
            </Box>

            <Box
                sx={{
                    padding: '0.5rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                }}
            >
                <Box sx={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {viewMode === 'split' && (
                        <Box sx={{ display: 'flex', background: 'rgba(0,0,0,0.3)', p: '2px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Button
                                onClick={() => setActivePane('left')}
                                sx={{
                                    fontSize: '0.6rem',
                                    py: '2px',
                                    minWidth: '50px',
                                    background: activePane === 'left' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'left' ? 'black' : 'white',
                                    '&:hover': { background: activePane === 'left' ? 'var(--accent)' : 'rgba(255,255,255,0.1)' },
                                }}
                            >
                                LEFT
                            </Button>
                            <Button
                                onClick={() => setActivePane('right')}
                                sx={{
                                    fontSize: '0.6rem',
                                    py: '2px',
                                    minWidth: '50px',
                                    background: activePane === 'right' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'right' ? 'black' : 'white',
                                    '&:hover': { background: activePane === 'right' ? 'var(--accent)' : 'rgba(255,255,255,0.1)' },
                                }}
                            >
                                RIGHT
                            </Button>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select BIN File (Event Names)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('bin')}
                                sx={{
                                    color: binPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' },
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField value={binPath} onChange={(e) => setBinPath(e.target.value)} placeholder="BIN File (Names)" size="small" sx={{ ...inputStyle, flex: 1 }} />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select Audio File (.wpk/.bnk)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('wpk')}
                                sx={{
                                    color: wpkPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' },
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField value={wpkPath} onChange={(e) => setWpkPath(e.target.value)} placeholder="Audio File (WPK/BNK)" size="small" sx={{ ...inputStyle, flex: 1 }} />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select BNK File (Events Structure)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('bnk')}
                                sx={{
                                    color: bnkPath ? 'var(--accent)' : 'var(--text)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', borderColor: 'var(--accent)' },
                                }}
                            >
                                <FolderOpen sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <TextField value={bnkPath} onChange={(e) => setBnkPath(e.target.value)} placeholder="Events File (BNK)" size="small" sx={{ ...inputStyle, flex: 1 }} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <Button
                            variant="contained"
                            size="small"
                            onClick={handleParseFiles}
                            disabled={isLoading || (!wpkPath && !bnkPath)}
                            startIcon={<Refresh sx={{ fontSize: 12 }} />}
                            sx={{
                                ...buttonStyle,
                                background: 'rgba(var(--accent-rgb), 0.25)',
                                color: 'var(--accent)',
                                fontWeight: 600,
                            }}
                        >
                            Parse
                        </Button>
                        <Tooltip title="Clear tree">
                            <IconButton
                                size="small"
                                onClick={() => handleClearPane(viewMode === 'split' ? activePane : 'left')}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(255, 80, 80, 0.2)', color: '#ff6666' },
                                }}
                            >
                                <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>

                        {viewMode === 'split' && (
                            <Tooltip title="Clear all trees">
                                <IconButton
                                    size="small"
                                    onClick={() => { handleClearPane('left'); handleClearPane('right'); }}
                                    sx={{
                                        color: 'rgba(255,255,255,0.5)',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '4px',
                                        padding: '4px',
                                        '&:hover': { background: 'rgba(255, 80, 80, 0.2)', color: '#ff6666' },
                                    }}
                                >
                                    <CompareArrows sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Tooltip>
                        )}

                        <Tooltip title="Recent files">
                            <IconButton
                                size="small"
                                onClick={(e) => setHistoryAnchor(e.currentTarget)}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)' },
                                }}
                            >
                                <History sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Mod Auto-Extract">
                            <IconButton
                                size="small"
                                onClick={() => setAutoExtractOpen(true)}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)' },
                                }}
                            >
                                <AutoFixHigh sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>
        </>
    );
}
