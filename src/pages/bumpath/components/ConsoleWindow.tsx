import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    IconButton,
    TextField,
} from '@mui/material';
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

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: 'color-mix(in oklab, var(--bg-secondary) 95%, transparent)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    minHeight: '600px',
                },
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: 'var(--text-primary)',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                }}
            >
                🖥️ Bumpath Console
                <IconButton onClick={onClose} sx={{ color: 'var(--text-primary)' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ padding: 0 }}>
                {/* Filter and Controls */}
                <Box
                    sx={{
                        padding: '16px',
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-tertiary)',
                    }}
                >
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <TextField
                            size="small"
                            placeholder="Filter logs..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            sx={{
                                flexGrow: 1,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'var(--bg-tertiary)',
                                    color: 'var(--text-primary)',
                                    '& fieldset': {
                                        borderColor: 'var(--border)',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'var(--border-strong)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: 'var(--accent-primary)',
                                    },
                                },
                                '& .MuiInputBase-input': {
                                    color: 'var(--text-primary)',
                                },
                            }}
                        />
                        <IconButton onClick={handleClear} sx={{ color: 'var(--text-primary)' }}>
                            <ClearIcon />
                        </IconButton>
                        {onRefresh && (
                            <IconButton onClick={onRefresh} sx={{ color: 'var(--text-primary)' }}>
                                <RefreshIcon />
                            </IconButton>
                        )}
                        <IconButton onClick={handleDownload} sx={{ color: 'var(--text-primary)' }}>
                            <DownloadIcon />
                        </IconButton>
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
            </DialogContent>

            <DialogActions
                sx={{
                    padding: '16px',
                    borderTop: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-tertiary)',
                }}
            >
                <Button onClick={onClose} sx={{ color: 'var(--text-primary)' }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ConsoleWindow;
