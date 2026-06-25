import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Box,
    Button,
} from '@mui/material';
import { AutoFixHigh as AutoFixHighIcon, Tune as TuneIcon } from '@mui/icons-material';
import { getActionButtonSx } from '../utils/styles';

interface SourceAddModeModalProps {
    open: boolean;
    sourceDirLabel: string;
    onQuick: () => void;
    onNormal: () => void;
    onClose: () => void;
}

const SourceAddModeModal = React.memo(function SourceAddModeModal({
    open,
    sourceDirLabel,
    onQuick,
    onNormal,
    onClose,
}: SourceAddModeModalProps) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                },
            }}
        >
            <DialogTitle sx={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                Source Folder Added
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: 'var(--text-secondary)', mb: 1.5 }}>
                    Choose your workflow for this source folder.
                </Typography>
                {sourceDirLabel && (
                    <Box
                        sx={{
                            px: 1.25,
                            py: 0.75,
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-tertiary)',
                            mb: 1,
                        }}
                    >
                        <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                            {sourceDirLabel}
                        </Typography>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button startIcon={<AutoFixHighIcon />} onClick={onQuick} sx={getActionButtonSx('var(--accent-primary)', { prominent: true })}>
                    Quick Repath (Recommended)
                </Button>
                <Button startIcon={<TuneIcon />} onClick={onNormal} sx={getActionButtonSx('var(--color-info)')}>
                    Normal Repath
                </Button>
            </DialogActions>
        </Dialog>
    );
});

export default SourceAddModeModal;
