import React from 'react';
import { CircularProgress } from '@mui/material';
import {
    Edit as EditIcon,
    Folder as FolderIcon,
    PlayArrow as PlayArrowIcon,
    AutoFixHigh as AutoFixHighIcon,
} from '@mui/icons-material';
import { FolderOpen as FolderOpenIcon } from 'lucide-react';
import type { ScannedData } from '../utils/types';

interface BumpathBottomControlsProps {
    handleSelectSourceDir: () => void;
    prefixText: string;
    handlePrefixTextChange: (value: string) => void;
    handleApplyPrefix: () => void;
    selectedEntriesSize: number;
    handleSelectOutputDir: () => void;
    isProcessing: boolean;
    handleProcess: () => void;
    handleOpenQuickRepath: () => void;
    quickRepathDisabled: boolean;
    scannedData: ScannedData | null;
    outputPath: string;
    statusMessage: string;
    statusKind: 'normal' | 'error';
}

const BumpathBottomControls = React.memo(function BumpathBottomControls({
    handleSelectSourceDir,
    prefixText,
    handlePrefixTextChange,
    handleApplyPrefix,
    selectedEntriesSize,
    handleSelectOutputDir,
    isProcessing,
    handleProcess,
    handleOpenQuickRepath,
    quickRepathDisabled,
    scannedData,
    outputPath,
    statusMessage,
    statusKind,
}: BumpathBottomControlsProps) {
    return (
        <div className="bumpath-bottom-bar">
            <div className="bumpath-bottom-bar__group bumpath-bottom-bar__cells">
                <button
                    type="button"
                    className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                    onClick={handleSelectSourceDir}
                    title="Select source folder"
                >
                    <span className="dl-icon"><FolderOpenIcon size={16} /></span>
                </button>

                <input
                    className="dl-input"
                    value={prefixText}
                    onChange={(event) => handlePrefixTextChange(event.target.value)}
                    placeholder="Custom prefix"
                    data-bumpath-prefix
                    style={{ textAlign: 'center', fontWeight: 600 }}
                />

                <button
                    type="button"
                    className="dl-btn dl-btn--primary dl-btn--sm"
                    onClick={handleApplyPrefix}
                    disabled={selectedEntriesSize === 0 || !prefixText.trim()}
                >
                    <span className="dl-icon"><EditIcon /></span>
                    <span>Apply Prefix</span>
                </button>

                <button
                    type="button"
                    className="dl-btn dl-btn--primary dl-btn--sm"
                    onClick={handleOpenQuickRepath}
                    disabled={quickRepathDisabled}
                >
                    <span className="dl-icon"><AutoFixHighIcon /></span>
                    <span>Quick Repath</span>
                </button>
            </div>

            {statusMessage && (
                <span
                    className={`bumpath-bottom-bar__status${statusKind === 'error' ? ' is-error' : ''}`}
                    title={statusMessage}
                >
                    {statusMessage}
                </span>
            )}

            <div className="bumpath-bottom-bar__group bumpath-bottom-bar__cells bumpath-bottom-bar__actions">
                <button
                    type="button"
                    className="dl-btn dl-btn--secondary dl-btn--sm"
                    onClick={handleSelectOutputDir}
                    data-bumpath-output
                >
                    <span className="dl-icon"><FolderIcon /></span>
                    <span>Select Output</span>
                </button>

                <button
                    type="button"
                    className="dl-btn dl-btn--primary dl-btn--sm"
                    onClick={handleProcess}
                    disabled={isProcessing || !scannedData || !outputPath}
                    data-bumpath-process
                >
                    <span className="dl-icon">
                        {isProcessing ? <CircularProgress size={14} /> : <PlayArrowIcon />}
                    </span>
                    <span>{isProcessing ? 'Processing...' : 'Bum'}</span>
                </button>
            </div>
        </div>
    );
});

export default BumpathBottomControls;
