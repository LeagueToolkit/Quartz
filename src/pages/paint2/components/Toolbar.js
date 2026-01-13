/**
 * Toolbar Component
 * Top bar with file operations, file path, and mode selection
 * Styled to match the original Paint.js layout
 */

import React from 'react';
import { Box, Typography, Button, Select, MenuItem, Tooltip } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

const buttonStyle = {
    background: 'color-mix(in srgb, var(--accent), transparent 95%)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
    color: 'var(--accent)',
    borderRadius: '4px',
    textTransform: 'none',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.8rem',
    padding: '2px 12px',
    minWidth: 'auto',
    height: '28px',
    '&:hover': {
        background: 'color-mix(in srgb, var(--accent), transparent 90%)',
        borderColor: 'var(--accent)'
    },
    '&:disabled': {
        opacity: 0.3,
        color: 'var(--text-2)'
    }
};

const selectStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.85rem',
    color: 'var(--accent)',
    height: '28px',
    '& .MuiSelect-select': {
        padding: '2px 12px',
        paddingRight: '32px !important'
    },
    '& fieldset': {
        border: 'none'
    },
    '&:hover fieldset': {
        border: 'none'
    },
    '&.Mui-focused fieldset': {
        border: 'none'
    }
};

function Toolbar({
    filePath,
    isLoading,
    onFileOpen,
    mode,
    onModeChange
}) {
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            gap: 2
        }}>
            {/* Open Button */}
            <Button
                onClick={onFileOpen}
                disabled={isLoading}
                sx={buttonStyle}
            >
                Open Bin
            </Button>

            {/* File Path */}
            <Tooltip title={filePath || 'No file loaded'}>
                <Typography sx={{
                    flex: 1,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.85rem',
                    color: 'var(--accent-muted)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: 0.8,
                    cursor: 'default'
                }}>
                    {filePath ? filePath.split(/[\\/]/).pop() : 'No file loaded'}
                </Typography>
            </Tooltip>

            {/* Mode Selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase'
                }}>
                    Mode:
                </Typography>
                <Select
                    value={mode}
                    onChange={(e) => onModeChange(e.target.value)}
                    size="small"
                    sx={selectStyle}
                    MenuProps={{
                        PaperProps: {
                            sx: {
                                background: 'var(--bg-2)',
                                border: '1px solid var(--border)',
                                '& .MuiMenuItem-root': {
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-2)',
                                    '&.Mui-selected': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', color: 'var(--accent)' }
                                }
                            }
                        }
                    }}
                >
                    <MenuItem value="random">Random</MenuItem>
                    <MenuItem value="linear">Linear Gradient</MenuItem>
                    <MenuItem value="shift">HSL Shift</MenuItem>
                    <MenuItem value="shift-hue">Shift Hue</MenuItem>
                    <MenuItem value="materials">Materials Only</MenuItem>
                </Select>
            </Box>
        </Box>
    );
}

export default React.memo(Toolbar);
