import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Typography, Button, Slider, Checkbox, Switch, Menu, IconButton } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import GlowingSpinner from '../components/GlowingSpinner';
import { loadFolder, loadSingleImage, saveImageFile, isGrayscaleImage } from '../logic/imgRecolorLogic';

// Celestial-style minimalistic button
const celestialButtonStyle = {
  background: 'var(--bg-2)',
  border: '1px solid var(--accent-muted)',
  color: 'var(--text)',
  borderRadius: '5px',
  transition: 'all 200ms ease',
  textTransform: 'none',
  fontFamily: 'JetBrains Mono, monospace',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  '&:hover': {
    background: 'var(--surface-2)',
    borderColor: 'var(--accent)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
  },
  '&:disabled': {
    background: 'var(--bg-2)',
    borderColor: 'var(--text-2)',
    color: 'var(--text-2)',
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  '&:active': {
    transform: 'translateY(1px)'
  }
};

// Thumbnail loading queue - processes sequentially with UI yielding
const thumbnailQueue = {
  queue: [],
  isProcessing: false,

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  },

  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();

      try {
        // Critical: Yield to event loop every frame to keep UI responsive
        await new Promise(r => setTimeout(r, 16));

        if (job.task) {
          const result = await job.task();
          job.resolve(result);
        }
      } catch (e) {
        job.reject(e);
      }
    }
    this.isProcessing = false;
  }
};

// Image Thumbnail Component - Memoized for performance
const ImageThumbnail = memo(({ image, isSelected, onImageClick }) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  // Lazy load with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '50px' }
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

    thumbnailQueue.add(async () => {
      // Check if still mounted before doing work
      if (cancelled) return null;

      const imageData = await loadSingleImage(image.path);
      if (!imageData || cancelled) return null;

      const { width, height } = imageData;
      const maxSize = 128; // Small thumbnail size

      // Calculate scale
      const scale = Math.min(maxSize / width, maxSize / height, 1);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);

      // Create full size canvas first
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = width;
      fullCanvas.height = height;
      const fullCtx = fullCanvas.getContext('2d');
      fullCtx.putImageData(imageData, 0, 0);

      // Downscale to thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = newWidth;
      thumbCanvas.height = newHeight;
      const thumbCtx = thumbCanvas.getContext('2d');
      thumbCtx.drawImage(fullCanvas, 0, 0, newWidth, newHeight);

      return thumbCanvas.toDataURL();
    }).then(dataUrl => {
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
            : '0 0 15px color-mix(in srgb, var(--accent-muted), transparent 60%)'
        }
      }}
    >
      {/* Checkbox overlay */}
      <Box sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2
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
              background: 'var(--bg)'
            },
            '&:hover': {
              background: 'var(--surface-2)'
            }
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
          p: 1
        }}>
          <img
            src={thumbnail}
            alt={image.name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              imageRendering: 'pixelated'
            }}
          />
        </Box>
      ) : (
        <Box sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Typography sx={{
            color: 'var(--text-2)',
            fontSize: '0.7rem',
            fontFamily: 'JetBrains Mono, monospace'
          }}>
            Loading...
          </Typography>
        </Box>
      )}

      {/* Filename */}
      <Box sx={{
        p: 0.5
      }}>
        <Typography sx={{
          color: 'var(--text)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.65rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {image.name}
        </Typography>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if selection state or image path changes
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.image.path === nextProps.image.path &&
    prevProps.image.name === nextProps.image.name &&
    prevProps.onImageClick === nextProps.onImageClick
  );
});

