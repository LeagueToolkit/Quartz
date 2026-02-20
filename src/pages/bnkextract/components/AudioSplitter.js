/**
 * AudioSplitter — Load a WAV/MP3, mark regions by drag, export each as individual WAV.
 * Uses WaveSurfer.js v7 with Regions, Timeline, Zoom, and Hover plugins.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Button, IconButton, TextField, Slider, Tooltip, LinearProgress, Popover,
} from '@mui/material';
import {
    Close, PlayArrow, Pause, Stop, FolderOpen, Download, Upload,
    Delete, ZoomIn, ZoomOut, ContentCut, SkipPrevious, VolumeUp, AutoFixHigh, Save, ViewStream,
} from '@mui/icons-material';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline';
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom';
import HoverPlugin from 'wavesurfer.js/dist/plugins/hover';

// ─── Colour palette for regions ──────────────────────────────────────────────
const REGION_COLORS = [
    'rgba(99,179,237,0.28)', 'rgba(154,230,180,0.28)', 'rgba(252,176,64,0.28)',
    'rgba(183,148,246,0.28)', 'rgba(245,101,101,0.28)', 'rgba(129,230,217,0.28)',
    'rgba(246,173,85,0.28)', 'rgba(198,246,213,0.28)',
];
let colorIdx = 0;
const nextColor = () => REGION_COLORS[(colorIdx++) % REGION_COLORS.length];

// ─── Pure-JS WAV builder ──────────────────────────────────────────────────────
function sliceAndEncodeWav(audioBuffer, startSec, endSec) {
    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.numberOfChannels;
    const s0 = Math.max(0, Math.floor(startSec * sr));
    const s1 = Math.min(audioBuffer.length, Math.ceil(endSec * sr));
    const len = s1 - s0;
    if (len <= 0) return null;

    const dataSize = len * ch * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);
    const wr = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };

    wr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
    wr(8, 'WAVE'); wr(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);            // PCM
    v.setUint16(22, ch, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * 2, true);  // byte rate
    v.setUint16(32, ch * 2, true);       // block align
    v.setUint16(34, 16, true);           // bits per sample
    wr(36, 'data'); v.setUint32(40, dataSize, true);

    let off = 44;
    for (let i = 0; i < len; i++) {
        for (let c = 0; c < ch; c++) {
            const samp = Math.max(-1, Math.min(1, audioBuffer.getChannelData(c)[s0 + i]));
            v.setInt16(off, samp < 0 ? samp * 32768 : samp * 32767, true);
            off += 2;
        }
    }
    return Buffer.from(buf);
}

function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00.000';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

// ─── Silence detector ─────────────────────────────────────────────────────────
function detectSegments(audioBuffer, { thresholdDb = -40, minSilenceMs = 300, minSegmentMs = 80, padMs = 30 } = {}) {
    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const WIN = Math.max(1, Math.floor(sr * 0.01)); // 10 ms analysis window
    const threshold = Math.pow(10, thresholdDb / 20);
    const minSilWin = Math.max(1, Math.ceil(minSilenceMs / 10));
    const minSegSamp = Math.floor(sr * minSegmentMs / 1000);
    const padSamp = Math.floor(sr * padMs / 1000);
    const numWin = Math.ceil(len / WIN);

    // RMS per window (all channels combined)
    const silent = new Uint8Array(numWin);
    for (let w = 0; w < numWin; w++) {
        const s = w * WIN, e = Math.min(s + WIN, len);
        let sum = 0, n = 0;
        for (let c = 0; c < ch; c++) {
            const d = audioBuffer.getChannelData(c);
            for (let i = s; i < e; i++) { sum += d[i] * d[i]; n++; }
        }
        silent[w] = Math.sqrt(sum / n) < threshold ? 1 : 0;
    }

    const segments = [];
    let w = 0;
    while (w < numWin && silent[w]) w++; // skip leading silence

    while (w < numWin) {
        const segStartW = w;
        let segEndW = w;
        while (w < numWin) {
            if (!silent[w]) { segEndW = w + 1; w++; continue; }
            // peek how long this silence run is
            let silEnd = w;
            while (silEnd < numWin && silent[silEnd]) silEnd++;
            if (silEnd - w >= minSilWin) break; // long enough → split
            segEndW = silEnd; w = silEnd;        // short silence → merge
        }
        const s0 = Math.max(0, segStartW * WIN - padSamp);
        const s1 = Math.min(len, segEndW * WIN + padSamp);
        if (s1 - s0 >= minSegSamp) segments.push({ start: s0 / sr, end: s1 / sr });
        while (w < numWin && silent[w]) w++;
    }
    return segments;
}

// ─── Memoised region row — only re-renders when its own data changes ─────────
const RegionRow = React.memo(function RegionRow({
    reg, index, isActive, isEditingName, isEditingStart, isEditingEnd,
    onSeek, onSetEditingName, onRename, onSetEditingTime, onTimeEdit, onExport, onRemove,
}) {
    const dur = reg.end - reg.start;
    return (
        <Box
            onClick={() => onSeek(reg)}
            sx={{
                display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px',
                gap: 0, px: 1.5, py: 0.4, cursor: 'pointer', alignItems: 'center',
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
                    onBlur={e => onRename(reg.id, e.target.value || reg.name)}
                    onKeyDown={e => { if (e.key === 'Enter') onRename(reg.id, e.target.value || reg.name); if (e.key === 'Escape') onSetEditingName(null); }}
                    onClick={e => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.72rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={{ '& .MuiOutlinedInput-root': { background: 'rgba(0,0,0,0.4)', '& fieldset': { borderColor: 'var(--accent)' } } }}
                />
            ) : (
                <Typography
                    onDoubleClick={e => { e.stopPropagation(); onSetEditingName(reg.id); }}
                    sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                    title="Double-click to rename"
                >{reg.name}</Typography>
            )}

            {isEditingStart ? (
                <TextField autoFocus size="small"
                    defaultValue={reg.start.toFixed(3)}
                    onBlur={e => onTimeEdit(reg.id, 'start', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onTimeEdit(reg.id, 'start', e.target.value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={e => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.65rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={{ '& .MuiOutlinedInput-root': { background: 'rgba(0,0,0,0.4)', '& fieldset': { borderColor: 'var(--accent)' } } }}
                />
            ) : (
                <Typography onClick={e => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'start' }); }}
                    sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', cursor: 'text', '&:hover': { color: 'var(--accent)' } }}
                    title="Click to edit start time (seconds)">
                    {fmtTime(reg.start)}
                </Typography>
            )}

            {isEditingEnd ? (
                <TextField autoFocus size="small"
                    defaultValue={reg.end.toFixed(3)}
                    onBlur={e => onTimeEdit(reg.id, 'end', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onTimeEdit(reg.id, 'end', e.target.value); if (e.key === 'Escape') onSetEditingTime(null); }}
                    onClick={e => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.65rem', fontFamily: 'JetBrains Mono', padding: '1px 4px', color: 'var(--text)' } }}
                    sx={{ '& .MuiOutlinedInput-root': { background: 'rgba(0,0,0,0.4)', '& fieldset': { borderColor: 'var(--accent)' } } }}
                />
            ) : (
                <Typography onClick={e => { e.stopPropagation(); onSetEditingTime({ id: reg.id, field: 'end' }); }}
                    sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', cursor: 'text', '&:hover': { color: 'var(--accent)' } }}
                    title="Click to edit end time (seconds)">
                    {fmtTime(reg.end)}
                </Typography>
            )}

            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)' }}>{fmtTime(dur)}</Typography>

            <Box sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function AudioSplitter({ open, onClose, initialFile, onReplace, onExportSegments }) {
    const containerRef = useRef(null);
    const timelineRef = useRef(null);
    const wsRef = useRef(null);
    const regionsRef = useRef(null);
    const audioBufferRef = useRef(null);
    const blobUrlRef = useRef(null);

    const currentTimeRef = useRef(null); // DOM span — updated without React state
    const rafIdRef = useRef(null);        // rAF handle for region-updated throttle

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [regions, setRegions] = useState([]); // [{id, name, start, end}]
    const [activeRegionId, setActiveRegionId] = useState(null);
    const [loadedName, setLoadedName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState('');
    const [editingName, setEditingName] = useState(null); // region id being renamed
    const [editingTime, setEditingTime] = useState(null); // { id, field: 'start'|'end' }
    const [isDragOver, setIsDragOver] = useState(false);
    const [volume, setVolume] = useState(0.05);
    const [autoSplitAnchor, setAutoSplitAnchor] = useState(null);
    const [splitThreshold, setSplitThreshold] = useState(-40);
    const [splitMinSilence, setSplitMinSilence] = useState(300);
    const [splitPad, setSplitPad] = useState(30);

    // ── Init WaveSurfer ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!open || !containerRef.current) return;

        colorIdx = 0;

        const regPlugin = RegionsPlugin.create();
        regionsRef.current = regPlugin;

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: (() => {
                try {
                    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4fc3f7';
                    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                    return `rgba(${r},${g},${b},0.45)`;
                } catch (_) { return 'rgba(79,195,247,0.45)'; }
            })(),
            progressColor: (() => {
                try {
                    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4fc3f7';
                    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                    return `rgba(${r},${g},${b},0.9)`;
                } catch (_) { return 'rgba(79,195,247,0.9)'; }
            })(),
            cursorColor: 'rgba(255,255,255,0.8)',
            cursorWidth: 2,
            height: 110,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
            backend: 'WebAudio',
            plugins: [
                regPlugin,
                TimelinePlugin.create({
                    container: timelineRef.current,
                    height: 20,
                    primaryColor: 'rgba(255,255,255,0.5)',
                    secondaryColor: 'rgba(255,255,255,0.25)',
                    primaryFontColor: 'rgba(255,255,255,0.6)',
                    secondaryFontColor: 'rgba(255,255,255,0.35)',
                    style: { fontSize: '9px', fontFamily: 'JetBrains Mono, monospace' },
                }),
                ZoomPlugin.create({ scale: 0.01, maxZoom: 300 }),
                HoverPlugin.create({
                    lineColor: 'rgba(255,255,255,0.4)',
                    lineWidth: 1,
                    labelBackground: 'rgba(0,0,0,0.7)',
                    labelColor: 'rgba(255,255,255,0.8)',
                    labelSize: '10px',
                    formatTimeCallback: fmtTime,
                }),
            ],
        });
        wsRef.current = ws;

        // Enable drag-to-create regions
        regPlugin.enableDragSelection({ color: nextColor() });

        // Events
        ws.on('ready', (dur) => {
            setDuration(dur);
            setIsReady(true);
            setIsLoading(false);
            ws.setVolume(volume);
        });
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));
        // Direct DOM write — no React state, no re-render every frame
        ws.on('timeupdate', (t) => {
            if (currentTimeRef.current) currentTimeRef.current.textContent = fmtTime(t);
        });

        regPlugin.on('region-created', (region) => {
            const color = nextColor();
            region.setOptions({ color });
            const idx = regionsRef._regionCount = (regionsRef._regionCount || 0) + 1;
            const name = `segment_${String(idx).padStart(3, '0')}`;
            setRegions(prev => [...prev, { id: region.id, name, start: region.start, end: region.end }]);
            // Update drag-selection color for next region
            regPlugin.enableDragSelection({ color: nextColor() });
            colorIdx--; // nextColor was called twice, correct
        });
        regPlugin.on('region-updated', (region) => {
            // rAF throttle: at most one React update per frame during drag
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null;
                setRegions(prev => prev.map(r => r.id === region.id ? { ...r, start: region.start, end: region.end } : r));
            });
        });
        regPlugin.on('region-clicked', (region, e) => {
            e.stopPropagation();
            setActiveRegionId(region.id);
            region.play();
        });

        return () => {
            if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
            try { ws.stop(); } catch (_) { }
            ws.destroy();
            wsRef.current = null;
            regionsRef.current = null;
            audioBufferRef.current = null;
            if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
            setIsReady(false);
            setIsPlaying(false);
            setRegions([]);
            setActiveRegionId(null);
            setDuration(0);
            setZoom(1);
            setLoadedName('');
        };
    }, [open]);

    // ── Auto-load initialFile ─────────────────────────────────────────────────
    useEffect(() => {
        if (open && initialFile?.path && wsRef.current && containerRef.current) {
            loadFile(initialFile.path, initialFile.name);
        }
    }, [open, initialFile]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Space') { e.preventDefault(); wsRef.current?.playPause(); }
            if ((e.code === 'Delete' || e.code === 'Backspace') && activeRegionId) {
                e.preventDefault();
                removeRegion(activeRegionId);
            }
            if (e.code === 'Home') wsRef.current?.seekTo(0);
            if (e.code === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, activeRegionId, onClose]);

    // ── Load audio file ───────────────────────────────────────────────────────
    const loadFile = useCallback(async (filePath, fileName) => {
        if (!wsRef.current || !window.require) return;
        const fs = window.require('fs');
        const path = window.require('path');

        setIsLoading(true);
        setIsReady(false);
        setRegions([]);
        setActiveRegionId(null);
        colorIdx = 0;
        if (regionsRef._regionCount) regionsRef._regionCount = 0;

        try {
            // Revoke any previous blob URL
            if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

            // Read file into Buffer/Blob and use createObjectURL to bypass security blocks
            const data = fs.readFileSync(filePath);
            const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)]);
            blobUrlRef.current = URL.createObjectURL(blob);
            wsRef.current.load(blobUrlRef.current);

            // Decode audio independently for WAV export
            const arrBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            audioBufferRef.current = await ctx.decodeAudioData(arrBuf);
            ctx.close();

            setLoadedName(fileName || path.basename(filePath));
        } catch (err) {
            setIsLoading(false);
            console.error('[AudioSplitter] load error:', err);
        }
    }, []);

    // ── Sync volume ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (wsRef.current && isReady) {
            wsRef.current.setVolume(volume);
        }
    }, [volume, isReady]);

    // ── Open file dialog ──────────────────────────────────────────────────────
    const handleOpenFile = useCallback(async () => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openFile', {
            title: 'Open Audio File',
            properties: ['openFile'],
            filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }, { name: 'All', extensions: ['*'] }],
        });
        if (!result?.canceled && result?.filePaths?.length) {
            const fp = result.filePaths[0];
            const path = window.require('path');
            loadFile(fp, path.basename(fp));
        }
    }, [loadFile]);

    // ── Drag-and-drop file load ───────────────────────────────────────────────
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const hasFile = [...(e.dataTransfer.items || [])].some(i => i.kind === 'file');
        if (hasFile) { e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); }
    }, []);

    const handleDragLeave = useCallback((e) => {
        // Only clear if leaving the root element entirely
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['wav', 'mp3'].includes(ext)) return;
        loadFile(file.path, file.name);
    }, [loadFile]);

    // ── Playback ──────────────────────────────────────────────────────────────
    const handlePlayPause = () => wsRef.current?.playPause();
    const handleStop = () => { wsRef.current?.stop(); wsRef.current?.seekTo(0); };

    // ── Volume ────────────────────────────────────────────────────────────────
    const handleVolumeChange = useCallback((_, val) => {
        setVolume(val);
        wsRef.current?.setVolume(val);
    }, []);

    // ── Zoom ──────────────────────────────────────────────────────────────────
    const handleZoomChange = useCallback((_, val) => {
        setZoom(val);
        wsRef.current?.zoom(val);
    }, []);

    // ── Edit region start/end ─────────────────────────────────────────────────
    const handleTimeEdit = useCallback((id, field, rawVal) => {
        setEditingTime(null);
        const secs = parseFloat(rawVal);
        if (isNaN(secs)) return;
        setRegions(prev => prev.map(r => {
            if (r.id !== id) return r;
            const newStart = field === 'start' ? Math.max(0, secs) : r.start;
            const newEnd = field === 'end' ? Math.max(r.start + 0.01, secs) : r.end;
            // Update the live WaveSurfer region handle too
            const wsReg = regionsRef.current?.getRegions()?.find(wr => wr.id === id);
            if (wsReg) wsReg.setOptions({ start: newStart, end: newEnd });
            return { ...r, start: newStart, end: newEnd };
        }));
    }, []);

    // ── Auto-split by silence ─────────────────────────────────────────────────
    const handleAutoSplit = useCallback(() => {
        if (!audioBufferRef.current || !regionsRef.current) return;
        setAutoSplitAnchor(null);

        // Clear existing regions
        regionsRef.current.getRegions?.()?.forEach(r => r.remove());
        setRegions([]);
        setActiveRegionId(null);
        colorIdx = 0;
        if (regionsRef._regionCount) regionsRef._regionCount = 0;

        const segs = detectSegments(audioBufferRef.current, {
            thresholdDb: splitThreshold,
            minSilenceMs: splitMinSilence,
            padMs: splitPad,
        });

        const newRegions = segs.map((seg, i) => {
            const color = nextColor();
            const name = `segment_${String(i + 1).padStart(3, '0')}`;
            const wsReg = regionsRef.current.addRegion({ start: seg.start, end: seg.end, color, drag: true, resize: true });
            regionsRef._regionCount = i + 1;
            return { id: wsReg.id, name, start: seg.start, end: seg.end };
        });

        setRegions(newRegions);
        // re-arm drag-selection color
        regionsRef.current.enableDragSelection({ color: nextColor() });
    }, [audioBufferRef, splitThreshold, splitMinSilence, splitPad, volume]);

    // ── Remove region ─────────────────────────────────────────────────────────
    const removeRegion = useCallback((id) => {
        const wsRegion = regionsRef.current?.getRegions()?.find(r => r.id === id);
        wsRegion?.remove();
        setRegions(prev => prev.filter(r => r.id !== id));
        setActiveRegionId(prev => prev === id ? null : prev);
    }, []);

    const removeAllRegions = useCallback(() => {
        regionsRef.current?.getRegions()?.forEach(r => r.remove());
        setRegions([]);
        setActiveRegionId(null);
    }, []);

    // ── Rename region ─────────────────────────────────────────────────────────
    const handleRename = useCallback((id, name) => {
        setRegions(prev => prev.map(r => r.id === id ? { ...r, name } : r));
        setEditingName(null);
    }, []);

    // ── Seek to region ────────────────────────────────────────────────────────
    const seekToRegion = useCallback((region) => {
        if (!wsRef.current) return;
        const dur = wsRef.current.getDuration();
        if (!dur) return;
        wsRef.current.seekTo(region.start / dur);
        setActiveRegionId(region.id);
    }, []);

    // ── Export all regions ────────────────────────────────────────────────────
    const handleExportAll = useCallback(async () => {
        if (!audioBufferRef.current || regions.length === 0 || !window.require) return;
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        const dirResult = await ipcRenderer.invoke('dialog:openDirectory', { title: 'Choose Export Folder' });
        if (!dirResult?.filePaths?.length) return;
        const outDir = dirResult.filePaths[0];

        setIsExporting(true);
        const sorted = [...regions].sort((a, b) => a.start - b.start);

        try {
            for (let i = 0; i < sorted.length; i++) {
                const reg = sorted[i];
                setExportProgress(`Exporting ${i + 1} / ${sorted.length}: ${reg.name}`);
                const wavBuf = sliceAndEncodeWav(audioBufferRef.current, reg.start, reg.end);
                if (wavBuf) {
                    const outPath = path.join(outDir, `${reg.name}.wav`);
                    fs.writeFileSync(outPath, wavBuf);
                }
            }
            setExportProgress(`Done! ${sorted.length} file(s) saved to ${path.basename(outDir)}`);
            setTimeout(() => setExportProgress(''), 4000);
        } catch (err) {
            setExportProgress(`Error: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    }, [regions]);

    // ── Export single region ──────────────────────────────────────────────────
    const handleExportOne = useCallback(async (reg) => {
        if (!audioBufferRef.current || !window.require) return;
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');

        const result = await ipcRenderer.invoke('dialog:saveFile', {
            defaultPath: `${reg.name}.wav`,
            filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
        });
        if (result?.canceled || !result?.filePath) return;
        const wavBuf = sliceAndEncodeWav(audioBufferRef.current, reg.start, reg.end);
        if (wavBuf) fs.writeFileSync(result.filePath, wavBuf);
    }, []);

    const handleCut = useCallback(() => {
        if (!activeRegionId || !audioBufferRef.current || !wsRef.current) return;

        const reg = regions.find(r => r.id === activeRegionId);
        if (!reg) return;

        // Remove the visual region from WaveSurfer immediately
        const wsRegToCut = regionsRef.current?.getRegions()?.find(wr => wr.id === activeRegionId);
        if (wsRegToCut) wsRegToCut.remove();

        const sr = audioBufferRef.current.sampleRate;
        const ch = audioBufferRef.current.numberOfChannels;
        const startSamp = Math.floor(reg.start * sr);
        const endSamp = Math.ceil(reg.end * sr);
        const cutLen = endSamp - startSamp;

        if (cutLen <= 0) return;

        const newLen = audioBufferRef.current.length - cutLen;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const newBuf = ctx.createBuffer(ch, newLen, sr);

        for (let c = 0; c < ch; c++) {
            const oldData = audioBufferRef.current.getChannelData(c);
            const newData = newBuf.getChannelData(c);

            // Copy before cut
            newData.set(oldData.subarray(0, startSamp));
            // Copy after cut
            newData.set(oldData.subarray(endSamp), startSamp);
        }
        ctx.close();

        // Update states
        audioBufferRef.current = newBuf;
        setDuration(newBuf.length / sr);

        // Shift remaining regions
        const cutDur = reg.end - reg.start;
        setRegions(prev => {
            return prev
                .filter(r => r.id !== activeRegionId) // remove cut region
                .map(r => {
                    if (r.start >= reg.end) {
                        // Region is after the cut
                        const ns = r.start - cutDur;
                        const ne = r.end - cutDur;
                        const wsReg = regionsRef.current?.getRegions()?.find(wr => wr.id === r.id);
                        if (wsReg) wsReg.setOptions({ start: ns, end: ne });
                        return { ...r, start: ns, end: ne };
                    } else if (r.start < reg.start && r.end > reg.start) {
                        // Region overlaps start of cut
                        const ne = Math.min(r.end, reg.start);
                        const wsReg = regionsRef.current?.getRegions()?.find(wr => wr.id === r.id);
                        if (wsReg) wsReg.setOptions({ end: ne });
                        return { ...r, end: ne };
                    }
                    return r;
                }).filter(r => r.end > r.start);
        });

        setActiveRegionId(null);

        // Re-load into WaveSurfer
        const wavBuf = sliceAndEncodeWav(newBuf, 0, newBuf.length / sr);
        const blob = new Blob([wavBuf], { type: 'audio/wav' });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        wsRef.current.load(blobUrlRef.current);
    }, [activeRegionId, regions, removeRegion]);

    const handleReplace = useCallback(async () => {
        if (!audioBufferRef.current || !onReplace || !initialFile?.nodeId) return;

        setIsExporting(true);
        setExportProgress('Preparing replacement audio...');

        try {
            const fs = window.require('fs');
            const path = window.require('path');
            const os = window.require('os');
            const { ipcRenderer } = window.require('electron');

            // 1. Export entire buffer to temporary WAV
            const duration = audioBufferRef.current.length / audioBufferRef.current.sampleRate;
            const wavBuf = sliceAndEncodeWav(audioBufferRef.current, 0, duration);
            if (!wavBuf) throw new Error('Failed to encode audio');

            const tmpWav = path.join(os.tmpdir(), `quartz_replace_${Date.now()}.wav`);
            fs.writeFileSync(tmpWav, wavBuf);

            let finalData = wavBuf;
            let finalPath = tmpWav;

            // 2. If it was WEM, convert to WEM first
            if (initialFile.isWem) {
                setExportProgress('Converting back to WEM (Wwise Console)...');
                const res = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: tmpWav });
                if (!res.success) throw new Error(res.error);
                finalData = fs.readFileSync(res.wemPath);
                finalPath = res.wemPath;
                try { fs.unlinkSync(tmpWav); } catch (_) { }
            }

            // 3. Call onReplace with the final data
            onReplace(new Uint8Array(finalData), initialFile.nodeId, initialFile.pane);

            try { fs.unlinkSync(finalPath); } catch (_) { }

            setExportProgress('Original file replaced in tree!');
            setTimeout(() => setExportProgress(''), 4000);
        } catch (err) {
            console.error('[AudioSplitter] Replace error:', err);
            setExportProgress(`Replace error: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    }, [initialFile, onReplace]);

    const handleExportSegmentsToRef = useCallback(() => {
        if (!audioBufferRef.current || regions.length === 0 || !onExportSegments) return;

        setIsExporting(true);
        setExportProgress(`Preparing ${regions.length} segment(s) for reference pane...`);

        try {
            const sorted = [...regions].sort((a, b) => a.start - b.start);
            const segments = sorted.map(reg => {
                const wavBuf = sliceAndEncodeWav(audioBufferRef.current, reg.start, reg.end);
                return {
                    name: reg.name,
                    data: new Uint8Array(wavBuf)
                };
            }).filter(s => s.data !== null);

            onExportSegments(segments);
            setExportProgress(`Successfully pushed ${segments.length} segment(s) to reference pane!`);
            setTimeout(() => setExportProgress(''), 3000);
        } catch (err) {
            setExportProgress(`Push error: ${err.message}`);
        } finally {
            setIsExporting(false);
        }
    }, [regions, onExportSegments]);

    const sortedRegions = useMemo(() => [...regions].sort((a, b) => a.start - b.start), [regions]);

    if (!open) return null;

    return (
        <Box
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                position: 'fixed',
                top: '48px', // Offset for CustomTitleBar
                left: '60px', // Offset for ModernNavigation (sidebar)
                right: 0,
                bottom: 0,
                zIndex: 9500, // Below TitleBar (10000) but above everything else
                background: 'rgba(8,8,14,0.97)',
                display: 'flex', flexDirection: 'column',
                fontFamily: 'JetBrains Mono, monospace',
                outline: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
                outlineOffset: '-3px',
                transition: 'outline-color 0.1s',
            }}
        >

            {/* ── Top Bar ─────────────────────────────────────────────────── */}
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                padding: '0.6rem 1rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.5)',
                flexShrink: 0,
            }}>
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
                    <Button onClick={handleExportAll} disabled={isExporting || !isReady}
                        startIcon={<Download sx={{ fontSize: 14 }} />}
                        variant="contained"
                        sx={{ fontSize: '0.72rem', fontFamily: 'inherit', textTransform: 'none', background: 'var(--accent)', borderRadius: 1, px: 1.5, py: 0.4, '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}>
                        Export All ({regions.length})
                    </Button>
                )}

                {regions.length > 0 && onExportSegments && (
                    <Button onClick={handleExportSegmentsToRef} disabled={isExporting || !isReady}
                        startIcon={<ViewStream sx={{ fontSize: 14 }} />}
                        variant="contained"
                        sx={{
                            fontSize: '0.72rem',
                            fontFamily: 'inherit',
                            textTransform: 'none',
                            background: 'rgba(var(--accent-rgb), 0.15)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            borderRadius: 1,
                            px: 1.5, py: 0.4,
                            ml: 1,
                            '&:hover': { background: 'rgba(var(--accent-rgb), 0.25)' }
                        }}>
                        PUSH TO REF
                    </Button>
                )}

                {initialFile?.nodeId && (
                    <Button onClick={handleReplace} disabled={isExporting || !isReady}
                        startIcon={<Upload sx={{ fontSize: 14 }} />}
                        variant="contained"
                        sx={{
                            fontSize: '0.72rem',
                            fontFamily: 'inherit',
                            textTransform: 'none',
                            background: 'rgba(var(--accent-rgb), 0.2)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            borderRadius: 1,
                            px: 1.5, py: 0.4,
                            '&:hover': { background: 'rgba(var(--accent-rgb), 0.3)' }
                        }}>
                        REPLACE ORIGINAL
                    </Button>
                )}

                <Button
                    onClick={onClose}
                    startIcon={<Close />}
                    sx={{
                        ml: 2,
                        color: '#ff6666',
                        border: '1px solid rgba(255,100,100,0.3)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        '&:hover': {
                            background: 'rgba(255,100,100,0.1)',
                            borderColor: '#ff6666'
                        }
                    }}
                >
                    CLOSE
                </Button>
            </Box>

            {/* ── Export progress ──────────────────────────────────────────── */}
            {(isExporting || exportProgress) && (
                <Box sx={{ px: 2, pt: 0.5, pb: 0.25, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                    {isExporting && <LinearProgress sx={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />}
                    <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', mt: 0.5 }}>{exportProgress}</Typography>
                </Box>
            )}

            {/* ── Waveform ─────────────────────────────────────────────────── */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>

                {/* Loading overlay */}
                {isLoading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.6)', p: 0.5 }}>
                        <LinearProgress sx={{ height: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', textAlign: 'center', mt: 0.5 }}>Loading audio...</Typography>
                    </Box>
                )}

                {/* Drop hint when empty */}
                {!isReady && !isLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.18)', flexDirection: 'column', gap: 1 }}>
                        <ContentCut sx={{ fontSize: 48, opacity: isDragOver ? 0.7 : 0.3, color: isDragOver ? 'var(--accent)' : 'inherit', transition: 'all 0.15s' }} />
                        <Typography sx={{ fontSize: '0.8rem', fontFamily: 'inherit', color: isDragOver ? 'var(--accent)' : 'inherit', transition: 'color 0.15s' }}>
                            {isDragOver ? 'Drop to load' : 'Drop a WAV or MP3 here, or click Open File'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', opacity: 0.6 }}>Drag on the waveform to mark segments · Space to play/pause</Typography>
                    </Box>
                )}

                {/* Full-overlay drop highlight (shown when file loaded and user drags new file) */}
                {isDragOver && isReady && (
                    <Box sx={{
                        position: 'absolute', inset: 0, zIndex: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(8,8,14,0.82)',
                        pointerEvents: 'none',
                        flexDirection: 'column', gap: 1,
                    }}>
                        <ContentCut sx={{ fontSize: 48, color: 'var(--accent)', opacity: 0.8 }} />
                        <Typography sx={{ fontSize: '0.9rem', color: 'var(--accent)', fontFamily: 'inherit' }}>Drop to replace</Typography>
                    </Box>
                )}

                {/* Waveform container */}
                <Box sx={{ px: 2, pt: 1.5, display: isReady || isLoading ? 'block' : 'none' }}>
                    <Box ref={containerRef} sx={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', overflow: 'hidden', cursor: 'crosshair', '& ::selection': { background: 'transparent' } }} />
                    <Box ref={timelineRef} sx={{ mt: 0.25 }} />
                </Box>

                {/* ── Controls bar ─────────────────────────────────────────── */}
                {isReady && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.06)', mt: 0.5 }}>
                        <Tooltip title="Go to start (Home)">
                            <IconButton onClick={() => { wsRef.current?.seekTo(0); }} size="small" sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}>
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
                            <span ref={currentTimeRef}>0:00.000</span> / {fmtTime(duration)}
                        </Typography>

                        {/* Volume */}
                        <VolumeUp sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', ml: 1 }} />
                        <Slider min={0} max={1} step={0.01} value={volume} onChange={handleVolumeChange}
                            sx={{ width: 80, color: 'var(--accent)', '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />

                        <Box sx={{ flex: 1 }} />

                        {/* Zoom */}
                        <ZoomOut sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                        <Slider min={1} max={300} step={1} value={zoom} onChange={handleZoomChange}
                            sx={{ width: 120, color: 'var(--accent)', '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />
                        <ZoomIn sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', minWidth: 36 }}>{zoom}×</Typography>

                        {activeRegionId && (
                            <Tooltip title="Cut selected part out (Shift audio)">
                                <Button
                                    size="small"
                                    onClick={handleCut}
                                    startIcon={<ContentCut sx={{ fontSize: 14 }} />}
                                    sx={{
                                        fontSize: '0.65rem',
                                        fontFamily: 'inherit',
                                        textTransform: 'none',
                                        color: '#ff6666',
                                        border: '1px solid rgba(255,100,100,0.3)',
                                        borderRadius: 1,
                                        px: 1, py: 0.25, ml: 1,
                                        '&:hover': {
                                            background: 'rgba(255,100,100,0.1)',
                                            borderColor: '#ff6666'
                                        }
                                    }}
                                >
                                    CUT SELECTION
                                </Button>
                            </Tooltip>
                        )}

                        {/* Auto-split button */}
                        <Tooltip title="Auto-split by silence">
                            <Button
                                size="small"
                                disabled={!isReady}
                                onClick={e => setAutoSplitAnchor(e.currentTarget)}
                                startIcon={<AutoFixHigh sx={{ fontSize: 14 }} />}
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

                        {/* Auto-split settings popover */}
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
                            <Slider min={-70} max={-10} step={1} value={splitThreshold} onChange={(_, v) => setSplitThreshold(v)}
                                sx={{ color: 'var(--accent)', mb: 1.5, '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', mb: 0.25 }}>
                                Min silence gap: <b style={{ color: 'rgba(255,255,255,0.7)' }}>{splitMinSilence} ms</b>
                            </Typography>
                            <Slider min={50} max={2000} step={10} value={splitMinSilence} onChange={(_, v) => setSplitMinSilence(v)}
                                sx={{ color: 'var(--accent)', mb: 1.5, '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />

                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', mb: 0.25 }}>
                                Segment padding: <b style={{ color: 'rgba(255,255,255,0.7)' }}>{splitPad} ms</b>
                            </Typography>
                            <Slider min={0} max={200} step={5} value={splitPad} onChange={(_, v) => setSplitPad(v)}
                                sx={{ color: 'var(--accent)', mb: 2, '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />

                            <Button fullWidth variant="contained" onClick={handleAutoSplit}
                                sx={{ fontFamily: 'inherit', fontSize: '0.72rem', textTransform: 'none', background: 'var(--accent)', '&:hover': { filter: 'brightness(1.15)', background: 'var(--accent)' } }}>
                                Split Now
                            </Button>
                        </Popover>
                    </Box>
                )}

                {/* ── Region list ──────────────────────────────────────────── */}
                {sortedRegions.length > 0 && (
                    <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', maxHeight: 240, flexShrink: 0 }}>
                        {/* Header */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.4)' }}>
                            {['#', 'Name', 'Start', 'End', 'Duration', ''].map(h => (
                                <Typography key={h} sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.08em' }}>{h}</Typography>
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

                        {/* Footer summary */}
                        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', display: 'flex', gap: 2 }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>
                                {regions.length} segment{regions.length !== 1 ? 's' : ''} &nbsp;·&nbsp; total: {fmtTime(sortedRegions.reduce((a, r) => a + (r.end - r.start), 0))}
                            </Typography>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>
                                Drag waveform to add · Double-click name to rename · Space to play · Del to remove selected
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
