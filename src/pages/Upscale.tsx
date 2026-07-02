import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    Image as ImageIcon,
    Folder as FolderIcon,
    ArrowLeftRight as CompareIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    RotateCcw as ResetIcon,
    Upload as UploadIcon,
    Sparkles as SparklesIcon,
    FolderOpen as FolderOpenIcon,
    X as CloseIcon,
    Rocket as RocketIcon,
    Loader2 as LoaderIcon,
    ArrowRight as ArrowRightIcon,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Button, CustomSelect, FormGroup } from '@/components/settings/primitives';
import { useNavigationStore } from '@/lib/stores';
import { useFileDrop } from '@/lib/util/useFileDrop';
import {
    readFileBase64,
    prefsGet,
    prefsSet,
    upscaleCheckStatus,
    realesrganEnsure,
    upscaylStream,
    upscaylBatchProcess,
    upscaylCancel,
    imgRecolorScanDir,
} from '@/lib/api';
import { log } from '@/lib/util/logger';
import './upscale/Upscale.css';

type DownloadStatus = {
    binary: { installed: boolean };
    models: { installed: string[]; total: number };
} | null;

type BatchProgress = {
    currentFile: number;
    totalFiles: number;
    currentFileName: string;
    overallProgress: number;
    fileProgress: number;
};

type FolderContent = {
    name: string;
    path: string;
    thumbnail: string | null;
    size: number;
};

/* Natural (intrinsic) pixel size of an image once decoded. Tracked separately
   for the original and the upscaled output so we can (a) show the real
   resolution change and (b) lock both to one on-screen rectangle. */
type Dims = { w: number; h: number } | null;

// ─── path helpers (replace Electron node:path) ──────────────────────────────
function basename(p: string, ext?: string): string {
    const norm = p.replace(/[\\/]+$/, '');
    let base = norm.split(/[\\/]/).pop() || norm;
    if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
        base = base.slice(0, base.length - ext.length);
    }
    return base;
}
function dirname(p: string): string {
    const norm = p.replace(/[\\/]+$/, '');
    const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
    return idx >= 0 ? norm.slice(0, idx) : '';
}
function extname(p: string): string {
    const base = basename(p);
    const idx = base.lastIndexOf('.');
    return idx > 0 ? base.slice(idx) : '';
}
function joinPath(...parts: string[]): string {
    return parts.filter(Boolean).join('\\').replace(/[\\/]+/g, '\\');
}
function mimeFor(p: string): string {
    const ext = (p.split('.').pop() || '').toLowerCase();
    return ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
        : ext === 'bmp' ? 'image/bmp'
            : ext === 'tif' || ext === 'tiff' ? 'image/tiff'
                : 'image/png';
}
async function readAsDataUrl(p: string): Promise<string> {
    const b64 = await readFileBase64(p);
    return `data:${mimeFor(p)};base64,${b64}`;
}

