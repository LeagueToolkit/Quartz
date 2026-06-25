import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';

interface BumpathSettingsDialogProps {
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    hashesPath: string;
}

const BumpathSettingsDialog = React.memo(function BumpathSettingsDialog({
    settingsOpen,
    setSettingsOpen,
    hashesPath,
}: BumpathSettingsDialogProps) {
    return (
        <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                Bumpath Settings
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField
                        fullWidth
                        label="Hash Directory (Automatic)"
                        value={hashesPath}
                        placeholder="Loading..."
                        InputProps={{
                            readOnly: true,
                        }}
                        helperText="Hash files are automatically managed. Use Settings page to download/update hash files."
                        data-bumpath-hash-dir
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                color: 'var(--text-primary)',
                                backgroundColor: 'var(--bg-tertiary)',
                            },
                            '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                            '& .MuiFormHelperText-root': { color: 'var(--text-muted)', fontSize: '0.75rem' },
                        }}
                    />
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        Hash files are downloaded automatically from CommunityDragon.
                        Go to Settings -&gt; Hash Files section to download or update hash files.
                    </Typography>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setSettingsOpen(false)} sx={{ color: 'var(--text-secondary)' }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
});

export default BumpathSettingsDialog;
