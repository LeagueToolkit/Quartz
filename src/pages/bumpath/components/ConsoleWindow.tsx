import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import {
    Close as CloseIcon,
    Clear as ClearIcon,
    Download as DownloadIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';

interface ConsoleWindowProps {
    open: boolean;
    onClose: () => void;
    logs?: string[];
    onRefresh?: () => void;
}

const ConsoleWindow: React.FC<ConsoleWindowProps> = ({ open, onClose, logs = [], onRefresh }) => {
    const [filter, setFilter] = useState('');
    const [filteredLogs, setFilteredLogs] = useState<string[]>(logs);
    const logContainerRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Filter logs based on search term
    useEffect(() => {
        if (!filter.trim()) {
            setFilteredLogs(logs);
        } else {
            const filtered = logs.filter((logLine) =>
                logLine.toLowerCase().includes(filter.toLowerCase()),
            );
            setFilteredLogs(filtered);
        }
    }, [logs, filter]);

    const handleClear = () => {
        setFilteredLogs([]);
    };

    const handleDownload = () => {
        const logText = filteredLogs.join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bumpath-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const formatLogLine = (logLine: string, index: number) => {
        // Color code different types of logs by severity token
        let color = 'var(--text-primary)';
        if (logLine.includes('❌') || logLine.includes('Error') || logLine.includes('Failed')) {
            color = 'var(--color-danger)';
        } else if (logLine.includes('✅') || logLine.includes('Success') || logLine.includes('Completed')) {
            color = 'var(--color-success)';
        } else if (logLine.includes('⚠️') || logLine.includes('Warning')) {
            color = 'var(--color-warning)';
        } else if (logLine.includes('🔗') || logLine.includes('Combining')) {
            color = 'var(--color-info)';
        } else if (logLine.includes('📋') || logLine.includes('Copying')) {
            color = 'var(--text-secondary)';
        } else if (logLine.includes('🔧') || logLine.includes('Repathing')) {
            color = 'var(--color-warning)';
        }

        return (
            <Box
                key={index}
                sx={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color,
                    padding: '2px 8px',
                    borderBottom: '1px solid var(--border)',
                    '&:hover': {
                        backgroundColor: 'var(--bg-hover)',
                    },
                }}
            >
                {logLine}
            </Box>
        );
    };

    if (!open) return null;

    return (
        <div className="dl-modal-backdrop" onClick={onClose}>
            <div
                className="dl-modal dl-modal--large"
                onClick={(e) => e.stopPropagation()}
                style={{ minHeight: '600px' }}
            >
                <div className="dl-modal__head">
                    <h2 className="dl-modal__title" style={{ fontFamily: 'var(--font-mono)' }}>
                        🖥️ Bumpath Console
                    </h2>
                    <button type="button" className="dl-modal__close" onClick={onClose} title="Close">
                        <span className="dl-icon"><CloseIcon /></span>
                    </button>
                </div>

                <div className="dl-modal__body" style={{ padding: 0, display: 'block' }}>
                    {/* Filter and Controls */}
                    <Box
                        sx={{
                            padding: '16px',
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-tertiary)',
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <input
                                className="dl-input"
                                placeholder="Filter logs..."
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                style={{ flexGrow: 1 }}
                            />
                            <button
                                type="button"
                                className="dl-btn dl-btn--icon dl-btn--secondary"
                                onClick={handleClear}
                                title="Clear"
                            >
                                <span className="dl-icon"><ClearIcon /></span>
                            </button>
                            {onRefresh && (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--icon dl-btn--secondary"
                                    onClick={onRefresh}
                                    title="Refresh"
                                >
                                    <span className="dl-icon"><RefreshIcon /></span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="dl-btn dl-btn--icon dl-btn--secondary"
                                onClick={handleDownload}
                                title="Download"
                            >
                                <span className="dl-icon"><DownloadIcon /></span>
                            </button>
                        </Box>
                    </Box>

                    {/* Log Display */}
                    <Box
                        ref={logContainerRef}
                        sx={{
                            height: '400px',
                            overflow: 'auto',
                            backgroundColor: 'var(--bg-primary)',
                            '&::-webkit-scrollbar': {
                                width: '8px',
                            },
                            '&::-webkit-scrollbar-track': {
                                backgroundColor: 'var(--bg-secondary)',
                            },
                            '&::-webkit-scrollbar-thumb': {
                                backgroundColor: 'var(--bg-hover)',
                                borderRadius: '4px',
                            },
                            '&::-webkit-scrollbar-thumb:hover': {
                                backgroundColor: 'var(--border-strong)',
                            },
                        }}
                    >
                        {filteredLogs.length === 0 ? (
                            <Box
                                sx={{
                                    padding: '20px',
                                    textAlign: 'center',
                                    color: 'var(--text-muted)',
                                    fontStyle: 'italic',
                                }}
                            >
                                No logs to display
                            </Box>
                        ) : (
                            filteredLogs.map((logLine, index) => formatLogLine(logLine, index))
                        )}
                    </Box>

                    {/* Stats */}
                    <Box
                        sx={{
                            padding: '12px 16px',
                            borderTop: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-tertiary)',
                        }}
                    >
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                            Showing {filteredLogs.length} of {logs.length} log entries
                            {filter && ` (filtered by "${filter}")`}
                        </Typography>
                    </Box>
                </div>

                <div className="dl-modal__foot">
                    <button type="button" className="dl-btn dl-btn--secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConsoleWindow;
