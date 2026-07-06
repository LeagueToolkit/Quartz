/* AudioSplitter — full-screen overlay to load a WAV/MP3/WEM, mark segment
   regions on a live waveform, and export each as a WAV (or push to the reference
   pane / replace the source).

   The waveform + drag-to-create regions are rendered with wavesurfer.js (regions
   plugin). Source audio is decoded to WAV in Rust (vgmstream / the native WEM
   decoder); slicing and WAV encoding happen here in the browser via the Web Audio
   API, and WEM re-encoding for "Replace Original" goes back through WwiseConsole. */

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
    Box, Typography, Slider, Tooltip, LinearProgress, Popover,
} from '@mui/material';
import {
    Close, PlayArrow, Pause, Stop, FolderOpen, Download, Upload,
    Delete, ZoomIn, ZoomOut, ContentCut, SkipPrevious, VolumeUp, AutoFixHigh, ViewStream, Add,
} from '@mui/icons-material';
import { pickPath } from '@/components/explorer';
import { tempDir, join } from '@tauri-apps/api/path';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region as WsRegion } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { log } from '@/lib/util/logger';
import { decodeToWav, readFileBytes, writeFileBytes, convertToWem } from '../utils/backend';
import type { SplitterFile, SplitterSegment } from '../types';

interface Region { id: string; name: string; start: number; end: number }
interface EditingTime { id: string; field: 'start' | 'end' }

function fmtTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) return '0:00.000';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/* Encode an AudioBuffer slice [start, end) (seconds) to a 16-bit PCM WAV. */
function encodeWavSlice(buffer: AudioBuffer, start: number, end: number): Uint8Array {
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;
    const startSample = Math.max(0, Math.floor(start * sampleRate));
    const endSample = Math.min(buffer.length, Math.ceil(end * sampleRate));
    const frames = Math.max(0, endSample - startSample);

    const dataSize = frames * channels * 2;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const chans: Float32Array[] = [];
    for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            let s = chans[c][startSample + i] || 0;
            s = Math.max(-1, Math.min(1, s));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }
    }
    return new Uint8Array(out);
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
    return (
        <Box
            onClick={() => onSeek(reg)}
            sx={{
                display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.4, cursor: 'pointer', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: isActive ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                '&:hover': { background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' },
            }}
        >
            <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{index + 1}</Typography>

            {isEditingName ? (
                <input
                    className="dl-input"
                    autoFocus defaultValue={reg.name}
                    onBlur={(e) => onRename(reg.id, e.target.value || reg.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onRename(reg.id, (e.target as HTMLInputElement).value || reg.name); if (e.key === 'Escape') onSetEditingName(null); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '0.72rem', padding: '1px 4px', height: 'auto' }}
                />
            ) : (
                <Typography
                    onDoubleClick={(e) => { e.stopPropagation(); onSetEditingName(reg.id); }}
                    sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                    title="Double-click to rename"
                >{reg.name}</Typography>
            )}

            {isEditingStart ? (
                <input
                    className="dl-input" autoFocus
                    defaultValue={reg.start.toFixed(3)}
                    onBlur={(e) => onTimeEdit(reg.id, 'start', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onTimeEdit(reg.id, 'start', (e.target as HTMLInputElement).value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '0.65rem', padding: '1px 4px', height: 'auto' }}
                />
            ) : (
                <Typography onClick={(e) => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'start' }); }}
                    sx={{ fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'text', '&:hover': { color: 'var(--accent-primary)' } }}
                    title="Click to edit start time (seconds)">
                    {fmtTime(reg.start)}
                </Typography>
            )}

            {isEditingEnd ? (
                <input
                    className="dl-input" autoFocus
                    defaultValue={reg.end.toFixed(3)}
                    onBlur={(e) => onTimeEdit(reg.id, 'end', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onTimeEdit(reg.id, 'end', (e.target as HTMLInputElement).value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: '0.65rem', padding: '1px 4px', height: 'auto' }}
                />
            ) : (
                <Typography onClick={(e) => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'end' }); }}
                    sx={{ fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'text', '&:hover': { color: 'var(--accent-primary)' } }}
                    title="Click to edit end time (seconds)">
                    {fmtTime(reg.end)}
                </Typography>
            )}

            <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{fmtTime(dur)}</Typography>

            <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Export this segment">
                    <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost" onClick={() => onExport(reg)}>
                        <span className="dl-icon"><Download sx={{ fontSize: 13 }} /></span>
                    </button>
                </Tooltip>
                <Tooltip title="Delete region (Del)">
                    <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--danger" onClick={() => onRemove(reg.id)}>
                        <span className="dl-icon"><Delete sx={{ fontSize: 13 }} /></span>
                    </button>
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

