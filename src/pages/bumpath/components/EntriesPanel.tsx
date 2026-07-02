import React from 'react';
import { Box, CircularProgress, List, ListItem, Typography } from '@mui/material';
import { ChevronRight as ChevronRightIcon, ExpandMore as ExpandMoreIcon, Check as CheckIcon, CheckBox as CheckBoxIcon, Clear as ClearIcon } from '@mui/icons-material';
import { groupReferencedFiles } from '../utils/referencedFiles';
import type { ScannedData, ScannedEntry } from '../utils/types';

interface EntriesPanelProps {
    isScanning: boolean;
    scannedData: ScannedData | null;
    filteredEntries: Array<[string, ScannedEntry]>;
    expandedEntries: Set<string>;
    selectedEntries: Set<string>;
    expandedFilePaths: Set<string>;
    appliedPrefixes: Map<string, string>;
    showMissingOnly: boolean;
    setShowMissingOnly: (value: boolean) => void;
    selectedEntriesSize: number;
    handleSelectAll: () => void;
    handleDeselectAll: () => void;
    getEntryDisplayName: (entryHash: string, entryData: ScannedEntry) => string;
    handleEntryExpand: (entryHash: string) => void;
    handleEntrySelect: (entryHash: string) => void;
    handleFilePathExpand: (filePath: string) => void;
}

