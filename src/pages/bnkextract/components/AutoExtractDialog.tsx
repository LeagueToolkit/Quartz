import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Typography,
    Divider, IconButton, Switch, FormControlLabel,
} from '@mui/material';
import { FolderOpen, AutoFixHigh, Close } from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { log } from '@/lib/util/logger';
import { getModFiles } from '../utils/backend';
import type { AutoExtractRequest, ModFileSet } from '../types';

interface Props {
    open: boolean;
    onClose: () => void;
    onProcess: (req: AutoExtractRequest) => void;
}

const inputStyle = {
    '& .MuiOutlinedInput-root': {
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '0.8rem',
        fontFamily: 'JetBrains Mono, monospace',
        '& fieldset': { borderColor: 'var(--border)' },
        '&:hover fieldset': { borderColor: 'color-mix(in oklab, var(--accent-primary) 50%, transparent)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
    },
    '& .MuiInputLabel-root': { color: 'var(--text-secondary)', fontSize: '0.8rem' },
};

export default function AutoExtractDialog({ open: isOpen, onClose, onProcess }: Props) {
    const [modPaths, setModPaths] = useState<string[]>([]);
    const [outputPath, setOutputPath] = useState('');
    const [skinId, setSkinId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadToTree, setLoadToTree] = useState(true);

    const handleSelectFolder = async (target: 'mod' | 'output') => {
        const picked = await open({ directory: true, multiple: target === 'mod' });
        if (picked == null) return;
        if (target === 'mod') {
            setModPaths(Array.isArray(picked) ? picked : [picked]);
        } else {
            setOutputPath(Array.isArray(picked) ? picked[0] : picked);
        }
    };

    const handleRun = async () => {
        if (modPaths.length === 0) return;
        setIsProcessing(true);
        try {
            const batchFiles: ModFileSet[] = [];
            for (const path of modPaths) {
                const results = (await getModFiles(path, skinId)) as ModFileSet[];
                if (results && results.length > 0) {
                    const pathParts = path.split(/[\\/]/);
                    const baseFolderName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || 'Mod';
                    for (const set of results) {
                        if (set.audio || set.events) {
                            const modFolderName = set.type ? `${baseFolderName} (${set.type})` : baseFolderName;
                            batchFiles.push({ ...set, modFolderName });
                        }
                    }
                }
            }

            if (batchFiles.length > 0) {
                onProcess({ batchFiles, outputPath, loadToTree, skinId });
                onClose();
            }
        } catch (e) {
            log.error('[AutoExtractDialog] scan error', e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            PaperProps={{
                sx: {
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(10px)',
                    maxWidth: '500px',
                    width: '100%',
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoFixHigh sx={{ color: 'var(--accent-primary)' }} />
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>Batch Mod Processor</Typography>
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: 'var(--text-secondary)' }}>
                    <Close />
                </IconButton>
            </DialogTitle>
            <Divider sx={{ borderColor: 'var(--border)' }} />
            <DialogContent sx={{ py: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box>
                        <Typography sx={{ fontSize: '0.7rem', opacity: 0.5, mb: 1, letterSpacing: '0.05em' }}>MOD SOURCE FOLDERS ({modPaths.length})</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                fullWidth
                                placeholder="Select one or more mod folders..."
                                value={modPaths.length > 0 ? `${modPaths.length} folder(s) selected` : ''}
                                InputProps={{ readOnly: true }}
                                size="small"
                                sx={inputStyle}
                            />
                            <Button variant="outlined" onClick={() => handleSelectFolder('mod')} sx={{ minWidth: '40px', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                <FolderOpen fontSize="small" />
                            </Button>
                            {modPaths.length > 0 && (
                                <IconButton size="small" onClick={() => setModPaths([])} sx={{ color: 'var(--color-danger)' }}>
                                    <Close fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    </Box>

                    <Box>
                        <Typography sx={{ fontSize: '0.7rem', opacity: 0.5, mb: 1, letterSpacing: '0.05em' }}>OUTPUT DESTINATION (OPTIONAL)</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                fullWidth
                                placeholder="Leave empty to just parse tree"
                                value={outputPath}
                                onChange={(e) => setOutputPath(e.target.value)}
                                size="small"
                                sx={inputStyle}
                            />
                            <Button variant="outlined" onClick={() => handleSelectFolder('output')} sx={{ minWidth: '40px', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                <FolderOpen fontSize="small" />
                            </Button>
                        </Box>
                    </Box>

                    <Box>
                        <Typography sx={{ fontSize: '0.7rem', opacity: 0.5, mb: 1, letterSpacing: '0.05em' }}>SKIN ID (OPTIONAL)</Typography>
                        <TextField fullWidth placeholder="e.g. 45" value={skinId} onChange={(e) => setSkinId(e.target.value)} size="small" sx={inputStyle} />
                    </Box>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={loadToTree}
                                onChange={(e) => setLoadToTree(e.target.checked)}
                                size="small"
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent-primary)' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent-primary)' },
                                }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>LOAD INTO TREE VIEW</Typography>}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2, background: 'color-mix(in oklab, var(--bg-primary) 20%, transparent)' }}>
                <Button onClick={onClose} sx={{ color: 'var(--text-secondary)' }}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleRun}
                    disabled={modPaths.length === 0 || isProcessing}
                    sx={{
                        background: outputPath ? 'var(--accent-primary)' : 'var(--text-primary)',
                        color: 'var(--bg-primary)',
                        fontWeight: 700,
                        '&:hover': { background: outputPath ? 'var(--accent-hover)' : 'var(--text-primary)' },
                        '&.Mui-disabled': { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' },
                    }}
                >
                    {isProcessing ? 'Processing...' : (outputPath ? 'Batch Auto-Extract' : 'Batch Parse Only')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
