import React from 'react';
import { Box, Typography, Tooltip, Button, IconButton, TextField } from '@mui/material';
import {
    ContentCut,
    ViewStream,
    VerticalSplit,
    FolderOpen,
    Refresh,
    Delete,
    Bookmark,
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
    onSessionClick,
    setHistoryAnchor,
    setAutoExtractOpen,
}) {
    const controlShellSx = {
        background: 'var(--bg)',
        backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
        WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'none',
        transition: 'all 0.15s ease',
    };

    return (
        <>
            <Box className="bnk-extract-header" sx={headerStyle}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    BNK EXTRACT
                    <Box component="span" sx={{ fontSize: '0.6rem', background: 'transparent', color: 'var(--accent)', px: 1, borderRadius: '4px', verticalAlign: 'middle' }}>
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
                                background: 'transparent',
                                color: showAudioSplitter ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'transparent', color: 'var(--accent)' },
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
                                background: 'transparent',
                                color: viewMode === 'split' ? 'var(--accent)' : '',
                                border: '1px solid rgba(255,255,255,0.1)',
                                '&:hover': { background: 'transparent' },
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
                    background: 'var(--bg)',
                    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
                    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
                    borderBottom: '1px solid var(--glass-border)',
                }}
            >
                <Box sx={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {viewMode === 'split' && (
                        <Box sx={{ 
                            display: 'flex', 
                            background: 'var(--bg)', 
                            backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
                            WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
                            p: '3px', 
                            borderRadius: '6px', 
                            border: '1px solid var(--glass-border)' 
                        }}>
                            <Box
                                onClick={() => setActivePane('left')}
                                sx={{
                                    fontSize: '0.65rem',
                                    fontFamily: 'JetBrains Mono',
                                    fontWeight: activePane === 'left' ? 'bold' : 'normal',
                                    py: '4px',
                                    px: '12px',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    background: activePane === 'left' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'left' ? '#000' : 'rgba(255,255,255,0.5)',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { 
                                        color: activePane === 'left' ? '#000' : 'rgba(255,255,255,0.8)' 
                                    },
                                }}
                            >
                                LEFT
                            </Box>
                            <Box
                                onClick={() => setActivePane('right')}
                                sx={{
                                    fontSize: '0.65rem',
                                    fontFamily: 'JetBrains Mono',
                                    fontWeight: activePane === 'right' ? 'bold' : 'normal',
                                    py: '4px',
                                    px: '12px',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    background: activePane === 'right' ? 'var(--accent)' : 'transparent',
                                    color: activePane === 'right' ? '#000' : 'rgba(255,255,255,0.5)',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { 
                                        color: activePane === 'right' ? '#000' : 'rgba(255,255,255,0.8)' 
                                    },
                                }}
                            >
                                RIGHT
                            </Box>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                        <Tooltip title="Select BIN File (Event Names)">
                            <IconButton
                                size="small"
                                onClick={() => handleSelectFile('bin')}
                                sx={{
                                    color: binPath ? 'var(--accent)' : 'var(--text)',
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { borderColor: 'var(--accent)' },
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
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { borderColor: 'var(--accent)' },
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
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { borderColor: 'var(--accent)' },
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
                                ...controlShellSx,
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
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { color: '#ff6666', borderColor: '#ff6666' },
                                }}
                            >
                                <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Session Manager">
                            <IconButton
                                size="small"
                                onClick={onSessionClick}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' },
                                }}
                            >
                                <Bookmark style={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Mod Auto-Extract">
                            <IconButton
                                size="small"
                                onClick={() => setAutoExtractOpen(true)}
                                sx={{
                                    color: 'rgba(255,255,255,0.5)',
                                    ...controlShellSx,
                                    borderRadius: '4px',
                                    padding: '4px',
                                    '&:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' },
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
