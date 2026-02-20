import React from 'react';
import { Menu, MenuItem, Divider, Typography, Box } from '@mui/material';

export default function BnkHistoryMenu({
    historyAnchor,
    setHistoryAnchor,
    history,
    setHistory,
    setBinPath,
    setWpkPath,
    setBnkPath,
}) {
    return (
        <Menu
            anchorEl={historyAnchor}
            open={Boolean(historyAnchor)}
            onClose={() => setHistoryAnchor(null)}
            PaperProps={{
                sx: {
                    background: 'rgba(30,30,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    color: 'white',
                    maxWidth: '400px',
                    '& .MuiMenuItem-root': {
                        fontSize: '0.7rem',
                        fontFamily: 'JetBrains Mono, monospace',
                        py: 1,
                        '&:hover': { background: 'rgba(var(--accent-rgb), 0.2)' },
                    },
                },
            }}
        >
            <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: '0.6rem', opacity: 0.5, letterSpacing: '0.1em' }}>
                RECENT FILES
            </Typography>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 0.5 }} />
            {history.length === 0 ? (
                <MenuItem disabled>No recent files</MenuItem>
            ) : (
                history.map((entry) => (
                    <MenuItem
                        key={entry.id}
                        onClick={() => {
                            setBinPath(entry.paths.bin);
                            setWpkPath(entry.paths.wpk);
                            setBnkPath(entry.paths.bnk);
                            setHistoryAnchor(null);
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography sx={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                                {entry.label}
                            </Typography>
                            <Typography sx={{ fontSize: '0.6rem', opacity: 0.4 }}>
                                {new Date(entry.timestamp).toLocaleString()}
                            </Typography>
                        </Box>
                    </MenuItem>
                ))
            )}
            {history.length > 0 && (
                <>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                    <MenuItem onClick={() => { setHistory([]); setHistoryAnchor(null); }} sx={{ color: '#ff6666' }}>
                        Clear History
                    </MenuItem>
                </>
            )}
        </Menu>
    );
}
