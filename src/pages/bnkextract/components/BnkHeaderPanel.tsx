import { Box, Typography, Tooltip, Button, IconButton, TextField } from '@mui/material';
import {
    ContentCut, ViewStream, VerticalSplit, FolderOpen, Refresh, Delete, Bookmark, AutoFixHigh, SportsEsports,
} from '@mui/icons-material';
import type { SxProps, Theme } from '@mui/material';
import type { Pane, SplitterFile, ViewMode } from '../types';

interface Props {
    headerStyle: SxProps<Theme>;
    inputStyle: Record<string, unknown>;
    buttonStyle: Record<string, unknown>;
    statusMessage: string;
    showAudioSplitter: boolean;
    setSplitterInitialFile: (f: SplitterFile | null) => void;
    setShowAudioSplitter: (v: boolean) => void;
    viewMode: ViewMode;
    setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
    activePane: Pane;
    setActivePane: (p: Pane) => void;
    binPath: string;
    setBinPath: (v: string) => void;
    wpkPath: string;
    setWpkPath: (v: string) => void;
    bnkPath: string;
    setBnkPath: (v: string) => void;
    handleSelectFile: (kind: 'bin' | 'wpk' | 'bnk') => void;
    handleParseFiles: () => void;
    isLoading: boolean;
    handleClearPane: (pane: Pane) => void;
    onSessionClick: () => void;
    setAutoExtractOpen: (v: boolean) => void;
    onOpenGameBanks: () => void;
}

const controlShellSx = {
    background: 'var(--bg)',
    backdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
    WebkitBackdropFilter: 'blur(calc(var(--glass-blur, 10px) + 1px)) saturate(118%)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'none',
    transition: 'all 0.15s ease',
} as const;

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
    setAutoExtractOpen,
    onOpenGameBanks,
}: Props) {
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
                                color: showAudioSplitter ? 'var(--accent-primary)' : 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                '&:hover': { background: 'transparent', color: 'var(--accent-primary)' },
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
                                color: viewMode === 'split' ? 'var(--accent-primary)' : '',
                                border: '1px solid var(--border)',
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
                            {(['left', 'right'] as const).map((p) => (
                                <Box
                                    key={p}
                                    onClick={() => setActivePane(p)}
                                    sx={{
                                        fontSize: '0.65rem',
                                        fontFamily: 'JetBrains Mono',
                                        fontWeight: activePane === p ? 'bold' : 'normal',
                                        py: '4px',
                                        px: '12px',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        background: activePane === p ? 'var(--accent-primary)' : 'transparent',
                                        color: activePane === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { color: activePane === p ? 'var(--text-primary)' : 'var(--text-primary)' },
                                    }}
                                >
                                    {p.toUpperCase()}
                                </Box>
                            ))}
                        </Box>
                    )}

                    {([
                        ['bin', binPath, setBinPath, 'BIN File (Names)', 'Select BIN File (Event Names)'],
                        ['wpk', wpkPath, setWpkPath, 'Audio File (WPK/BNK)', 'Select Audio File (.wpk/.bnk)'],
                        ['bnk', bnkPath, setBnkPath, 'Events File (BNK)', 'Select BNK File (Events Structure)'],
                    ] as const).map(([kind, val, setter, placeholder, tip]) => (
                        <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}>
                            <Tooltip title={tip}>
                                <IconButton
                                    size="small"
                                    onClick={() => handleSelectFile(kind)}
                                    sx={{
                                        color: val ? 'var(--accent-primary)' : 'var(--text)',
                                        ...controlShellSx,
                                        borderRadius: '4px',
                                        padding: '4px',
                                        '&:hover': { borderColor: 'var(--accent-primary)' },
                                    }}
                                >
                                    <FolderOpen sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                            <TextField value={val} onChange={(e) => setter(e.target.value)} placeholder={placeholder} size="small" sx={{ ...inputStyle, flex: 1 }} />
                        </Box>
                    ))}

                    <Box sx={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <Button
                            variant="contained"
                            size="small"
                            onClick={handleParseFiles}
                            disabled={isLoading || (!wpkPath && !bnkPath)}
                            startIcon={<Refresh sx={{ fontSize: 12 }} />}
                            sx={{ ...buttonStyle, ...controlShellSx, color: 'var(--accent-primary)', fontWeight: 600 }}
                        >
                            Parse
                        </Button>
                        <Tooltip title="Clear tree">
                            <IconButton
                                size="small"
                                onClick={() => handleClearPane(viewMode === 'split' ? activePane : 'left')}
                                sx={{ color: 'var(--text-secondary)', ...controlShellSx, borderRadius: '4px', padding: '4px', '&:hover': { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' } }}
                            >
                                <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Session Manager">
                            <IconButton
                                size="small"
                                onClick={onSessionClick}
                                sx={{ color: 'var(--text-secondary)', ...controlShellSx, borderRadius: '4px', padding: '4px', '&:hover': { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } }}
                            >
                                <Bookmark style={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Mod Auto-Extract">
                            <IconButton
                                size="small"
                                onClick={() => setAutoExtractOpen(true)}
                                sx={{ color: 'var(--text-secondary)', ...controlShellSx, borderRadius: '4px', padding: '4px', '&:hover': { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } }}
                            >
                                <AutoFixHigh sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Load Banks From Game">
                            <IconButton
                                size="small"
                                onClick={onOpenGameBanks}
                                sx={{ color: 'var(--text-secondary)', ...controlShellSx, borderRadius: '4px', padding: '4px', '&:hover': { color: 'var(--accent-secondary)', borderColor: 'var(--accent-secondary)' } }}
                            >
                                <SportsEsports sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>
        </>
    );
}
