import React from 'react';
import { Box, CircularProgress } from '@mui/material';
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
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'wrap',
                minHeight: '70px',
            }}
        >
            <button
                type="button"
                className="dl-btn dl-btn--danger"
                onClick={handleReset}
            >
                <span className="dl-icon"><CloseIcon /></span>
                <span>Reset</span>
            </button>

            <DebouncedTextField
                value={prefixText}
                onValueChange={handlePrefixTextChange}
                debounceMs={100}
                data-bumpath-prefix
                style={{ width: '110px', textAlign: 'center', fontWeight: 600 }}
            />

            <button
                type="button"
                className="dl-btn dl-btn--primary"
                onClick={handleApplyPrefix}
                disabled={selectedEntriesSize === 0 || !debouncedPrefixText.trim()}
            >
                <span className="dl-icon"><EditIcon /></span>
                <span>Apply Prefix</span>
            </button>

            <button
                type="button"
                className="dl-btn dl-btn--secondary"
                onClick={handleSelectOutputDir}
                data-bumpath-output
            >
                <span className="dl-icon"><FolderIcon /></span>
                <span>Select Output</span>
            </button>

            <button
                type="button"
                className="dl-btn dl-btn--primary"
                onClick={handleProcess}
                disabled={isProcessing || !scannedData || !outputPath}
                data-bumpath-process
                style={{ minWidth: '120px' }}
            >
                <span className="dl-icon">
                    {isProcessing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                </span>
                <span>{isProcessing ? 'Processing...' : 'Bum'}</span>
            </button>
            <button
                type="button"
                className="dl-btn dl-btn--primary"
                onClick={handleOpenQuickRepath}
                disabled={quickRepathDisabled}
                style={{ minWidth: '150px' }}
            >
                <span className="dl-icon"><AutoFixHighIcon /></span>
                <span>Quick Repath</span>
            </button>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
                <button
                    type="button"
                    className="dl-btn dl-btn--icon dl-btn--secondary"
                    onClick={() => setConsoleOpen(true)}
                    title="Console"
                >
                    <span className="dl-icon"><TerminalIcon /></span>
                </button>

                <button
                    type="button"
                    className="dl-btn dl-btn--icon dl-btn--primary"
                    onClick={() => {
                        setSettingsExpanded(!settingsExpanded);
                        setSettingsAutoOpened(false);
                    }}
                    data-bumpath-settings
                    title="Settings"
                >
                    <span className="dl-icon"><SettingsIcon /></span>
                </button>
            </Box>
        </Box>
    );
});

export default BumpathBottomControls;