const EntriesPanel = React.memo(function EntriesPanel({
    isScanning,
    scannedData,
    filteredEntries,
    expandedEntries,
    selectedEntries,
    expandedFilePaths,
    appliedPrefixes,
    showMissingOnly,
    setShowMissingOnly,
    selectedEntriesSize,
    handleSelectAll,
    handleDeselectAll,
    getEntryDisplayName,
    handleEntryExpand,
    handleEntrySelect,
    handleFilePathExpand,
}: EntriesPanelProps) {
    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* List header: entry selection + missing-only filter (moved out of
                the top bar so it sits directly above the entries it acts on). */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderBottom: '1px solid var(--border)',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    type="button"
                    className="dl-btn dl-btn--secondary dl-btn--sm"
                    onClick={handleSelectAll}
                    disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
                    data-bumpath-select-all
                >
                    <span className="dl-icon"><CheckBoxIcon /></span>
                    <span>Select All</span>
                </button>

                <button
                    type="button"
                    className="dl-btn dl-btn--danger dl-btn--sm"
                    onClick={handleDeselectAll}
                    disabled={!scannedData || selectedEntriesSize === 0}
                >
                    <span className="dl-icon"><ClearIcon /></span>
                    <span>Deselect All</span>
                </button>

                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        marginLeft: 'auto',
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

            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                {isScanning ? (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            gap: 2,
                        }}
                    >
                        <CircularProgress sx={{ color: 'var(--accent-primary)' }} />
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                            Scanning BIN files...
                        </Typography>
                    </Box>
                ) : scannedData ? (
                    <List dense>
                        {filteredEntries.map(([entryHash, entryData]) => (
                            <ListItem
                                key={entryHash}
                                sx={{
                                    px: 1,
                                    py: 0.5,
                                    borderBottom: '1px solid var(--border)',
                                    '&:hover': { backgroundColor: 'var(--bg-hover)' },
                                }}
                            >
                                <Box sx={{ width: '100%' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <button
                                            type="button"
                                            className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost"
                                            onClick={() => handleEntryExpand(entryHash)}
                                        >
                                            <span className="dl-icon">
                                                {expandedEntries.has(entryHash) ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                                            </span>
                                        </button>

                                        <label className="dl-check">
                                            <input
                                                type="checkbox"
                                                checked={selectedEntries.has(entryHash)}
                                                onChange={() => handleEntrySelect(entryHash)}
                                                disabled={entryData.prefix === 'Uneditable'}
                                            />
                                            <span className="dl-check__box">
                                                <span className="dl-check__tick">
                                                    <span className="dl-icon"><CheckIcon /></span>
                                                </span>
                                            </span>
                                        </label>

                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '600',
                                                        fontFamily: 'var(--font-mono)',
                                                        flex: '1 1 auto',
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {getEntryDisplayName(entryHash, entryData)}
                                                </Typography>
                                                <Box
                                                    sx={{
                                                        backgroundColor: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                                                        border: '1px solid color-mix(in oklab, var(--accent-primary) 24%, transparent)',
                                                        borderRadius: '3px',
                                                        px: 0.5,
                                                        py: 0.25,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        flex: '0 0 auto',
                                                    }}
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        sx={{
                                                            color: 'var(--accent-primary)',
                                                            fontSize: '0.65rem',
                                                            fontWeight: '600',
                                                            fontFamily: 'var(--font-mono)',
                                                            lineHeight: 1,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {appliedPrefixes.get(entryHash) || entryData.prefix || 'No Prefix'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            {expandedEntries.has(entryHash) && (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'var(--font-mono)',
                                                        opacity: 0.7,
                                                        display: 'block',
                                                        width: '100%',
                                                    }}
                                                >
                                                    {entryData.type_name ? `${entryData.type_name} | Hash: ${entryHash}` : `Hash: ${entryHash}`}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>

                                    {expandedEntries.has(entryHash) && (
                                        <Box sx={{ ml: 4 }}>
                                            {(() => {
                                                const { missingFiles, existingFiles } = groupReferencedFiles(entryData);
                                                const result: React.ReactNode[] = [];

                                                missingFiles.forEach((textureFiles, missingPath) => {
                                                    const isExpanded = expandedFilePaths.has(missingPath);
                                                    result.push(
                                                        <Box key={`missing-${missingPath}`} sx={{ mb: 0.5 }}>
                                                            <Box
                                                                sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 1,
                                                                    cursor: 'pointer',
                                                                    opacity: 1,
                                                                    '&:hover': {
                                                                        backgroundColor: 'var(--bg-hover)',
                                                                        borderRadius: '4px',
                                                                    },
                                                                    py: 0.25,
                                                                    px: 0.5,
                                                                }}
                                                                onClick={() => handleFilePathExpand(missingPath)}
                                                            >
                                                                <span
                                                                    className="dl-icon"
                                                                    style={{ color: 'var(--text-secondary)', width: '0.9rem', height: '0.9rem' }}
                                                                >
                                                                    {isExpanded ? (
                                                                        <ExpandMoreIcon sx={{ fontSize: '0.9rem' }} />
                                                                    ) : (
                                                                        <ChevronRightIcon sx={{ fontSize: '0.9rem' }} />
                                                                    )}
                                                                </span>
                                                                <Box
                                                                    sx={{
                                                                        width: 8,
                                                                        height: 8,
                                                                        borderRadius: '50%',
                                                                        backgroundColor: 'var(--color-danger)',
                                                                        flexShrink: 0,
                                                                    }}
                                                                />
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '600',
                                                                        fontFamily: 'var(--font-mono)',
                                                                        wordBreak: 'break-all',
                                                                    }}
                                                                >
                                                                    {missingPath}
                                                                </Typography>
                                                            </Box>

                                                            {isExpanded && textureFiles.length > 0 && (
                                                                <Box sx={{ ml: 4, mt: 0.25 }}>
                                                                    {textureFiles.map((textureFile, texIndex) => (
                                                                        <Box
                                                                            key={`tex-${texIndex}`}
                                                                            sx={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: 1,
                                                                                mb: 0.5,
                                                                                opacity: showMissingOnly && textureFile.exists ? 0.3 : 1,
                                                                            }}
                                                                        >
                                                                            <Box
                                                                                sx={{
                                                                                    width: 8,
                                                                                    height: 8,
                                                                                    borderRadius: '50%',
                                                                                    backgroundColor: textureFile.exists ? 'var(--color-success)' : 'var(--color-danger)',
                                                                                    flexShrink: 0,
                                                                                }}
                                                                            />
                                                                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '0.7rem', wordBreak: 'break-all' }}>
                                                                                {textureFile.path}
                                                                            </Typography>
                                                                        </Box>
                                                                    ))}
                                                                </Box>
                                                            )}
                                                        </Box>,
                                                    );
                                                });

                                                existingFiles.forEach((file, index) => {
                                                    result.push(
                                                        <Box
                                                            key={`existing-${index}`}
                                                            sx={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 1,
                                                                mb: 0.5,
                                                                opacity: showMissingOnly && file.exists ? 0.3 : 1,
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    backgroundColor: file.exists ? 'var(--color-success)' : 'var(--color-danger)',
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '0.7rem', wordBreak: 'break-all' }}>
                                                                {file.path}
                                                            </Typography>
                                                        </Box>,
                                                    );
                                                });

                                                return result;
                                            })()}
                                        </Box>
                                    )}
                                </Box>
                            </ListItem>
                        ))}
                    </List>
                ) : (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            flexDirection: 'column',
                            gap: 1.2,
                            textAlign: 'center',
                            px: 2,
                        }}
                    >
                        <Typography variant="h6" sx={{ color: 'var(--text-secondary)' }}>
                            No scanned data
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                            Drag and drop a source folder into Bumpath, or click "Add Source Folders" to begin.
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', opacity: 0.8, fontSize: '0.78rem' }}>
                            Then select a main BIN and continue with Quick Repath (recommended) or the normal flow.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
});

export default EntriesPanel;
