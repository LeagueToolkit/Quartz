import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Slider, Checkbox } from '@mui/material';
import { glassButton } from '../utils/glassStyles';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import PaletteIcon from '@mui/icons-material/Palette';
import GlowingSpinner from '../components/GlowingSpinner';
import { loadFolder, loadSingleImage, saveImageFile, isGrayscaleImage } from '../logic/imgRecolorLogic';

// Image Thumbnail Component
const ImageThumbnail = ({ image, isSelected, onClick }) => {
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

  // Load thumbnail only when visible
  useEffect(() => {
    if (!isVisible) return;

    loadSingleImage(image.path).then(imageData => {
      if (imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        setThumbnail(canvas.toDataURL());
      }
    });
  }, [isVisible, image.path]);

  return (
    <Box
      ref={ref}
      onClick={onClick}
      sx={{
        position: 'relative',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
        border: isSelected ? '3px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': {
          transform: 'scale(1.05)',
          border: isSelected ? '3px solid var(--accent)' : '2px solid var(--accent-muted)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
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
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '4px',
            padding: '4px',
            '&.Mui-checked': { 
              color: 'var(--accent)',
              background: 'rgba(0,0,0,0.7)'
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
        p: 0.5,
        background: 'rgba(0,0,0,0.6)',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <Typography sx={{
          color: 'var(--text-2)',
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
};

const ImgRecolor = () => {
  // State
  const [folderPath, setFolderPath] = useState('');
  const [allImages, setAllImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [showingSelection, setShowingSelection] = useState(true);
  const [loadedImages, setLoadedImages] = useState(new Map()); // path -> { original, adjusted }
  
  // Color adjustment sliders
  const [hueShift, setHueShift] = useState(0);
  const [saturationBoost, setSaturationBoost] = useState(0);
  const [lightnessAdjust, setLightnessAdjust] = useState(0);
  
  // Save result toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  
  // Web Worker and debounce
  const workerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const processingCountRef = useRef(0);

  // Glass section style
  const glassSection = {
    background: 'rgba(16,14,22,0.35)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
  };

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
          newMap.set(id, { ...entry, adjusted: imageData });
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

  // Debounced color adjustment
  const updateColorAdjustments = (hue, sat, light) => {
    if (loadedImages.size === 0) return;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      processingCountRef.current = 0;
      
      for (const [imagePath, data] of loadedImages.entries()) {
        processingCountRef.current++;
        const pixelDataCopy = new Uint8ClampedArray(data.original.data);
        workerRef.current.postMessage({
          pixelData: pixelDataCopy.buffer,
          width: data.original.width,
          height: data.original.height,
          targetHue: hue,
          saturationBoost: sat,
          lightnessAdjust: light,
          id: imagePath
        }, [pixelDataCopy.buffer]);
      }
    }, 50); // 50ms debounce
  };

  // Load folder
  const handleLoadFolder = async () => {
    setIsLoading(true);
    try {
      const result = await loadFolder();
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

  // Toggle image selection
  const toggleImageSelection = (imagePath) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imagePath)) {
      newSelected.delete(imagePath);
    } else {
      newSelected.add(imagePath);
    }
    setSelectedImages(newSelected);
  };

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
          newLoadedImages.set(imagePath, {
            original: imageData,
            adjusted: imageData // Will be processed by worker
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
      updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust);
    }
  }, [loadedImages]);

  // Apply adjustments when sliders change
  useEffect(() => {
    if (loadedImages.size > 0) {
      updateColorAdjustments(hueShift, saturationBoost, lightnessAdjust);
    }
  }, [hueShift, saturationBoost, lightnessAdjust]);

  // Reset
  const handleReset = () => {
    setHueShift(0);
    setSaturationBoost(0);
    setLightnessAdjust(0);
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

  // Save all selected images (not just previewed ones)
  const handleSaveAll = async () => {
    setIsLoading(true);
    let savedCount = 0;
    let failedCount = 0;
    
    try {
      // Process all selected images
      for (const imagePath of selectedImages) {
        // Load image if not already loaded
        let imageData;
        if (loadedImages.has(imagePath)) {
          imageData = loadedImages.get(imagePath).adjusted;
        } else {
          // Load and process in background
          const original = await loadSingleImage(imagePath);
          if (original) {
            // Apply same adjustments
            const adjusted = await new Promise((resolve) => {
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
                targetHue: hueShift,
                saturationBoost: saturationBoost,
                lightnessAdjust: lightnessAdjust,
                id: imagePath
              }, [pixelDataCopy.buffer]);
            });
            imageData = adjusted;
          }
        }
        
        if (imageData) {
          const success = await saveImageFile(imageData, imagePath);
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

  return (
    <Box sx={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
      </Box>

      {/* Header */}
      <Box sx={{ 
        position: 'relative',
        zIndex: 1,
        p: 1.5, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5,
        background: 'color-mix(in srgb, var(--surface), transparent 20%)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid color-mix(in srgb, var(--accent), transparent 80%)'
      }}>
        <PaletteIcon sx={{ color: 'var(--accent)', fontSize: 24 }} />
        <Typography sx={{ 
          fontWeight: 600, 
          fontSize: '1.1rem',
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace'
        }}>
          Img Recolor
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>
          {folderPath ? `${allImages.length} images found` : 'No folder loaded'}
        </Typography>
      </Box>

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
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              startIcon={<FolderOpenIcon />}
              onClick={handleLoadFolder}
              sx={{ ...glassButton, fontSize: '0.85rem', height: '32px' }}
            >
              Load Folder
            </Button>
            {!showingSelection && (
              <>
                <Button
                  onClick={handleBackToSelection}
                  sx={{ ...glassButton, fontSize: '0.85rem', height: '32px' }}
                >
                  Back to Selection
                </Button>
                <Button
                  startIcon={<SaveIcon />}
                  onClick={handleSaveAll}
                  disabled={loadedImages.size === 0}
                  sx={{ ...glassButton, fontSize: '0.85rem', height: '32px' }}
                >
                  Save All
                </Button>
                <Button
                  startIcon={<RefreshIcon />}
                  onClick={handleReset}
                  sx={{ ...glassButton, fontSize: '0.85rem', height: '32px' }}
                >
                  Reset
                </Button>
              </>
            )}
            {showingSelection && allImages.length > 0 && (
              <>
                <Button
                  onClick={handleFilterGrayscale}
                  sx={{ ...glassButton, fontSize: '0.85rem', height: '32px' }}
                >
                  Filter Grayscale
                </Button>
                {selectedImages.size > 0 && (
                  <Button
                    onClick={handleConfirmSelection}
                    sx={{
                      ...glassButton,
                      fontSize: '0.85rem',
                      height: '32px',
                      fontWeight: 600
                    }}
                  >
                    Load {selectedImages.size} Images
                  </Button>
                )}
              </>
            )}
          </Box>

          {/* Content Container */}
          <Box sx={{ 
            ...glassSection,
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
                    onClick={() => toggleImageSelection(image.path)}
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
                  const canvas = document.createElement('canvas');
                  canvas.width = data.adjusted.width;
                  canvas.height = data.adjusted.height;
                  const ctx = canvas.getContext('2d');
                  ctx.putImageData(data.adjusted, 0, 0);
                  const dataURL = canvas.toDataURL();

                  return (
                    <Box
                      key={imagePath}
                      sx={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.1)'
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
            ...glassSection,
            borderRadius: '16px',
            padding: '20px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)'
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