export function Upscale() {
    const goToSettings = useNavigationStore((s) => s.goToSettings);
    const [exePath, setExePath] = useState('');
    const [, setIsEnsuring] = useState(false);
    const [ensureError, setEnsureError] = useState('');

    const [inputPath, setInputPath] = useState('');
    const [outputDir, setOutputDir] = useState('');
    const [scale, setScale] = useState(4);
    const [model, setModel] = useState('upscayl-standard-4x');
    const [batchMode, setBatchMode] = useState(false);

    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [, setShouldCancel] = useState(false);

    // Install status (drives the sidebar badge / Settings deep-link). The
    // actual download lives in Settings → External Tools now.
    const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>(null);

    // Batch processing state
    const [, setBatchInfo] = useState<{ totalFiles: number } | null>(null);
    const [batchProgress, setBatchProgress] = useState<BatchProgress>({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: '',
        overallProgress: 0,
        fileProgress: 0,
    });
    const [, setBatchResults] = useState<unknown>(null);

    // Folder preview state
    const [folderContents, setFolderContents] = useState<FolderContent[]>([]);

    // Preview state
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [upscaledImage, setUpscaledImage] = useState<string | null>(null);
    const [sliderPosition, setSliderPosition] = useState(50);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [isDragOver, setIsDragOver] = useState(false);

    /* ── Display sizing (the fix for the resolution bug) ──────────────────────
       The before/after slider only works if BOTH images occupy the exact same
       on-screen rectangle. Previously each <img> used max-width/height derived
       from the ORIGINAL's natural size, so the upscaled image (different pixel
       dimensions, sometimes a slightly different aspect after the model) sized
       itself independently and the two drifted apart at different resolutions.

       Now we measure the available preview area live, fit the ORIGINAL's aspect
       into it to get ONE rectangle, size the wrapper to exactly that rectangle,
       and force both images to fill it. Same rect, always aligned, at any
       window size or zoom. */
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
    const [origDims, setOrigDims] = useState<Dims>(null);
    const [upDims, setUpDims] = useState<Dims>(null);

    // Measure the preview stage (minus a comfortable gutter) whenever it resizes.
    useLayoutEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const GUTTER = 24;
        const obs = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) setStageSize({ w: Math.max(0, r.width - GUTTER), h: Math.max(0, r.height - GUTTER) });
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // The single fitted rectangle both images render into. Derived from the
    // original's aspect ratio fitted inside the measured stage; never upscales
    // past 1:1 of the natural size so small images aren't blown up blurry.
    const fitRect = React.useMemo(() => {
        if (!origDims || stageSize.w <= 0 || stageSize.h <= 0) return { w: 0, h: 0 };
        const s = Math.min(stageSize.w / origDims.w, stageSize.h / origDims.h, 1);
        return { w: Math.round(origDims.w * s), h: Math.round(origDims.h * s) };
    }, [origDims, stageSize]);

    const handleOriginalLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
        }
    };
    const handleUpscaledLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            setUpDims({ w: img.naturalWidth, h: img.naturalHeight });
        }
    };

    // Add CSS animation for pulse/spin effects (kept for the running modal).
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    // Resolve the saved binary path on mount, then subscribe to the backend's
    // upscale/upscayl events so the log + progress bars update live.
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const saved = await prefsGet('RealesrganExePath');
                if (mounted && saved) {
                    setExePath(saved);
                } else if (mounted) {
                    await ensureUpscayl();
                }
            } catch { /* ignore */ }
        })();

        const unlisteners: UnlistenFn[] = [];
        (async () => {
            unlisteners.push(await listen<number>('upscayl:progress', (e) => setProgress(e.payload)));
            unlisteners.push(await listen<{ totalFiles: number }>('upscayl:batch-start', (e) => {
                setBatchInfo(e.payload);
                setBatchProgress({
                    currentFile: 0,
                    totalFiles: e.payload.totalFiles,
                    currentFileName: '',
                    overallProgress: 0,
                    fileProgress: 0,
                });
            }));
            unlisteners.push(await listen<BatchProgress>('upscayl:batch-progress', (e) => {
                setBatchProgress(e.payload);
            }));
            unlisteners.push(await listen<unknown>('upscayl:batch-complete', (e) => {
                setBatchResults(e.payload);
                setIsRunning(false);
            }));
        })();

        return () => {
            mounted = false;
            for (const un of unlisteners) un();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Check download status on mount
    useEffect(() => {
        void checkDownloadStatus();
    }, []);

    // Load preview image when input path changes (data URL via backend file read)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Reset the comparison + measured dims so a new image never inherits
            // the previous one's rectangle (a source of the old misalignment).
            setUpscaledImage(null);
            setOrigDims(null);
            setUpDims(null);
            setSliderPosition(50);
            try {
                if (inputPath && !batchMode) {
                    const dataUrl = await readAsDataUrl(inputPath);
                    if (!cancelled) setPreviewImage(dataUrl);
                } else if (!cancelled) {
                    setPreviewImage(null);
                }
            } catch {
                if (!cancelled) { setPreviewImage(null); }
            }
        })();
        return () => { cancelled = true; };
    }, [inputPath, batchMode]);

    // Function to load folder contents for preview
    const loadFolderContents = async (files: string[]) => {
        try {
            const supportedExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
            const contents: FolderContent[] = [];

            for (const filePath of files) {
                const file = basename(filePath);
                const ext = extname(file).toLowerCase();
                if (supportedExtensions.includes(ext)) {
                    try {
                        const dataUrl = await readAsDataUrl(filePath);
                        contents.push({ name: file, path: filePath, thumbnail: dataUrl, size: 0 });
                    } catch {
                        contents.push({ name: file, path: filePath, thumbnail: null, size: 0 });
                    }
                }
            }

            contents.sort((a, b) => a.name.localeCompare(b.name));
            setFolderContents(contents);
        } catch (error) {
            log.error('Error loading folder contents', String(error));
            setFolderContents([]);
        }
    };

    const pickInput = async () => {
        if (batchMode) {
            const picked = await open({ directory: true, multiple: false });
            if (typeof picked === 'string') {
                const scanned = await imgRecolorScanDir(picked, false);
                const files = scanned.map((img) => img.path);
                setInputPath(picked);
                await loadFolderContents(files);
                setOutputDir(joinPath(picked, 'upscaled'));
            }
        } else {
            const picked = await open({
                multiple: false,
                filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tif', 'tiff'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (typeof picked === 'string') {
                setInputPath(picked);
                setFolderContents([]);
                setOutputDir(dirname(picked));
            }
        }
    };

    const pickOutput = async () => {
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string') setOutputDir(dir);
    };

    /* Drag-and-drop into the preview. Single mode: first dropped image becomes the
       input. Batch mode: a dropped folder is scanned; dropped image files use their
       parent folder as the source. Paths come from the native webview drag-drop
       event (Tauri File objects don't expose real disk paths). */
    const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
    const isImagePath = (p: string) => IMG_EXTS.includes(extname(p).toLowerCase());

    const handleDroppedPaths = async (paths: string[]) => {
        // Ignore drops while running or before the AI components are installed.
        const installed = downloadStatus?.binary?.installed ?? !!exePath;
        if (isRunning || !installed || paths.length === 0) return;

        if (!batchMode) {
            // Single mode: take the first image; ignore folders/non-images.
            const img = paths.find(isImagePath);
            if (!img) return;
            setInputPath(img);
            setFolderContents([]);
            setOutputDir(dirname(img));
            return;
        }

        // Batch mode: prefer a dropped folder; else derive the folder from images.
        const folder = paths.find((p) => !isImagePath(p)) ?? dirname(paths.find(isImagePath) ?? '');
        if (!folder) return;
        try {
            const scanned = await imgRecolorScanDir(folder, false);
            const files = scanned.map((img) => img.path);
            setInputPath(folder);
            await loadFolderContents(files);
            setOutputDir(joinPath(folder, 'upscaled'));
        } catch (e) {
            log.error('Upscale drop scan failed', String(e));
        }
    };

    useFileDrop({
        onEnter: () => { if (!isRunning) setIsDragOver(true); },
        onOver: () => { if (!isRunning) setIsDragOver(true); },
        onLeave: () => setIsDragOver(false),
        onDrop: (paths) => {
            setIsDragOver(false);
            void handleDroppedPaths(paths);
        },
    });

    // Download manager functions
    const checkDownloadStatus = async () => {
        try {
            const status = await upscaleCheckStatus();
            setDownloadStatus(status);
        } catch (error) {
            log.error('Failed to check download status', String(error));
        }
    };

    const ensureUpscayl = async () => {
        setIsEnsuring(true);
        setEnsureError('');
        try {
            const path = await realesrganEnsure();
            if (path) {
                setExePath(path);
                await prefsSet('RealesrganExePath', path);
            } else {
                setExePath('');
                setEnsureError('Upscayl binary not found. Install it from Settings, External Tools, AI Upscale Models.');
            }
        } catch (e) {
            setEnsureError(String((e as Error)?.message || e));
        } finally {
            setIsEnsuring(false);
        }
    };

    const cancelUpscaling = async () => {
        setShouldCancel(true);
        setProgress(0);
        try {
            await upscaylCancel();
        } catch (e) {
            log.error('Error canceling upscaling', String(e));
        }
        setIsRunning(false);
    };

    const startUpscale = async () => {
        if (!exePath) { log.error('Missing exePath'); return; }
        if (!inputPath) { log.error('No input path selected'); return; }

        setIsRunning(true);
        setShouldCancel(false);
        setProgress(0);
        setBatchInfo(null);
        setBatchProgress({ currentFile: 0, totalFiles: 0, currentFileName: '', overallProgress: 0, fileProgress: 0 });
        setBatchResults(null);

        try {
            if (batchMode) {
                if (!outputDir) throw new Error('Please select an output folder for batch processing');
                await upscaylBatchProcess({
                    inputFolder: inputPath, outputFolder: outputDir, model, scale, extraArgs: '', exePath,
                });
            } else {
                const args: string[] = [];
                if (inputPath) args.push('-i', inputPath);

                let resolvedOutput = outputDir;
                try {
                    const outputIsDir = resolvedOutput ? !extname(resolvedOutput) : false;
                    if (!resolvedOutput) {
                        const ext = extname(inputPath) || '.png';
                        const base = basename(inputPath, ext) || 'upscaled';
                        const dir = dirname(inputPath) || '';
                        resolvedOutput = joinPath(dir, `${base}_x${scale}${ext}`);
                    } else if (outputIsDir) {
                        const ext = extname(inputPath) || '.png';
                        const base = basename(inputPath, ext) || 'upscaled';
                        resolvedOutput = joinPath(resolvedOutput, `${base}_x${scale}${ext}`);
                    }
                } catch (shapeErr) {
                    log.error('Output path resolution error', String(shapeErr));
                    setIsRunning(false);
                    return;
                }

                if (resolvedOutput) args.push('-o', resolvedOutput);
                if (scale) args.push('-s', String(scale));
                if (model) args.push('-n', model);

                const { code } = await upscaylStream(exePath, args, dirname(exePath));
                setProgress(code === 0 ? 100 : 0);

                if (code === 0 && resolvedOutput) {
                    try {
                        const dataUrl = await readAsDataUrl(resolvedOutput);
                        setUpscaledImage(dataUrl);
                    } catch {
                        setUpscaledImage(null);
                    }
                }
            }
        } catch (e) {
            log.error('Upscaling error', String(e));
            setIsRunning(false);
        } finally {
            setIsRunning(false);
        }
    };

    /* Slider: drive the divider from the pointer anywhere over the comparison
       box (pointer capture so a drag that leaves the box keeps tracking). */
    const compareRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    const setSliderFromClientX = (clientX: number) => {
        const el = compareRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pct = ((clientX - rect.left) / rect.width) * 100;
        setSliderPosition(Math.max(0, Math.min(100, pct)));
    };
    const onComparePointerDown = (e: React.PointerEvent) => {
        if (!upscaledImage) return;
        draggingRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setSliderFromClientX(e.clientX);
    };
    const onComparePointerMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        setSliderFromClientX(e.clientX);
    };
    const onComparePointerUp = (e: React.PointerEvent) => {
        draggingRef.current = false;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 300));
    const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 25));
    const handleResetZoom = () => setZoomLevel(100);

    const availableModels = [
        { value: 'upscayl-standard-4x', label: 'Upscayl Standard' },
        { value: 'upscayl-lite-4x', label: 'Upscayl Lite' },
        { value: 'ultrasharp-4x', label: 'UltraSharp' },
        { value: 'remacri-4x', label: 'Remacri' },
        { value: 'digital-art-4x', label: 'Digital Art' },
        { value: 'high-fidelity-4x', label: 'High Fidelity' },
        { value: 'ultramix-balanced-4x', label: 'UltraMix Balanced' },
    ];

    const pathChip = (text: string) => (
        <div className="upscale-pathchip">{text}</div>
    );

    // Shared style: force an image to exactly fill the fitted rectangle.
    const fillImgStyle: React.CSSProperties = {
        width: '100%', height: '100%', objectFit: 'fill', display: 'block', userSelect: 'none',
    };

    // ── Running modal ──
    const runningModal = (
        <div className="upscale-modal-overlay">
            <div className="upscale-modal" style={{ maxWidth: 460 }}>
                <div className="upscale-modal-head">
                    <span className="upscale-modal-title">AI PROCESSING IN PROGRESS</span>
                    <button className="dl-btn dl-btn--ghost dl-btn--sm" onClick={cancelUpscaling}><CloseIcon size={16} /></button>
                </div>
                <div style={{ padding: 28, textAlign: 'center' }}>
                    <div className="upscale-spinner">
                        <div className="upscale-spinner__halo" />
                        <LoaderIcon size={30} className="upscale-spin" style={{ color: 'var(--accent-primary)' }} />
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '1.15rem', marginBottom: 6 }}>
                        {batchMode ? `${batchProgress.currentFile} of ${batchProgress.totalFiles} Files` : 'Enhancing Image'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 24, padding: '0 12px', lineHeight: 1.5 }}>
                        {batchMode
                            ? <>Currently processing: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{batchProgress.currentFileName}</span></>
                            : `AI is upscaling your image by ${scale}x. This may take a minute depending on your hardware.`}
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        {batchMode ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <ProgressRow label="OVERALL PROGRESS" pct={batchProgress.overallProgress} />
                                <ProgressRow label="CURRENT FILE" pct={Math.round(batchProgress.fileProgress)} thin />
                            </div>
                        ) : (
                            <ProgressRow label="PROCESSING" pct={Math.round(progress)} big />
                        )}
                    </div>

                    <button className="dl-btn dl-btn--danger" onClick={cancelUpscaling} style={{ padding: '0 32px' }}>
                        Cancel Process
                    </button>
                </div>
            </div>
        </div>
    );

    const showFolderGrid = batchMode && inputPath && folderContents.length > 0 && !isRunning;
    const showSingle = previewImage && !batchMode;
    // Empty when nothing is loaded for the current mode (and not mid-run).
    const showEmpty = !isRunning && (batchMode ? !showFolderGrid : !previewImage);

    // Installed = backend reports the binary present (fallback: a resolved exe path).
    const isInstalled = downloadStatus?.binary?.installed ?? !!exePath;

    // Dim the page chrome until something is loaded (mirrors Paint's empty state).
    // The input picker + the empty-state prompt stay full-opacity as the CTA.
    const dimmed = !inputPath && !isRunning;
    const dimStyle: React.CSSProperties = dimmed
        ? { opacity: 0.4, pointerEvents: 'none', transition: 'opacity var(--motion-base)' }
        : { transition: 'opacity var(--motion-base)' };

    return (
        <div className="upscale-root">
            {/* ── Body: sidebar + preview area ── */}
            <div className="upscale-body">
                {/* Sidebar */}
                <div className="upscale-sidebar">
                    {/* Step 1: Input — disabled until the AI components are installed. */}
                    <FormGroup label={batchMode ? 'Source Folder' : 'Source Image'}>
                        <Button
                            variant="secondary"
                            fullWidth
                            icon={batchMode ? <FolderOpenIcon size={15} /> : <UploadIcon size={15} />}
                            onClick={pickInput}
                            disabled={isRunning || !isInstalled}
                        >
                            {inputPath ? 'Change Selection' : (batchMode ? 'Select Folder' : 'Select Image')}
                        </Button>
                        {inputPath && pathChip(basename(inputPath))}
                    </FormGroup>

                    {/* Step 2: Model Configuration — dims until an input is picked. */}
                    <div style={dimStyle}>
                        <FormGroup label="Model Configuration">
                            <CustomSelect
                                value={model}
                                onChange={setModel}
                                icon={<RocketIcon size={15} />}
                                options={availableModels}
                            />

                            <div>
                                <div className="upscale-rowlabel">
                                    <span>Upscale Scale</span>
                                    <span className="upscale-rowvalue">{scale}x</span>
                                </div>
                                <input
                                    type="range" min={1} max={4} step={1} value={scale}
                                    onChange={(e) => setScale(Number(e.target.value))}
                                    className="upscale-range"
                                />
                            </div>
                        </FormGroup>
                    </div>

                    {/* Step 3: Output — dims until an input is picked. */}
                    <div style={dimStyle}>
                        <FormGroup label="Destination">
                            <Button
                                variant="secondary"
                                fullWidth
                                icon={<FolderIcon size={15} />}
                                onClick={pickOutput}
                                disabled={isRunning}
                            >
                                {outputDir ? 'Change Folder' : 'Set Output Folder'}
                            </Button>
                            {outputDir && pathChip(outputDir)}
                        </FormGroup>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: 8, ...dimStyle }}>
                        <Button
                            variant="primary"
                            fullWidth
                            icon={isRunning ? <LoaderIcon size={16} className="upscale-spin" /> : <SparklesIcon size={16} />}
                            onClick={startUpscale}
                            disabled={!exePath || !inputPath || !outputDir || isRunning}
                        >
                            {isRunning ? 'Upscaling...' : 'Start Upscaling'}
                        </Button>

                        {ensureError && <div className="upscale-error">{ensureError}</div>}
                    </div>
                </div>

                {/* Preview Area */}
                <div className="upscale-preview">
                    {/* Preview Toolbar — holds zoom controls, the mode pills, and settings. */}
                    <div className="upscale-toolbar">
                        {/* Zoom controls dim until an image is loaded (nothing to zoom). */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...dimStyle }}>
                            <button className="upscale-iconbtn upscale-iconbtn--sm" onClick={handleZoomOut} title="Zoom out"><ZoomOutIcon size={18} /></button>
                            <span className="upscale-zoom">{zoomLevel}%</span>
                            <button className="upscale-iconbtn upscale-iconbtn--sm" onClick={handleZoomIn} title="Zoom in"><ZoomInIcon size={18} /></button>
                            <button className="upscale-iconbtn upscale-iconbtn--sm" onClick={handleResetZoom} title="Reset zoom" style={{ marginLeft: 6 }}><ResetIcon size={16} /></button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {origDims && (
                                <span className="upscale-dims">
                                    {origDims.w}×{origDims.h}
                                    {upDims && <> <span className="upscale-dims__arrow">→</span> {upDims.w}×{upDims.h}</>}
                                </span>
                            )}
                            {upscaledImage && <span className="upscale-badge">AI ENHANCED COMPARISON</span>}

                            {/* Shown only when the AI components aren't installed — sits left of
                                the mode pills and leads to Settings, External Tools. */}
                            {!isInstalled && (
                                <button className="upscale-install-link" onClick={() => goToSettings({ section: 'tools', highlight: 'upscale' })}>
                                    <span className="upscale-install-link__dot" />
                                    Install in Settings
                                    <ArrowRightIcon size={13} />
                                </button>
                            )}

                            <div className="upscale-pills">
                                {([{ key: false, label: 'Single File' }, { key: true, label: 'Batch Mode' }] as const).map(({ key, label }) => (
                                    <button
                                        key={String(key)}
                                        className={`upscale-pill${batchMode === key ? ' is-active' : ''}`}
                                        onClick={() => setBatchMode(key)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Empty-state prompt: absolute overlay centered over the WHOLE preview
                        column, not just the stage. Stays full-brightness (it's the thing
                        to look at) while the surrounding chrome dims. */}
                    {showEmpty && (
                        <div className="upscale-emptystate">
                            {batchMode
                                ? <FolderIcon size={48} color="var(--accent-primary)" strokeWidth={1.5} style={{ display: 'block', marginBottom: 16 }} />
                                : <ImageIcon size={48} color="var(--accent-primary)" strokeWidth={1.5} style={{ display: 'block', marginBottom: 16 }} />}
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                                {isDragOver ? 'Drop to load' : batchMode ? 'No Folder Selected' : 'No Image Selected'}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 18 }}>
                                {batchMode ? 'Drop a folder here' : 'Drop an image here'}
                            </div>
                            <button
                                className="dl-btn dl-btn--primary"
                                onClick={pickInput}
                                disabled={!isInstalled}
                                style={{ pointerEvents: 'auto' }}
                            >
                                <span className="dl-icon">{batchMode ? <FolderOpenIcon size={16} /> : <UploadIcon size={16} />}</span>
                                <span>{batchMode ? 'Select Folder' : 'Select Image'}</span>
                            </button>
                        </div>
                    )}

                    {/* Comparison Content (measured stage) */}
                    <div className={`upscale-stage${isDragOver ? ' is-dragover' : ''}`} ref={stageRef}>

                        {/* Batch Mode Folder Preview */}
                        {showFolderGrid && (
                            <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                                <div style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.82rem', marginBottom: 14 }}>
                                    SOURCE FOLDER: {folderContents.length} IMAGES
                                </div>
                                <div className="upscale-grid">
                                    {folderContents.map((file, idx) => (
                                        <div key={idx} className="upscale-gridcard">
                                            {file.thumbnail
                                                ? <img src={file.thumbnail} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 4 }} alt="" />
                                                : <div className="upscale-gridcard__ph"><ImageIcon size={22} /></div>}
                                            <div className="upscale-gridcard__name">{file.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Single File Preview — fixed shared rectangle */}
                        {showSingle && (
                            <div style={{ transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.2s var(--ease-out)' }}>
                                <div
                                    ref={compareRef}
                                    className="upscale-compare"
                                    style={{ width: fitRect.w || 'auto', height: fitRect.h || 'auto' }}
                                    onPointerDown={onComparePointerDown}
                                    onPointerMove={onComparePointerMove}
                                    onPointerUp={onComparePointerUp}
                                >
                                    {/* Base (original) fills the rect and defines it via natural dims. */}
                                    <img
                                        src={previewImage}
                                        draggable={false}
                                        style={fillImgStyle}
                                        alt="original"
                                        onLoad={handleOriginalLoad}
                                    />

                                    {/* Upscaled overlay forced into the SAME rect, clipped by the slider. */}
                                    {upscaledImage && (
                                        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `inset(0 0 0 ${sliderPosition}%)` }}>
                                            <img
                                                src={upscaledImage}
                                                draggable={false}
                                                style={fillImgStyle}
                                                alt="upscaled"
                                                onLoad={handleUpscaledLoad}
                                            />
                                        </div>
                                    )}

                                    {/* Divider handle */}
                                    {upscaledImage && (
                                        <div className="upscale-divider" style={{ left: `${sliderPosition}%` }}>
                                            <div className="upscale-divider__grip"><CompareIcon size={15} /></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Upscaling Running Modal */}
            {isRunning && runningModal}
        </div>
    );
}

// Small progress-bar row used in the running modal.
function ProgressRow({ label, pct, thin, big }: { label: string; pct: number; thin?: boolean; big?: boolean }) {
    return (
        <div>
            <div className="upscale-rowlabel">
                <span>{label}</span>
                <span className="upscale-rowvalue">{pct}%</span>
            </div>
            <div className="upscale-bar" style={{ height: big ? 8 : thin ? 4 : 6 }}>
                <div className="upscale-bar__fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default Upscale;
