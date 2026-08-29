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
    Close, PlayArrow, Pause, Stop, Download, Upload,
    Delete, ZoomIn, ZoomOut, ContentCut, SkipPrevious, VolumeUp, AutoFixHigh, ViewStream, Add,
} from '@mui/icons-material';
import { FolderOpen as FolderOpenIcon } from 'lucide-react';
import { pickPath } from '@/components/explorer';
import { DropOverlay, BinOpenLanding } from '@/components/ui';
import { useUiPrefsStore, type SavedAudioSegment } from '@/lib/stores/uiPrefsStore';
import { explorerResolvePath } from '@/lib/api/explorer';
import { useFileDrop } from '@/lib/util/useFileDrop';
import { join } from '@tauri-apps/api/path';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region as WsRegion } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom.esm.js';
import HoverPlugin from 'wavesurfer.js/dist/plugins/hover.esm.js';
import { log } from '@/lib/util/logger';
import { decodeToPlayable, readFileBytes, writeFileBytes, convertWavsToWem } from '../utils/backend';
import type { SplitterFile, SplitterSegment } from '../types';
import './AudioSplitter.css';

interface Region { id: string; name: string; start: number; end: number; colorIndex: number }

/* One open file. The decoded buffer and the WAV bytes are held per tab so that
   switching back restores the exact waveform and segments without re-decoding;
   `bytes` is what the waveform was mounted from (already WAV for WEM sources). */
interface SplitterTab {
    id: string;
    name: string;
    /* Set only for files opened off disk; drives the recents list and the
       saved-segment lookup. Audio handed in from a bank has no path. */
    path?: string;
    bytes: Uint8Array | null;
    mimeType: string;
    audioBuffer: AudioBuffer | null;
    regions: Region[];
    activeRegionId: string | null;
    regionSeq: number;
    duration: number;
    zoom: number;
    wasWem: boolean;
    nodeId?: string;
    status: 'empty' | 'loading' | 'ready' | 'error';
}

let tabSeq = 0;
function makeTab(partial: Partial<SplitterTab> = {}): SplitterTab {
    return {
        id: `tab_${++tabSeq}`,
        name: '',
        bytes: null,
        mimeType: 'audio/wav',
        audioBuffer: null,
        regions: [],
        activeRegionId: null,
        regionSeq: 0,
        duration: 0,
        zoom: 1,
        wasWem: false,
        status: 'empty',
        ...partial,
    };
}
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

/* Base RGB per segment slot; the alpha carries the selection state so the
   active region reads as lit up against its dimmed neighbours. */
const REGION_RGB = [
    '99,179,237', '154,230,180', '252,176,64', '183,148,246',
    '245,101,101', '129,230,217', '246,173,85', '198,246,213',
];
const REGION_ALPHA_IDLE = 0.18;
const REGION_ALPHA_ACTIVE = 0.46;

function regionRgb(colorIndex: number): string {
    return REGION_RGB[((colorIndex % REGION_RGB.length) + REGION_RGB.length) % REGION_RGB.length];
}

function regionColor(colorIndex: number, isActive: boolean): string {
    return `rgba(${regionRgb(colorIndex)},${isActive ? REGION_ALPHA_ACTIVE : REGION_ALPHA_IDLE})`;
}

interface DetectOptions {
    thresholdDb?: number;
    minSilenceMs?: number;
    minSegmentMs?: number;
    padMs?: number;
}

/* Matches the Electron splitter's RMS-based silence detector. Looking at every
   channel avoids losing quiet stereo material that is absent from channel 1. */
function detectSegments(
    audioBuffer: AudioBuffer,
    { thresholdDb = -40, minSilenceMs = 300, minSegmentMs = 80, padMs = 30 }: DetectOptions = {},
): Array<{ start: number; end: number }> {
    const sampleRate = audioBuffer.sampleRate;
    const channelCount = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const windowSize = Math.max(1, Math.floor(sampleRate * 0.01));
    const threshold = Math.pow(10, thresholdDb / 20);
    const minSilentWindows = Math.max(1, Math.ceil(minSilenceMs / 10));
    const minSegmentSamples = Math.floor(sampleRate * minSegmentMs / 1000);
    const paddingSamples = Math.floor(sampleRate * padMs / 1000);
    const windowCount = Math.ceil(length / windowSize);
    const silent = new Uint8Array(windowCount);

    for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
        const start = windowIndex * windowSize;
        const end = Math.min(start + windowSize, length);
        let squareSum = 0;
        let samples = 0;
        for (let channel = 0; channel < channelCount; channel++) {
            const data = audioBuffer.getChannelData(channel);
            for (let sample = start; sample < end; sample++) {
                squareSum += data[sample] * data[sample];
                samples++;
            }
        }
        silent[windowIndex] = Math.sqrt(squareSum / Math.max(1, samples)) < threshold ? 1 : 0;
    }

    const result: Array<{ start: number; end: number }> = [];
    let windowIndex = 0;
    while (windowIndex < windowCount && silent[windowIndex]) windowIndex++;
    while (windowIndex < windowCount) {
        const segmentStart = windowIndex;
        let segmentEnd = windowIndex;
        while (windowIndex < windowCount) {
            if (!silent[windowIndex]) {
                segmentEnd = windowIndex + 1;
                windowIndex++;
                continue;
            }
            let silenceEnd = windowIndex;
            while (silenceEnd < windowCount && silent[silenceEnd]) silenceEnd++;
            if (silenceEnd - windowIndex >= minSilentWindows) break;
            segmentEnd = silenceEnd;
            windowIndex = silenceEnd;
        }
        const startSample = Math.max(0, segmentStart * windowSize - paddingSamples);
        const endSample = Math.min(length, segmentEnd * windowSize + paddingSamples);
        if (endSample - startSample >= minSegmentSamples) {
            result.push({ start: startSample / sampleRate, end: endSample / sampleRate });
        }
        while (windowIndex < windowCount && silent[windowIndex]) windowIndex++;
    }
    return result;
}

