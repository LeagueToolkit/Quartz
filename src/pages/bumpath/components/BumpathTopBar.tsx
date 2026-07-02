import React from 'react';
import { Box } from '@mui/material';
import { CheckBox as CheckBoxIcon, Clear as ClearIcon } from '@mui/icons-material';
import type { ScannedData } from '../utils/types';

interface BumpathTopBarProps {
    handleSelectAll: () => void;
    handleDeselectAll: () => void;
    scannedData: ScannedData | null;
    selectedEntriesSize: number;
    showMissingOnly: boolean;
    setShowMissingOnly: (value: boolean) => void;
}

const BumpathTopBar = React.memo(function BumpathTopBar({
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
                borderBottom: '1px solid var(--border)',
                minHeight: '60px',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <button
                    type="button"
                    className="dl-btn dl-btn--secondary"
                    onClick={handleSelectAll}
                    disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
                    data-bumpath-select-all
                >
                    <span className="dl-icon"><CheckBoxIcon /></span>
                    <span>Select All</span>
                </button>

                <button
                    type="button"
                    className="dl-btn dl-btn--danger"
                    onClick={handleDeselectAll}
                    disabled={!scannedData || selectedEntriesSize === 0}
                >
                    <span className="dl-icon"><ClearIcon /></span>
                    <span>Deselect All</span>
                </button>
            </Box>

            <label
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                <span className="dl-toggle">
                    <input
                        type="checkbox"
                        checked={showMissingOnly}
                        onChange={(e) => setShowMissingOnly(e.target.checked)}
                    />
                    <span className="dl-toggle__track" />
                    <span className="dl-toggle__thumb" />
                </span>
                <span
                    style={{
                        color: showMissingOnly ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        transition: 'color 180ms ease',
                    }}
                >
                    Show Missing Files Only
                </span>
            </label>
        </Box>
    );
});

export default BumpathTopBar;
