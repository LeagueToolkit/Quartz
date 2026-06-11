import React from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import {
    Close as CloseIcon,
    Edit as EditIcon,
    Folder as FolderIcon,
    PlayArrow as PlayArrowIcon,
    AutoFixHigh as AutoFixHighIcon,
    Terminal as TerminalIcon,
    Settings as SettingsIcon,
} from '@mui/icons-material';
import DebouncedTextField from './DebouncedTextField';
import { getActionButtonSx, inputSx } from '../utils/styles';
import type { ScannedData } from '../utils/types';

interface BumpathBottomControlsProps {
    handleReset: () => void;
    prefixText: string;
    handlePrefixTextChange: (value: string) => void;
    handleApplyPrefix: () => void;
    selectedEntriesSize: number;
    debouncedPrefixText: string;
    handleSelectOutputDir: () => void;
    isProcessing: boolean;
    handleProcess: () => void;
    handleOpenQuickRepath: () => void;
    quickRepathDisabled: boolean;
    scannedData: ScannedData | null;
    outputPath: string;
    setConsoleOpen: (open: boolean) => void;
    settingsExpanded: boolean;
    setSettingsExpanded: (expanded: boolean) => void;
    setSettingsAutoOpened: (value: boolean) => void;
}

const inputInputSx = (inputSx as Record<string, unknown>)['& .MuiInputBase-input'] as Record<string, unknown>;

const BumpathBottomControls = React.memo(function BumpathBottomControls({
    handleReset,
    prefixText,
    handlePrefixTextChange,
    handleApplyPrefix,
    selectedEntriesSize,
    debouncedPrefixText,
    handleSelectOutputDir,
    isProcessing,
    handleProcess,
    handleOpenQuickRepath,
    quickRepathDisabled,
    scannedData,
    outputPath,
    setConsoleOpen,
    settingsExpanded,
    setSettingsExpanded,
    setSettingsAutoOpened,
}: BumpathBottomControlsProps) {
    return (
        <Box
            sx={{
                p: 1.5,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'wrap',
                minHeight: '70px',
            }}
        >
            <Button
                startIcon={<CloseIcon />}
                onClick={handleReset}
                sx={getActionButtonSx('#ef4444')}
            >
                Reset
            </Button>

            <DebouncedTextField
                value={prefixText}
                onValueChange={handlePrefixTextChange}
                debounceMs={100}
                data-bumpath-prefix
                sx={{
                    width: '110px',
                    ...inputSx,
                    '& .MuiInputBase-input': {
                        ...inputInputSx,
                        textAlign: 'center',
                        fontWeight: 600,
                    },
                }}
            />

            <Button
                startIcon={<EditIcon />}
                onClick={handleApplyPrefix}
                disabled={selectedEntriesSize === 0 || !debouncedPrefixText.trim()}
                sx={getActionButtonSx('#8b5cf6')}
            >
                Apply Prefix
            </Button>

            <Button
                startIcon={<FolderIcon />}
                onClick={handleSelectOutputDir}
                data-bumpath-output
                color="inherit"
                sx={getActionButtonSx('#06b6d4')}
            >
                Select Output
            </Button>

            <Button
                startIcon={isProcessing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                onClick={handleProcess}
                disabled={isProcessing || !scannedData || !outputPath}
                data-bumpath-process
                sx={getActionButtonSx('#f97316', { minWidth: '120px', prominent: true })}
            >
                {isProcessing ? 'Processing...' : 'Bum'}
            </Button>
            <Button
                startIcon={<AutoFixHighIcon />}
                onClick={handleOpenQuickRepath}
                disabled={quickRepathDisabled}
                sx={getActionButtonSx('#8b5cf6', { minWidth: '150px', prominent: true })}
            >
                Quick Repath
            </Button>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
                <Button
                    onClick={() => setConsoleOpen(true)}
                    sx={getActionButtonSx('var(--accent2)', { iconOnly: true, height: '36px', px: 0 })}
                >
                    <TerminalIcon />
                </Button>

                <Button
                    onClick={() => {
                        setSettingsExpanded(!settingsExpanded);
                        setSettingsAutoOpened(false);
                    }}
                    data-bumpath-settings
                    sx={getActionButtonSx('var(--accent)', { iconOnly: true, height: '36px', px: 0 })}
                >
                    <SettingsIcon />
                </Button>
            </Box>
        </Box>
    );
});

export default BumpathBottomControls;
