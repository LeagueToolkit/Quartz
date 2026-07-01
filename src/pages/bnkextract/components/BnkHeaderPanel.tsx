import { Box, Typography } from '@mui/material';
import {
    ContentCut, ViewStream, VerticalSplit, FolderOpen, Refresh, Delete, Bookmark, AutoFixHigh, SportsEsports,
} from '@mui/icons-material';
import type { SxProps, Theme } from '@mui/material';
import type { Pane, SplitterFile, ViewMode } from '../types';

interface Props {
    headerStyle: SxProps<Theme>;
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

export default function BnkHeaderPanel({
    headerStyle,
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
                    <button
                        className={`dl-btn dl-btn--icon dl-btn--sm ${showAudioSplitter ? 'dl-btn--primary' : 'dl-btn--ghost'}`}
                        onClick={() => { setSplitterInitialFile(null); setShowAudioSplitter(true); }}
                        title="Audio Splitter - cut audio into segments"
                    >
                        <span className="dl-icon"><ContentCut sx={{ fontSize: 18 }} /></span>
                    </button>
                    <button
                        className={`dl-btn dl-btn--icon dl-btn--sm ${viewMode === 'split' ? 'dl-btn--primary' : 'dl-btn--ghost'}`}
                        onClick={() => setViewMode((prev) => (prev === 'normal' ? 'split' : 'normal'))}
                        title={viewMode === 'normal' ? 'Switch to Split View' : 'Switch to Single View'}
                    >
                        <span className="dl-icon">{viewMode === 'normal' ? <ViewStream sx={{ fontSize: 18 }} /> : <VerticalSplit sx={{ fontSize: 18 }} />}</span>
                    </button>
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
                            <button
                                className={`dl-btn dl-btn--icon dl-btn--sm ${val ? 'dl-btn--primary' : 'dl-btn--secondary'}`}
                                onClick={() => handleSelectFile(kind)}
                                title={tip}
                            >
                                <span className="dl-icon"><FolderOpen sx={{ fontSize: 16 }} /></span>
                            </button>
                            <input
                                className="dl-input"
                                style={{ flex: 1 }}
                                value={val}
                                onChange={(e) => setter(e.target.value)}
                                placeholder={placeholder}
                            />
                        </Box>
                    ))}

                    <Box sx={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button
                            className="dl-btn dl-btn--primary dl-btn--sm"
                            onClick={handleParseFiles}
                            disabled={isLoading || (!wpkPath && !bnkPath)}
                        >
                            <span className="dl-icon"><Refresh sx={{ fontSize: 12 }} /></span>
                            <span>Parse</span>
                        </button>
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--danger"
                            onClick={() => handleClearPane(viewMode === 'split' ? activePane : 'left')}
                            title="Clear tree"
                        >
                            <span className="dl-icon"><Delete sx={{ fontSize: 14 }} /></span>
                        </button>
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--secondary"
                            onClick={onSessionClick}
                            title="Session Manager"
                        >
                            <span className="dl-icon"><Bookmark style={{ fontSize: 14 }} /></span>
                        </button>
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--secondary"
                            onClick={() => setAutoExtractOpen(true)}
                            title="Mod Auto-Extract"
                        >
                            <span className="dl-icon"><AutoFixHigh sx={{ fontSize: 14 }} /></span>
                        </button>
                        <button
                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--secondary"
                            onClick={onOpenGameBanks}
                            title="Load Banks From Game"
                        >
                            <span className="dl-icon"><SportsEsports sx={{ fontSize: 14 }} /></span>
                        </button>
                    </Box>
                </Box>
            </Box>
        </>
    );
}
