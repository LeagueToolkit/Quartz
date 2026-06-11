/* AudioSplitter — full-screen overlay to load a WAV/MP3, mark segment regions,
   and export each as a WAV (or push to the reference pane / replace the source).

   The Electron build rendered the waveform and drag-to-create regions with
   wavesurfer.js (+ regions/timeline/zoom/hover plugins). wavesurfer.js is NOT a
   dependency of this Rust port, so the waveform surface here is a placeholder and
   regions are added/edited manually through the table. The full top-bar, controls
   bar, auto-split popover, region table and footer are ported 1:1.
   TODO(dep): add wavesurfer.js to render the live waveform + drag regions.
   TODO(backend): WAV slicing/encoding + WEM re-encode run in Rust once available. */

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    Box, Typography, Button, IconButton, TextField, Slider, Tooltip, LinearProgress, Popover,
} from '@mui/material';
import {
    Close, PlayArrow, Pause, Stop, FolderOpen, Download, Upload,
    Delete, ZoomIn, ZoomOut, ContentCut, SkipPrevious, VolumeUp, AutoFixHigh, ViewStream, Add,
} from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { log } from '@/lib/util/logger';
import type { SplitterFile, SplitterSegment } from '../types';

interface Region { id: string; name: string; start: number; end: number }
interface EditingTime { id: string; field: 'start' | 'end' }

function fmtTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) return '0:00.000';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

interface RegionRowProps {
    reg: Region;
    index: number;
    isActive: boolean;
    isEditingName: boolean;
    isEditingStart: boolean;
    isEditingEnd: boolean;
    onSeek: (reg: Region) => void;
    onSetEditingName: (id: string | null) => void;
    onRename: (id: string, name: string) => void;
    onSetEditingTime: (v: EditingTime | null) => void;
    onTimeEdit: (id: string, field: 'start' | 'end', raw: string) => void;
    onExport: (reg: Region) => void;
    onRemove: (id: string) => void;
}

