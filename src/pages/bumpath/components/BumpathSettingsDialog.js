import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';

const BumpathSettingsDialog = React.memo(function BumpathSettingsDialog({ settingsOpen, setSettingsOpen, hashesPath }) {
  return (
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
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
                color: 'var(--accent)',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
              },
              '& .MuiInputLabel-root': { color: 'var(--accent2)' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent2)' },
              '& .MuiFormHelperText-root': { color: 'var(--accent-muted)', fontSize: '0.75rem' },
            }}
          />
          <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.8rem' }}>
            Hash files are downloaded automatically from CommunityDragon.
            Go to Settings -> Hash Files section to download or update hash files.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setSettingsOpen(false)} sx={{ color: 'var(--accent2)' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default BumpathSettingsDialog;
