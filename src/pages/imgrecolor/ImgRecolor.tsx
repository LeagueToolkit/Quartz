import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Box, Typography, Button, Slider, Checkbox, Switch, Menu, IconButton } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import GlowingSpinner from './GlowingSpinner';
import {
    loadFolder,
    loadSingleImage,
    saveImageFile,
    isGrayscaleImage,
    applyAdjustment,
    type ImageEntry,
    type RecolorParams,
} from './utils/imgRecolorLogic';
import './ImgRecolor.css';

// Celestial-style minimalistic button
const celestialButtonStyle = {
    background: 'rgba(0, 0, 0, 0.35)',
    border: '2px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    color: 'var(--accent)',
    borderRadius: '8px',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    textTransform: 'none' as const,
    fontFamily: 'JetBrains Mono, monospace',
    '&:hover': {
        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        borderColor: 'var(--accent)',
        boxShadow: '0 0 15px color-mix(in srgb, var(--accent) 25%, transparent)',
        transform: 'translateY(-1px)',
    },
    '&:disabled': {
        background: 'rgba(0, 0, 0, 0.2)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-2)',
        opacity: 0.4,
        cursor: 'not-allowed',
    },
    '&:active': {
        transform: 'translateY(1px)',
    },
};

const sliderSx = {
    width: '100%',
    height: '8px',
    color: 'var(--accent)',
    '& .MuiSlider-track': {
        background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
        border: 'none',
        height: '8px',
        borderRadius: '4px',
    },
    '& .MuiSlider-rail': {
        backgroundColor: 'rgba(255,255,255,0.1)',
        height: '8px',
        borderRadius: '4px',
    },
    '& .MuiSlider-thumb': {
        width: '20px',
        height: '20px',
        backgroundColor: 'var(--accent)',
        border: '3px solid #fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        transition: 'box-shadow 0.2s ease',
        '&:hover, &.Mui-active': {
            boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)',
        },
    },
};

interface LoadedImage {
    original: ImageData;
    preview: ImageData;
    adjustedPreview: ImageData;
}

// Thumbnail loading queue with scroll-aware scheduling + cache.
// Keeps scrolling responsive in large folders.
interface QueueJob {
    key: string;
    task: () => Promise<string | null>;
    promiseHandlers: { resolve: (v: string | null) => void; reject: (e: unknown) => void };
}

const thumbnailQueue = {
    queue: [] as QueueJob[],
    activeCount: 0,
    maxConcurrent: Math.max(2, Math.min(4, Math.floor(((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) || 8) / 3))),
    pausedUntil: 0,
    scrollListenerAttached: false,
    inflight: new Map<string, Promise<string | null>>(),
    cache: new Map<string, string>(),
    maxCacheSize: 600,

    attachScrollTracking() {
        if (this.scrollListenerAttached || typeof document === 'undefined') return;
        this.scrollListenerAttached = true;

        const markScrolling = () => {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            this.pausedUntil = now + 140;
            setTimeout(() => this.process(), 150);
        };

        document.addEventListener('scroll', markScrolling, true);
        document.addEventListener('wheel', markScrolling, { passive: true });
        document.addEventListener('touchmove', markScrolling, { passive: true });
    },

    getCached(key: string): string | null {
        if (!this.cache.has(key)) return null;
        const cached = this.cache.get(key)!;
        // touch for LRU
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached;
    },

    setCached(key: string, objectUrl: string | null) {
        if (!objectUrl) return;
        if (this.cache.has(key)) {
            const prev = this.cache.get(key);
            if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
            this.cache.delete(key);
        }
        this.cache.set(key, objectUrl);

        while (this.cache.size > this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value as string;
            const oldestUrl = this.cache.get(oldestKey);
            if (oldestUrl) URL.revokeObjectURL(oldestUrl);
            this.cache.delete(oldestKey);
        }
    },

    clearCache() {
        for (const objectUrl of this.cache.values()) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
        this.cache.clear();
        this.inflight.clear();
        this.queue = [];
        this.activeCount = 0;
    },

    add(key: string, task: () => Promise<string | null>): Promise<string | null> {
        this.attachScrollTracking();
        const cached = this.getCached(key);
        if (cached) return Promise.resolve(cached);
        if (this.inflight.has(key)) return this.inflight.get(key)!;

        const managedPromise = new Promise<string | null>((resolve, reject) => {
            this.queue.push({ key, task, promiseHandlers: { resolve, reject } });
            this.process();
        }).then((result) => {
            if (result) this.setCached(key, result);
            return result;
        }).finally(() => {
            this.inflight.delete(key);
        });

        this.inflight.set(key, managedPromise);
        return managedPromise;
    },

    process() {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (now < this.pausedUntil) return;

        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const job = this.queue.shift()!;
            this.activeCount += 1;

            Promise.resolve()
                .then(() => (job.task ? job.task() : null))
                .then((result) => {
                    job.promiseHandlers?.resolve(result);
                    return result;
                })
                .catch((e) => {
                    job.promiseHandlers?.reject(e);
                })
                .finally(() => {
                    this.activeCount -= 1;
                    if (this.queue.length > 0) {
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(() => this.process());
                        } else {
                            setTimeout(() => this.process(), 0);
                        }
                    }
                });
        }
    },
};

