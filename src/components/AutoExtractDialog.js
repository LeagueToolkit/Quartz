import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Typography,
    Divider,
    IconButton,
    Tooltip,
    Switch,
    FormControlLabel,
} from '@mui/material';
import { FolderOpen, AutoFixHigh, Close } from '@mui/icons-material';
import { getModFiles } from '../utils/modAutoProcessor';

const AutoExtractDialog = ({ open, onClose, onProcess }) => {
    const [modPaths, setModPaths] = useState([]);
    const [outputPath, setOutputPath] = useState('');
    const [skinId, setSkinId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadToTree, setLoadToTree] = useState(true);

    const handleSelectFolder = async (target) => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openDirectory', {
            properties: target === 'mod' ? ['openDirectory', 'multiSelections'] : ['openDirectory']
        });

        if (result && !result.canceled && result.filePaths.length > 0) {
            if (target === 'mod') {
                console.log(`[AutoExtractDialog] Selected ${result.filePaths.length} mod folder(s):`, result.filePaths);
                setModPaths(result.filePaths);
            }
            else setOutputPath(result.filePaths[0]);
        }
    };

    const handleRun = async () => {
        if (modPaths.length === 0) return;
        setIsProcessing(true);
        try {
            const batchFiles = [];
            for (const path of modPaths) {
                const results = await getModFiles(path, skinId);
                if (results && results.length > 0) {
                    // Extract folder name from path
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
                onProcess({
                    batchFiles,
                    outputPath,
                    loadToTree,
                    skinId
                });
                onClose();
            } else {
                alert('No BNK files found in the specified mod folders.');
            }
        } catch (e) {
            console.error(e);
            alert('Error scanning mod folders: ' + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const inputStyle = {
        '& .MuiOutlinedInput-root': {
            background: 'rgba(0, 0, 0, 0.4)',
            color: 'white',
            fontSize: '0.8rem',
            fontFamily: 'JetBrains Mono, monospace',
            '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
            '&:hover fieldset': { borderColor: 'rgba(var(--accent-rgb), 0.5)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.8rem' },
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    background: 'rgba(25, 25, 30, 0.95)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    maxWidth: '500px',
                    width: '100%'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoFixHigh sx={{ color: 'var(--accent)' }} />
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>Batch Mod Processor</Typography>
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <Close />
                </IconButton>
            </DialogTitle>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
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
                            <Button
                                variant="outlined"
                                onClick={() => handleSelectFolder('mod')}
                                sx={{ minWidth: '40px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                            >
                                <FolderOpen fontSize="small" />
                            </Button>
                            {modPaths.length > 0 && (
                                <IconButton size="small" onClick={() => setModPaths([])} sx={{ color: '#ff6666' }}>
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
                            <Button
                                variant="outlined"
                                onClick={() => handleSelectFolder('output')}
                                sx={{ minWidth: '40px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                            >
                                <FolderOpen fontSize="small" />
                            </Button>
                        </Box>
                    </Box>

                    <Box>
                        <Typography sx={{ fontSize: '0.7rem', opacity: 0.5, mb: 1, letterSpacing: '0.05em' }}>SKIN ID (OPTIONAL)</Typography>
                        <TextField
                            fullWidth
                            placeholder="e.g. 45"
                            value={skinId}
                            onChange={(e) => setSkinId(e.target.value)}
                            size="small"
                            sx={inputStyle}
                        />
                    </Box>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={loadToTree}
                                onChange={(e) => setLoadToTree(e.target.checked)}
                                size="small"
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent)' },
                                }}
                            />
                        }
                        label={<Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'JetBrains Mono' }}>LOAD INTO TREE VIEW</Typography>}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2, background: 'rgba(0,0,0,0.2)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.6)' }}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleRun}
                    disabled={modPaths.length === 0 || isProcessing}
                    sx={{
                        background: outputPath ? 'var(--accent)' : 'rgba(255, 255, 255, 0.9)',
                        color: 'black',
                        fontWeight: 700,
                        '&:hover': { background: 'white' },
                        '&.Mui-disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                    }}
                >
                    {isProcessing ? 'Processing...' : (outputPath ? 'Batch Auto-Extract' : 'Batch Parse Only')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AutoExtractDialog;
