import React from 'react';
import { Box, List, ListItem, Typography } from '@mui/material';
import { FormatListBulleted as FormatListBulletedIcon, Search as SearchIcon, Check as CheckIcon } from '@mui/icons-material';
import DebouncedTextField from './DebouncedTextField';
import type { SourceBin } from '../utils/types';

interface SourceBinsPanelProps {
    binFilter: string;
    setBinFilter: (value: string) => void;
    filteredBins: Array<[string, SourceBin]>;
    selectedBinCount: number;
    totalBinCount: number;
    activeBinPath: string;
    handleBinSelect: (unifyPath: string, selected: boolean) => void;
    handleBinView: (unifyPath: string) => void;
}

const SourceBinsPanel = React.memo(function SourceBinsPanel({
    binFilter,
    setBinFilter,
    filteredBins,
    selectedBinCount,
    totalBinCount,
    activeBinPath,
    handleBinSelect,
    handleBinView,
}: SourceBinsPanelProps) {
    return (
        <Box
            sx={{
                width: '350px',
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-bumpath-bin-list>
                <Box sx={{ p: 2, borderBottom: '1px solid var(--border)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormatListBulletedIcon sx={{ color: 'var(--accent-primary)', fontSize: '1.2rem' }} />
                            <Typography variant="h6" sx={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>
                                Source BINs:
                            </Typography>
                        </Box>
                        <span className="dl-badge">
                            {selectedBinCount} / {totalBinCount} selected
                        </span>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <div className="dl-search" style={{ flex: 1 }}>
                            <span className="dl-icon"><SearchIcon sx={{ fontSize: '1rem' }} /></span>
                            <DebouncedTextField
                                placeholder="Filter BIN files..."
                                value={binFilter}
                                onValueChange={setBinFilter}
                                debounceMs={150}
                            />
                        </div>
                        {binFilter && (
                            <button
                                type="button"
                                className="dl-btn dl-btn--icon dl-btn--sm dl-btn--secondary"
                                onClick={() => setBinFilter('')}
                                title="Clear filter"
                            >
                                <span className="dl-icon">✕</span>
                            </button>
                        )}
                    </Box>

                    {binFilter && (
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '0.7rem', mt: 0.5 }}>
                            Showing {filteredBins.length} of {totalBinCount} BINs
                        </Typography>
                    )}
                </Box>

                <Box
                    sx={{
                        flex: 1,
                        overflow: 'auto',
                        p: 0.5,
                        '&::-webkit-scrollbar': {
                            width: '8px',
                        },
                        '&::-webkit-scrollbar-track': {
                            background: 'var(--bg-secondary)',
                            borderRadius: '4px',
                        },
                        '&::-webkit-scrollbar-thumb': {
                            background: 'var(--bg-hover)',
                            borderRadius: '4px',
                            '&:hover': {
                                background: 'var(--border-strong)',
                            },
                        },
                        minHeight: '200px',
                    }}
                >
                    <List dense sx={{ py: 0 }}>
                        {filteredBins.map(([unifyPath, data]) => {
                            const pathToUse = data?.rel_path || data?.path || unifyPath || '';
                            const fileName = pathToUse.split('/').pop() || pathToUse.split('\\').pop() || pathToUse;
                            const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : '';
                            const pathWithoutFile = pathToUse.replace(fileName, '');

                            return (
                                <ListItem
                                    key={unifyPath}
                                    onClick={() => handleBinView(unifyPath)}
                                    sx={{
                                        px: 1,
                                        py: 0.75,
                                        minHeight: 'auto',
                                        backgroundColor: activeBinPath === unifyPath
                                            ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)'
                                            : 'transparent',
                                        borderLeft: activeBinPath === unifyPath
                                            ? '2px solid var(--accent-primary)'
                                            : '2px solid transparent',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        mb: 0.25,
                                        '&:hover': {
                                            backgroundColor: 'var(--bg-hover)',
                                        },
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                >
                                    <label className="dl-check" style={{ marginRight: '8px' }}>
                                        <input
                                            type="checkbox"
                                            checked={data.selected}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleBinSelect(unifyPath, e.target.checked)}
                                        />
                                        <span className="dl-check__box">
                                            <span className="dl-check__tick">
                                                <span className="dl-icon"><CheckIcon /></span>
                                            </span>
                                        </span>
                                    </label>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '0.65rem',
                                                    opacity: 0.7,
                                                    fontFamily: 'var(--font-mono)',
                                                }}
                                            >
                                                {pathWithoutFile}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    fontFamily: 'var(--font-mono)',
                                                }}
                                            >
                                                {fileName.replace(`.${fileExtension}`, '')}
                                            </Typography>
                                            {fileExtension && (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'var(--accent-primary)',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '700',
                                                        fontFamily: 'var(--font-mono)',
                                                        backgroundColor: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                                                        px: 0.5,
                                                        py: 0.25,
                                                        borderRadius: '3px',
                                                    }}
                                                >
                                                    .{fileExtension}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                </ListItem>
                            );
                        })}
                    </List>
                </Box>
            </Box>
        </Box>
    );
});

export default SourceBinsPanel;