// Image Thumbnail Component - Memoized for performance
interface ImageThumbnailProps {
    image: ImageEntry;
    isSelected: boolean;
    onImageClick: (path: string) => void;
}

const ImageThumbnail = memo(({ image, isSelected, onImageClick }: ImageThumbnailProps) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Lazy load with Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            },
            { rootMargin: '180px 0px', threshold: 0.01 },
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, []);

    // Load thumbnail only when visible - queued with UI yielding and downscaled
    useEffect(() => {
        if (!isVisible) return;

        let cancelled = false;

        const cached = thumbnailQueue.getCached(image.path);
        if (cached) {
            setThumbnail(cached);
            return;
        }

        thumbnailQueue.add(image.path, async () => {
            if (cancelled) return null;

            const imageData = await loadSingleImage(image.path);
            if (!imageData || cancelled) return null;

            const { width, height } = imageData;
            const maxSize = 128; // Small thumbnail size

            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);

            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = width;
            fullCanvas.height = height;
            const fullCtx = fullCanvas.getContext('2d');
            if (!fullCtx) return null;
            fullCtx.putImageData(imageData, 0, 0);

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = newWidth;
            thumbCanvas.height = newHeight;
            const thumbCtx = thumbCanvas.getContext('2d');
            if (!thumbCtx) return null;
            thumbCtx.drawImage(fullCanvas, 0, 0, newWidth, newHeight);

            const blob = await new Promise<Blob | null>((resolve) => thumbCanvas.toBlob(resolve, 'image/png'));
            if (!blob) return null;
            return URL.createObjectURL(blob);
        }).then((dataUrl) => {
            if (dataUrl && !cancelled) {
                setThumbnail(dataUrl);
            }
        }).catch(() => {
            // Ignore errors for cancelled loads
        });

        return () => {
            cancelled = true;
        };
    }, [isVisible, image.path]);

    return (
        <Box
            ref={ref}
            onClick={() => onImageClick(image.path)}
            data-image-path={image.path}
            sx={{
                position: 'relative',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                overflow: 'hidden',
                border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isSelected ? '0 0 20px color-mix(in srgb, var(--accent), transparent 80%)' : 'none',
                '&:hover': {
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--accent-muted)',
                    boxShadow: isSelected
                        ? '0 0 20px color-mix(in srgb, var(--accent), transparent 80%), 0 0 30px color-mix(in srgb, var(--accent), transparent 50%)'
                        : '0 0 15px color-mix(in srgb, var(--accent-muted), transparent 60%)',
                },
            }}
        >
            {/* Checkbox overlay */}
            <Box sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 2,
            }}>
                <Checkbox
                    checked={isSelected}
                    sx={{
                        color: 'var(--text-2)',
                        background: 'var(--bg)',
                        borderRadius: '4px',
                        padding: '4px',
                        '&.Mui-checked': {
                            color: 'var(--accent)',
                            background: 'var(--bg)',
                        },
                        '&:hover': {
                            background: 'var(--surface-2)',
                        },
                    }}
                />
            </Box>

            {/* Image */}
            {thumbnail ? (
                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    p: 1,
                }}>
                    <img
                        src={thumbnail}
                        alt={image.name}
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            imageRendering: 'pixelated',
                        }}
                    />
                </Box>
            ) : (
                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Typography sx={{
                        color: 'var(--text-2)',
                        fontSize: '0.7rem',
                        fontFamily: 'JetBrains Mono, monospace',
                    }}>
                        Loading...
                    </Typography>
                </Box>
            )}

            {/* Filename */}
            <Box sx={{
                p: 0.5,
            }}>
                <Typography sx={{
                    color: 'var(--text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.65rem',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {image.name}
                </Typography>
            </Box>
        </Box>
    );
}, (prevProps, nextProps) => (
    // Only re-render if selection state or image path changes
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.image.path === nextProps.image.path &&
    prevProps.image.name === nextProps.image.name &&
    prevProps.onImageClick === nextProps.onImageClick
));

