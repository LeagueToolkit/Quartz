import { useState, useEffect, useRef, useCallback } from 'react';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { Image as ImageIcon } from 'lucide-react';
import {
    loadFolder,
    loadSingleImage,
    saveImageFile,
    isGrayscaleImage,
    applyAdjustment,
    type ImageEntry,
    type RecolorParams,
} from './utils/imgRecolorLogic';
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

    // ── Toast + async guards ──
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
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
    const updateColorAdjustments = useCallback((hue: number, sat: number, light: number, opac: number, preserveColors: boolean) => {
        if (loadedImages.size === 0) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(() => {
            const params: RecolorParams = {
                targetHue: hue, saturationBoost: sat, lightnessAdjust: light, opacity: opac, preserveOriginalColors: preserveColors,
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
            }
        } finally {
            setIsLoading(false);
        }
    };

    const toggleImageSelection = useCallback((imagePath: string) => {
        setSelectedImages((prev) => {
            const next = new Set(prev);
            if (next.has(imagePath)) next.delete(imagePath); else next.add(imagePath);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedImages((prev) => (
            prev.size === allImages.length ? new Set<string>() : new Set(allImages.map((img) => img.path))
        ));
    }, [allImages]);

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

    // Re-apply adjustments when images load or sliders change.
    useEffect(() => {
        if (loadedImages.size > 0) updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedImages.size]);
    useEffect(() => {
        if (loadedImages.size > 0) updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors]);

    const handleReset = () => {
        setHueShift(0);
        setSaturationBoost(0);
        setLightnessAdjust(0);
        setOpacity(100);
        setPreserveOriginalColors(false);
    };

    const handleBackToSelection = () => {
        setShowingSelection(true);
        setLoadedImages(new Map());
    };

    const handleFilterGrayscale = async () => {
        const isDistortionName = (name = '') => {
            const n = String(name).toLowerCase();
            return n.includes('distortion') || n.includes('distort') || n.includes('distord')
                || /(^|[_\-\s.])dist([_\-\s.]|$)/i.test(n);
        };

        setIsLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
            const newSelected = new Set<string>();
            for (const image of allImages) {
                if (isDistortionName(image.name)) continue;
                const imageData = await loadSingleImage(image.path);
                if (imageData && !isGrayscaleImage(imageData)) newSelected.add(image.path);
            }
            setSelectedImages(newSelected);
            setToastMessage(`✅ Selected ${newSelected.size} colored image${newSelected.size !== 1 ? 's' : ''}`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveAll = async () => {
        setIsLoading(true);
        let savedCount = 0;
        let failedCount = 0;
        try {
            const params: RecolorParams = { targetHue: hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors };
            for (const imagePath of selectedImages) {
                const original = loadedImages.has(imagePath) ? loadedImages.get(imagePath)!.original : await loadSingleImage(imagePath);
                if (original) {
                    const ok = await saveImageFile(applyAdjustment(original, params), imagePath);
                    if (ok) savedCount++; else failedCount++;
                } else {
                    failedCount++;
                }
            }
            setToastMessage(failedCount === 0
                ? `✅ Saved ${savedCount} image${savedCount !== 1 ? 's' : ''}`
                : `⚠️ Saved ${savedCount}, failed ${failedCount}`);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        } finally {
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

    // Auto-load a file handed over from the explorer's "Open in Image Recolor".
    const consumePendingFile = useNavigationStore((s) => s.consumePendingFile);
    useEffect(() => {
        const path = consumePendingFile('imgrecolor');
        if (path) void loadDroppedPaths([path]);
    }, [consumePendingFile, loadDroppedPaths]);

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
                allSelected={selectedImages.size === allImages.length}
                loadedCount={loadedImages.size}
                recursiveScan={recursiveScan}
                setRecursiveScan={setRecursiveScan}
                onLoadFolder={handleLoadFolder}
                onFilterGrayscale={handleFilterGrayscale}
                onToggleSelectAll={toggleSelectAll}
                onConfirmSelection={handleConfirmSelection}
                onBackToSelection={handleBackToSelection}
                onReset={handleReset}
                onSaveAll={handleSaveAll}
            />

            {showToast && <div className="imgrecolor-toast">{toastMessage}</div>}
        </div>
    );
}

export { ImgRecolor };
export default ImgRecolor;