const RegionRow = memo(function RegionRow({
    reg, index, isActive, isEditingName, isEditingStart, isEditingEnd,
    onSeek, onSetEditingName, onRename, onSetEditingTime, onTimeEdit, onExport, onRemove,
}: RegionRowProps) {
    const dur = reg.end - reg.start;
    const editSx = { '& .MuiOutlinedInput-root': { background: 'rgba(0,0,0,0.4)', '& fieldset': { borderColor: 'var(--accent)' } } };
    return (
        <Box
            onClick={() => onSeek(reg)}
            sx={{
                display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.4, cursor: 'pointer', alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isActive ? 'rgba(var(--accent-rgb,100,200,255),0.08)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
            }}
        >
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>{index + 1}</Typography>

            {isEditingName ? (
                <TextField
                    autoFocus defaultValue={reg.name} size="small"
                    onBlur={(e) => onRename(reg.id, e.target.value || reg.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onRename(reg.id, (e.target as HTMLInputElement).value || reg.name); if (e.key === 'Escape') onSetEditingName(null); }}
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.72rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={editSx}
                />
            ) : (
                <Typography
                    onDoubleClick={(e) => { e.stopPropagation(); onSetEditingName(reg.id); }}
                    sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                    title="Double-click to rename"
                >{reg.name}</Typography>
            )}

            {isEditingStart ? (
                <TextField autoFocus size="small"
                    defaultValue={reg.start.toFixed(3)}
                    onBlur={(e) => onTimeEdit(reg.id, 'start', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onTimeEdit(reg.id, 'start', (e.target as HTMLInputElement).value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.65rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={editSx}
                />
            ) : (
                <Typography onClick={(e) => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'start' }); }}
                    sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', cursor: 'text', '&:hover': { color: 'var(--accent)' } }}
                    title="Click to edit start time (seconds)">
                    {fmtTime(reg.start)}
                </Typography>
            )}

            {isEditingEnd ? (
                <TextField autoFocus size="small"
                    defaultValue={reg.end.toFixed(3)}
                    onBlur={(e) => onTimeEdit(reg.id, 'end', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onTimeEdit(reg.id, 'end', (e.target as HTMLInputElement).value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.65rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={editSx}
                />
            ) : (
                <Typography onClick={(e) => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'end' }); }}
                    sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', cursor: 'text', '&:hover': { color: 'var(--accent)' } }}
                    title="Click to edit end time (seconds)">
                    {fmtTime(reg.end)}
                </Typography>
            )}

            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)' }}>{fmtTime(dur)}</Typography>

            <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Export this segment">
                    <IconButton size="small" onClick={() => onExport(reg)} sx={{ p: 0.25, color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}>
                        <Download sx={{ fontSize: 13 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Delete region (Del)">
                    <IconButton size="small" onClick={() => onRemove(reg.id)} sx={{ p: 0.25, color: 'rgba(255,100,100,0.4)', '&:hover': { color: '#ff8888' } }}>
                        <Delete sx={{ fontSize: 13 }} />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
});

interface Props {
    open: boolean;
    onClose: () => void;
    initialFile: SplitterFile | null;
    onReplace: (data: Uint8Array, nodeId: string, pane?: string) => void;
    onExportSegments: (segments: SplitterSegment[]) => void;
}

export default function AudioSplitter({ open: isOpen, onClose, initialFile, onReplace, onExportSegments }: Props) {
    const audioRef = useRef<HTMLAudioElement>(null);

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [regions, setRegions] = useState<Region[]>([]);
    const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
    const [loadedName, setLoadedName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState('');
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingTime, setEditingTime] = useState<EditingTime | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const [autoSplitAnchor, setAutoSplitAnchor] = useState<HTMLElement | null>(null);
    const [splitThreshold, setSplitThreshold] = useState(-40);
    const [splitMinSilence, setSplitMinSilence] = useState(300);
    const [splitPad, setSplitPad] = useState(30);
    const regionCount = useRef(0);

    const resetState = useCallback(() => {
        setIsReady(false);
        setIsPlaying(false);
        setRegions([]);
        setActiveRegionId(null);
        setDuration(0);
        setZoom(1);
        setLoadedName('');
        regionCount.current = 0;
    }, []);

    const loadFile = useCallback((filePath: string, fileName?: string) => {
        // TODO(backend): decode WEM/MP3/WAV to a playable buffer in Rust. For now
        // we point the <audio> element at the picked path via the Tauri asset URL.
        setIsLoading(true);
        try {
            if (audioRef.current) {
                audioRef.current.src = filePath.startsWith('http') || filePath.startsWith('data:')
                    ? filePath
                    : `file://${filePath}`;
            }
            setLoadedName(fileName || filePath.split(/[\\/]/).pop() || '');
            setRegions([]);
            setActiveRegionId(null);
            regionCount.current = 0;
        } catch (err) {
            setIsLoading(false);
            log.error('[AudioSplitter] load error', err);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) resetState();
    }, [isOpen, resetState]);

    useEffect(() => {
        if (isOpen && initialFile?.path) {
            loadFile(initialFile.path, initialFile.name);
        }
    }, [isOpen, initialFile, loadFile]);

    const removeRegion = useCallback((id: string) => {
        setRegions((prev) => prev.filter((r) => r.id !== id));
        setActiveRegionId((prev) => (prev === id ? null : prev));
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.code === 'Space') { e.preventDefault(); void (isPlaying ? audioRef.current?.pause() : audioRef.current?.play()); }
            if ((e.code === 'Delete' || e.code === 'Backspace') && activeRegionId) { e.preventDefault(); removeRegion(activeRegionId); }
            if (e.code === 'Home' && audioRef.current) audioRef.current.currentTime = 0;
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, activeRegionId, isPlaying, onClose, removeRegion]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    const handleOpenFile = useCallback(async () => {
        const picked = await open({ multiple: false, filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }, { name: 'All', extensions: ['*'] }] });
        if (typeof picked === 'string') loadFile(picked, picked.split(/[\\/]/).pop());
    }, [loadFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const hasFile = [...(e.dataTransfer.items || [])].some((i) => i.kind === 'file');
        if (hasFile) { e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !['wav', 'mp3'].includes(ext)) return;
        loadFile((file as File & { path?: string }).path ?? file.name, file.name);
    }, [loadFile]);

    const handlePlayPause = () => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause(); else void audioRef.current.play();
    };
    const handleStop = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } };

    const addRegionAtCursor = useCallback(() => {
        const cur = audioRef.current?.currentTime ?? 0;
        const end = Math.min(duration || cur + 1, cur + 1);
        const idx = (regionCount.current += 1);
        const name = `segment_${String(idx).padStart(3, '0')}`;
        const id = `reg_${Date.now()}_${idx}`;
        setRegions((prev) => [...prev, { id, name, start: cur, end }]);
        setActiveRegionId(id);
    }, [duration]);

    const handleTimeEdit = useCallback((id: string, field: 'start' | 'end', rawVal: string) => {
        setEditingTime(null);
        const secs = parseFloat(rawVal);
        if (isNaN(secs)) return;
        setRegions((prev) => prev.map((r) => {
            if (r.id !== id) return r;
            const newStart = field === 'start' ? Math.max(0, secs) : r.start;
            const newEnd = field === 'end' ? Math.max(r.start + 0.01, secs) : r.end;
            return { ...r, start: newStart, end: newEnd };
        }));
    }, []);

    const handleAutoSplit = useCallback(() => {
        // TODO(backend): silence-based segment detection runs in Rust once the
        // decoder lands. Without a decoded buffer there is nothing to analyse here.
        setAutoSplitAnchor(null);
        setExportProgress('Auto-split needs the audio decoder (backend not wired yet)');
        setTimeout(() => setExportProgress(''), 3500);
    }, []);

    const removeAllRegions = useCallback(() => {
        setRegions([]);
        setActiveRegionId(null);
    }, []);

    const handleRename = useCallback((id: string, name: string) => {
        setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
        setEditingName(null);
    }, []);

    const seekToRegion = useCallback((region: Region) => {
        if (audioRef.current) audioRef.current.currentTime = region.start;
        setActiveRegionId(region.id);
    }, []);

    const handleExportAll = useCallback(async () => {
        if (regions.length === 0) return;
        // TODO(backend): slice + encode each region to WAV in Rust, write under chosen dir.
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir !== 'string') return;
        setExportProgress('Segment export needs the audio encoder (backend not wired yet)');
        setTimeout(() => setExportProgress(''), 3500);
    }, [regions]);

    const handleExportOne = useCallback((_reg: Region) => {
        // TODO(backend): slice + encode single region to WAV in Rust.
        setExportProgress('Segment export needs the audio encoder (backend not wired yet)');
        setTimeout(() => setExportProgress(''), 3500);
    }, []);

    const handleReplace = useCallback(() => {
        if (!onReplace || !initialFile?.nodeId) return;
        // TODO(backend): encode the edited buffer (WAV, then WEM if source was WEM)
        // and hand the bytes back to the tree. Stubbed until the encoder exists.
        setExportProgress('Replace needs the audio/WEM encoder (backend not wired yet)');
        setTimeout(() => setExportProgress(''), 3500);
    }, [initialFile, onReplace]);

    const handleExportSegmentsToRef = useCallback(() => {
        if (regions.length === 0 || !onExportSegments) return;
        // TODO(backend): encode each region to WAV bytes before pushing to the ref pane.
        const segments: SplitterSegment[] = [...regions]
            .sort((a, b) => a.start - b.start)
            .map((reg) => ({ name: reg.name, data: new Uint8Array(0) }));
        onExportSegments(segments);
        setExportProgress(`Pushed ${segments.length} segment(s) to reference pane (audio bytes pending backend)`);
        setTimeout(() => setExportProgress(''), 3500);
    }, [regions, onExportSegments]);

    const sortedRegions = useMemo(() => [...regions].sort((a, b) => a.start - b.start), [regions]);

    if (!isOpen) return null;

    const slotSx = { '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } };
    const headerCells = ['#', 'Name', 'Start', 'End', 'Duration', ''];

    return (
        <Box
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                position: 'fixed', top: '48px', left: '60px', right: 0, bottom: 0, zIndex: 9500,
                background: 'rgba(8,8,14,0.97)', display: 'flex', flexDirection: 'column',
                fontFamily: 'JetBrains Mono, monospace',
                outline: isDragOver ? '2px solid var(--accent)' : '2px solid transparent', outlineOffset: '-3px',
                transition: 'outline-color 0.1s',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>
                <ContentCut sx={{ fontSize: 18, color: 'var(--accent)', mr: 0.5 }} />
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', mr: 1 }}>
                    AUDIO SPLITTER
                </Typography>

                {loadedName && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', mr: 1, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loadedName}
                    </Typography>
                )}

                <Button onClick={handleOpenFile} startIcon={<FolderOpen sx={{ fontSize: 14 }} />}
                    sx={{ fontSize: '0.72rem', fontFamily: 'inherit', textTransform: 'none', color: 'var(--text)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 1, px: 1, py: 0.4, '&:hover': { borderColor: 'var(--accent)' } }}>
                    Open File
                </Button>

                <Box sx={{ flex: 1 }} />

                {regions.length > 0 && (
                    <Button onClick={handleExportAll} disabled={isExporting || !isReady} startIcon={<Download sx={{ fontSize: 14 }} />} variant="contained"
                        sx={{ fontSize: '0.72rem', fontFamily: 'inherit', textTransform: 'none', background: 'var(--accent)', borderRadius: 1, px: 1.5, py: 0.4, '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}>
                        Export All ({regions.length})
                    </Button>
                )}

                {regions.length > 0 && (
                    <Button onClick={handleExportSegmentsToRef} disabled={isExporting || !isReady} startIcon={<ViewStream sx={{ fontSize: 14 }} />} variant="contained"
                        sx={{ fontSize: '0.72rem', fontFamily: 'inherit', textTransform: 'none', background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 1, px: 1.5, py: 0.4, ml: 1, '&:hover': { background: 'rgba(var(--accent-rgb), 0.25)' } }}>
                        PUSH TO REF
                    </Button>
                )}

                {initialFile?.nodeId && (
                    <Button onClick={handleReplace} disabled={isExporting || !isReady} startIcon={<Upload sx={{ fontSize: 14 }} />} variant="contained"
                        sx={{ fontSize: '0.72rem', fontFamily: 'inherit', textTransform: 'none', background: 'rgba(var(--accent-rgb), 0.2)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 1, px: 1.5, py: 0.4, '&:hover': { background: 'rgba(var(--accent-rgb), 0.3)' } }}>
                        REPLACE ORIGINAL
                    </Button>
                )}

                <Button
                    onClick={onClose}
                    startIcon={<Close />}
                    sx={{ ml: 2, color: '#ff6666', border: '1px solid rgba(255,100,100,0.3)', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', '&:hover': { background: 'rgba(255,100,100,0.1)', borderColor: '#ff6666' } }}
                >
                    CLOSE
                </Button>
            </Box>

            {(isExporting || exportProgress) && (
                <Box sx={{ px: 2, pt: 0.5, pb: 0.25, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                    {isExporting && <LinearProgress sx={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />}
                    <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', mt: 0.5 }}>{exportProgress}</Typography>
                </Box>
            )}

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
                {isLoading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.6)', p: 0.5 }}>
                        <LinearProgress sx={{ height: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', textAlign: 'center', mt: 0.5 }}>Loading audio...</Typography>
                    </Box>
                )}

                {!isReady && !isLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.18)', flexDirection: 'column', gap: 1 }}>
                        <ContentCut sx={{ fontSize: 48, opacity: isDragOver ? 0.7 : 0.3, color: isDragOver ? 'var(--accent)' : 'inherit', transition: 'all 0.15s' }} />
                        <Typography sx={{ fontSize: '0.8rem', fontFamily: 'inherit', color: isDragOver ? 'var(--accent)' : 'inherit', transition: 'color 0.15s' }}>
                            {isDragOver ? 'Drop to load' : 'Drop a WAV or MP3 here, or click Open File'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', opacity: 0.6 }}>Add segments at the cursor · Space to play/pause</Typography>
                    </Box>
                )}

                {isDragOver && isReady && (
                    <Box sx={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,8,14,0.82)', pointerEvents: 'none', flexDirection: 'column', gap: 1 }}>
                        <ContentCut sx={{ fontSize: 48, color: 'var(--accent)', opacity: 0.8 }} />
                        <Typography sx={{ fontSize: '0.9rem', color: 'var(--accent)', fontFamily: 'inherit' }}>Drop to replace</Typography>
                    </Box>
                )}

                {/* Waveform surface placeholder (wavesurfer.js not bundled in this port) */}
                <Box sx={{ px: 2, pt: 1.5, display: isReady || isLoading ? 'block' : 'none' }}>
                    <Box sx={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', overflow: 'hidden', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Waveform preview unavailable — use Add Segment + edit times</Typography>
                    </Box>
                    <Box sx={{ mt: 0.25, height: 20 }} />
                </Box>

                {isReady && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.06)', mt: 0.5 }}>
                        <Tooltip title="Go to start (Home)">
                            <IconButton onClick={() => { if (audioRef.current) audioRef.current.currentTime = 0; }} size="small" sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}>
                                <SkipPrevious sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                            <IconButton onClick={handlePlayPause} size="small" sx={{ color: 'var(--accent)', '&:hover': { filter: 'brightness(1.2)' } }}>
                                {isPlaying ? <Pause sx={{ fontSize: 22 }} /> : <PlayArrow sx={{ fontSize: 22 }} />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Stop">
                            <IconButton onClick={handleStop} size="small" sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}>
                                <Stop sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>

                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', minWidth: 130, ml: 0.5 }}>
                            {fmtTime(audioRef.current?.currentTime ?? 0)} / {fmtTime(duration)}
                        </Typography>

                        <VolumeUp sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', ml: 1 }} />
                        <Slider min={0} max={1} step={0.01} value={volume} onChange={(_, v) => setVolume(v as number)} sx={{ width: 80, color: 'var(--accent)', ...slotSx }} />

                        <Box sx={{ flex: 1 }} />

                        <ZoomOut sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                        <Slider min={1} max={300} step={1} value={zoom} onChange={(_, v) => setZoom(v as number)} sx={{ width: 120, color: 'var(--accent)', ...slotSx }} />
                        <ZoomIn sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', minWidth: 36 }}>{zoom}×</Typography>

                        <Tooltip title="Add segment at cursor">
                            <Button size="small" onClick={addRegionAtCursor} startIcon={<Add sx={{ fontSize: 14 }} />}
                                sx={{ fontSize: '0.65rem', fontFamily: 'inherit', textTransform: 'none', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb,100,200,255),0.3)', borderRadius: 1, px: 1, py: 0.25, ml: 1, '&:hover': { borderColor: 'var(--accent)', background: 'rgba(var(--accent-rgb,100,200,255),0.08)' } }}>
                                Add Segment
                            </Button>
                        </Tooltip>

                        <Tooltip title="Auto-split by silence">
                            <Button size="small" disabled={!isReady} onClick={(e) => setAutoSplitAnchor(e.currentTarget)} startIcon={<AutoFixHigh sx={{ fontSize: 14 }} />}
                                sx={{ fontSize: '0.65rem', fontFamily: 'inherit', textTransform: 'none', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb,100,200,255),0.3)', borderRadius: 1, px: 1, py: 0.25, ml: 1, '&:hover': { borderColor: 'var(--accent)', background: 'rgba(var(--accent-rgb,100,200,255),0.08)' } }}>
                                Auto-Split
                            </Button>
                        </Tooltip>

                        {regions.length > 0 && (
                            <Tooltip title="Clear all regions">
                                <Button onClick={removeAllRegions} size="small"
                                    sx={{ fontSize: '0.65rem', fontFamily: 'inherit', textTransform: 'none', color: 'rgba(255,100,100,0.7)', border: '1px solid rgba(255,100,100,0.25)', borderRadius: 1, px: 1, py: 0.25, ml: 1, '&:hover': { borderColor: 'rgba(255,100,100,0.6)', color: '#ff8888' } }}>
                                    Clear all
                                </Button>
                            </Tooltip>
                        )}

                        <Popover
                            open={Boolean(autoSplitAnchor)}
                            anchorEl={autoSplitAnchor}
                            onClose={() => setAutoSplitAnchor(null)}
                            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                            transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                            PaperProps={{ sx: { background: 'rgba(18,18,24,0.98)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', p: 2, minWidth: 260, fontFamily: 'JetBrains Mono, monospace' } }}
                        >
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', mb: 1.5, letterSpacing: '0.08em' }}>AUTO-SPLIT SETTINGS</Typography>

                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', mb: 0.25 }}>
                                Silence threshold: <b style={{ color: 'rgba(255,255,255,0.7)' }}>{splitThreshold} dB</b>
                            </Typography>
                            <Slider min={-70} max={-10} step={1} value={splitThreshold} onChange={(_, v) => setSplitThreshold(v as number)} sx={{ color: 'var(--accent)', mb: 1.5, ...slotSx }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', mb: 0.25 }}>
                                Min silence gap: <b style={{ color: 'rgba(255,255,255,0.7)' }}>{splitMinSilence} ms</b>
                            </Typography>
                            <Slider min={50} max={2000} step={10} value={splitMinSilence} onChange={(_, v) => setSplitMinSilence(v as number)} sx={{ color: 'var(--accent)', mb: 1.5, ...slotSx }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', mb: 0.25 }}>
                                Segment padding: <b style={{ color: 'rgba(255,255,255,0.7)' }}>{splitPad} ms</b>
                            </Typography>
                            <Slider min={0} max={200} step={5} value={splitPad} onChange={(_, v) => setSplitPad(v as number)} sx={{ color: 'var(--accent)', mb: 2, ...slotSx }} />

                            <Button fullWidth variant="contained" onClick={handleAutoSplit}
                                sx={{ fontFamily: 'inherit', fontSize: '0.72rem', textTransform: 'none', background: 'var(--accent)', '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}>
                                Split Now
                            </Button>
                        </Popover>
                    </Box>
                )}

                {sortedRegions.length > 0 && (
                    <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', maxHeight: 240, flexShrink: 0 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.4)' }}>
                            {headerCells.map((h, i) => (
                                <Typography key={`${h}-${i}`} sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.08em' }}>{h}</Typography>
                            ))}
                        </Box>

                        {sortedRegions.map((reg, i) => (
                            <RegionRow
                                key={reg.id}
                                reg={reg}
                                index={i}
                                isActive={reg.id === activeRegionId}
                                isEditingName={editingName === reg.id}
                                isEditingStart={editingTime?.id === reg.id && editingTime?.field === 'start'}
                                isEditingEnd={editingTime?.id === reg.id && editingTime?.field === 'end'}
                                onSeek={seekToRegion}
                                onSetEditingName={setEditingName}
                                onRename={handleRename}
                                onSetEditingTime={setEditingTime}
                                onTimeEdit={handleTimeEdit}
                                onExport={handleExportOne}
                                onRemove={removeRegion}
                            />
                        ))}

                        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', display: 'flex', gap: 2 }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                                {regions.length} segment{regions.length !== 1 ? 's' : ''} &nbsp;·&nbsp; total: {fmtTime(sortedRegions.reduce((a, r) => a + (r.end - r.start), 0))}
                            </Typography>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>
                                Add segment to mark · Double-click name to rename · Space to play · Del to remove selected
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Box>

            <audio
                ref={audioRef}
                style={{ display: 'none' }}
                onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); setIsReady(true); setIsLoading(false); }}
                onError={() => { setIsLoading(false); setIsReady(true); }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
            />
        </Box>
    );
}
