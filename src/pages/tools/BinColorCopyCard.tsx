import { useState, type ReactNode } from 'react';
import {
    Box, Button, Typography, TextField, IconButton, Tooltip, FormControlLabel, Checkbox, CircularProgress,
} from '@mui/material';
import {
    Palette as PaletteIcon, FolderOpen as FolderOpenIcon, PlayArrow as PlayArrowIcon, Clear as ClearIcon,
} from '@mui/icons-material';
import { open, save } from '@tauri-apps/plugin-dialog';
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
                <IconButton size="small" onClick={onPick} sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'var(--accent)' } }}>
                    <FolderOpenIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {value && (
                <Tooltip title="Clear">
                    <IconButton size="small" onClick={() => onChange('')} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4d4d' } }}>
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
            // TODO: backend command for VFX color copy (Electron used IPC 'bin:copyColors',
            // inspired by ltmao's hapibin). No equivalent Rust command exists in quartz-lib yet,
            // so wiring is pending a backend port. UI and validation match the original.
            void createBackup;
            notify('Copy BIN Colors backend is not available in this build yet', 'error');
            setLastResult({ ok: false, error: 'backend unavailable' });
        } catch (e) {
            log.error('bin:copyColors', e);
            notify(`Copy crashed: ${String((e as Error)?.message || e)}`, 'error');
            setLastResult({ ok: false, error: String((e as Error)?.message || e) });
        } finally {
            setBusy(false);
        }
    };

    const labelSx = {
        color: 'var(--accent)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.1em', mb: 0.5, opacity: 0.8,
    } as const;

    return (
        <Box sx={{
            background: 'rgba(255,255,255,0.026)', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '12px',
            p: 2, mb: 3, position: 'relative', overflow: 'hidden',
            '&::before': { content: '""', position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)' },
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Box sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)' }}>
                    <PaletteIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2 }}>Copy BIN Colors</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', mt: 0.25 }}>
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
                    control={<Checkbox size="small" checked={overwriteTarget} onChange={(e) => setOverwriteTarget(e.target.checked)} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'var(--accent)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Overwrite target in place</Typography>}
                    sx={{ m: 0 }}
                />
                <FormControlLabel
                    control={<Checkbox size="small" checked={createBackup} disabled={!overwriteTarget} onChange={(e) => setCreateBackup(e.target.checked)} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: 'var(--accent)' }, py: 0.5 }} />}
                    label={<Typography sx={{ fontSize: '0.75rem', color: overwriteTarget ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)' }}>Create .bak backup</Typography>}
                    sx={{ m: 0 }}
                />

                <Box sx={{ flex: 1 }} />

                {lastResult?.ok && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
                        Last run: {lastResult.fieldsCopied} field(s), {lastResult.entriesMatched} entries matched, {lastResult.entriesSkipped} skipped
                    </Typography>
                )}

                <Button
                    size="small" variant="contained"
                    startIcon={(busy ? <CircularProgress size={14} sx={{ color: '#000' }} /> : <PlayArrowIcon />) as ReactNode}
                    disabled={busy || !sourcePath || !targetPath} onClick={handleRun}
                    sx={{ background: 'var(--accent)', color: '#000', borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', fontWeight: 700, px: 2, boxShadow: 'none', '&:hover': { background: 'var(--accent)', opacity: 0.9 }, '&.Mui-disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}
                >
                    {busy ? 'Copying…' : 'Copy Colors'}
                </Button>
            </Box>
        </Box>
    );
}

export default BinColorCopyCard;
