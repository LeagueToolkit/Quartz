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
    fontSize: '0.82rem',
    color: 'var(--text)',
    height: '26px',
    minWidth: '148px',
    borderRadius: '8px',
    background: 'rgba(18, 20, 28, 0.55)',
    border: '1px solid rgba(255, 255, 255, 0.24)',
    transition: 'all 160ms ease',
    '& .MuiSelect-select': {
        padding: '3px 10px',
        paddingRight: '28px !important'
    },
    '& .MuiSelect-icon': {
        color: 'rgba(255,255,255,0.78)',
        fontSize: '1rem'
    },
    '&:hover': {
        background: 'rgba(34, 38, 52, 0.62)',
        borderColor: 'rgba(255, 255, 255, 0.52)',
        boxShadow: '0 8px 18px rgba(0,0,0,0.28)'
    },
    '&.Mui-focused': {
        borderColor: 'color-mix(in srgb, var(--accent2), transparent 35%)',
        boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent2), transparent 75%)'
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

const modeMenuPaperSx = {
    mt: 0.6,
    background: 'var(--glass-bg, rgba(20, 20, 24, 0.94))',
    border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
    borderRadius: '12px',
    boxShadow: '0 20px 48px rgba(0,0,0,0.5), 0 0 16px color-mix(in srgb, var(--accent2), transparent 80%)',
    backdropFilter: 'saturate(180%) blur(12px)',
    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
    overflow: 'hidden',
    '& .MuiMenu-list': {
        py: 0.5
    },
    '& .MuiMenuItem-root': {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.82rem',
        color: 'var(--text-2)',
        mx: 0.6,
        borderRadius: '8px',
        minHeight: '34px',
        transition: 'all 140ms ease',
        '&:hover': {
            background: 'rgba(255,255,255,0.07)',
            color: 'var(--text)'
        },
        '&.Mui-selected': {
            background: 'color-mix(in srgb, var(--accent), transparent 85%)',
            color: 'var(--accent)',
            fontWeight: 700
        },
        '&.Mui-selected:hover': {
            background: 'color-mix(in srgb, var(--accent), transparent 80%)'
        }
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
                            sx: modeMenuPaperSx
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