/* Resolve once the element has a usable width, giving the browser up to a few
   animation frames to run the layout pass that un-hides the wave surface.
   Resolves anyway after the budget so a load never stalls on a hidden panel. */
function waitForContainerWidth(el: HTMLElement, maxFrames = 30): Promise<void> {
    return new Promise((resolve) => {
        let frames = 0;
        const check = () => {
            if (el.clientWidth > 0 || frames >= maxFrames) { resolve(); return; }
            frames++;
            requestAnimationFrame(check);
        };
        check();
    });
}

function safeFileStem(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'segment';
}

async function uniqueOutputPath(directory: string, stem: string): Promise<string> {
    const safeStem = safeFileStem(stem);
    let suffix = 1;
    while (true) {
        const fileName = suffix === 1 ? `${safeStem}.wav` : `${safeStem}(${suffix}).wav`;
        const candidate = await join(directory, fileName);
        const info = await explorerResolvePath(candidate);
        if (!info.exists) return candidate;
        suffix++;
    }
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
    /* Tint the row with the same hue the segment has on the waveform, so the
       table and the regions read as one colour-coded set. */
    const rgb = regionRgb(reg.colorIndex);
    return (
        <Box
            onClick={() => onSeek(reg)}
            sx={{
                display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.4, cursor: 'pointer', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: `rgba(${rgb},${isActive ? 0.22 : 0.07})`,
                borderLeft: `2px solid ${isActive ? `rgb(${rgb})` : 'transparent'}`,
                '&:hover': { background: `rgba(${rgb},${isActive ? 0.28 : 0.14})` },
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
                    sx={{ fontSize: '0.72rem', color: `rgb(${rgb})`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
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
    onExportSegments: (segments: SplitterSegment[]) => void | Promise<void>;
}

export default function AudioSplitter({ open: isOpen, onClose, initialFile, onReplace, onExportSegments }: Props) {
    const waveContainerRef = useRef<HTMLDivElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const blobUrlRef = useRef<string | null>(null);
    const sourceWasWem = useRef(false);
    const volumeRef = useRef(0.05);
    const zoomRef = useRef(1);
    const currentTimeRef = useRef(0);
    const currentTimeLabelRef = useRef<HTMLSpanElement>(null);
    const loadGenerationRef = useRef(0);
    const loadedInitialFileRef = useRef<SplitterFile | null>(null);
    /* Set while a tab restore re-adds saved regions. region-created fires
       synchronously from addRegion, so it pops the matching entry from here to
       keep the original name, colour and numbering instead of inventing new ones. */
    const restoringRegions = useRef<Region[] | null>(null);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const recentAudioFiles = useUiPrefsStore((s) => s.recentAudioFiles);
    const pushRecentAudioFile = useUiPrefsStore((s) => s.pushRecentAudioFile);
    const removeRecentAudioFile = useUiPrefsStore((s) => s.removeRecentAudioFile);
    const saveAudioSegments = useUiPrefsStore((s) => s.saveAudioSegments);

    const [tabs, setTabs] = useState<SplitterTab[]>(() => [makeTab()]);
    const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
    const activeTabIdRef = useRef(activeTabId);
    activeTabIdRef.current = activeTabId;
    /* `tabsRef` is the authoritative tab list, not a per-render mirror.
       Assigning it on every render would clobber writes that are still queued,
       which let a close be silently undone and left the tab stuck on screen.
       Every mutation goes through updateTabs so the ref and the state advance
       together and reads always see the newest list. */
    const tabsRef = useRef(tabs);
    const updateTabs = useCallback((next: SplitterTab[] | ((prev: SplitterTab[]) => SplitterTab[])) => {
        const resolved = typeof next === 'function' ? next(tabsRef.current) : next;
        if (resolved === tabsRef.current) return;
        tabsRef.current = resolved;
        setTabs(resolved);
    }, []);

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
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
    const [volume, setVolume] = useState(0.05);
    const [autoSplitAnchor, setAutoSplitAnchor] = useState<HTMLElement | null>(null);
    const [splitThreshold, setSplitThreshold] = useState(-40);
    const [splitMinSilence, setSplitMinSilence] = useState(300);
    const [splitPad, setSplitPad] = useState(30);
    const regionCount = useRef(0);

    const flash = useCallback((msg: string, ms = 3500) => {
        setExportProgress(msg);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        if (ms > 0) flashTimerRef.current = setTimeout(() => setExportProgress(''), ms);
    }, []);

    /* (Re)build wavesurfer for a fresh blob URL and decode the same bytes into an
       AudioBuffer for slicing. */
    const mountWaveform = useCallback(async (
        audioBytes: Uint8Array,
        name: string,
        mimeType: string,
        generation: number,
        ownerTabId?: string,
    ) => {
        const container = waveContainerRef.current;
        if (!container) throw new Error('Waveform surface is unavailable');

        // Decode for slicing.
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        try {
            const ab = new ArrayBuffer(audioBytes.byteLength);
            new Uint8Array(ab).set(audioBytes);
            audioBufferRef.current = await ctx.decodeAudioData(ab);
        } catch (e) {
            log.error('[AudioSplitter] decodeAudioData failed', e);
            audioBufferRef.current = null;
            throw e;
        } finally {
            void ctx.close();
        }
        if (generation !== loadGenerationRef.current) return;

        /* The wave surface is display:none until a load starts, and a wavesurfer
           built inside a zero-width container renders no canvas at all (it skips
           drawing and still emits "ready", leaving a blank waveform). Wait for
           the layout pass that reveals the container before creating it. */
        await waitForContainerWidth(container);
        if (generation !== loadGenerationRef.current) return;

        wsRef.current?.destroy();
        wsRef.current = null;
        if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

        const blob = new Blob([audioBytes as BlobPart], { type: mimeType });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const regionsPlugin = RegionsPlugin.create();
        regionsPluginRef.current = regionsPlugin;

        const plugins = [
            regionsPlugin,
            TimelinePlugin.create({
                container: timelineContainerRef.current || undefined,
                height: 18,
                style: { color: 'var(--text-muted)', fontSize: '9px' },
            }),
            ZoomPlugin.create({ scale: 0.5, maxZoom: 300 }),
            HoverPlugin.create({
                lineColor: 'var(--accent-primary)',
                labelColor: 'var(--text-primary)',
                labelBackground: 'var(--bg-elevated)',
            }),
        ];

        /* Hand wavesurfer the PCM we already decoded rather than letting it fetch
           the blob URL itself: the webview CSP does not allow blob: in
           connect-src, so that fetch is refused and the waveform never appears.
           Supplying peaks + duration also skips a second decode of the same
           bytes. The URL is still set so the <audio> element can play it, which
           goes through media-src and is allowed. */
        const decoded = audioBufferRef.current;
        const peaks = decoded
            ? Array.from({ length: decoded.numberOfChannels }, (_, ch) => decoded.getChannelData(ch))
            : undefined;

        const ws = WaveSurfer.create({
            container,
            height: 110,
            waveColor: 'rgba(120, 180, 230, 0.5)',
            progressColor: 'var(--accent)',
            cursorColor: 'rgba(255,255,255,0.6)',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
            url,
            ...(peaks ? { peaks, duration: decoded!.duration } : {}),
            plugins,
        });
        wsRef.current = ws;

        // Drag on empty waveform to create a region.
        regionsPlugin.enableDragSelection({ color: regionColor(0, false) });

        regionsPlugin.on('region-created', (region: WsRegion) => {
            /* Names live in the segment table, not on the waveform: overlapping
               regions used to stack their labels into unreadable text. */
            region.setOptions({ content: undefined });

            // Re-adding a saved segment during a tab switch: keep its identity.
            const restored = restoringRegions.current?.shift();
            if (restored) {
                region.setOptions({ color: regionColor(restored.colorIndex, false) });
                setRegions((prev) => (prev.some((r) => r.id === region.id)
                    ? prev
                    : [...prev, { ...restored, id: region.id, start: region.start, end: region.end }]));
                return;
            }

            const idx = (regionCount.current += 1);
            region.setOptions({ color: regionColor(idx - 1, false) });
            setRegions((prev) => {
                if (prev.some((r) => r.id === region.id)) return prev;
                return [...prev, { id: region.id, name: `segment_${String(idx).padStart(3, '0')}`, start: region.start, end: region.end, colorIndex: idx - 1 }];
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

        /* Settled by whichever of ready/error comes first. Surfacing the error as
           a rejection lets loadSource fall back to the native decoder instead of
           leaving the panel on its empty state with no explanation. */
        let settle: (err?: unknown) => void = () => {};
        const mounted = new Promise<void>((resolve, reject) => {
            settle = (err?: unknown) => (err === undefined ? resolve() : reject(err));
        });

        ws.on('ready', () => {
            setDuration(ws.getDuration());
            setIsReady(true);
            setIsLoading(false);
            settle();
        });
        ws.on('timeupdate', (t: number) => {
            currentTimeRef.current = t;
            if (currentTimeLabelRef.current) currentTimeLabelRef.current.textContent = fmtTime(t);
        });
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));
        ws.on('error', (err) => {
            log.error('[AudioSplitter] wavesurfer error', err);
            settle(err instanceof Error ? err : new Error(String(err)));
        });
        ws.on('destroy', () => settle());
        ws.setVolume(volumeRef.current);
        setLoadedName(name);

        await mounted;

        /* A container that gained its width only after render draws no canvas
           until something invalidates the layout; nudge it once we are visible. */
        if (generation === loadGenerationRef.current && container.clientWidth > 0) {
            ws.zoom(zoomRef.current);
        }

        /* Record what this tab is holding so switching away and back can restore
           it without touching the disk or the decoder again. */
        const ownerId = ownerTabId ?? activeTabIdRef.current;
        updateTabs((prev) => prev.map((tab) => (tab.id === ownerId
            ? {
                ...tab,
                name,
                bytes: audioBytes,
                mimeType,
                audioBuffer: audioBufferRef.current,
                duration: ws.getDuration(),
                status: 'ready',
            }
            : tab)));
    }, [updateTabs]);

    /* Load any source (path / bytes) — decode to WAV in Rust when needed, then
       hand the WAV bytes to the waveform + slicer. */
    const loadSource = useCallback(async (opts: { path?: string; data?: Uint8Array; name: string; isWem?: boolean; tabId?: string; nodeId?: string }) => {
        const generation = ++loadGenerationRef.current;
        const tabId = opts.tabId ?? activeTabIdRef.current;
        setIsLoading(true);
        setIsReady(false);
        setRegions([]);
        setActiveRegionId(null);
        regionCount.current = 0;
        updateTabs((prev) => prev.map((tab) => (tab.id === tabId
            ? { ...tab, name: opts.name, path: opts.path ?? tab.path, status: 'loading', regions: [], activeRegionId: null, regionSeq: 0, nodeId: opts.nodeId ?? tab.nodeId }
            : tab)));
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
            const isWem = !!opts.isWem || nameLower.endsWith('.wem');
            const isWav = !isWem && nameLower.endsWith('.wav');
            const isMp3 = nameLower.endsWith('.mp3');
            const isOgg = nameLower.endsWith('.ogg');
            sourceWasWem.current = isWem;
            if (generation !== loadGenerationRef.current) return;

            if (isWem) {
                /* Vorbis WEMs decode to OGG, which the webview plays as-is;
                   only PCM ones come back as WAV. Forcing WAV here would drop
                   the native result and fall through to vgmstream. */
                const playable = await decodeToPlayable(rawBytes);
                if (generation !== loadGenerationRef.current) return;
                await mountWaveform(playable.data, opts.name, playable.mimeType, generation, tabId);
            } else {
                const mimeType = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : isOgg ? 'audio/ogg' : 'application/octet-stream';
                try {
                    // Web Audio handles ordinary WAV/MP3/OGG files directly, so
                    // opening them does not depend on the optional Wwise tools.
                    await mountWaveform(rawBytes, opts.name, mimeType, generation, tabId);
                } catch (browserDecodeError) {
                    log.warn('[AudioSplitter] browser decode failed; trying native decoder', browserDecodeError);
                    const playable = await decodeToPlayable(rawBytes);
                    if (generation !== loadGenerationRef.current) return;
                    await mountWaveform(playable.data, opts.name, playable.mimeType, generation, tabId);
                }
            }
            if (generation !== loadGenerationRef.current) return;

            /* Remember the file and put back whatever segments were saved against
               it the last time it was open. */
            if (opts.path) {
                pushRecentAudioFile(opts.path);
                const saved = useUiPrefsStore.getState().recentAudioFiles
                    .find((f) => f.path === opts.path)?.segments ?? [];
                const plugin = regionsPluginRef.current;
                if (saved.length > 0 && plugin) {
                    restoringRegions.current = saved.map((seg, i) => ({
                        id: `saved_${i}`,
                        name: seg.name,
                        start: seg.start,
                        end: seg.end,
                        colorIndex: seg.colorIndex,
                    }));
                    try {
                        for (const seg of saved) {
                            plugin.addRegion({
                                start: seg.start,
                                end: seg.end,
                                color: regionColor(seg.colorIndex, false),
                                drag: true,
                                resize: true,
                            });
                        }
                    } finally {
                        restoringRegions.current = null;
                    }
                    regionCount.current = saved.length;
                    flash(`Restored ${saved.length} saved segment(s)`);
                }
            }
        } catch (e) {
            log.error('[AudioSplitter] load error', e);
            /* A load that lost its race, or whose tab was closed mid-flight, must
               not touch the UI or resurrect the tab it was loading into. */
            if (generation !== loadGenerationRef.current) return;
            setIsLoading(false);
            updateTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, status: 'error' } : tab)));
            flash(`Failed to load audio: ${(e as Error).message}`);
        }
    }, [mountWaveform, flash, pushRecentAudioFile, updateTabs]);

    /* Closing the splitter keeps the decoded audio and its segments in memory so
       reopening lands back on the same waveform. Only playback and transient
       chrome are reset here; teardown happens when the panel unmounts. */
    useEffect(() => {
        if (!isOpen) {
            wsRef.current?.pause();
            setIsPlaying(false);
            setIsDragOver(false);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        }
    }, [isOpen]);

    /* Release the waveform, blob URL and decoded buffer for real on unmount. */
    useEffect(() => () => {
        loadGenerationRef.current++;
        wsRef.current?.destroy();
        wsRef.current = null;
        if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
        audioBufferRef.current = null;
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    }, []);

    /* Load a handed-in file once. Reopening the panel with the same file must not
       re-decode it and throw away the segments already marked. */
    useEffect(() => {
        if (!isOpen || !initialFile || !(initialFile.data || initialFile.path)) return;
        if (loadedInitialFileRef.current === initialFile) return;
        loadedInitialFileRef.current = initialFile;

        /* Reuse the current tab when it is still empty, otherwise open the file
           in a new one so existing work is never overwritten. */
        let targetId = activeTabIdRef.current;
        const current = tabsRef.current.find((tab) => tab.id === targetId);
        if (!current || current.status !== 'empty') {
            const tab = makeTab();
            targetId = tab.id;
            updateTabs([...tabsRef.current, tab]);
            activeTabIdRef.current = tab.id;
            setActiveTabId(tab.id);
        }

        void loadSource({
            path: initialFile.path,
            data: initialFile.data,
            name: initialFile.name || 'audio',
            isWem: initialFile.isWem,
            tabId: targetId,
            nodeId: initialFile.nodeId,
        });
    }, [isOpen, initialFile, loadSource, updateTabs]);

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

    /* Drop recents whose file has since been deleted or moved. Runs once per
       open so a stale list never offers a path that cannot load. */
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        void (async () => {
            const stale: string[] = [];
            for (const entry of useUiPrefsStore.getState().recentAudioFiles) {
                try {
                    const info = await explorerResolvePath(entry.path);
                    if (!info.exists) stale.push(entry.path);
                } catch {
                    /* Leave the entry alone if the path cannot be checked. */
                }
            }
            if (!cancelled) stale.forEach(removeRecentAudioFile);
        })();
        return () => { cancelled = true; };
    }, [isOpen, removeRecentAudioFile]);

    /* Persist the marked segments against the source file so reopening it later
       brings the work back. Debounced: region drags fire continuously. */
    useEffect(() => {
        if (!isReady) return;
        const path = tabs.find((tab) => tab.id === activeTabId)?.path;
        if (!path) return;
        const timer = setTimeout(() => {
            const saved: SavedAudioSegment[] = [...regions]
                .sort((a, b) => a.start - b.start)
                .map((r) => ({ name: r.name, start: r.start, end: r.end, colorIndex: r.colorIndex }));
            saveAudioSegments(path, saved);
        }, 400);
        return () => clearTimeout(timer);
    }, [regions, isReady, tabs, activeTabId, saveAudioSegments]);

    /* Mirror live edits into the owning tab so a switch away keeps them. */
    useEffect(() => {
        if (!isReady) return;
        updateTabs((prev) => {
            const idx = prev.findIndex((tab) => tab.id === activeTabIdRef.current);
            // The tab was closed while this edit was in flight; drop the write.
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], regions, activeRegionId, regionSeq: regionCount.current, duration, zoom };
            return next;
        });
    }, [regions, activeRegionId, duration, zoom, isReady, updateTabs]);

    /* Repaint every region so the selected one is the bright one. */
    useEffect(() => {
        const plugin = regionsPluginRef.current;
        if (!plugin) return;
        const byId = new Map(regions.map((r) => [r.id, r]));
        for (const wsReg of plugin.getRegions()) {
            const meta = byId.get(wsReg.id);
            if (!meta) continue;
            wsReg.setOptions({ color: regionColor(meta.colorIndex, wsReg.id === activeRegionId) });
        }
    }, [activeRegionId, regions]);

    useEffect(() => { volumeRef.current = volume; wsRef.current?.setVolume(volume); }, [volume]);
    useEffect(() => { zoomRef.current = zoom; if (wsRef.current && isReady) wsRef.current.zoom(zoom); }, [zoom, isReady]);

    const handleOpenFile = useCallback(async () => {
        const picked = await pickPath({ mode: 'file', filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'wem'] }, { name: 'All', extensions: ['*'] }], recentsKey: 'audio' });
        if (typeof picked === 'string') void loadSource({ path: picked, name: picked.split(/[\\/]/).pop() || 'audio' });
    }, [loadSource]);

    /* Rebuild the waveform for a tab from its cached bytes and put its segments
       back, so switching tabs never re-reads the file or re-runs the decoder. */
    const restoreTab = useCallback(async (tab: SplitterTab) => {
        const generation = ++loadGenerationRef.current;
        if (!tab.bytes || tab.status !== 'ready') {
            wsRef.current?.destroy();
            wsRef.current = null;
            regionsPluginRef.current = null;
            audioBufferRef.current = null;
            setIsReady(false);
            setIsLoading(tab.status === 'loading');
            setRegions([]);
            setActiveRegionId(null);
            setDuration(0);
            setLoadedName(tab.name);
            regionCount.current = 0;
            return;
        }

        setIsLoading(true);
        setIsReady(false);
        setRegions([]);
        setActiveRegionId(null);
        sourceWasWem.current = tab.wasWem;
        try {
            await mountWaveform(tab.bytes, tab.name, tab.mimeType, generation, tab.id);
            if (generation !== loadGenerationRef.current) return;

            // Put the saved segments back onto the fresh waveform.
            const plugin = regionsPluginRef.current;
            if (plugin && tab.regions.length > 0) {
                const queue = [...tab.regions];
                restoringRegions.current = queue;
                try {
                    let restoredActiveId: string | null = null;
                    for (const saved of tab.regions) {
                        const wsReg = plugin.addRegion({
                            start: saved.start,
                            end: saved.end,
                            color: regionColor(saved.colorIndex, false),
                            drag: true,
                            resize: true,
                        });
                        if (saved.id === tab.activeRegionId) restoredActiveId = wsReg.id;
                    }
                    setActiveRegionId(restoredActiveId);
                } finally {
                    restoringRegions.current = null;
                }
            }
            regionCount.current = tab.regionSeq;
            setZoom(tab.zoom);
        } catch (e) {
            log.error('[AudioSplitter] tab restore failed', e);
            setIsLoading(false);
            flash(`Could not restore ${tab.name}: ${(e as Error).message}`);
        }
    }, [mountWaveform, flash]);

    const handleSelectTab = useCallback((tabId: string) => {
        if (tabId === activeTabIdRef.current) return;
        wsRef.current?.pause();
        setIsPlaying(false);
        const next = tabsRef.current.find((tab) => tab.id === tabId);
        if (!next) return;
        activeTabIdRef.current = tabId;
        setActiveTabId(tabId);
        void restoreTab(next);
    }, [restoreTab]);

    const handleNewTab = useCallback(() => {
        wsRef.current?.pause();
        setIsPlaying(false);
        const tab = makeTab();
        updateTabs([...tabsRef.current, tab]);
        activeTabIdRef.current = tab.id;
        setActiveTabId(tab.id);
        void restoreTab(tab);
    }, [restoreTab, updateTabs]);

    const handleCloseTab = useCallback((tabId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        /* Everything is computed from tabsRef, the authoritative list, and applied
           through updateTabs. Deciding this inside a setTabs updater made the
           updater impure — React could run it twice or discard the run, which
           left a tab on screen that no handler would act on. */
        const idx = tabsRef.current.findIndex((tab) => tab.id === tabId);
        if (idx === -1) return;

        const closing = tabsRef.current[idx];
        const closingActive = tabId === activeTabIdRef.current;

        /* Abandon any load still running for this tab, whether or not it is the
           active one: otherwise it completes and writes state back for a tab
           that no longer exists. */
        if (closing.status === 'loading') loadGenerationRef.current++;

        const remaining = tabsRef.current.filter((tab) => tab.id !== tabId);
        // Never leave the bar empty: closing the last tab leaves a fresh one.
        const next = remaining.length > 0 ? remaining : [makeTab()];
        updateTabs(next);

        if (closingActive) {
            const fallback = next[Math.min(idx, next.length - 1)];
            wsRef.current?.pause();
            setIsPlaying(false);
            activeTabIdRef.current = fallback.id;
            setActiveTabId(fallback.id);
            void restoreTab(fallback);
        }
    }, [restoreTab, updateTabs]);

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
        if (!ext || !['wav', 'mp3', 'ogg', 'wem'].includes(ext)) {
            flash('Audio Splitter accepts WAV, MP3, OGG, or WEM files');
            return;
        }
        const path = (file as File & { path?: string }).path;
        if (path) {
            void loadSource({ path, name: file.name });
        } else {
            void file.arrayBuffer()
                .then((data) => loadSource({ data: new Uint8Array(data), name: file.name }))
                .catch((error) => flash(`Could not read dropped file: ${(error as Error).message}`));
        }
    }, [loadSource, flash]);

    /* Tauri's webview owns native file drops and does not populate File.path.
       This listener is the authoritative desktop drop route; the DOM handler
       above remains useful when running the frontend in a normal browser. */
    useFileDrop({
        onEnter: () => { if (isOpen) setIsDragOver(true); },
        onOver: () => { if (isOpen) setIsDragOver(true); },
        onLeave: () => { if (isOpen) setIsDragOver(false); },
        onDrop: (paths) => {
            if (!isOpen) return;
            setIsDragOver(false);
            const audioPath = paths.find((path) => /\.(wav|mp3|ogg|wem)$/i.test(path));
            if (!audioPath) {
                flash('Audio Splitter accepts WAV, MP3, OGG, or WEM files');
                return;
            }
            const name = audioPath.split(/[\\/]/).pop() || 'audio';
            void loadSource({ path: audioPath, name, isWem: /\.wem$/i.test(name) });
        },
    });

    const handlePlayPause = () => wsRef.current?.playPause();
    const handleStop = () => { wsRef.current?.stop(); wsRef.current?.seekTo(0); };

    const addRegionAtCursor = useCallback(() => {
        const plugin = regionsPluginRef.current;
        if (!plugin) return;
        const cur = currentTimeRef.current;
        const end = Math.min(duration || cur + 1, cur + 1);
        plugin.addRegion({ start: cur, end, color: regionColor(regionCount.current, false), drag: true, resize: true });
    }, [duration]);

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

        const segments = detectSegments(buffer, {
            thresholdDb: splitThreshold,
            minSilenceMs: splitMinSilence,
            minSegmentMs: 80,
            padMs: splitPad,
        });

        if (segments.length === 0) { flash('No segments detected — lower the threshold'); return; }

        plugin.clearRegions();
        regionCount.current = 0;
        setRegions([]);
        setActiveRegionId(null);
        for (const seg of segments) {
            plugin.addRegion({
                start: seg.start,
                end: seg.end,
                color: regionColor(regionCount.current, false),
                drag: true,
                resize: true,
            });
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

    const handleCut = useCallback(() => {
        const buffer = audioBufferRef.current;
        const ws = wsRef.current;
        const plugin = regionsPluginRef.current;
        const selected = regions.find((region) => region.id === activeRegionId);
        if (!buffer || !ws || !plugin || !selected) {
            flash('Select a segment to cut from the audio');
            return;
        }

        const sampleRate = buffer.sampleRate;
        const startSample = Math.max(0, Math.floor(selected.start * sampleRate));
        const endSample = Math.min(buffer.length, Math.ceil(selected.end * sampleRate));
        const cutSamples = endSample - startSample;
        if (cutSamples <= 0 || cutSamples >= buffer.length) {
            flash('The selected segment cannot remove the entire audio file');
            return;
        }

        const edited = new AudioBuffer({
            length: buffer.length - cutSamples,
            numberOfChannels: buffer.numberOfChannels,
            sampleRate,
        });
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const source = buffer.getChannelData(channel);
            const destination = edited.getChannelData(channel);
            destination.set(source.subarray(0, startSample));
            destination.set(source.subarray(endSample), startSample);
        }

        plugin.getRegions().find((region) => region.id === selected.id)?.remove();
        const actualCutStart = startSample / sampleRate;
        const actualCutEnd = endSample / sampleRate;
        const cutDuration = cutSamples / sampleRate;
        const nextRegions: Region[] = [];

        for (const region of regions) {
            if (region.id === selected.id) continue;
            let start = region.start;
            let end = region.end;
            if (end <= actualCutStart) {
                // Region is entirely before the cut.
            } else if (start >= actualCutEnd) {
                start -= cutDuration;
                end -= cutDuration;
            } else if (start < actualCutStart && end > actualCutEnd) {
                end -= cutDuration;
            } else if (start < actualCutStart) {
                end = actualCutStart;
            } else if (end > actualCutEnd) {
                start = actualCutStart;
                end -= cutDuration;
            } else {
                plugin.getRegions().find((candidate) => candidate.id === region.id)?.remove();
                continue;
            }

            if (end - start < 0.01) {
                plugin.getRegions().find((candidate) => candidate.id === region.id)?.remove();
                continue;
            }
            plugin.getRegions().find((candidate) => candidate.id === region.id)?.setOptions({ start, end });
            nextRegions.push({ ...region, start, end });
        }

        audioBufferRef.current = edited;
        setRegions(nextRegions);
        setActiveRegionId(null);
        setDuration(edited.duration);
        currentTimeRef.current = 0;
        if (currentTimeLabelRef.current) currentTimeLabelRef.current.textContent = fmtTime(0);

        const wav = encodeWavSlice(edited, 0, edited.duration);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }));
        const peaks = Array.from({ length: edited.numberOfChannels }, (_, channel) => edited.getChannelData(channel));
        void ws.load(blobUrlRef.current, peaks, edited.duration).catch((error) => {
            log.error('[AudioSplitter] failed to reload cut audio', error);
            flash(`Cut succeeded, but the waveform could not reload: ${(error as Error).message}`);
        });
        flash(`Cut ${fmtTime(cutDuration)} from the audio`);
    }, [activeRegionId, regions, flash]);

    const handleExportOne = useCallback(async (reg: Region) => {
        const wav = sliceRegion(reg);
        if (!wav) { flash('Audio not decoded yet'); return; }
        const safe = safeFileStem(reg.name);
        const path = await pickPath({
            mode: 'save',
            title: 'Export Audio Segment',
            defaultPath: `${safe}.wav`,
            filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
            recentsKey: 'audio',
        });
        if (typeof path !== 'string') return;
        setIsExporting(true);
        try {
            await writeFileBytes(path, wav);
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
                const outPath = await uniqueOutputPath(dir, reg.name);
                await writeFileBytes(outPath, wav);
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
        const nodeId = tabs.find((tab) => tab.id === activeTabId)?.nodeId ?? initialFile?.nodeId;
        if (!onReplace || !nodeId) return;
        const buffer = audioBufferRef.current;
        if (!buffer) { flash('Audio not decoded yet'); return; }
        setIsExporting(true);
        try {
            // Replace uses the complete edited buffer. Regions mark exports; only
            // Cut Selection changes the source audio itself.
            const wav = encodeWavSlice(buffer, 0, buffer.duration);

            let outBytes = wav;
            if (sourceWasWem.current) {
                setExportProgress('Encoding WEM...');
                const [converted] = await convertWavsToWem([{ name: loadedName || 'replacement.wav', data: wav }]);
                if (!converted?.data?.length) {
                    throw new Error(converted?.error || 'Wwise did not return replacement audio');
                }
                outBytes = converted.data;
            }
            onReplace(outBytes, nodeId, initialFile?.pane);
            flash('Replaced original audio');
        } catch (e) {
            log.error('[AudioSplitter] replace failed', e);
            flash(`Replace failed: ${(e as Error).message}`);
        } finally {
            setIsExporting(false);
        }
    }, [onReplace, initialFile, loadedName, flash, tabs, activeTabId]);

    const handleExportSegmentsToRef = useCallback(async () => {
        if (regions.length === 0 || !onExportSegments) return;
        if (!audioBufferRef.current) { flash('Audio not decoded yet'); return; }
        setIsExporting(true);
        setExportProgress(`Preparing ${regions.length} segment(s) for the reference pane...`);
        try {
            const segments: SplitterSegment[] = [...regions]
                .sort((a, b) => a.start - b.start)
                .map((reg) => ({ name: reg.name, data: sliceRegion(reg) || new Uint8Array(0) }))
                .filter((s) => s.data.length > 0);
            await onExportSegments(segments);
            flash(`Pushed ${segments.length} segment(s) to reference pane`);
        } catch (error) {
            log.error('[AudioSplitter] push to reference failed', error);
            flash(`Push failed: ${(error as Error).message}`);
        } finally {
            setIsExporting(false);
        }
    }, [regions, onExportSegments, sliceRegion, flash]);

    const sortedRegions = useMemo(() => [...regions].sort((a, b) => a.start - b.start), [regions]);

    const slotSx = { '& .MuiSlider-thumb': { width: 12, height: 12 }, '& .MuiSlider-rail': { opacity: 0.2 } };
    const headerCells = ['#', 'Name', 'Start', 'End', 'Duration', ''];

    /* Hidden rather than unmounted: tearing the panel down would destroy the
       waveform and the marked segments every time it is closed. */
    return (
        <Box
            className={`audio-splitter${isDragOver ? ' audio-splitter--dragging' : ''}`}
            sx={isOpen ? undefined : { display: 'none' }}
            aria-hidden={!isOpen}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <Box className="audio-splitter__tabs" role="tablist">
                {tabs.map((tab) => (
                    <Box
                        key={tab.id}
                        role="tab"
                        aria-selected={tab.id === activeTabId}
                        className={`audio-splitter__tab${tab.id === activeTabId ? ' audio-splitter__tab--active' : ''}`}
                        onClick={() => handleSelectTab(tab.id)}
                        title={tab.name || 'Empty tab'}
                    >
                        <FolderOpenIcon className="audio-splitter__tab-icon" size={13} />
                        <span className="audio-splitter__tab-name">{tab.name || 'New tab'}</span>
                        <span
                            role="button"
                            aria-label={`Close ${tab.name || 'tab'}`}
                            className="audio-splitter__tab-close"
                            onClick={(e) => handleCloseTab(tab.id, e)}
                        >
                            <Close sx={{ fontSize: 11 }} />
                        </span>
                    </Box>
                ))}
                <button className="audio-splitter__tab-add" onClick={handleNewTab} title="New tab">
                    <Add sx={{ fontSize: 14 }} />
                </button>

                <Box sx={{ flex: 1 }} />

                <button
                    className="dl-btn dl-btn--icon dl-btn--sm dl-btn--ghost"
                    onClick={onClose}
                    title="Close Audio Splitter (Esc)"
                >
                    <span className="dl-icon"><Close sx={{ fontSize: 14 }} /></span>
                </button>
            </Box>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
                {isLoading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'color-mix(in oklab, var(--bg-primary) 60%, transparent)', p: 0.5 }}>
                        <LinearProgress sx={{ height: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent-primary)' } }} />
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent-primary)', textAlign: 'center', mt: 0.5 }}>Loading audio...</Typography>
                    </Box>
                )}

                {!isReady && !isLoading && (
                    <BinOpenLanding
                        recentBins={recentAudioFiles}
                        dragActive={isDragOver}
                        onOpen={handleOpenFile}
                        onOpenRecent={(path) => void loadSource({ path, name: path.split(/[\\/]/).pop() || 'audio' })}
                        onRemoveRecent={removeRecentAudioFile}
                        title={isDragOver ? 'Drop to load audio' : 'No Audio Loaded'}
                        description="Drop a .wav, .mp3, .ogg, or .wem here"
                        actionLabel="Open Audio"
                        recentTitle="Recent Audio"
                        footnote="Drag across the waveform to mark a segment · Space to play/pause"
                    />
                )}

                {isDragOver && isReady && (
                    <DropOverlay variant="scrim" label="Drop to replace" icon={<ContentCut sx={{ fontSize: 40 }} />} />
                )}

                {/* Live waveform surface (wavesurfer.js). */}
                <Box className="audio-splitter__wave-area" sx={{ display: isReady || isLoading ? 'block' : 'none' }}>
                    <Box className="audio-splitter__wave-card">
                        <div ref={waveContainerRef} style={{ width: '100%' }} />
                    </Box>
                    <div ref={timelineContainerRef} className="audio-splitter__timeline" />
                </Box>

                {isReady && (
                    <Box className="audio-splitter__controls">
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
                            <span ref={currentTimeLabelRef}>{fmtTime(0)}</span> / {fmtTime(duration)}
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

                        <Tooltip title="Remove the selected segment from the source audio">
                            <span>
                                <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={handleCut} disabled={!activeRegionId}>
                                    <span className="dl-icon"><ContentCut sx={{ fontSize: 14 }} /></span>
                                    <span>Cut Selection</span>
                                </button>
                            </span>
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
                    /* Fills the space under the waveform instead of stopping at a
                       fixed height: only the rows scroll, while the column header
                       and the summary bar stay pinned. */
                    <Box sx={{ borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 90px 72px 58px', gap: 0, px: 1.5, py: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
                            {headerCells.map((h, i) => (
                                <Typography key={`${h}-${i}`} sx={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em' }}>{h}</Typography>
                            ))}
                        </Box>

                        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                        </Box>

                        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', gap: 2, flexShrink: 0 }}>
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

            <Box className="audio-splitter__footer">
                <button
                    className="bnk-action-btn"
                    style={{ '--action-color': 'var(--text-secondary)' } as React.CSSProperties}
                    onClick={handleOpenFile}
                    title="Open audio file"
                >
                    <FolderOpenIcon size={17} />
                </button>
                <Typography className="audio-splitter__footer-copy">
                    {isReady ? `${regions.length} marked segment${regions.length === 1 ? '' : 's'}` : 'Load audio to begin'}
                </Typography>

                {/* Centered status, matching the bottom bar on the other pages. */}
                <span className="audio-splitter__footer-status">{exportProgress}</span>

                <Box className="audio-splitter__footer-actions">
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={handleExportAll} disabled={isExporting || !isReady || regions.length === 0}>
                        <span className="dl-icon"><Download sx={{ fontSize: 14 }} /></span>
                        <span>Export All ({regions.length})</span>
                    </button>
                    <button className="dl-btn dl-btn--secondary dl-btn--sm" onClick={handleExportSegmentsToRef} disabled={isExporting || !isReady || regions.length === 0}>
                        <span className="dl-icon"><ViewStream sx={{ fontSize: 14 }} /></span>
                        <span>Push to Reference</span>
                    </button>
                    {initialFile?.nodeId && (
                        <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={handleReplace} disabled={isExporting || !isReady}>
                            <span className="dl-icon"><Upload sx={{ fontSize: 14 }} /></span>
                            <span>Replace Original</span>
                        </button>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
