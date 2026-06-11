import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Select,
    MenuItem,
    FormControl,
    Slider,
    IconButton,
    Tooltip,
    Chip,
    CircularProgress,
} from '@mui/material';
import {
    Image as ImageIcon,
    Settings as SettingsIcon,
    Folder as FolderIcon,
    RocketLaunch as RocketIcon,
    Compare as CompareIcon,
    Info as InfoIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    RestartAlt as ResetIcon,
    Upload as UploadIcon,
    AutoAwesome as SparklesIcon,
    Autorenew as LoaderIcon,
    FolderOpen as FolderOpenIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { readFileBase64 } from '@/lib/api';
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
    const [exePath, setExePath] = useState('');
    const [, setIsEnsuring] = useState(false);
    const [ensureError, setEnsureError] = useState('');

    // Add CSS animation for pulse effect
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
			@keyframes pulse {
				0% { opacity: 1; transform: scale(1); }
				50% { opacity: 0.5; transform: scale(1.05); }
				100% { opacity: 1; transform: scale(1); }
			}
			@keyframes spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}
		`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const [inputPath, setInputPath] = useState('');
    const [outputDir, setOutputDir] = useState('');
    const [scale, setScale] = useState(4);
    const [model, setModel] = useState('upscayl-standard-4x');
    const [extraArgs, setExtraArgs] = useState('');
    const [batchMode, setBatchMode] = useState(false);

    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logText, setLog] = useState('');
    const logRef = useRef<HTMLDivElement>(null);
    const [, setShouldCancel] = useState(false);

    // Download manager state
    const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadMessage, setDownloadMessage] = useState('');
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    // Batch processing state
    // TODO(backend): setBatchInfo / setBatchResults are wired for the 'upscayl:batch-*'
    // events; with the bridge absent they are write-only, so we drop the read bindings.
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
    const [isDragging, setIsDragging] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(100);

    // Ensure original and upscaled images render at exactly the same size
    const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
    const MAX_PREVIEW_W = 900;
    const MAX_PREVIEW_H = 650;

    const handleOriginalLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        try {
            const naturalWidth = e?.currentTarget?.naturalWidth || 0;
            const naturalHeight = e?.currentTarget?.naturalHeight || 0;
            if (naturalWidth && naturalHeight) {
                const s = Math.min(MAX_PREVIEW_W / naturalWidth, MAX_PREVIEW_H / naturalHeight, 1.0) || 1.0;
                const width = Math.round(naturalWidth * s);
                const height = Math.round(naturalHeight * s);
                setDisplaySize({ width, height });
            }
        } catch { /* ignore */ }
    };

    // ─── Modern style helpers ──────────────────────────────────────────────────
    const panelSx = {
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        p: { xs: 1.25, sm: 1.5 },
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
            content: '""',
            position: 'absolute',
            top: 0, left: '20%', right: '20%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
            pointerEvents: 'none',
        },
    } as const;

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text)',
            fontSize: '0.8rem',
            borderRadius: '8px',
            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
            '&:hover fieldset': { borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent)', borderWidth: '1px' },
        },
        '& .MuiInputBase-input': {
            color: 'var(--text)',
            '&::placeholder': { color: 'rgba(255,255,255,0.25)', opacity: 1 },
        },
    } as const;

    const selectSx = {
        ...inputSx,
        '& .MuiOutlinedInput-root': {
            ...inputSx['& .MuiOutlinedInput-root'],
            height: '38px',
        },
        '& .MuiSelect-select': {
            py: 1,
            display: 'flex',
            alignItems: 'center',
        },
    } as const;

    const modePillSx = (active: boolean) => ({
        px: 1.35, py: 0.45,
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
        color: active ? 'var(--accent)' : 'rgba(255,255,255,0.28)',
        border: active ? '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' : '1px solid transparent',
        transition: 'all 0.18s ease',
        userSelect: 'none',
        '&:hover': { color: active ? 'var(--accent)' : 'rgba(255,255,255,0.5)' },
    });

    const buttonSx = {
        width: '100%',
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        color: 'var(--accent)',
        fontWeight: 700,
        fontSize: '0.8rem',
        textTransform: 'none',
        borderRadius: '10px',
        py: 1,
        transition: 'all 0.2s ease',
        '&:hover': {
            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
            transform: 'translateY(-1px)',
        },
        '&:disabled': { opacity: 0.5, transform: 'none', cursor: 'not-allowed' },
    } as const;

    const primaryButtonSx = {
        ...buttonSx,
        background: 'var(--accent) !important',
        color: '#000 !important',
        '&:hover': {
            background: 'var(--accent)',
            filter: 'brightness(1.15)',
            transform: 'translateY(-1.5px)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
        },
        '&.Mui-disabled': {
            background: 'rgba(255,255,255,0.06) !important',
            color: 'rgba(255,255,255,0.25) !important',
            border: '1px solid rgba(255,255,255,0.02) !important',
            opacity: 1,
        },
    } as const;

    const sliderSx = {
        color: 'var(--accent)',
        height: 4,
        '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
            transition: '0.3s cubic-bezier(.47,1.64,.41,.8)',
            '&:before': { boxShadow: '0 2px 12px 0 rgba(0,0,0,0.4)' },
            '&:hover, &.Mui-focusVisible': { boxShadow: '0px 0px 0px 8px color-mix(in srgb, var(--accent) 16%, transparent)' },
            '&.Mui-active': { width: 16, height: 16 },
        },
        '& .MuiSlider-rail': { opacity: 0.15 },
    } as const;

    // TODO(backend): the Upscayl IPC bridge (upscale:* / upscayl:* commands, binary
    // download + Real-ESRGAN NCNN process, live log/progress events, prefs persistence)
    // does not exist yet. The listeners below are kept as no-op stubs so the wiring
    // is obvious once the backend lands.
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                // TODO(backend): const saved = await invokeCommand('prefs:get', { key: 'RealesrganExePath' });
                const saved = '';
                if (mounted && saved) {
                    setExePath(saved);
                } else if (mounted) {
                    // No saved path — try to resolve/ensure the Upscayl binary.
                    await ensureUpscayl();
                }
            } catch { /* ignore */ }
        })();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Check download status on mount
    useEffect(() => {
        void checkDownloadStatus();
    }, []);

    useEffect(() => {
        try {
            if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
            }
        } catch { /* ignore */ }
    }, [logText]);

    // Load preview image when input path changes (data URL via backend file read)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (inputPath && !batchMode) {
                    const dataUrl = await readAsDataUrl(inputPath);
                    if (!cancelled) setPreviewImage(dataUrl);
                } else if (!cancelled) {
                    setPreviewImage(null);
                }
                if (!cancelled) setUpscaledImage(null);
            } catch {
                if (!cancelled) { setPreviewImage(null); setUpscaledImage(null); }
            }
        })();
        return () => { cancelled = true; };
    }, [inputPath, batchMode]);

    // Debug folder contents changes
    useEffect(() => {
        if (folderContents.length > 0) {
            log.debug('Upscale folderContents', folderContents.length, 'items');
        }
    }, [folderContents]);

    // Global mouse event listener for slider dragging
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
            }
        };

        if (isDragging) {
            document.addEventListener('mouseup', handleGlobalMouseUp);
            document.addEventListener('mouseleave', handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener('mouseup', handleGlobalMouseUp);
            document.removeEventListener('mouseleave', handleGlobalMouseUp);
        };
    }, [isDragging]);

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
            // Batch mode: select folder.
            // TODO(backend): a folder picker only returns the directory path; enumerating
            // image files inside it for thumbnails needs a backend list-directory command.
            // As a faithful interim we let the user multi-select the source images so the
            // grid preview still works against real files on disk.
            const picked = await open({
                multiple: true,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tif', 'tiff'] }],
            });
            if (Array.isArray(picked) && picked.length > 0) {
                const selectedPath = dirname(picked[0]);
                setInputPath(selectedPath);
                await loadFolderContents(picked);
                // Automatically set output folder to a subfolder of the selected folder
                setOutputDir(joinPath(selectedPath, 'upscaled'));
            }
        } else {
            // Single file mode: select image file
            const picked = await open({
                multiple: false,
                filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tif', 'tiff'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (typeof picked === 'string') {
                setInputPath(picked);
                // Clear folder contents for single file mode
                setFolderContents([]);
                // Automatically set output folder to the same directory as the input image
                setOutputDir(dirname(picked));
            }
        }
    };

    const pickOutput = async () => {
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string') setOutputDir(dir);
    };

    // Download manager functions
    const checkDownloadStatus = async () => {
        try {
            // TODO(backend): const status = await invokeCommand('upscale:check-status');
            const status: DownloadStatus = { binary: { installed: false }, models: { installed: [], total: 0 } };
            setDownloadStatus(status);
        } catch (error) {
            log.error('Failed to check download status', String(error));
        }
    };

    const startDownload = async () => {
        setIsDownloading(true);
        setDownloadProgress(0);
        setDownloadMessage('Starting download...');
        setLog(''); // Clear previous logs

        try {
            // TODO(backend): await invokeCommand('upscale:download-all'); — streams
            // 'upscale:progress' / 'upscale:log' events back to drive the bar below.
            throw new Error('Upscayl backend download not wired yet');
        } catch (error) {
            log.error('Download failed', String(error));
            setDownloadMessage('Download failed');
        } finally {
            setIsDownloading(false);
            setDownloadMessage('');
            // Refresh status after download
            await checkDownloadStatus();
        }
    };

    const ensureUpscayl = async () => {
        setIsEnsuring(true);
        setEnsureError('');
        setLog('');
        try {
            // TODO(backend): const path = await invokeCommand('realesrgan.ensure');
            const path = '';
            if (path) {
                setExePath(path);
                // TODO(backend): await invokeCommand('prefs:set', { key: 'RealesrganExePath', value: path });
            } else {
                setExePath('');
                setEnsureError('Upscayl binary not found. Please download it from the AI Components Settings in the top right corner.');
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
        setLog('');

        // Cancel the upscaling process
        try {
            // TODO(backend): await invokeCommand('upscayl:cancel');
        } catch (e) {
            log.error('Error canceling upscaling', String(e));
        }

        // Set running to false after canceling
        setIsRunning(false);
    };

    const startUpscale = async () => {
        if (!exePath) {
            log.error('Missing exePath');
            return;
        }

        // Validate required inputs before starting
        if (!inputPath) {
            log.error('No input path selected');
            return;
        }

        setIsRunning(true);
        setShouldCancel(false);
        setProgress(0);
        setLog('');
        setBatchInfo(null);
        setBatchProgress({
            currentFile: 0,
            totalFiles: 0,
            currentFileName: '',
            overallProgress: 0,
            fileProgress: 0,
        });
        setBatchResults(null);

        try {
            if (batchMode) {
                // Batch processing mode
                if (!outputDir) {
                    throw new Error('Please select an output folder for batch processing');
                }

                // TODO(backend): await invokeCommand('upscayl:batch-process', {
                //     inputFolder: inputPath, outputFolder: outputDir, model, scale, extraArgs, exePath });
                throw new Error('Upscale (batch) not wired yet');
            } else {
                // Single file processing mode
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
                    setLog((prev) => prev + `\n${String((shapeErr as Error)?.message || shapeErr)}`);
                    setIsRunning(false);
                    return;
                }

                if (resolvedOutput) args.push('-o', resolvedOutput);
                if (scale) args.push('-s', String(scale));
                if (model) args.push('-n', model);
                if (extraArgs && extraArgs.trim().length) {
                    args.push(...extraArgs.split(' ').filter(Boolean));
                }

                // TODO(backend): const { code, stdout, stderr } = await invokeCommand('upscayl:stream', {
                //     exePath, args, cwd: dirname(exePath) }); — streams 'upscayl:log' / 'upscayl:progress'.
                // On success, load the upscaled output for the before/after comparison:
                //   const dataUrl = await readAsDataUrl(resolvedOutput); setUpscaledImage(dataUrl);
                throw new Error('Upscale not wired yet');
            }
        } catch (e) {
            log.error('Upscaling error', String(e));
            const errorMessage = (e as Error)?.message || String(e) || 'Unknown error occurred';
            setLog((prev) => prev + '\n❌ Error: ' + errorMessage);
            setIsRunning(false);
        } finally {
            setIsRunning(false);
        }
    };

    const handleSliderMouseDown = () => {
        setIsDragging(true);
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !upscaledImage) return;

        const container = event.currentTarget;
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPosition(percentage);
    };

    const handleZoomIn = () => {
        setZoomLevel((prev) => Math.min(prev + 25, 200));
    };

    const handleZoomOut = () => {
        setZoomLevel((prev) => Math.max(prev - 25, 25));
    };

    const handleResetZoom = () => {
        setZoomLevel(100);
    };

    const availableModels = [
        { value: 'upscayl-standard-4x', label: 'Upscayl Standard' },
        { value: 'upscayl-lite-4x', label: 'Upscayl Lite' },
        { value: 'ultrasharp-4x', label: 'UltraSharp' },
        { value: 'remacri-4x', label: 'Remacri' },
        { value: 'digital-art-4x', label: 'Digital Art' },
        { value: 'high-fidelity-4x', label: 'High Fidelity' },
        { value: 'ultramix-balanced-4x', label: 'UltraMix Balanced' },
    ];

    // Modern Processing Modal
    const runningModal = (
        <Box sx={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3,
        }}>
            <Box sx={{
                width: '100%', maxWidth: 480,
                background: 'rgba(15, 15, 20, 0.98)',
                backdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px',
                overflow: 'hidden', boxShadow: '0 42px 100px rgba(0,0,0,0.9)',
                position: 'relative',
            }}>
                {/* Modal Header */}
                <Box sx={{
                    p: 2.2, borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.02)',
                }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--accent)' }}>
                        AI PROCESSING IN PROGRESS
                    </Typography>
                    <IconButton size="small" onClick={cancelUpscaling} sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#f87171' } }}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>

                {/* Modal Content */}
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    {/* Animated Loader */}
                    <Box sx={{
                        width: 84, height: 84, mx: 'auto', mb: 3.5, position: 'relative',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Box sx={{
                            position: 'absolute', inset: 0, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-bright))',
                            opacity: 0.15, animation: 'pulse 2s infinite',
                        }} />
                        <CircularProgress
                            variant="determinate"
                            value={batchMode ? batchProgress.overallProgress : progress}
                            size={84}
                            thickness={2.5}
                            sx={{ color: 'var(--accent)', position: 'absolute' }}
                        />
                        <LoaderIcon sx={{ fontSize: 32, color: 'var(--accent)', animation: 'spin 2s linear infinite' }} />
                    </Box>

                    <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', mb: 1 }}>
                        {batchMode ? `${batchProgress.currentFile} of ${batchProgress.totalFiles} Files` : 'Enhancing Image'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-2)', opacity: 0.6, mb: 4, px: 2, lineHeight: 1.5 }} component="div">
                        {batchMode ? (
                            <>Currently processing: <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>{batchProgress.currentFileName}</Box></>
                        ) : (
                            `AI is upscaling your image by ${scale}x. This may take a minute depending on your hardware.`
                        )}
                    </Typography>

                    {/* Progress Indicators */}
                    <Box sx={{ mb: 4 }}>
                        {batchMode ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.4 }}>OVERALL PROGRESS</Typography>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{batchProgress.overallProgress}%</Typography>
                                    </Box>
                                    <Box sx={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                                        <Box sx={{ width: `${batchProgress.overallProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease-out' }} />
                                    </Box>
                                </Box>
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.4 }}>CURRENT FILE</Typography>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{Math.round(batchProgress.fileProgress)}%</Typography>
                                    </Box>
                                    <Box sx={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                                        <Box sx={{ width: `${batchProgress.fileProgress}%`, height: '100%', background: 'linear-gradient(90deg, rgba(255,255,255,0.2), var(--accent))', transition: 'width 0.3s' }} />
                                    </Box>
                                </Box>
                            </Box>
                        ) : (
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.4 }}>PROCESSING</Typography>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)' }}>{Math.round(progress)}%</Typography>
                                </Box>
                                <Box sx={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden', p: '2px' }}>
                                    <Box sx={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.5s cubic-bezier(0.1, 0, 0.3, 1)' }} />
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <Button
                        onClick={cancelUpscaling}
                        variant="outlined"
                        sx={{
                            borderColor: 'rgba(239,68,68,0.2)', color: '#f87171',
                            textTransform: 'none', fontSize: '0.75rem', fontWeight: 700,
                            px: 4, borderRadius: '8px',
                            '&:hover': { borderColor: '#ef4444', background: 'rgba(239,68,68,0.05)' },
                        }}
                    >
                        Cancel Process
                    </Button>
                </Box>
            </Box>
        </Box>
    );

    return (
        <Box className="upscale-root" sx={{
            height: '100%', minHeight: '100%', width: '100%',
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg)', color: 'var(--text)',
            overflow: 'hidden', position: 'relative',
        }}>
            {/* ── Page header ── */}
            <Box sx={{
                flexShrink: 0,
                px: { xs: 2, sm: 2.5 }, py: { xs: 1.1, sm: 1.35 },
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 1.5,
                position: 'relative', zIndex: 2,
                background: 'rgba(0,0,0,0.05)',
            }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.2 }}>
                        AI Image Upscaler
                    </Typography>
                    <Typography sx={{ fontSize: '0.67rem', color: 'var(--text-2)', opacity: 0.5, mt: 0.1, lineHeight: 1 }}>
                        {batchMode ? 'Upscale multiple images from a folder' : 'Enhance a single image using AI models'}
                    </Typography>
                </Box>

                {/* Batch mode toggle pills */}
                <Box sx={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', p: '3px' }}>
                    {([
                        { key: false, label: 'Single File' },
                        { key: true, label: 'Batch Mode' },
                    ] as const).map(({ key, label }) => (
                        <Box key={String(key)} onClick={() => setBatchMode(key)} sx={modePillSx(batchMode === key)}>{label}</Box>
                    ))}
                </Box>

                {/* Refresh + Settings */}
                <Box sx={{ display: 'flex', gap: 0.25, ml: 1 }}>
                    <Tooltip title={!downloadStatus?.binary?.installed ? 'Install AI Components' : 'AI Settings'} arrow>
                        <IconButton size="small"
                            onClick={() => setShowDownloadModal(true)}
                            sx={{
                                color: downloadStatus?.binary?.installed ? 'rgba(255,255,255,0.35)' : '#f59e0b',
                                '&:hover': { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' },
                            }}
                        >
                            <SettingsIcon sx={{ fontSize: 17 }} />
                            {!downloadStatus?.binary?.installed && (
                                <Box sx={{
                                    position: 'absolute', top: 6, right: 6, width: 6, height: 6,
                                    background: '#f59e0b', borderRadius: '50%', border: '1px solid var(--bg)',
                                    animation: 'pulse 2s infinite',
                                }} />
                            )}
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* ── Body: sidebar + preview area ── */}
            <Box sx={{
                flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
                position: 'relative', zIndex: 1,
            }}>
                {/* Sidebar */}
                <Box sx={{
                    width: { xs: '100%', sm: '300px', md: '320px' },
                    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.25,
                    px: { xs: 1.5, sm: 2 }, py: 2,
                    background: 'rgba(0,0,0,0.08)',
                    backdropFilter: 'blur(10px)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: 4 },
                    '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 2 },
                }}>
                    {/* Status Chip */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.3)' }}>SYSTEM STATUS</Typography>
                        <Chip
                            label={exePath ? 'READY' : 'NOT INSTALLED'}
                            size="small"
                            sx={{
                                height: 18, fontSize: '0.6rem', fontWeight: 800,
                                background: exePath ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: exePath ? '#4ade80' : '#f87171',
                                border: `1px solid ${exePath ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                '& .MuiChip-label': { px: 1 },
                            }}
                        />
                    </Box>

                    {/* Step 1: Input */}
                    <Box sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }} component="div">
                            {batchMode ? <FolderIcon sx={{ fontSize: 13 }} /> : <UploadIcon sx={{ fontSize: 13 }} />} {batchMode ? 'Source Folder' : 'Source Image'}
                        </Typography>
                        <Button onClick={pickInput} disabled={isRunning}
                            startIcon={batchMode ? <FolderOpenIcon sx={{ fontSize: 15 }} /> : <UploadIcon sx={{ fontSize: 15 }} />}
                            sx={buttonSx}
                        >
                            {inputPath ? 'Change Selection' : (batchMode ? 'Select Folder' : 'Select Image')}
                        </Button>
                        {inputPath && (
                            <Box sx={{ mt: 1, px: 1, py: 0.75, borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-2)', wordBreak: 'break-all', opacity: 0.8, lineHeight: 1.2 }}>
                                    {basename(inputPath)}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Step 2: Model Configuration */}
                    <Box sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }} component="div">
                            <RocketIcon sx={{ fontSize: 13 }} /> Model Configuration
                        </Typography>

                        <FormControl fullWidth size="small" sx={{ mb: 1.5, ...selectSx }}>
                            <Select value={model} onChange={(e) => setModel(e.target.value)}>
                                {availableModels.map((m) => (
                                    <MenuItem key={m.value} value={m.value} sx={{ fontSize: '0.8rem', fontFamily: 'inherit' }}>{m.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Box sx={{ px: 0.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>UPSCALE SCALE</Typography>
                                <Typography sx={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>{scale}x</Typography>
                            </Box>
                            <Slider value={scale} onChange={(_e, v) => setScale(v as number)} min={1} max={4} step={1} marks sx={sliderSx} />
                        </Box>

                        <Box sx={{ px: 0.5, mt: 1.5 }}>
                            <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, mb: 0.5 }}>EXTRA ARGUMENTS</Typography>
                            <Box
                                component="input"
                                value={extraArgs}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExtraArgs(e.target.value)}
                                placeholder="-t 0 -g 0 ..."
                                sx={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.03)', color: 'var(--text)',
                                    fontSize: '0.8rem', borderRadius: '8px', px: 1, py: 0.75,
                                    border: '1px solid rgba(255,255,255,0.1)', outline: 'none',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    '&:focus': { borderColor: 'var(--accent)' },
                                    '&::placeholder': { color: 'rgba(255,255,255,0.25)' },
                                }}
                            />
                        </Box>
                    </Box>

                    {/* Step 3: Output */}
                    <Box sx={panelSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }} component="div">
                            <FolderIcon sx={{ fontSize: 13 }} /> Destination
                        </Typography>
                        <Button onClick={pickOutput} disabled={isRunning}
                            startIcon={<FolderOpenIcon sx={{ fontSize: 15 }} />}
                            sx={buttonSx}
                        >
                            {outputDir ? 'Change Folder' : 'Set Output Folder'}
                        </Button>
                        {outputDir && (
                            <Box sx={{ mt: 1, px: 1, py: 0.75, borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-2)', wordBreak: 'break-all', opacity: 0.6, lineHeight: 1.3 }}>
                                    {outputDir}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ mt: 'auto', pt: 1 }}>
                        <Button
                            fullWidth
                            onClick={startUpscale}
                            disabled={!exePath || !inputPath || !outputDir || isRunning}
                            startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <SparklesIcon sx={{ fontSize: 16 }} />}
                            sx={primaryButtonSx}
                        >
                            {isRunning ? 'UPSCAlING...' : 'START UPSCALING'}
                        </Button>

                        {ensureError && (
                            <Typography sx={{ mt: 1.5, fontSize: '0.65rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', p: 1, borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.4 }}>
                                {ensureError}
                            </Typography>
                        )}
                    </Box>
                </Box>

                {/* Preview Area */}
                <Box sx={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    position: 'relative', background: 'rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                }}>
                    {/* Small Preview Toolbar */}
                    <Box sx={{
                        px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.05)',
                        zIndex: 5,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton size="small" onClick={handleZoomOut} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
                                <ZoomOutIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <Typography sx={{ minWidth: 45, textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {zoomLevel}%
                            </Typography>
                            <IconButton size="small" onClick={handleZoomIn} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
                                <ZoomInIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton size="small" onClick={handleResetZoom} sx={{ ml: 1, color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}>
                                <ResetIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                        </Box>

                        {upscaledImage && (
                            <Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.05em', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', px: 1, py: 0.3, borderRadius: '4px' }}>
                                AI ENHANCED COMPARISON
                            </Typography>
                        )}
                    </Box>

                    {/* Comparison Content */}
                    <Box sx={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', overflow: 'auto', p: 4,
                        '&::-webkit-scrollbar': { width: 6, height: 6 },
                        '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.05)', borderRadius: 3 },
                    }}>
                        {!previewImage && !isRunning && !batchMode && (
                            <Box sx={{ textAlign: 'center', color: 'var(--text)' }}>
                                <Box sx={{
                                    width: 96,
                                    height: 96,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    mx: 'auto', mb: 3,
                                }}>
                                    <ImageIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)' }} />
                                </Box>
                                <Typography sx={{ mb: 1, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '1rem' }}>No Image Selected</Typography>
                                <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>Select an image from the sidebar to get started</Typography>
                            </Box>
                        )}

                        {/* Batch Mode Folder Preview */}
                        {batchMode && inputPath && folderContents.length > 0 && !isRunning && (
                            <Box sx={{ width: '100%', height: '100%', p: 2, overflow: 'auto' }}>
                                <Typography sx={{ mb: 2, fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
                                    SOURCE FOLDER: {folderContents.length} IMAGES
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
                                    {folderContents.map((file, idx) => (
                                        <Box key={idx} sx={{
                                            background: 'rgba(255,255,255,0.03)', p: 1, borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            '&:hover': { borderColor: 'rgba(255,255,255,0.15)', transform: 'translateY(-2px)' },
                                            transition: 'all 0.2s ease',
                                        }}>
                                            {file.thumbnail ? (
                                                <img src={file.thumbnail} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: '4px' }} alt="" />
                                            ) : (
                                                <Box sx={{ width: '100%', height: 100, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                                    <ImageIcon sx={{ opacity: 0.1 }} />
                                                </Box>
                                            )}
                                            <Typography noWrap sx={{ mt: 0.75, fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{file.name}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {/* Single File Preview */}
                        {previewImage && !batchMode && (
                            <Box sx={{ position: 'relative', transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.3s ease' }}>
                                <Box sx={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onMouseMove={handleMouseMove} onMouseLeave={() => setIsDragging(false)}>
                                    <img src={previewImage} draggable={false} style={{ maxWidth: displaySize.width || 900, maxHeight: displaySize.height || 650, display: 'block' }} alt="" onLoad={handleOriginalLoad} />
                                    {upscaledImage && (
                                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', clipPath: `inset(0 0 0 ${sliderPosition}%)` }}>
                                            <img src={upscaledImage} draggable={false} style={{ maxWidth: displaySize.width || 900, maxHeight: displaySize.height || 650, display: 'block' }} alt="" />
                                        </Box>
                                    )}
                                    {upscaledImage && (
                                        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${sliderPosition}%`, width: 1.5, background: 'var(--accent)', cursor: 'col-resize', transform: 'translateX(-50%)', zIndex: 3 }} onMouseDown={handleSliderMouseDown}>
                                            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '2px solid rgba(0,0,0,0.2)' }}>
                                                <CompareIcon sx={{ fontSize: 16 }} />
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {/* Console / log output */}
                    <Box sx={{
                        flexShrink: 0, height: 140, borderTop: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
                    }}>
                        <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <InfoIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }} />
                            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.35)' }}>CONSOLE</Typography>
                        </Box>
                        <Box ref={logRef} sx={{
                            flex: 1, minHeight: 0, p: 1.25, overflow: 'auto',
                            fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', lineHeight: 1.55,
                            whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.7)',
                            '&::-webkit-scrollbar': { width: 6 },
                            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.08)', borderRadius: 3 },
                        }}>
                            {logText || 'Console ready...\n'}
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* Download/Settings Modal */}
            {showDownloadModal && (
                <Box sx={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                    <Box sx={{
                        width: '100%', maxWidth: 460,
                        background: 'rgba(15, 15, 20, 0.98)',
                        backdropFilter: 'blur(30px)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px',
                        overflow: 'hidden', boxShadow: '0 42px 100px rgba(0,0,0,0.9)',
                    }}>
                        <Box sx={{ p: 2.2, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--accent)' }}>AI COMPONENTS SETTINGS</Typography>
                            <IconButton size="small" onClick={() => setShowDownloadModal(false)} sx={{ color: 'rgba(255,255,255,0.3)' }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
                        </Box>
                        <Box sx={{ p: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Upscayl Binary</Typography>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', mt: 0.2 }}>Required for AI processing</Typography>
                                </Box>
                                <Chip label={downloadStatus?.binary?.installed ? 'INSTALLED' : 'MISSING'} size="small" sx={{ background: downloadStatus?.binary?.installed ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: downloadStatus?.binary?.installed ? '#4ade80' : '#f59e0b', fontSize: '0.62rem', fontWeight: 800 }} />
                            </Box>

                            {isDownloading && (
                                <Box sx={{ mb: 2.5 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{downloadMessage}</Typography>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{Math.round(downloadProgress)}%</Typography>
                                    </Box>
                                    <Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                        <Box sx={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
                                    </Box>
                                </Box>
                            )}

                            <Button fullWidth onClick={startDownload} disabled={isDownloading || (!!downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)} sx={primaryButtonSx}>
                                {isDownloading ? 'DOWNLOADING...' : (downloadStatus?.binary?.installed ? 'UPDATE COMPONENTS' : 'DOWNLOAD COMPONENTS (~200MB)')}
                            </Button>
                        </Box>
                    </Box>
                </Box>
            )}

            {/* Upscaling Running Modal */}
            {isRunning && runningModal}
        </Box>
    );
}

export default Upscale;
