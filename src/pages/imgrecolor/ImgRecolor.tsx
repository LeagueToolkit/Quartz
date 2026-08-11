import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { Image as ImageIcon } from 'lucide-react';
import {
    loadFolder,
    loadSingleImage,
    applyAdjustment,
    isProtectedTextureName,
    type ImageEntry,
    type RecolorParams,
} from './utils/imgRecolorLogic';
import { buildCurveLut, DEFAULT_CURVE, isIdentityCurve, type CurvePoint } from './utils/curve';
import { imgRecolorBatch, imgRecolorFilterColored } from '@/lib/api';
import { useFileDrop } from '@/lib/util/useFileDrop';
import { DropOverlay } from '@/components/ui';
import { useNavigationStore } from '@/lib/stores';
import { thumbnailQueue } from './components/thumbnailQueue';
import { ImageThumbnail } from './components/ImageThumbnail';
import { ProcessedImageCard } from './components/ProcessedImageCard';
import { AdjustmentsPanel } from './components/AdjustmentsPanel';
import { RecolorFooter } from './components/RecolorFooter';
import './ImgRecolor.css';

// File extensions ImgRecolor can decode; anything else dropped is treated as a folder.
const IMG_RECOLOR_EXTS = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff', '.tex', '.dds'];

function hasImageExt(p: string): boolean {
    const dot = p.lastIndexOf('.');
    if (dot < 0) return false;
    return IMG_RECOLOR_EXTS.includes(p.slice(dot).toLowerCase());
}

function baseName(p: string): string {
    const m = /[^/\\]+$/.exec(p);
    return m ? m[0] : p;
}

interface LoadedImage {
    original: ImageData;
    preview: ImageData;
    adjustedPreview: ImageData;
}

