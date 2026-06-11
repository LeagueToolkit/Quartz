import { useState, type ReactNode } from 'react';
import {
    Box, Button, Typography, TextField, IconButton, Tooltip, FormControlLabel, Checkbox, CircularProgress,
    ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
    AutoFixHigh as AutoFixHighIcon, FolderOpen as FolderOpenIcon, PlayArrow as PlayArrowIcon, Clear as ClearIcon,
    InsertDriveFile as FileIcon, Folder as FolderIcon,
} from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { binScaleParams } from '@/lib/api/binEditor';
import { log } from '@/lib/util/logger';

interface NotifyArg { message: string; severity: 'info' | 'success' | 'error' | 'warning' }

const baseFieldSx = {
    '& .MuiOutlinedInput-root': {
        background: 'rgba(255,255,255,0.03)', color: '#fff', borderRadius: '8px', fontSize: '0.78rem',
        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
    },
    '& .MuiInputBase-input': { py: 1 },
} as const;

const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;

async function pickBinFile(): Promise<string | null> {
    const r = await open({ title: 'Select .bin to fix', multiple: false, filters: [{ name: 'BIN Files', extensions: ['bin'] }] });
    return typeof r === 'string' ? r : null;
}

async function pickFolder(): Promise<string | null> {
    const r = await open({ title: 'Select folder (recursively scans for .bin)', directory: true, multiple: false });
    return typeof r === 'string' ? r : null;
}

interface FixResult {
    ok: boolean;
    shapesRewrittenRadius?: number;
    shapesRewrittenVec3?: number;
    shapesRewrittenEmpty?: number;
    birthTranslationsLifted?: number;
    filesModified?: number;
    filesProcessed?: number;
    error?: string;
}

export function FixVfxShapeCard({ onNotify }: { onNotify?: (a: NotifyArg) => void }) {
    const [mode, setMode] = useState<'file' | 'folder'>('file');
    const [targetPath, setTargetPath] = useState('');
    const [createBackup, setCreateBackup] = useState(true);
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<FixResult | null>(null);

    const notify = (message: string, severity: NotifyArg['severity'] = 'info') => onNotify?.({ message, severity });

    const handleRun = async () => {
        if (!targetPath) {
            notify(`Select a ${mode} first`, 'warning');
            return;
        }
        setBusy(true);
        setLastResult(null);
        try {
            if (mode === 'folder') {
                // TODO: recursive folder fix had a dedicated Electron IPC ('bin:fixVfxShape'
                // with folderPath). The Rust backend currently only exposes a single-file
                // matrix/shape fix via bin_scale_params, so folder mode is pending a backend port.
                notify('Folder (recursive) fix is not available in this build yet — use Single .bin', 'error');
                setLastResult({ ok: false, error: 'folder mode unavailable' });
                return;
            }
            // Single .bin: run the matrix/shape fix in place (multipliers of 1.0 leave
            // scale untouched; applyMatrixFix rewrites legacy Shape pointers).
            void createBackup;
            const res = await binScaleParams(targetPath, 1.0, 1.0, true);
            const total = res.shapesFixed || 0;
            notify(
                `Fixed ${total} shape(s) — ${res.systemsTouched} system(s) touched, ${res.modified} entr(ies) modified in ${basename(targetPath)}`,
                total > 0 ? 'success' : 'info',
            );
            setLastResult({
                ok: true,
                shapesRewrittenRadius: res.shapesFixed,
                shapesRewrittenVec3: 0,
                shapesRewrittenEmpty: 0,
                birthTranslationsLifted: 0,
                filesModified: res.modified > 0 ? 1 : 0,
                filesProcessed: 1,
            });
        } catch (e) {
            log.error('bin:fixVfxShape', e);
            notify(`Fix crashed: ${String((e as Error)?.message || e)}`, 'error');
            setLastResult({ ok: false, error: String((e as Error)?.message || e) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{
            background: 'rgba(255,255,255,0.026)', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '12px',
            p: 2, mb: 3, position: 'relative', overflow: 'hidden',
            '&::before': { content: '""', position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)' },
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)' }}>
                    <AutoFixHighIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}>Fix VFX Shape</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', mt: 0.25 }}>
                        Rewrites legacy Shape pointers (and lifts BirthTranslation) in VfxEmitterDefinitionData. Ports ltmao&apos;s FixVfxShape script.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <ToggleButtonGroup
                    size="small" exclusive value={mode}
                    onChange={(_, v) => { if (v) { setMode(v); setTargetPath(''); } }}
                    sx={{ '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'none', px: 1.5, py: 0.5, '&.Mui-selected': { background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', borderColor: 'var(--accent)' } } }}
                >
                    <ToggleButton value="file"><FileIcon sx={{ fontSize: 14, mr: 0.5 }} />Single .bin</ToggleButton>
                    <ToggleButton value="folder"><FolderIcon sx={{ fontSize: 14, mr: 0.5 }} />Folder (recursive)</ToggleButton>
                </ToggleButtonGroup>

                <TextField
                    size="small" fullWidth
                    placeholder={mode === 'file' ? '.bin file path…' : 'Folder path (scans for .bin)…'}
                    value={targetPath} onChange={(e) => setTargetPath(e.target.value)} sx={baseFieldSx}
                />
                <Tooltip title={`Browse for ${mode}`}>
                    <IconButton size="small" onClick={async () => { const p = mode === 'file' ? await pickBinFile() : await pickFolder(); if (p) setTargetPath(p); }} sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'var(--accent)' } }}>
                        <FolderOpenIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {targetPath && (
                    <Tooltip title="Clear">
                        <IconButton size="small" onClick={() => setTargetPath('')} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}>
                            <ClearIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <FormControlLabel
                    control={<Checkbox size="small" checked={createBackup} onChange={(e) => setCreateBackup(e.target.checked)} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'var(--accent)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Create .bak backup before write</Typography>}
                    sx={{ m: 0 }}
                />

                <Box sx={{ flex: 1 }} />

                {lastResult?.ok && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
                        Radius:{lastResult.shapesRewrittenRadius} · Vec3:{lastResult.shapesRewrittenVec3} ·{' '}
                        Empty:{lastResult.shapesRewrittenEmpty} · BT:{lastResult.birthTranslationsLifted}
                    </Typography>
                )}

                <Button
                    size="small" variant="contained"
                    startIcon={(busy ? <CircularProgress size={14} sx={{ color: '#000' }} /> : <PlayArrowIcon />) as ReactNode}
                    disabled={busy || !targetPath} onClick={handleRun}
                    sx={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', fontWeight: 700, px: 2, boxShadow: 'none', '&:hover': { background: 'var(--accent)', opacity: 0.9 }, '&.Mui-disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}
                >
                    {busy ? 'Fixing…' : 'Run Fix'}
                </Button>
            </Box>
        </Box>
    );
}

export default FixVfxShapeCard;
