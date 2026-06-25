import { useState, type ReactNode } from 'react';
import {
    Box, Button, Typography, TextField, IconButton, Tooltip, FormControlLabel, Checkbox, CircularProgress,
} from '@mui/material';
import {
    Palette as PaletteIcon, FolderOpen as FolderOpenIcon, PlayArrow as PlayArrowIcon, Clear as ClearIcon,
} from '@mui/icons-material';
import { open, save } from '@tauri-apps/plugin-dialog';
import { toolsBinCopyColors } from '@/lib/api/vfxTools';
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
const dirname = (p: string) => {
    const norm = p.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(0, idx) : '';
};

async function pickBinFile(title: string): Promise<string | null> {
    const r = await open({ title, multiple: false, filters: [{ name: 'BIN Files', extensions: ['bin'] }] });
    return typeof r === 'string' ? r : null;
}

async function pickSaveBinFile(defaultPath: string): Promise<string | null> {
    const r = await save({ title: 'Save modified BIN as', defaultPath, filters: [{ name: 'BIN Files', extensions: ['bin'] }] });
    return r ?? null;
}

function PathPicker({ label, value, onChange, onPick }: {
    label: string; value: string; onChange: (v: string) => void; onPick: () => void;
}) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField size="small" fullWidth placeholder={`${label} .bin path…`} value={value} onChange={(e) => onChange(e.target.value)} sx={baseFieldSx} />
            <Tooltip title={`Browse for ${label.toLowerCase()} bin`}>
                <IconButton size="small" onClick={onPick} sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--accent-primary)' } }}>
                    <FolderOpenIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {value && (
                <Tooltip title="Clear">
                    <IconButton size="small" onClick={() => onChange('')} sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--color-danger)' } }}>
                        <ClearIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}

interface CopyResult { ok: boolean; fieldsCopied?: number; entriesMatched?: number; entriesSkipped?: number; outputPath?: string; error?: string }

export function BinColorCopyCard({ onNotify }: { onNotify?: (a: NotifyArg) => void }) {
    const [sourcePath, setSourcePath] = useState('');
    const [targetPath, setTargetPath] = useState('');
    const [overwriteTarget, setOverwriteTarget] = useState(true);
    const [createBackup, setCreateBackup] = useState(true);
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<CopyResult | null>(null);

    const notify = (message: string, severity: NotifyArg['severity'] = 'info') => onNotify?.({ message, severity });

    const handleRun = async () => {
        if (!sourcePath || !targetPath) {
            notify('Select both source and target bins first', 'warning');
            return;
        }
        let outputPath: string | null = null;
        if (!overwriteTarget) {
            const base = basename(targetPath).replace(/\.bin$/i, '');
            const suggested = `${dirname(targetPath)}/${base}_colored.bin`;
            outputPath = await pickSaveBinFile(suggested);
            if (!outputPath) return;
        }
        setBusy(true);
        setLastResult(null);
        try {
            const res = await toolsBinCopyColors(sourcePath, targetPath, outputPath, createBackup);
            notify(
                `Copied ${res.fieldsCopied} color field(s) — ${res.entriesMatched} entr(ies) matched, ${res.entriesSkipped} skipped → ${basename(res.outputPath)}`,
                res.fieldsCopied > 0 ? 'success' : 'info',
            );
            setLastResult({
                ok: true,
                fieldsCopied: res.fieldsCopied,
                entriesMatched: res.entriesMatched,
                entriesSkipped: res.entriesSkipped,
                outputPath: res.outputPath,
            });
        } catch (e) {
            log.error('bin:copyColors', e);
            notify(`Copy crashed: ${String((e as Error)?.message || e)}`, 'error');
            setLastResult({ ok: false, error: String((e as Error)?.message || e) });
        } finally {
            setBusy(false);
        }
    };

    const labelSx = {
        color: 'var(--accent-primary)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.1em', mb: 0.5,
    } as const;

    return (
        <Box sx={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            p: 2, mb: 3, position: 'relative', overflow: 'hidden',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 25%, transparent)', color: 'var(--accent-primary)' }}>
                    <PaletteIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}>Copy BIN Colors</Typography>
                    <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.7rem', mt: 0.25 }}>
                        Copy VFX colors (RGBA + named VEC4 fields) from a source bin into a structurally identical target bin. Inspired by ltmao&apos;s hapibin.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mb: 1.5 }}>
                <Box>
                    <Typography sx={labelSx}>Source (donor colors)</Typography>
                    <PathPicker label="Source" value={sourcePath} onChange={setSourcePath} onPick={async () => { const p = await pickBinFile('Select source bin (donor)'); if (p) setSourcePath(p); }} />
                </Box>
                <Box>
                    <Typography sx={labelSx}>Target (gets recolored)</Typography>
                    <PathPicker label="Target" value={targetPath} onChange={setTargetPath} onPick={async () => { const p = await pickBinFile('Select target bin (will be recolored)'); if (p) setTargetPath(p); }} />
                </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <FormControlLabel
                    control={<Checkbox size="small" checked={overwriteTarget} onChange={(e) => setOverwriteTarget(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Overwrite target in place</Typography>}
                    sx={{ m: 0 }}
                />
                <FormControlLabel
                    control={<Checkbox size="small" checked={createBackup} disabled={!overwriteTarget} onChange={(e) => setCreateBackup(e.target.checked)} sx={{ color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--accent-primary)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: overwriteTarget ? 'var(--text-secondary)' : 'var(--text-muted)' }}>Create .bak backup</Typography>}
                    sx={{ m: 0 }}
                />

                <Box sx={{ flex: 1 }} />

                {lastResult?.ok && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        Last run: {lastResult.fieldsCopied} field(s), {lastResult.entriesMatched} entries matched, {lastResult.entriesSkipped} skipped
                    </Typography>
                )}

                <Button
                    size="small" variant="contained"
                    startIcon={(busy ? <CircularProgress size={14} sx={{ color: 'var(--accent-primary)' }} /> : <PlayArrowIcon />) as ReactNode}
                    disabled={busy || !sourcePath || !targetPath} onClick={handleRun}
                    sx={{ background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)', color: 'var(--accent-primary)', border: '1px solid color-mix(in oklab, var(--accent-primary) 35%, transparent)', borderRadius: 'var(--radius-sm)', textTransform: 'none', fontSize: '0.75rem', fontWeight: 700, px: 2, boxShadow: 'none', '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)', borderColor: 'color-mix(in oklab, var(--accent-primary) 60%, transparent)' }, '&.Mui-disabled': { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } }}
                >
                    {busy ? 'Copying…' : 'Copy Colors'}
                </Button>
            </Box>
        </Box>
    );
}

export default BinColorCopyCard;