const ImgRecolor = () => {
  // State
  const [folderPath, setFolderPath] = useState('');
  const [allImages, setAllImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [recursiveScan, setRecursiveScan] = useState(false); // Include subfolders toggle
  const [showingSelection, setShowingSelection] = useState(true);
  const [loadedImages, setLoadedImages] = useState(new Map()); // path -> { original, adjusted }

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
  const [optionsAnchor, setOptionsAnchor] = useState(null);
  const optionsOpen = Boolean(optionsAnchor);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Web Worker and debounce
  const workerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const processingCountRef = useRef(0);

  const location = useLocation();

  // Handle auto-load from navigation state
  useEffect(() => {
    if (location.state) {
      const { autoLoadPath, autoSelectFile } = location.state;

      if (autoLoadPath) {
        const loadAuto = async () => {
          setIsLoading(true);
          try {
            const result = await loadFolder(autoLoadPath);
            if (result) {
              setFolderPath(result.folderPath);
              setAllImages(result.images);

              setLoadedImages(new Map());

              if (autoSelectFile) {
                // Auto-select the file
                setSelectedImages(new Set([autoSelectFile]));

                // If we have a file, we might want to go straight to preview?
                // For now, let's keep it in selection mode but selected, so user knows what's happening.
                setShowingSelection(true);

                // Auto-scroll to the selected image
                setTimeout(() => {
                  if (CSS && CSS.escape) {
                    const selector = `[data-image-path="${CSS.escape(autoSelectFile)}"]`;
                    const element = document.querySelector(selector);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                      // Flash effect
                      element.animate([
                        { boxShadow: '0 0 0 rgba(var(--accent-rgb), 0)', borderColor: 'var(--accent-muted)' },
                        { boxShadow: '0 0 30px var(--accent)', borderColor: 'var(--accent)', offset: 0.2 },
                        { boxShadow: '0 0 30px var(--accent)', borderColor: 'var(--accent)', offset: 0.8 },
                        { boxShadow: '0 0 0 rgba(var(--accent-rgb), 0)', borderColor: 'var(--accent-muted)' }
                      ], {
                        duration: 1500,
                        easing: 'ease-out'
                      });
                    }
                  }
                }, 500); // Wait for render
              } else {
                setSelectedImages(new Set());
                setShowingSelection(true);
              }
            }
          } catch (e) {
            console.error("Auto-load failed", e);
          } finally {
            setIsLoading(false);
          }
        };
        loadAuto();

        // Clear state so we don't re-trigger? 
        // Actually best to leave it, as subsequent visits without state won't trigger.
      }
    }
  }, [location.state]);


  // Create a downscaled preview for fast processing
  const createPreview = useCallback((imageData, maxSize = 256) => {
    const { width, height } = imageData;

    // If already small enough, return as-is
    if (width <= maxSize && height <= maxSize) {
      return { preview: imageData, scale: 1 };
    }

    // Calculate scale to fit within maxSize
    const scale = Math.min(maxSize / width, maxSize / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);

    // Create canvas for downscaling
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Create smaller canvas
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = newWidth;
    smallCanvas.height = newHeight;
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

    return {
      preview: smallCtx.getImageData(0, 0, newWidth, newHeight),
      scale
    };
  }, []);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/imageProcessor.worker.js', import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { pixelData, width, height, id } = event.data;

      // Reconstruct ImageData from transferred buffer
      const imageData = new ImageData(new Uint8ClampedArray(pixelData), width, height);

      setLoadedImages(prev => {
        const newMap = new Map(prev);
        const entry = newMap.get(id);
        if (entry) {
          newMap.set(id, { ...entry, adjustedPreview: imageData });
        }
        return newMap;
      });
      processingCountRef.current--;
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Debounced color adjustment - uses small preview for fast UI updates
  const updateColorAdjustments = (hue, sat, light, opac, preserveColors) => {
    if (loadedImages.size === 0) return;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      processingCountRef.current = 0;

      for (const [imagePath, data] of loadedImages.entries()) {
        // Use preview (small) image for fast processing during slider adjustment
        const sourceImage = data.preview || data.original;
        processingCountRef.current++;
        const pixelDataCopy = new Uint8ClampedArray(sourceImage.data);
        workerRef.current.postMessage({
          pixelData: pixelDataCopy.buffer,
          width: sourceImage.width,
          height: sourceImage.height,
          targetHue: hue,
          saturationBoost: sat,
          lightnessAdjust: light,
          opacity: opac,
          preserveOriginalColors: preserveColors,
          id: imagePath
        }, [pixelDataCopy.buffer]);
      }
    }, 50); // 50ms debounce
  };

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
  const toggleImageSelection = useCallback((imagePath) => {
    setSelectedImages(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(imagePath)) {
        newSelected.delete(imagePath);
      } else {
        newSelected.add(imagePath);
      }
      return newSelected;
    });
  }, []);

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

      const newLoadedImages = new Map();

      // Load only first 6 images for preview (rest will be processed in background)
      const imagePaths = Array.from(selectedImages);
      const previewPaths = imagePaths.slice(0, 6);

      for (const imagePath of previewPaths) {
        const imageData = await loadSingleImage(imagePath);
        if (imageData) {
          // Create small preview for fast slider adjustments
          const { preview } = createPreview(imageData, 256);
          newLoadedImages.set(imagePath, {
            original: imageData,
            preview: preview,
            adjustedPreview: preview // Will be processed by worker
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
  }, [loadedImages]);

  // Apply adjustments when sliders change
  useEffect(() => {
    if (loadedImages.size > 0) {
      updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust, opacity, preserveOriginalColors);
    }
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
    setIsLoading(true);

    // Give React time to render the spinner
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const newSelected = new Set();
      let filtered = 0;

      for (const image of allImages) {
        const imageData = await loadSingleImage(image.path);
        if (imageData && !isGrayscaleImage(imageData)) {
          newSelected.add(image.path);
        } else {
          filtered++;
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
  const processFullResolution = useCallback((original, hue, sat, light, opac, preserveColors) => {
    return new Promise((resolve) => {
      const worker = new Worker(new URL('../workers/imageProcessor.worker.js', import.meta.url));
      worker.onmessage = (event) => {
        const { pixelData, width, height } = event.data;
        resolve(new ImageData(new Uint8ClampedArray(pixelData), width, height));
        worker.terminate();
      };
      const pixelDataCopy = new Uint8ClampedArray(original.data);
      worker.postMessage({
        pixelData: pixelDataCopy.buffer,
        width: original.width,
        height: original.height,
        targetHue: hue,
        saturationBoost: sat,
        lightnessAdjust: light,
        opacity: opac,
        preserveOriginalColors: preserveColors,
        id: 'save'
      }, [pixelDataCopy.buffer]);
    });
  }, []);

  // Save all selected images (not just previewed ones)
  const handleSaveAll = async () => {
    setIsLoading(true);
    let savedCount = 0;
    let failedCount = 0;

    try {
      // Process all selected images at FULL resolution
      for (const imagePath of selectedImages) {
        let original;

        // Get original full-resolution image
        if (loadedImages.has(imagePath)) {
          original = loadedImages.get(imagePath).original;
        } else {
          // Load from disk if not in memory
          original = await loadSingleImage(imagePath);
        }

        if (original) {
          // Process at full resolution for saving
          const adjusted = await processFullResolution(
            original,
            hueShift,
            saturationBoost,
            lightnessAdjust,
            opacity,
            preserveOriginalColors
          );

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

      // Show toast
      if (failedCount === 0) {
        setToastMessage(`✅ Saved ${savedCount} image${savedCount !== 1 ? 's' : ''}`);
      } else {
        setToastMessage(`⚠️ Saved ${savedCount}, failed ${failedCount}`);
      }
      setShowToast(true);

      // Auto-hide after 3 seconds
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      const imageExtensions = ['.tex', '.dds', '.png', '.jpg', '.jpeg'];

      // Check if first item is a directory
      const firstPath = files[0].path;
      const stat = fs.statSync(firstPath);

      if (stat.isDirectory()) {
        // Load folder (use recursiveScan setting)
        const result = await loadFolder(firstPath, recursiveScan);
        if (result) {
          setFolderPath(result.folderPath);
          setAllImages(result.images);
          setSelectedImages(new Set());
          setShowingSelection(true);
          setLoadedImages(new Map());
        }
      } else {
        // Handle individual files - collect all valid images
        const images = [];
        const folderPaths = new Set();

        for (const file of files) {
          const ext = path.extname(file.path).toLowerCase();
          if (imageExtensions.includes(ext)) {
            images.push({
              path: file.path,
              name: file.name,
              type: ext.substring(1)
            });
            folderPaths.add(path.dirname(file.path));
          }
        }

        if (images.length > 0) {
          // Use the common folder or first file's folder as the path
          const commonFolder = folderPaths.size === 1
            ? Array.from(folderPaths)[0]
            : path.dirname(files[0].path);

          setFolderPath(commonFolder);
          setAllImages(images);
          setSelectedImages(new Set(images.map(img => img.path))); // Auto-select dropped files
          setShowingSelection(true);
          setLoadedImages(new Map());
        }
      }
    } catch (error) {
      console.error('Drop error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [recursiveScan]);

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        position: 'relative',
        overflow: 'hidden'
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
          pointerEvents: 'none'
        }}>
          <CloudUploadIcon sx={{
            fontSize: '4rem',
            color: 'var(--accent)',
            animation: 'float 2s ease-in-out infinite'
          }} />
          <Typography sx={{
            color: 'var(--accent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.2rem',
            fontWeight: 600
          }}>
            Drop images or folder here
          </Typography>
          <Typography sx={{
            color: 'var(--text-2)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.85rem'
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
          gap: 'clamp(0.5rem, 1vw, 0.75rem)'
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
                  {selectedImages.size > 0 && (
                    <Button
                      onClick={handleConfirmSelection}
                      sx={{
                        ...celestialButtonStyle,
                        fontSize: '0.8rem',
                        height: '34px',
                        padding: '0 12px',
                        fontWeight: 500,
                        boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 70%), 0 2px 4px rgba(0,0,0,0.2)',
                        '&:hover': {
                          ...celestialButtonStyle['&:hover'],
                          boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent), transparent 50%), 0 2px 4px rgba(0,0,0,0.3)'
                        }
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
                fontSize: '0.85rem'
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
                      mt: 0.5
                    }
                  }
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
                      background: 'rgba(255, 255, 255, 0.05)'
                    }
                  }}
                >
                  <Typography sx={{
                    color: 'var(--text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.85rem',
                    userSelect: 'none'
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
                      }
                    }}
                  />
                </Box>
              </Menu>
            </Box>
          </Box>

          {/* Horizontal Divider */}
          <Box sx={{
            height: '1px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            flexShrink: 0
          }} />

          {/* Content Container */}
          <Box sx={{
            flex: 1,
            overflow: 'auto',
            p: 2
          }}>
            {/* Image Selection Grid */}
            {showingSelection && allImages.length > 0 && (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 2
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
                gap: 2
              }}>
                {Array.from(loadedImages.entries()).map(([imagePath, data]) => {
                  // Use adjustedPreview for display (small, fast)
                  const displayImage = data.adjustedPreview || data.preview || data.original;
                  const canvas = document.createElement('canvas');
                  canvas.width = displayImage.width;
                  canvas.height = displayImage.height;
                  const ctx = canvas.getContext('2d');
                  ctx.putImageData(displayImage, 0, 0);
                  const dataURL = canvas.toDataURL();

                  return (
                    <Box
                      key={imagePath}
                      sx={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      <img
                        src={dataURL}
                        alt={imagePath}
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          imageRendering: 'pixelated'
                        }}
                      />
                      <Typography sx={{
                        p: 1,
                        color: 'var(--text-2)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.7rem',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {imagePath.split(/[\\/]/).pop()}
                      </Typography>
                    </Box>
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
                height: '100%'
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
          width: '1px',
          background: 'rgba(255, 255, 255, 0.06)',
          flexShrink: 0,
          margin: '0 clamp(0.5rem, 1vw, 0.75rem)'
        }} />

        {/* Right Panel - Color Adjustments */}
        <Box sx={{
          flex: '0 0 clamp(280px, 22vw, 320px)',
          minWidth: 'clamp(260px, 20vw, 300px)',
          maxWidth: 'clamp(300px, 25vw, 350px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <Box sx={{
            padding: '20px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0
          }}>
            {/* Header */}
            <Typography sx={{
              fontSize: 'clamp(1rem, 1.2vw, 1.1rem)',
              fontWeight: '700',
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              marginBottom: '20px'
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
                  fontFamily: 'JetBrains Mono, monospace'
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
                  textAlign: 'center'
                }}>
                  {hueShift}°
                </Typography>
              </Box>
              <Slider
                value={hueShift}
                onChange={(_, value) => setHueShift(value)}
                min={0}
                max={360}
                disabled={loadedImages.size === 0}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)'
                    }
                  }
                }}
              />
            </Box>

            {/* Saturation Slider */}
            <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <Typography sx={{
                  color: 'var(--accent)',
                  fontWeight: '600',
                  fontSize: '14px',
                  fontFamily: 'JetBrains Mono, monospace'
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
                  textAlign: 'center'
                }}>
                  {saturationBoost}%
                </Typography>
              </Box>
              <Slider
                value={saturationBoost}
                onChange={(_, value) => setSaturationBoost(value)}
                min={0}
                max={100}
                disabled={loadedImages.size === 0}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)'
                    }
                  }
                }}
              />
            </Box>

            {/* Lightness Slider */}
            <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <Typography sx={{
                  color: 'var(--accent)',
                  fontWeight: '600',
                  fontSize: '14px',
                  fontFamily: 'JetBrains Mono, monospace'
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
                  textAlign: 'center'
                }}>
                  {lightnessAdjust}%
                </Typography>
              </Box>
              <Slider
                value={lightnessAdjust}
                onChange={(_, value) => setLightnessAdjust(value)}
                min={-100}
                max={100}
                disabled={loadedImages.size === 0}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)'
                    }
                  }
                }}
              />
            </Box>

            {/* Opacity Slider */}
            <Box sx={{ marginBottom: '20px', flexShrink: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <Typography sx={{
                  color: 'var(--accent)',
                  fontWeight: '600',
                  fontSize: '14px',
                  fontFamily: 'JetBrains Mono, monospace'
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
                  textAlign: 'center'
                }}>
                  {opacity}%
                </Typography>
              </Box>
              <Slider
                value={opacity}
                onChange={(_, value) => setOpacity(value)}
                min={0}
                max={100}
                disabled={loadedImages.size === 0}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px'
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)'
                    }
                  }
                }}
              />
            </Box>

            {/* Preserve Original Colors Checkbox */}
            <Box sx={{
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '4px'
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
                    background: 'rgba(255,255,255,0.05)'
                  }
                }}
              />
              <Typography sx={{
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                userSelect: 'none'
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
          '@keyframes slideIn': {
            from: { transform: 'translateX(400px)', opacity: 0 },
            to: { transform: 'translateX(0)', opacity: 1 }
          }
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
            backdropFilter: 'blur(10px)'
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
};

export default ImgRecolor;
