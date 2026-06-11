import React from 'react';
import { Box, Button, FormControlLabel, Switch, Typography } from '@mui/material';
import { Folder as FolderIcon, CheckBox as CheckBoxIcon, Clear as ClearIcon } from '@mui/icons-material';
import { getActionButtonSx } from '../utils/styles';
import type { ScannedData } from '../utils/types';

interface BumpathTopBarProps {
    handleSelectSourceDir: () => void;
    handleSelectAll: () => void;
    handleDeselectAll: () => void;
    scannedData: ScannedData | null;
    selectedEntriesSize: number;
    showMissingOnly: boolean;
    setShowMissingOnly: (value: boolean) => void;
}

const BumpathTopBar = React.memo(function BumpathTopBar({
    handleSelectSourceDir,
    handleSelectAll,
    handleDeselectAll,
    scannedData,
    selectedEntriesSize,
    showMissingOnly,
    setShowMissingOnly,
}: BumpathTopBarProps) {
    return (
        <Box
            sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                minHeight: '60px',
            }}
        >
            <Button
                startIcon={<FolderIcon />}
                onClick={handleSelectSourceDir}
                sx={getActionButtonSx('#ecb96a')}
            >
                Add Source Folders
            </Button>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Button
                    startIcon={<CheckBoxIcon />}
                    onClick={handleSelectAll}
                    disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
                    data-bumpath-select-all
                    sx={getActionButtonSx('#10b981')}
                >
                    Select All
                </Button>

                <Button
                    startIcon={<ClearIcon />}
                    onClick={handleDeselectAll}
                    disabled={!scannedData || selectedEntriesSize === 0}
                    sx={getActionButtonSx('#ef4444')}
                >
                    Deselect All
                </Button>
            </Box>

            <FormControlLabel
                control={
                    <Switch
                        size="small"
                        checked={showMissingOnly}
                        onChange={(e) => setShowMissingOnly(e.target.checked)}
                        sx={{
                            p: 0.5,
                            width: 38,
                            height: 22,
                            '& .MuiSwitch-switchBase': {
                                p: '3px',
                                '&.Mui-checked': {
                                    color: '#fff',
                                    transform: 'translateX(16px)',
                                    '& + .MuiSwitch-track': {
                                        backgroundColor: 'var(--accent)',
                                        opacity: 1,
                                        boxShadow: '0 0 10px color-mix(in srgb, var(--accent), transparent 65%)',
                                    },
                                },
                            },
                            '& .MuiSwitch-thumb': {
                                width: 14,
                                height: 14,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            },
                            '& .MuiSwitch-track': {
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.12)',
                                opacity: 1,
                                transition: 'background 200ms ease, box-shadow 200ms ease',
                            },
                        }}
                    />
                }
                label={
                    <Typography
                        variant="body2"
                        sx={{
                            color: showMissingOnly ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            fontFamily: 'JetBrains Mono, monospace',
                            letterSpacing: '0.02em',
                            transition: 'color 180ms ease',
                        }}
                    >
                        Show Missing Files Only
                    </Typography>
                }
            />
        </Box>
    );
});

export default BumpathTopBar;