interface ProcessedImageCardProps {
    imagePath: string;
    displayImage: ImageData | null;
}

const ProcessedImageCard = memo(({ imagePath, displayImage }: ProcessedImageCardProps) => {
    const [src, setSrc] = useState('');

    useEffect(() => {
        if (!displayImage) {
            setSrc('');
            return;
        }

        let cancelled = false;
        let objectUrl = '';

        const canvas = document.createElement('canvas');
        canvas.width = displayImage.width;
        canvas.height = displayImage.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(displayImage, 0, 0);

        canvas.toBlob((blob) => {
            if (cancelled || !blob) return;
            objectUrl = URL.createObjectURL(blob);
            setSrc(objectUrl);
        }, 'image/png');

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [displayImage]);

    return (
        <Box
            sx={{
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {src && (
                <img
                    src={src}
                    alt={imagePath}
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        imageRendering: 'pixelated',
                    }}
                />
            )}
            <Typography sx={{
                p: 1,
                color: 'var(--text-2)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.7rem',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {imagePath.split(/[\\/]/).pop()}
            </Typography>
        </Box>
    );
}, (prev, next) => prev.imagePath === next.imagePath && prev.displayImage === next.displayImage);

function ImgRecolor() {
    // State
    const [folderPath, setFolderPath] = useState('');
    const [allImages, setAllImages] = useState<ImageEntry[]>([]);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [recursiveScan, setRecursiveScan] = useState(false); // Include subfolders toggle
    const [showingSelection, setShowingSelection] = useState(true);
    const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map()); // path -> { original, adjusted }

    // Color adjustment sliders
    const [hueShift, setHueShift] = useState(0);
    const [saturationBoost, setSaturationBoost] = useState(0);
    const [lightnessAdjust, setLightnessAdjust] = useState(0);
    const [opacity, setOpacity] = useState(100);
    const [preserveOriginalColors, setPreserveOriginalColors] = useState(false);

    // Save result toast
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    // Options menu state
    const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
    const optionsOpen = Boolean(optionsAnchor);

    // Loading state
    const [isLoading, setIsLoading] = useState(false);

    // Drag and drop state
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);

    // Debounce for live preview
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        thumbnailQueue.clearCache();
    }, []);

    // Create a downscaled preview for fast processing
    const createPreview = useCallback((imageData: ImageData, maxSize = 256): { preview: ImageData; scale: number } => {
        const { width, height } = imageData;

        if (width <= maxSize && height <= maxSize) {
            return { preview: imageData, scale: 1 };
        }

        const scale = Math.min(maxSize / width, maxSize / height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(imageData, 0, 0);

        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = newWidth;
        smallCanvas.height = newHeight;
        const smallCtx = smallCanvas.getContext('2d')!;
        smallCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

        return {
            preview: smallCtx.getImageData(0, 0, newWidth, newHeight),
            scale,
        };
    }, []);

    // Debounced color adjustment - uses small preview for fast UI updates
    const updateColorAdjustments = useCallback((hue: number, sat: number, light: number, opac: number, preserveColors: boolean) => {
        if (loadedImages.size === 0) return;

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            const params: RecolorParams = {
                targetHue: hue,
                saturationBoost: sat,
                lightnessAdjust: light,
                opacity: opac,
                preserveOriginalColors: preserveColors,
            };

            setLoadedImages((prev) => {
                const newMap = new Map(prev);
                for (const [imagePath, data] of newMap.entries()) {
                    const sourceImage = data.preview || data.original;
                    const adjustedPreview = applyAdjustment(sourceImage, params);
                    newMap.set(imagePath, { ...data, adjustedPreview });
                }
                return newMap;
            });
        }, 50); // 50ms debounce
    }, [loadedImages]);

    // Load folder
    const handleLoadFolder = async () => {
        setIsLoading(true);
        try {
            const result = await loadFolder(null, recursiveScan);
            if (result) {
                setFolderPath(result.folderPath);
                setAllImages(result.images);
                setSelectedImages(new Set());
                setShowingSelection(true);
                setLoadedImages(new Map());
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Toggle image selection - Memoized with useCallback to prevent re-renders
    const toggleImageSelection = useCallback((imagePath: string) => {
        setSelectedImages((prev) => {
            const newSelected = new Set(prev);
            if (newSelected.has(imagePath)) {
                newSelected.delete(imagePath);
            } else {
                newSelected.add(imagePath);
            }
            return newSelected;
        });
    }, []);

    // Select every image, or clear the selection if all are already selected.
    const toggleSelectAll = useCallback(() => {
        setSelectedImages((prev) => (
            prev.size === allImages.length
                ? new Set<string>()
                : new Set(allImages.map((img) => img.path))
        ));
    }, [allImages]);

    // Confirm selection and load images
    const handleConfirmSelection = async () => {
        if (selectedImages.size === 0) return;

        setShowingSelection(false);
        setIsLoading(true);
        try {
            // Reset sliders to cyan baseline (like GIMP)
            setHueShift(180); // Cyan is at 180 degrees
            setSaturationBoost(50); // Boost saturation for visibility
            setLightnessAdjust(0); // Keep original lightness

            const newLoadedImages = new Map<string, LoadedImage>();

            // Load only first 6 images for preview (rest will be processed in background)
            const imagePaths = Array.from(selectedImages);
            const previewPaths = imagePaths.slice(0, 6);

            for (const imagePath of previewPaths) {
                const imageData = await loadSingleImage(imagePath);
                if (imageData) {
                    const { preview } = createPreview(imageData, 256);
                    newLoadedImages.set(imagePath, {
                        original: imageData,
                        preview,
                        adjustedPreview: preview,
                    });
                }
            }

            setLoadedImages(newLoadedImages);
        } finally {
            setIsLoading(false);
        }
    };

    // Apply adjustments when images are loaded
    useEffect(() => {
        if (loadedImages.size > 0) {
            updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedImages.size]);

    // Apply adjustments when sliders change
    useEffect(() => {
        if (loadedImages.size > 0) {
            updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors]);

    // Reset
    const handleReset = () => {
        setHueShift(0);
        setSaturationBoost(0);
        setLightnessAdjust(0);
        setOpacity(100);
        setPreserveOriginalColors(false);
    };

    // Back to selection
    const handleBackToSelection = () => {
        setShowingSelection(true);
        setLoadedImages(new Map());
    };

    // Filter out grayscale images from all loaded images
    const handleFilterGrayscale = async () => {
        const isDistortionName = (name = '') => {
            const n = String(name).toLowerCase();
            return n.includes('distortion')
                || n.includes('distort')
                || n.includes('distord')
                || /(^|[_\-\s.])dist([_\-\s.]|$)/i.test(n);
        };

        setIsLoading(true);

        // Give React time to render the spinner
        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
            const newSelected = new Set<string>();

            for (const image of allImages) {
                if (isDistortionName(image.name)) {
                    continue;
                }

                const imageData = await loadSingleImage(image.path);
                if (imageData && !isGrayscaleImage(imageData)) {
                    newSelected.add(image.path);
                }
            }

            setSelectedImages(newSelected);
            setToastMessage(`✅ Selected ${newSelected.size} colored image${newSelected.size !== 1 ? 's' : ''}`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    // Process full-resolution image for saving
    const processFullResolution = useCallback((original: ImageData, params: RecolorParams): ImageData => (
        applyAdjustment(original, params)
    ), []);

    // Save all selected images (not just previewed ones)
    const handleSaveAll = async () => {
        setIsLoading(true);
        let savedCount = 0;
        let failedCount = 0;

        try {
            const params: RecolorParams = {
                targetHue: hueShift,
                saturationBoost,
                lightnessAdjust,
                opacity,
                preserveOriginalColors,
            };

            for (const imagePath of selectedImages) {
                let original: ImageData | null;

                if (loadedImages.has(imagePath)) {
                    original = loadedImages.get(imagePath)!.original;
                } else {
                    original = await loadSingleImage(imagePath);
                }

                if (original) {
                    const adjusted = processFullResolution(original, params);
                    const success = await saveImageFile(adjusted, imagePath);
                    if (success) {
                        savedCount++;
                    } else {
                        failedCount++;
                    }
                } else {
                    failedCount++;
                }
            }

            if (failedCount === 0) {
                setToastMessage(`✅ Saved ${savedCount} image${savedCount !== 1 ? 's' : ''}`);
            } else {
                setToastMessage(`⚠️ Saved ${savedCount}, failed ${failedCount}`);
            }
            setShowToast(true);

            setTimeout(() => setShowToast(false), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    // Drag and drop handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounterRef.current = 0;

        // Tauri's webview does not expose dropped file paths through the HTML5
        // dataTransfer API, so fall back to the file picker to stay usable.
        // TODO(backend): resolve dropped paths via the native drag-drop event.
        setIsLoading(true);
        try {
            const result = await loadFolder(null, recursiveScan);
            if (result) {
                setFolderPath(result.folderPath);
                setAllImages(result.images);
                setSelectedImages(new Set(result.images.map((img) => img.path))); // Auto-select dropped files
                setShowingSelection(true);
                setLoadedImages(new Map());
            }
        } catch (error) {
            console.error('Drop error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [recursiveScan]);

    return (
        <Box
            className="img-recolor-container"
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
                position: 'relative',
                overflow: 'hidden',
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 100,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    border: '3px dashed var(--accent)',
                    borderRadius: '12px',
                    margin: '16px',
                    animation: 'pulse-border 1.5s ease-in-out infinite',
                    pointerEvents: 'none',
                }}>
                    <CloudUploadIcon sx={{
                        fontSize: '4rem',
                        color: 'var(--accent)',
                        animation: 'float 2s ease-in-out infinite',
                    }} />
                    <Typography sx={{
                        color: 'var(--accent)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '1.2rem',
                        fontWeight: 600,
                    }}>
                        Drop images or folder here
                    </Typography>
                    <Typography sx={{
                        color: 'var(--text-2)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.85rem',
                    }}>
                        Supports TEX, DDS, PNG, JPG files
                    </Typography>
                </Box>
            )}

            {/* Drag overlay animations */}
            <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: var(--accent); box-shadow: 0 0 20px color-mix(in srgb, var(--accent), transparent 70%); }
          50% { border-color: var(--accent-muted); box-shadow: 0 0 40px color-mix(in srgb, var(--accent), transparent 50%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
            {/* Main Content */}
            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1, overflow: 'hidden', gap: 'clamp(0.5rem, 1vw, 0.75rem)', p: 'clamp(0.5rem, 1vw, 0.75rem)' }}>
                {/* Left Panel - Image List/Preview */}
                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'clamp(0.5rem, 1vw, 0.75rem)',
                }}>
                    {/* Toolbar */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button
                                startIcon={<FolderOpenIcon />}
                                onClick={handleLoadFolder}
                                sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                            >
                                Load Folder
                            </Button>
                            {!showingSelection && (
                                <>
                                    <Button
                                        onClick={handleBackToSelection}
                                        sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                                    >
                                        Back to Selection
                                    </Button>
                                    <Button
                                        startIcon={<SaveIcon />}
                                        onClick={handleSaveAll}
                                        disabled={loadedImages.size === 0}
                                        sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                                    >
                                        Save All
                                    </Button>
                                    <Button
                                        startIcon={<RefreshIcon />}
                                        onClick={handleReset}
                                        sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                                    >
                                        Reset
                                    </Button>
                                </>
                            )}
                            {showingSelection && allImages.length > 0 && (
                                <>
                                    <Button
                                        onClick={handleFilterGrayscale}
                                        sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                                    >
                                        Filter Grayscale
                                    </Button>
                                    <Button
                                        onClick={toggleSelectAll}
                                        sx={{ ...celestialButtonStyle, fontSize: '0.8rem', height: '34px', padding: '0 12px' }}
                                    >
                                        {selectedImages.size === allImages.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                    {selectedImages.size > 0 && (
                                        <Button
                                            onClick={handleConfirmSelection}
                                            sx={{
                                                ...celestialButtonStyle,
                                                fontSize: '0.8rem',
                                                height: '34px',
                                                padding: '0 12px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            Load {selectedImages.size} Images
                                        </Button>
                                    )}
                                </>
                            )}
                        </Box>
                        {/* Right side - Status text and Settings */}
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                            <Typography sx={{
                                color: 'var(--text-2)',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.85rem',
                            }}>
                                {folderPath ? `${allImages.length} images found` : 'No folder loaded'}
                            </Typography>
                            {/* Options Menu Button */}
                            <IconButton
                                onClick={(e) => setOptionsAnchor(e.currentTarget)}
                                sx={{
                                    ...celestialButtonStyle,
                                    width: '34px',
                                    height: '34px',
                                    padding: 0,
                                    minWidth: 'unset',
                                    color: optionsOpen ? 'var(--accent)' : 'var(--text)',
                                    borderColor: optionsOpen ? 'var(--accent)' : 'var(--accent-muted)',
                                }}
                            >
                                <SettingsIcon sx={{ fontSize: '1.1rem' }} />
                            </IconButton>
                            {/* Options Dropdown Menu */}
                            <Menu
                                anchorEl={optionsAnchor}
                                open={optionsOpen}
                                onClose={() => setOptionsAnchor(null)}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            background: 'var(--bg-2)',
                                            border: '1px solid var(--accent-muted)',
                                            borderRadius: '8px',
                                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                                            minWidth: '200px',
                                            mt: 0.5,
                                        },
                                    },
                                }}
                            >
                                {/* Include Subfolders Option */}
                                <Box
                                    onClick={() => setRecursiveScan(!recursiveScan)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 16px',
                                        cursor: 'pointer',
                                        transition: 'background 150ms ease',
                                        '&:hover': {
                                            background: 'rgba(255, 255, 255, 0.05)',
                                        },
                                    }}
                                >
                                    <Typography sx={{
                                        color: 'var(--text)',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        fontSize: '0.85rem',
                                        userSelect: 'none',
                                    }}>
                                        Include Subfolders
                                    </Typography>
                                    <Switch
                                        checked={recursiveScan}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            setRecursiveScan(e.target.checked);
                                        }}
                                        size="small"
                                        sx={{
                                            '& .MuiSwitch-switchBase': {
                                                color: 'var(--text-2)',
                                            },
                                            '& .MuiSwitch-switchBase.Mui-checked': {
                                                color: 'var(--accent)',
                                            },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                backgroundColor: 'var(--accent-muted)',
                                            },
                                            '& .MuiSwitch-track': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            },
                                        }}
                                    />
                                </Box>
                            </Menu>
                        </Box>
                    </Box>

                    {/* Horizontal Divider */}
                    <Box sx={{
                        height: '2px',
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.1)',
                        flexShrink: 0,
                    }} />

                    {/* Content Container */}
                    <Box sx={{
                        flex: 1,
                        overflow: 'auto',
                        p: 2,
                    }}>
                        {/* Image Selection Grid */}
                        {showingSelection && allImages.length > 0 && (
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(6, 1fr)',
                                gap: 2,
                            }}>
                                {allImages.map((image) => (
                                    <ImageThumbnail
                                        key={image.path}
                                        image={image}
                                        isSelected={selectedImages.has(image.path)}
                                        onImageClick={toggleImageSelection}
                                    />
                                ))}
                            </Box>
                        )}

                        {/* Image Preview Grid */}
                        {!showingSelection && loadedImages.size > 0 && (
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 2,
                            }}>
                                {Array.from(loadedImages.entries()).map(([imagePath, data]) => {
                                    // Use adjustedPreview for display (small, fast)
                                    const displayImage = data.adjustedPreview || data.preview || data.original;
                                    return (
                                        <ProcessedImageCard
                                            key={imagePath}
                                            imagePath={imagePath}
                                            displayImage={displayImage}
                                        />
                                    );
                                })}
                            </Box>
                        )}

                        {/* Empty State */}
                        {allImages.length === 0 && (
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                            }}>
                                <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>
                                    Load a folder to start
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>

                {/* Vertical Divider */}
                <Box sx={{
                    width: '2px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    flexShrink: 0,
                    margin: '0 clamp(0.5rem, 1vw, 0.75rem)',
                }} />

                {/* Right Panel - Color Adjustments */}
                <Box sx={{
                    flex: '0 0 clamp(280px, 22vw, 320px)',
                    minWidth: 'clamp(260px, 20vw, 300px)',
                    maxWidth: 'clamp(300px, 25vw, 350px)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    <Box sx={{
                        padding: '20px',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        minHeight: 0,
                    }}>
                        {/* Header */}
                        <Typography sx={{
                            fontSize: 'clamp(1rem, 1.2vw, 1.1rem)',
                            fontWeight: '700',
                            color: 'var(--accent)',
                            fontFamily: 'JetBrains Mono, monospace',
                            marginBottom: '20px',
                        }}>
                            Color Adjustments
                        </Typography>

                        {/* Target Hue Slider */}
                        <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <Typography sx={{
                                    color: 'var(--accent)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}>
                                    Target Hue
                                </Typography>
                                <Typography sx={{
                                    color: 'var(--accent-muted)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    minWidth: '50px',
                                    textAlign: 'center',
                                }}>
                                    {hueShift}°
                                </Typography>
                            </Box>
                            <Slider
                                value={hueShift}
                                onChange={(_, value) => setHueShift(value as number)}
                                min={0}
                                max={360}
                                disabled={loadedImages.size === 0}
                                sx={sliderSx}
                            />
                        </Box>

                        {/* Saturation Slider */}
                        <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <Typography sx={{
                                    color: 'var(--accent)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}>
                                    Saturation
                                </Typography>
                                <Typography sx={{
                                    color: 'var(--accent-muted)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    minWidth: '50px',
                                    textAlign: 'center',
                                }}>
                                    {saturationBoost}%
                                </Typography>
                            </Box>
                            <Slider
                                value={saturationBoost}
                                onChange={(_, value) => setSaturationBoost(value as number)}
                                min={0}
                                max={100}
                                disabled={loadedImages.size === 0}
                                sx={sliderSx}
                            />
                        </Box>

                        {/* Lightness Slider */}
                        <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <Typography sx={{
                                    color: 'var(--accent)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}>
                                    Lightness
                                </Typography>
                                <Typography sx={{
                                    color: 'var(--accent-muted)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    minWidth: '50px',
                                    textAlign: 'center',
                                }}>
                                    {lightnessAdjust}%
                                </Typography>
                            </Box>
                            <Slider
                                value={lightnessAdjust}
                                onChange={(_, value) => setLightnessAdjust(value as number)}
                                min={-100}
                                max={100}
                                disabled={loadedImages.size === 0}
                                sx={sliderSx}
                            />
                        </Box>

                        {/* Opacity Slider */}
                        <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <Typography sx={{
                                    color: 'var(--accent)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}>
                                    Opacity
                                </Typography>
                                <Typography sx={{
                                    color: 'var(--accent-muted)',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    minWidth: '50px',
                                    textAlign: 'center',
                                }}>
                                    {opacity}%
                                </Typography>
                            </Box>
                            <Slider
                                value={opacity}
                                onChange={(_, value) => setOpacity(value as number)}
                                min={0}
                                max={100}
                                disabled={loadedImages.size === 0}
                                sx={sliderSx}
                            />
                        </Box>

                        {/* Preserve Original Colors Checkbox */}
                        <Box sx={{
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '4px',
                        }}>
                            <Checkbox
                                checked={preserveOriginalColors}
                                onChange={(e) => setPreserveOriginalColors(e.target.checked)}
                                sx={{
                                    color: 'var(--accent-muted)',
                                    padding: '4px',
                                    marginRight: '4px',
                                    '&.Mui-checked': {
                                        color: 'var(--accent)',
                                    },
                                    '&:hover': {
                                        background: 'rgba(255,255,255,0.05)',
                                    },
                                }}
                            />
                            <Typography
                                sx={{
                                    color: 'var(--text)',
                                    fontSize: '13px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                }}
                                onClick={() => setPreserveOriginalColors(!preserveOriginalColors)}
                            >
                                Preserve original colors
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* Toast Notification */}
            {showToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 200,
                    animation: 'slideIn 0.3s ease-out',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))',
                        border: '1px solid rgba(16, 185, 129, 0.5)',
                        borderRadius: '12px',
                        padding: '16px 24px',
                        color: 'white',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '14px',
                        fontWeight: '600',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
                        backdropFilter: 'blur(10px)',
                    }}>
                        {toastMessage}
                    </div>
                </div>
            )}

            <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

            {/* Loading Spinner */}
            {isLoading && <GlowingSpinner text="Loading images..." />}
        </Box>
    );
}

export { ImgRecolor };
export default ImgRecolor;