function ImgRecolor() {
    // ── Library / selection state ──
    const [, setFolderPath] = useState('');
    const [allImages, setAllImages] = useState<ImageEntry[]>([]);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [recursiveScan, setRecursiveScan] = useState(false);
    const [showingSelection, setShowingSelection] = useState(true);
    const [loadedImages, setLoadedImages] = useState<Map<string, LoadedImage>>(new Map());

    // ── Color adjustment sliders ──
    const [hueShift, setHueShift] = useState(0);
    const [saturationBoost, setSaturationBoost] = useState(0);
    const [lightnessAdjust, setLightnessAdjust] = useState(0);
    const [opacity, setOpacity] = useState(100);
    const [preserveOriginalColors, setPreserveOriginalColors] = useState(false);
    const [curve, setCurve] = useState<CurvePoint[]>(DEFAULT_CURVE);
    /* Rebuilt only when the control points move; the preview and the save both use
       this table, so neither can drift from what the editor draws. */
    const curveLut = useMemo(() => (isIdentityCurve(curve) ? undefined : buildCurveLut(curve)), [curve]);

    /* ── Footer status ──
       Long jobs (scanning, saving) report progress here instead of a toast. `progress`
       is set per item as the loop advances so the footer counter is live, not estimated;
       it is null whenever no job is running. */
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    /* Bumped after a save so the selection thumbnails re-read the rewritten files
       instead of showing the images from before the recolor. */
    const [textureVersion, setTextureVersion] = useState(0);
    const [, setIsLoading] = useState(false); // re-entrancy guard (no UI overlay)

    // ── Drag state ──
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { thumbnailQueue.clearCache(); }, []);

    // Downscaled preview for fast live processing.
    const createPreview = useCallback((imageData: ImageData, maxSize = 256): { preview: ImageData; scale: number } => {
        const { width, height } = imageData;
        if (width <= maxSize && height <= maxSize) return { preview: imageData, scale: 1 };

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

        return { preview: smallCtx.getImageData(0, 0, newWidth, newHeight), scale };
    }, []);

    // Debounced adjustment applied to the loaded previews.
    const updateColorAdjustments = useCallback((hue: number, sat: number, light: number, opac: number, preserveColors: boolean, lut?: Uint8Array) => {
        if (loadedImages.size === 0) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(() => {
            const params: RecolorParams = {
                targetHue: hue, saturationBoost: sat, lightnessAdjust: light, opacity: opac,
                preserveOriginalColors: preserveColors, curveLut: lut,
            };
            setLoadedImages((prev) => {
                const newMap = new Map(prev);
                for (const [imagePath, data] of newMap.entries()) {
                    const sourceImage = data.preview || data.original;
                    newMap.set(imagePath, { ...data, adjustedPreview: applyAdjustment(sourceImage, params) });
                }
                return newMap;
            });
        }, 50);
    }, [loadedImages]);

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
                setStatus(`${result.images.length} image${result.images.length !== 1 ? 's' : ''} found`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    /* Distortion maps and cubemaps are never recolorable, so they stay out of every
       selection path, not just the click handler. */
    const selectableImages = useMemo(
        () => allImages.filter((img) => !isProtectedTextureName(img.name)),
        [allImages],
    );

    const toggleImageSelection = useCallback((imagePath: string) => {
        if (isProtectedTextureName(imagePath)) return;
        setSelectedImages((prev) => {
            const next = new Set(prev);
            if (next.has(imagePath)) next.delete(imagePath); else next.add(imagePath);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedImages((prev) => (
            prev.size === selectableImages.length
                ? new Set<string>()
                : new Set(selectableImages.map((img) => img.path))
        ));
    }, [selectableImages]);

    const handleConfirmSelection = async () => {
        if (selectedImages.size === 0) return;
        setShowingSelection(false);
        setIsLoading(true);
        try {
            // Cyan baseline (like GIMP) so the recolor is visible immediately.
            setHueShift(180);
            setSaturationBoost(50);
            setLightnessAdjust(0);

            const newLoadedImages = new Map<string, LoadedImage>();
            const previewPaths = Array.from(selectedImages).slice(0, 6);
            for (const imagePath of previewPaths) {
                const imageData = await loadSingleImage(imagePath);
                if (imageData) {
                    const { preview } = createPreview(imageData, 256);
                    newLoadedImages.set(imagePath, { original: imageData, preview, adjustedPreview: preview });
                }
            }
            setLoadedImages(newLoadedImages);
        } finally {
            setIsLoading(false);
        }
    };

    // Re-apply adjustments when images load or sliders/curve change.
    useEffect(() => {
        if (loadedImages.size > 0) updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors, curveLut);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedImages.size]);
    useEffect(() => {
        if (loadedImages.size > 0) updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors, curveLut);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors, curveLut]);

    /* Restore the neutral state: the image as it is on disk.

       Hue 0 / saturation 0 is NOT neutral. With "preserve original colors" off, the
       recolor REPLACES saturation with the slider value, so saturation 0 forces every
       pixel to grey - reset used to wash the whole batch out. The identity is hue-shift
       mode at its centre: preserve on, hue 180 (shift of 0) and saturation 50 (multiplier
       of 1), which is the same baseline handleConfirmSelection starts from. */
    const handleReset = () => {
        setHueShift(180);
        setSaturationBoost(50);
        setLightnessAdjust(0);
        setOpacity(100);
        setPreserveOriginalColors(true);
        setCurve(DEFAULT_CURVE);
    };

    const handleBackToSelection = () => {
        setShowingSelection(true);
        setLoadedImages(new Map());
    };

    const handleFilterGrayscale = async () => {
        setIsLoading(true);
        // Only non-protected files are examined, so they are the real denominator.
        const candidates = allImages.filter((img) => !isProtectedTextureName(img.name));
        setStatus('Scanning for colored images');
        setProgress({ done: 0, total: candidates.length });
        try {
            /* Rust decodes and tests these in parallel and returns only the colored paths,
               so no pixels cross the bridge. Sent in chunks purely so the footer can report
               real progress: the counter advances by however many a chunk actually finished. */
            const CHUNK = 64;
            const colored: string[] = [];
            for (let i = 0; i < candidates.length; i += CHUNK) {
                const batch = candidates.slice(i, i + CHUNK).map((img) => img.path);
                colored.push(...await imgRecolorFilterColored(batch));
                setProgress({ done: Math.min(i + CHUNK, candidates.length), total: candidates.length });
            }
            setSelectedImages(new Set(colored));
            setStatus(`Selected ${colored.length} colored image${colored.length !== 1 ? 's' : ''}`);
        } finally {
            setProgress(null);
            setIsLoading(false);
        }
    };

    const handleSaveAll = async () => {
        setIsLoading(true);
        let savedCount = 0;
        let failedCount = 0;
        const paths = Array.from(selectedImages);
        setStatus('Recoloring');
        setProgress({ done: 0, total: paths.length });
        try {
            /* Rust decodes, recolors and re-encodes these in parallel; nothing but paths
               crosses the bridge. Sent in chunks only so the footer can report real
               progress, since one call for the whole set would report nothing until it
               finished. */
            const CHUNK = 32;
            for (let i = 0; i < paths.length; i += CHUNK) {
                const batch = paths.slice(i, i + CHUNK);
                const result = await imgRecolorBatch({
                    paths: batch,
                    targetHue: hueShift,
                    saturationBoost,
                    lightnessAdjust,
                    opacity,
                    preserveOriginalColors,
                    // Rust takes the baked table, so the save matches the preview exactly.
                    curve: curveLut ? Array.from(curveLut) : null,
                });
                savedCount += result.saved;
                failedCount += result.failures.length;
                for (const [path, error] of result.failures) console.error(`Recolor failed for ${path}: ${error}`);
                /* These files just changed on disk. Thumbnails are cached by path, so
                   without this the selection grid would keep showing the pre-recolor
                   image. Only the files that actually failed keep their cached copy. */
                const failedPaths = new Set(result.failures.map(([path]) => path));
                thumbnailQueue.invalidate(batch.filter((path) => !failedPaths.has(path)));
                setProgress({ done: Math.min(i + CHUNK, paths.length), total: paths.length });
            }
            setStatus(failedCount === 0
                ? `Saved ${savedCount} image${savedCount !== 1 ? 's' : ''}`
                : `Saved ${savedCount}, failed ${failedCount}`);
            // Files on disk changed: make the selection grid re-read them.
            if (savedCount > 0) setTextureVersion((v) => v + 1);
        } finally {
            setProgress(null);
            setIsLoading(false);
        }
    };

    // ── Drag + drop ──
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setIsDragging(false);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        // The native webview drag-drop event carries the real paths; swallow the DOM one.
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        dragCounterRef.current = 0;
    }, []);

    const loadDroppedPaths = useCallback(async (paths: string[]) => {
        if (paths.length === 0) return;
        setIsLoading(true);
        try {
            const fileEntries: ImageEntry[] = [];
            let scannedFolder: string | null = null;
            for (const p of paths) {
                if (hasImageExt(p)) {
                    const ext = p.slice(p.lastIndexOf('.')).toLowerCase().replace('.', '');
                    fileEntries.push({ path: p, name: baseName(p), type: ext });
                } else {
                    const result = await loadFolder(p, recursiveScan);
                    if (result) { scannedFolder = result.folderPath; fileEntries.push(...result.images); }
                }
            }
            if (fileEntries.length === 0) return;

            const seen = new Set<string>();
            const images = fileEntries.filter((img) => (seen.has(img.path) ? false : seen.add(img.path)));
            setFolderPath(scannedFolder || images[0].path.replace(/[/\\][^/\\]*$/, ''));
            setAllImages(images);
            setSelectedImages(new Set()); // Load unselected — user picks what to recolor.
            setShowingSelection(true);
            setLoadedImages(new Map());
        } catch (error) {
            console.error('Drop error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [recursiveScan]);

    /* Auto-load a file handed over from the explorer's "Open in Image Recolor".
       Subscribes to the pending file: a mount-only read drops the handoff when
       this page is already the open one, since nothing remounts (see Paint). */
    const pendingFile = useNavigationStore((s) => s.pendingFile);
    const consumePendingFile = useNavigationStore((s) => s.consumePendingFile);
    const clearPendingFile = useNavigationStore((s) => s.clearPendingFile);
    useEffect(() => {
        if (pendingFile?.page !== 'imgrecolor') return;
        const path = consumePendingFile('imgrecolor');
        if (!path) return;
        clearPendingFile('imgrecolor');
        void loadDroppedPaths([path]);
    }, [pendingFile, consumePendingFile, clearPendingFile, loadDroppedPaths]);

    useFileDrop({
        onEnter: () => setIsDragging(true),
        onLeave: () => setIsDragging(false),
        onDrop: (paths) => { setIsDragging(false); dragCounterRef.current = 0; void loadDroppedPaths(paths); },
    });

    // Dim the editor chrome until images are loaded (via .is-dim on the panel).
    const nothingLoaded = allImages.length === 0;

    return (
        <div
            className="imgrecolor-root"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragging && (
                <DropOverlay
                    variant="scrim"
                    icon={<CloudUploadIcon sx={{ fontSize: '2.5rem' }} />}
                    label={(
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span>Drop images or folder here</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 400 }}>
                                Supports TEX, DDS, PNG, JPG files
                            </span>
                        </span>
                    )}
                />
            )}

            {/* Body: adjustments panel (left) + image area (right) */}
            <div className="imgrecolor-body">
                <div className={`imgrecolor-adjust${nothingLoaded ? ' is-dim' : ''}`}>
                    <div className="imgrecolor-adjust__scroll">
                        <AdjustmentsPanel
                            disabled={loadedImages.size === 0}
                            hueShift={hueShift} setHueShift={setHueShift}
                            saturationBoost={saturationBoost} setSaturationBoost={setSaturationBoost}
                            lightnessAdjust={lightnessAdjust} setLightnessAdjust={setLightnessAdjust}
                            opacity={opacity} setOpacity={setOpacity}
                            preserveOriginalColors={preserveOriginalColors} setPreserveOriginalColors={setPreserveOriginalColors}
                            curve={curve} setCurve={setCurve}
                        />
                    </div>
                </div>

                <div className="imgrecolor-images">
                    <div className="imgrecolor-images__scroll">
                        {showingSelection && allImages.length > 0 && (
                            <div className="imgrecolor-grid imgrecolor-grid--select">
                                {allImages.map((image) => (
                                    <ImageThumbnail
                                        key={image.path}
                                        image={image}
                                        isSelected={selectedImages.has(image.path)}
                                        onImageClick={toggleImageSelection}
                                        version={textureVersion}
                                    />
                                ))}
                            </div>
                        )}

                        {!showingSelection && loadedImages.size > 0 && (
                            <div className="imgrecolor-grid imgrecolor-grid--preview">
                                {Array.from(loadedImages.entries()).map(([imagePath, data]) => (
                                    <ProcessedImageCard
                                        key={imagePath}
                                        imagePath={imagePath}
                                        displayImage={data.adjustedPreview || data.preview || data.original}
                                    />
                                ))}
                            </div>
                        )}

                        {allImages.length === 0 && (
                            <div className="imgrecolor-empty">
                                <ImageIcon size={48} color="var(--accent-primary)" strokeWidth={1.5} style={{ display: 'block', marginBottom: 16 }} />
                                <div style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                                    {isDragging ? 'Drop to load' : 'No Image Selected'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 18 }}>
                                    Drop an image or folder here
                                </div>
                                <button className="dl-btn dl-btn--primary" onClick={handleLoadFolder}>
                                    <span className="dl-icon"><FolderOpenIcon sx={{ fontSize: 16 }} /></span>
                                    <span>Load Folder</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <RecolorFooter
                nothingLoaded={nothingLoaded}
                showingSelection={showingSelection}
                allImagesCount={allImages.length}
                selectedCount={selectedImages.size}
                allSelected={selectableImages.length > 0 && selectedImages.size === selectableImages.length}
                loadedCount={loadedImages.size}
                recursiveScan={recursiveScan}
                setRecursiveScan={setRecursiveScan}
                status={status}
                progress={progress}
                onLoadFolder={handleLoadFolder}
                onFilterGrayscale={handleFilterGrayscale}
                onToggleSelectAll={toggleSelectAll}
                onConfirmSelection={handleConfirmSelection}
                onBackToSelection={handleBackToSelection}
                onReset={handleReset}
                onSaveAll={handleSaveAll}
            />
        </div>
    );
}

export { ImgRecolor };
export default ImgRecolor;
