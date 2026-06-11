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
        // Color code different types of logs
        let color = '#ffffff';
        if (logLine.includes('❌') || logLine.includes('Error') || logLine.includes('Failed')) {
            color = '#ff6b6b';
        } else if (logLine.includes('✅') || logLine.includes('Success') || logLine.includes('Completed')) {
            color = '#51cf66';
        } else if (logLine.includes('⚠️') || logLine.includes('Warning')) {
            color = '#ffd43b';
        } else if (logLine.includes('🔗') || logLine.includes('Combining')) {
            color = '#74c0fc';
        } else if (logLine.includes('📋') || logLine.includes('Copying')) {
            color = '#ffa8a8';
        } else if (logLine.includes('🔧') || logLine.includes('Repathing')) {
            color = '#ffd43b';
        }

        return (
            <Box
                key={index}
                sx={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color,
                    padding: '2px 8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
                    backgroundColor: 'rgba(20, 20, 30, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
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
                    color: '#ffffff',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                }}
            >
                🖥️ Bumpath Console
                <IconButton onClick={onClose} sx={{ color: '#ffffff' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ padding: 0 }}>
                {/* Filter and Controls */}
                <Box
                    sx={{
                        padding: '16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
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
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    color: '#ffffff',
                                    '& fieldset': {
                                        borderColor: 'rgba(255, 255, 255, 0.2)',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#74c0fc',
                                    },
                                },
                                '& .MuiInputBase-input': {
                                    color: '#ffffff',
                                },
                            }}
                        />
                        <IconButton onClick={handleClear} sx={{ color: '#ffffff' }}>
                            <ClearIcon />
                        </IconButton>
                        {onRefresh && (
                            <IconButton onClick={onRefresh} sx={{ color: '#ffffff' }}>
                                <RefreshIcon />
                            </IconButton>
                        )}
                        <IconButton onClick={handleDownload} sx={{ color: '#ffffff' }}>
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
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        '&::-webkit-scrollbar': {
                            width: '8px',
                        },
                        '&::-webkit-scrollbar-track': {
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        },
                        '&::-webkit-scrollbar-thumb': {
                            backgroundColor: 'rgba(255, 255, 255, 0.3)',
                            borderRadius: '4px',
                        },
                        '&::-webkit-scrollbar-thumb:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        },
                    }}
                >
                    {filteredLogs.length === 0 ? (
                        <Box
                            sx={{
                                padding: '20px',
                                textAlign: 'center',
                                color: 'rgba(255, 255, 255, 0.5)',
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
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    }}
                >
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        Showing {filteredLogs.length} of {logs.length} log entries
                        {filter && ` (filtered by "${filter}")`}
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions
                sx={{
                    padding: '16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                }}
            >
                <Button onClick={onClose} sx={{ color: '#ffffff' }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ConsoleWindow;