const REGION_COLOR = 'rgba(100, 200, 255, 0.18)';

export default function AudioSplitter({ open: isOpen, onClose, initialFile, onReplace, onExportSegments }: Props) {
    const waveContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const blobUrlRef = useRef<string | null>(null);
    const sourceWasWem = useRef(false);

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [regions, setRegions] = useState<Region[]>([]);
    const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
    const [loadedName, setLoadedName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
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

    const flash = useCallback((msg: string, ms = 3500) => {
        setExportProgress(msg);
        if (ms > 0) setTimeout(() => setExportProgress(''), ms);
    }, []);

    const resetState = useCallback(() => {
        setIsReady(false);
        setIsPlaying(false);
        setRegions([]);
        setActiveRegionId(null);
        setDuration(0);
        setCurrentTime(0);
        setZoom(1);
        setLoadedName('');
        regionCount.current = 0;
        audioBufferRef.current = null;
        sourceWasWem.current = false;
    }, []);

    /* (Re)build wavesurfer for a fresh blob URL and decode the same bytes into an
       AudioBuffer for slicing. */
    const mountWaveform = useCallback(async (wavBytes: Uint8Array, name: string) => {
        const container = waveContainerRef.current;
        if (!container) return;

        wsRef.current?.destroy();
        wsRef.current = null;
        if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

        // Decode for slicing.
        try {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new Ctor();
            const ab = new ArrayBuffer(wavBytes.byteLength);
            new Uint8Array(ab).set(wavBytes);
            audioBufferRef.current = await ctx.decodeAudioData(ab);
            void ctx.close();
        } catch (e) {
            log.error('[AudioSplitter] decodeAudioData failed', e);
            audioBufferRef.current = null;
        }

        const blob = new Blob([wavBytes as BlobPart], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const regionsPlugin = RegionsPlugin.create();
        regionsPluginRef.current = regionsPlugin;

        const ws = WaveSurfer.create({
            container,
            height: 110,
            waveColor: 'rgba(120, 180, 230, 0.5)',
            progressColor: 'var(--accent)',
            cursorColor: 'rgba(255,255,255,0.6)',
            url,
            plugins: [regionsPlugin],
        });
        wsRef.current = ws;

        // Drag on empty waveform to create a region.
        regionsPlugin.enableDragSelection({ color: REGION_COLOR });

        regionsPlugin.on('region-created', (region: WsRegion) => {
            const idx = (regionCount.current += 1);
            if (!region.content) {
                const label = document.createElement('span');
                label.textContent = `segment_${String(idx).padStart(3, '0')}`;
                region.setOptions({ color: REGION_COLOR, content: label });
            }
            setRegions((prev) => {
                if (prev.some((r) => r.id === region.id)) return prev;
                const name = typeof region.content === 'string'
                    ? region.content
                    : (region.content?.textContent || `segment_${String(idx).padStart(3, '0')}`);
                return [...prev, { id: region.id, name, start: region.start, end: region.end }];
            });
            setActiveRegionId(region.id);
        });

        regionsPlugin.on('region-updated', (region: WsRegion) => {
            setRegions((prev) => prev.map((r) => (r.id === region.id ? { ...r, start: region.start, end: region.end } : r)));
        });

        regionsPlugin.on('region-clicked', (region: WsRegion, e: MouseEvent) => {
            e.stopPropagation();
            setActiveRegionId(region.id);
            region.play();
        });

        ws.on('ready', () => { setDuration(ws.getDuration()); setIsReady(true); setIsLoading(false); });
        ws.on('timeupdate', (t: number) => setCurrentTime(t));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));
        ws.on('error', (err) => { log.error('[AudioSplitter] wavesurfer error', err); setIsLoading(false); });
        ws.setVolume(volume);
        setLoadedName(name);
    }, [volume]);

    /* Load any source (path / bytes) — decode to WAV in Rust when needed, then
       hand the WAV bytes to the waveform + slicer. */
    const loadSource = useCallback(async (opts: { path?: string; data?: Uint8Array; name: string; isWem?: boolean }) => {
        setIsLoading(true);
        setRegions([]);
        setActiveRegionId(null);
        regionCount.current = 0;
        try {
            let rawBytes: Uint8Array;
            if (opts.data) {
                rawBytes = opts.data;
            } else if (opts.path) {
                rawBytes = await readFileBytes(opts.path);
            } else {
                setIsLoading(false);
                return;
            }

            const nameLower = opts.name.toLowerCase();
            const isWav = nameLower.endsWith('.wav') || (rawBytes.length >= 4 && rawBytes[0] === 0x52 && rawBytes[1] === 0x49 && rawBytes[2] === 0x46 && rawBytes[3] === 0x46);
            sourceWasWem.current = !!opts.isWem || nameLower.endsWith('.wem');

            // Already-WAV bytes can be fed straight in; everything else is decoded
            // to WAV in Rust (vgmstream / native WEM decoder).
            const wavBytes = isWav ? rawBytes : await readFileBytes(await decodeToWav(rawBytes));
            await mountWaveform(wavBytes, opts.name);
        } catch (e) {
            log.error('[AudioSplitter] load error', e);
            setIsLoading(false);
            flash(`Failed to load audio: ${(e as Error).message}`);
        }
    }, [mountWaveform, flash]);

    useEffect(() => {
        if (!isOpen) {
            wsRef.current?.destroy();
            wsRef.current = null;
            if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
            resetState();
        }
    }, [isOpen, resetState]);

    useEffect(() => {
        if (isOpen && initialFile && (initialFile.data || initialFile.path)) {
            void loadSource({
                path: initialFile.path,
                data: initialFile.data,
                name: initialFile.name || 'audio',
                isWem: initialFile.isWem,
            });
        }
    }, [isOpen, initialFile, loadSource]);

    const removeRegion = useCallback((id: string) => {
        regionsPluginRef.current?.getRegions().find((r) => r.id === id)?.remove();
        setRegions((prev) => prev.filter((r) => r.id !== id));
        setActiveRegionId((prev) => (prev === id ? null : prev));
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.code === 'Space') { e.preventDefault(); wsRef.current?.playPause(); }
            if ((e.code === 'Delete' || e.code === 'Backspace') && activeRegionId) { e.preventDefault(); removeRegion(activeRegionId); }
            if (e.code === 'Home') wsRef.current?.seekTo(0);
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, activeRegionId, onClose, removeRegion]);

    useEffect(() => { wsRef.current?.setVolume(volume); }, [volume]);
    useEffect(() => { if (wsRef.current && isReady) wsRef.current.zoom(zoom * 20); }, [zoom, isReady]);

    const handleOpenFile = useCallback(async () => {
        const picked = await pickPath({ mode: 'file', filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'wem'] }, { name: 'All', extensions: ['*'] }], recentsKey: 'audio' });
        if (typeof picked === 'string') void loadSource({ path: picked, name: picked.split(/[\\/]/).pop() || 'audio' });
    }, [loadSource]);

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
        if (!ext || !['wav', 'mp3', 'ogg', 'wem'].includes(ext)) return;
        const path = (file as File & { path?: string }).path;
        if (path) void loadSource({ path, name: file.name });
    }, [loadSource]);

    const handlePlayPause = () => wsRef.current?.playPause();
    const handleStop = () => { wsRef.current?.stop(); };

    const addRegionAtCursor = useCallback(() => {
        const plugin = regionsPluginRef.current;
        if (!plugin) return;
        const cur = currentTime;
        const end = Math.min(duration || cur + 1, cur + 1);
        const idx = (regionCount.current += 1);
        const label = document.createElement('span');
        label.textContent = `segment_${String(idx).padStart(3, '0')}`;
        plugin.addRegion({ start: cur, end, color: REGION_COLOR, content: label, drag: true, resize: true });
    }, [currentTime, duration]);

    const handleTimeEdit = useCallback((id: string, field: 'start' | 'end', rawVal: string) => {
        setEditingTime(null);
        const secs = parseFloat(rawVal);
        if (isNaN(secs)) return;
        setRegions((prev) => prev.map((r) => {
            if (r.id !== id) return r;
            const newStart = field === 'start' ? Math.max(0, secs) : r.start;
            const newEnd = field === 'end' ? Math.max(r.start + 0.01, secs) : r.end;
            const wsReg = regionsPluginRef.current?.getRegions().find((x) => x.id === id);
            wsReg?.setOptions({ start: newStart, end: newEnd });
            return { ...r, start: newStart, end: newEnd };
        }));
    }, []);

    /* Silence-based auto-split on the decoded PCM buffer. */
    const handleAutoSplit = useCallback(() => {
        setAutoSplitAnchor(null);
        const buffer = audioBufferRef.current;
        const plugin = regionsPluginRef.current;
        if (!buffer || !plugin) { flash('Load audio before auto-splitting'); return; }

        const data = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        const threshold = Math.pow(10, splitThreshold / 20);
        const minSilenceSamples = (splitMinSilence / 1000) * sampleRate;
        const padSec = splitPad / 1000;
        const win = Math.max(1, Math.floor(sampleRate * 0.01));

        const segments: { start: number; end: number }[] = [];
        let segStart = -1;
        let silenceRun = 0;
        for (let i = 0; i < data.length; i += win) {
            let peak = 0;
            for (let j = i; j < Math.min(i + win, data.length); j++) peak = Math.max(peak, Math.abs(data[j]));
            const loud = peak >= threshold;
            if (loud) {
                if (segStart < 0) segStart = i;
                silenceRun = 0;
            } else if (segStart >= 0) {
                silenceRun += win;
                if (silenceRun >= minSilenceSamples) {
                    segments.push({ start: segStart / sampleRate, end: (i - silenceRun) / sampleRate });
                    segStart = -1;
                    silenceRun = 0;
                }
            }
        }
        if (segStart >= 0) segments.push({ start: segStart / sampleRate, end: data.length / sampleRate });

        if (segments.length === 0) { flash('No segments detected — lower the threshold'); return; }

        plugin.clearRegions();
        regionCount.current = 0;
        setRegions([]);
        setActiveRegionId(null);
        for (const seg of segments) {
            const start = Math.max(0, seg.start - padSec);
            const end = Math.min(buffer.duration, seg.end + padSec);
            if (end - start < 0.05) continue;
            const idx = (regionCount.current += 1);
            const label = document.createElement('span');
            label.textContent = `segment_${String(idx).padStart(3, '0')}`;
            plugin.addRegion({ start, end, color: REGION_COLOR, content: label, drag: true, resize: true });
        }
        flash(`Auto-split into ${segments.length} segment(s)`);
    }, [splitThreshold, splitMinSilence, splitPad, flash]);

    const removeAllRegions = useCallback(() => {
        regionsPluginRef.current?.clearRegions();
        regionCount.current = 0;
        setRegions([]);
        setActiveRegionId(null);
    }, []);

    const handleRename = useCallback((id: string, name: string) => {
        setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
        const wsReg = regionsPluginRef.current?.getRegions().find((x) => x.id === id);
        if (wsReg) { const label = document.createElement('span'); label.textContent = name; wsReg.setOptions({ content: label }); }
        setEditingName(null);
    }, []);

    const seekToRegion = useCallback((region: Region) => {
        if (wsRef.current && duration > 0) wsRef.current.seekTo(region.start / duration);
        setActiveRegionId(region.id);
    }, [duration]);

    const sliceRegion = useCallback((reg: Region): Uint8Array | null => {
        const buffer = audioBufferRef.current;
        if (!buffer) return null;
        return encodeWavSlice(buffer, reg.start, reg.end);
    }, []);

    const handleExportOne = useCallback(async (reg: Region) => {
        const wav = sliceRegion(reg);
        if (!wav) { flash('Audio not decoded yet'); return; }
        const dir = await pickPath({ mode: 'directory' });
        if (typeof dir !== 'string') return;
        setIsExporting(true);
        try {
            const safe = reg.name.replace(/[<>:"/\\|?*]/g, '_');
            await writeFileBytes(await join(dir, `${safe}.wav`), wav);
            flash(`Exported ${safe}.wav`);
        } catch (e) {
            log.error('[AudioSplitter] export failed', e);
            flash(`Export failed: ${(e as Error).message}`);
        } finally {
            setIsExporting(false);
        }
    }, [sliceRegion, flash]);

    const handleExportAll = useCallback(async () => {
        if (regions.length === 0) return;
        if (!audioBufferRef.current) { flash('Audio not decoded yet'); return; }
        const dir = await pickPath({ mode: 'directory' });
        if (typeof dir !== 'string') return;
        setIsExporting(true);
        try {
            const sorted = [...regions].sort((a, b) => a.start - b.start);
            let n = 0;
            for (const reg of sorted) {
                const wav = sliceRegion(reg);
                if (!wav) continue;
                setExportProgress(`Exporting ${reg.name} (${n + 1}/${sorted.length})...`);
                const safe = reg.name.replace(/[<>:"/\\|?*]/g, '_');
                await writeFileBytes(await join(dir, `${safe}.wav`), wav);
                n++;
            }
            flash(`Exported ${n} segment(s)`);
        } catch (e) {
            log.error('[AudioSplitter] export all failed', e);
            flash(`Export failed: ${(e as Error).message}`);
        } finally {
            setIsExporting(false);
        }
    }, [regions, sliceRegion, flash]);

    const handleReplace = useCallback(async () => {
        if (!onReplace || !initialFile?.nodeId) return;
        const buffer = audioBufferRef.current;
        if (!buffer) { flash('Audio not decoded yet'); return; }
        setIsExporting(true);
        try {
            // Replace with the first region if one is set, else the whole clip.
            const sorted = [...regions].sort((a, b) => a.start - b.start);
            const region = sorted[0];
            const wav = region ? encodeWavSlice(buffer, region.start, region.end) : encodeWavSlice(buffer, 0, buffer.duration);

            let outBytes = wav;
            if (sourceWasWem.current) {
                // Round-trip WAV -> WEM via a temp file so WwiseConsole can read it.
                const tmp = await join(await tempDir(), `quartz_splitter_${Date.now()}.wav`);
                await writeFileBytes(tmp, wav);
                setExportProgress('Encoding WEM...');
                outBytes = await convertToWem(tmp);
            }
            onReplace(outBytes, initialFile.nodeId, initialFile.pane);
            flash('Replaced original audio');
            onClose();
        } catch (e) {
            log.error('[AudioSplitter] replace failed', e);
            flash(`Replace failed: ${(e as Error).message}`);
        } finally {
            setIsExporting(false);
        }
    }, [onReplace, initialFile, regions, flash, onClose]);

    const handleExportSegmentsToRef = useCallback(() => {
        if (regions.length === 0 || !onExportSegments) return;
        if (!audioBufferRef.current) { flash('Audio not decoded yet'); return; }
        const segments: SplitterSegment[] = [...regions]
            .sort((a, b) => a.start - b.start)
            .map((reg) => ({ name: reg.name, data: sliceRegion(reg) || new Uint8Array(0) }))
            .filter((s) => s.data.length > 0);
        onExportSegments(segments);
        flash(`Pushed ${segments.length} segment(s) to reference pane`);
    }, [regions, onExportSegments, sliceRegion, flash]);

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
                background: 'color-mix(in oklab, var(--bg-primary) 97%, transparent)', display: 'flex', flexDirection: 'column',
                fontFamily: 'var(--font-mono)',
                outline: isDragOver ? '2px solid var(--accent-primary)' : '2px solid transparent', outlineOffset: '-3px',
                transition: 'outline-color 0.1s',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
                <ContentCut sx={{ fontSize: 18, color: 'var(--accent-primary)', mr: 0.5 }} />
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.1em', mr: 1 }}>
                    AUDIO SPLITTER
                </Typography>

                {loadedName && (
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)', mr: 1, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loadedName}
                    </Typography>
                )}

                <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={handleOpenFile}>
                    <span className="dl-icon"><FolderOpen sx={{ fontSize: 14 }} /></span>
                    <span>Open File</span>
                </button>

                <Box sx={{ flex: 1 }} />

                {regions.length > 0 && (
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={handleExportAll} disabled={isExporting || !isReady}>
                        <span className="dl-icon"><Download sx={{ fontSize: 14 }} /></span>
                        <span>Export All ({regions.length})</span>
                    </button>
                )}

                {regions.length > 0 && (
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={handleExportSegmentsToRef} disabled={isExporting || !isReady}>
                        <span className="dl-icon"><ViewStream sx={{ fontSize: 14 }} /></span>
                        <span>PUSH TO REF</span>
                    </button>
                )}

                {initialFile?.nodeId && (
                    <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={handleReplace} disabled={isExporting || !isReady}>
                        <span className="dl-icon"><Upload sx={{ fontSize: 14 }} /></span>
                        <span>REPLACE ORIGINAL</span>
                    </button>
                )}

                <button className="dl-btn dl-btn--danger dl-btn--sm" onClick={onClose} style={{ marginLeft: 8 }}>
                    <span className="dl-icon"><Close sx={{ fontSize: 14 }} /></span>
                    <span>CLOSE</span>
                </button>
            </Box>

            {(isExporting || exportProgress) && (
                <Box sx={{ px: 2, pt: 0.5, pb: 0.25, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    {isExporting && <LinearProgress sx={{ height: 2, borderRadius: 1, background: 'var(--bg-tertiary)', '& .MuiLinearProgress-bar': { background: 'var(--accent-primary)' } }} />}
                    <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-muted)', mt: 0.5 }}>{exportProgress}</Typography>
                </Box>
            )}

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
                {isLoading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'color-mix(in oklab, var(--bg-primary) 60%, transparent)', p: 0.5 }}>
                        <LinearProgress sx={{ height: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent-primary)' } }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent-primary)', textAlign: 'center', mt: 0.5 }}>Loading audio...</Typography>
                    </Box>
                )}

                {!isReady && !isLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', flexDirection: 'column', gap: 1 }}>
                        <ContentCut sx={{ fontSize: 48, opacity: isDragOver ? 0.7 : 0.3, color: isDragOver ? 'var(--accent-primary)' : 'inherit', transition: 'all 0.15s' }} />
                        <Typography sx={{ fontSize: '0.8rem', fontFamily: 'inherit', color: isDragOver ? 'var(--accent-primary)' : 'inherit', transition: 'color 0.15s' }}>
                            {isDragOver ? 'Drop to load' : 'Drop a WAV/MP3/OGG/WEM here, or click Open File'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', opacity: 0.6 }}>Drag across the waveform to mark a segment · Space to play/pause</Typography>
                    </Box>
                )}

                {isDragOver && isReady && (
                    <Box sx={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--bg-primary) 82%, transparent)', pointerEvents: 'none', flexDirection: 'column', gap: 1 }}>
                        <ContentCut sx={{ fontSize: 48, color: 'var(--accent-primary)', opacity: 0.8 }} />
                        <Typography sx={{ fontSize: '0.9rem', color: 'var(--accent-primary)', fontFamily: 'inherit' }}>Drop to replace</Typography>
                    </Box>
                )}

                {/* Live waveform surface (wavesurfer.js). */}
                <Box sx={{ px: 2, pt: 1.5, display: isReady || isLoading ? 'block' : 'none' }}>
                    <Box sx={{ background: 'var(--bg-primary)', borderRadius: '8px', overflow: 'hidden', minHeight: 110 }}>
                        <div ref={waveContainerRef} style={{ width: '100%' }} />
                    </Box>
                    <Box sx={{ mt: 0.25, height: 20 }} />
                </Box>

                {isReady && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderTop: '1px solid var(--border)', mt: 0.5 }}>
                        <Tooltip title="Go to start (Home)">
                            <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost" onClick={() => wsRef.current?.seekTo(0)}>
                                <span className="dl-icon"><SkipPrevious sx={{ fontSize: 18 }} /></span>
                            </button>
                        </Tooltip>
                        <Tooltip title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                            <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost" onClick={handlePlayPause} style={{ color: 'var(--accent-primary)' }}>
                                <span className="dl-icon">{isPlaying ? <Pause sx={{ fontSize: 22 }} /> : <PlayArrow sx={{ fontSize: 22 }} />}</span>
                            </button>
                        </Tooltip>
                        <Tooltip title="Stop">
                            <button className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost" onClick={handleStop}>
                                <span className="dl-icon"><Stop sx={{ fontSize: 18 }} /></span>
                            </button>
                        </Tooltip>

                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 130, ml: 0.5 }}>
                            {fmtTime(currentTime)} / {fmtTime(duration)}
                        </Typography>

                        <VolumeUp sx={{ fontSize: 16, color: 'var(--text-muted)', ml: 1 }} />
                        <Slider min={0} max={1} step={0.01} value={volume} onChange={(_, v) => setVolume(v as number)} sx={{ width: 80, color: 'var(--accent-primary)', ...slotSx }} />

                        <Box sx={{ flex: 1 }} />

                        <ZoomOut sx={{ fontSize: 16, color: 'var(--text-muted)' }} />
                        <Slider min={1} max={300} step={1} value={zoom} onChange={(_, v) => setZoom(v as number)} sx={{ width: 120, color: 'var(--accent-primary)', ...slotSx }} />
                        <ZoomIn sx={{ fontSize: 16, color: 'var(--text-muted)' }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: 36 }}>{zoom}×</Typography>

                        <Tooltip title="Add segment at cursor">
                            <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={addRegionAtCursor} style={{ marginLeft: 8 }}>
                                <span className="dl-icon"><Add sx={{ fontSize: 14 }} /></span>
                                <span>Add Segment</span>
                            </button>
                        </Tooltip>

                        <Tooltip title="Auto-split by silence">
                            <button className="dl-btn dl-btn--secondary dl-btn--sm" disabled={!isReady} onClick={(e) => setAutoSplitAnchor(e.currentTarget)} style={{ marginLeft: 8 }}>
                                <span className="dl-icon"><AutoFixHigh sx={{ fontSize: 14 }} /></span>
                                <span>Auto-Split</span>
                            </button>
                        </Tooltip>

                        {regions.length > 0 && (
                            <Tooltip title="Clear all regions">
                                <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={removeAllRegions} style={{ marginLeft: 8 }}>
                                    <span>Clear all</span>
                                </button>
                            </Tooltip>
                        )}

                        <Popover
                            open={Boolean(autoSplitAnchor)}
                            anchorEl={autoSplitAnchor}
                            onClose={() => setAutoSplitAnchor(null)}
                            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                            transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                            PaperProps={{ sx: { background: 'color-mix(in oklab, var(--bg-secondary) 98%, transparent)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)', p: 2, minWidth: 260, fontFamily: 'var(--font-mono)' } }}
                        >
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-primary)', mb: 1.5, letterSpacing: '0.08em' }}>AUTO-SPLIT SETTINGS</Typography>

                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', mb: 0.25 }}>
                                Silence threshold: <b style={{ color: 'var(--text-secondary)' }}>{splitThreshold} dB</b>
                            </Typography>
                            <Slider min={-70} max={-10} step={1} value={splitThreshold} onChange={(_, v) => setSplitThreshold(v as number)} sx={{ color: 'var(--accent-primary)', mb: 1.5, ...slotSx }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', mb: 0.25 }}>
                                Min silence gap: <b style={{ color: 'var(--text-secondary)' }}>{splitMinSilence} ms</b>
                            </Typography>
                            <Slider min={50} max={2000} step={10} value={splitMinSilence} onChange={(_, v) => setSplitMinSilence(v as number)} sx={{ color: 'var(--accent-primary)', mb: 1.5, ...slotSx }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', mb: 0.25 }}>
                                Segment padding: <b style={{ color: 'var(--text-secondary)' }}>{splitPad} ms</b>
                            </Typography>
                            <Slider min={0} max={200} step={5} value={splitPad} onChange={(_, v) => setSplitPad(v as number)} sx={{ color: 'var(--accent-primary)', mb: 2, ...slotSx }} />

                            <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={handleAutoSplit} style={{ width: '100%' }}>
                                <span>Split Now</span>
                            </button>
                        </Popover>
                    </Box>
                )}

                {sortedRegions.length > 0 && (
                    <Box sx={{ borderTop: '1px solid var(--border)', overflowY: 'auto', maxHeight: 240, flexShrink: 0 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                            {headerCells.map((h, i) => (
                                <Typography key={`${h}-${i}`} sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em' }}>{h}</Typography>
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
                                onExport={(r) => void handleExportOne(r)}
                                onRemove={removeRegion}
                            />
                        ))}

                        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', gap: 2 }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                {regions.length} segment{regions.length !== 1 ? 's' : ''} &nbsp;·&nbsp; total: {fmtTime(sortedRegions.reduce((a, r) => a + (r.end - r.start), 0))}
                            </Typography>
                            <Typography sx={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                Drag on waveform to mark · Double-click name to rename · Space to play · Del to remove selected
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
