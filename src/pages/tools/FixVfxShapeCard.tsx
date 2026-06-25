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
import { toolsFixVfxShape } from '@/lib/api/vfxTools';
import { log } from '@/lib/util/logger';

interface NotifyArg { message: string; severity: 'info' | 'success' | 'error' | 'warning' }

const baseFieldSx = {
    '& .MuiOutlinedInput-root': {
        background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
        '& fieldset': { borderColor: 'var(--border)' },
        '&:hover fieldset': { borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, var(--border))' },
        '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
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
            const res = await toolsFixVfxShape(
                mode === 'folder' ? { folderPath: targetPath } : { filePath: targetPath },
                createBackup,
            );
            const total = res.shapesRewrittenRadius + res.shapesRewrittenVec3 + res.shapesRewrittenEmpty;
            const where = mode === 'folder'
                ? `${res.filesModified}/${res.filesProcessed} file(s) in ${basename(targetPath)}`
                : basename(targetPath);
            const failed = res.filesFailed > 0 ? ` — ${res.filesFailed} failed` : '';
            notify(
                `Fixed ${total} shape(s), lifted ${res.birthTranslationsLifted} BirthTranslation(s) across ${where}${failed}`,
                res.filesFailed > 0 ? 'warning' : total > 0 || res.birthTranslationsLifted > 0 ? 'success' : 'info',
            );
            setLastResult({
                ok: true,
                shapesRewrittenRadius: res.shapesRewrittenRadius,
                shapesRewrittenVec3: res.shapesRewrittenVec3,
                shapesRewrittenEmpty: res.shapesRewrittenEmpty,
                birthTranslationsLifted: res.birthTranslationsLifted,
                filesModified: res.filesModified,
                filesProcessed: res.filesProcessed,
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
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            p: 2, mb: 3, position: 'relative', overflow: 'hidden',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 25%, transparent)', color: 'var(--accent-primary)' }}>
                    <AutoFixHighIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}>Fix VFX Shape</Typography>
                    <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.7rem', mt: 0.25 }}>
                        Rewrites legacy Shape pointers (and lifts BirthTranslation) in VfxEmitterDefinitionData. Ports ltmao&apos;s FixVfxShape script.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <ToggleButtonGroup
                    size="small" exclusive value={mode}
                    onChange={(_, v) => { if (v) { setMode(v); setTargetPath(''); } }}
                    sx={{ '& .MuiToggleButton-root': { color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'none', px: 1.5, py: 0.5, '&.Mui-selected': { background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } } }}
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
                    <IconButton size="small" onClick={async () => { const p = mode === 'file' ? await pickBinFile() : await pickFolder(); if (p) setTargetPath(p); }} sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--accent-primary)' } }}>
                        <FolderOpenIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                {targetPath && (
                    <Tooltip title="Clear">
                        <IconButton size="small" onClick={() => setTargetPath('')} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--color-danger)' } }}>
                            <ClearIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <FormControlLabel
                    control={<Checkbox size="small" checked={createBackup} onChange={(e) => setCreateBackup(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Create .bak backup before write</Typography>}
                    sx={{ m: 0 }}
                />

                <Box sx={{ flex: 1 }} />

                {lastResult?.ok && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        Radius:{lastResult.shapesRewrittenRadius} · Vec3:{lastResult.shapesRewrittenVec3} ·{' '}
                        Empty:{lastResult.shapesRewrittenEmpty} · BT:{lastResult.birthTranslationsLifted}
                    </Typography>
                )}

                <Button
                    size="small" variant="contained"
                    startIcon={(busy ? <CircularProgress size={14} sx={{ color: 'var(--accent-primary)' }} /> : <PlayArrowIcon />) as ReactNode}
                    disabled={busy || !targetPath} onClick={handleRun}
                    sx={{ background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)', color: 'var(--accent-primary)', border: '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)', borderRadius: 'var(--radius-sm)', textTransform: 'none', fontSize: '0.75rem', fontWeight: 700, px: 2, boxShadow: 'none', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-primary) 60%, transparent)' }, '&.Mui-disabled': { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }}
                >
                    {busy ? 'Fixing…' : 'Run Fix'}
                </Button>
            </Box>
        </Box>
    );
}

export default FixVfxShapeCard;
