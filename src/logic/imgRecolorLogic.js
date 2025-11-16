/**
 * Image Recolor Logic
 * Handles all image processing operations for the Img Recolor page
 */

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

import { loadTextureRGBA, detectFileType, writeTEX, readTEX, writeDDS, readDDS, compressToDDS, compressToBC3 } from '../filetypes/index.js';

/**
 * Load a folder and scan for images
 * @returns {Promise<Object|null>} { folderPath, images: [{ path, name, type }] }
 */
export async function loadFolder() {
  if (!window.require || !fs || !path) {
    console.error('Electron environment not available');
    return null;
  }

  try {
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('dialog:openDirectory');

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];
    const images = [];

    // Scan folder for image files
    const files = fs.readdirSync(folderPath);
    const imageExtensions = ['.tex', '.dds', '.png', '.jpg', '.jpeg'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        images.push({
          path: path.join(folderPath, file),
          name: file,
          type: ext.substring(1)
        });
      }
    }

    return {
      folderPath,
      images
    };
  } catch (error) {
    console.error('Error loading folder:', error);
    return null;
  }
}

/**
 * Load a single image file
 * @param {string} filePath - Path to image file
 * @returns {Promise<ImageData|null>}
 */
export async function loadSingleImage(filePath) {
  if (!fs || !path) {
    console.error('fs or path not available');
    return null;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File does not exist:', filePath);
      return null;
    }

    // Read file as buffer
    const nodeBuffer = fs.readFileSync(filePath);
    const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);

    let imageData;

    // Detect file type
    const fileType = detectFileType(arrayBuffer);

    if (fileType === 'tex' || fileType === 'dds') {
      // Use native decoder
      const { pixels, width, height } = loadTextureRGBA(arrayBuffer, fileType);
      imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
    } else if (fileType === 'png' || fileType === 'jpg') {
      // Use browser's image decoder
      imageData = await loadStandardImage(arrayBuffer);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    return imageData;
  } catch (error) {
    console.error('Error loading image:', error);
    return null;
  }
}

/**
 * Load standard image formats (PNG, JPG) using browser APIs
 * @param {ArrayBuffer} buffer - Image buffer
 * @returns {Promise<ImageData>}
 */
function loadStandardImage(buffer) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Save image file directly (no dialog)
 * @param {ImageData} imageData - Image data to save
 * @param {string} originalPath - Original file path
 * @returns {Promise<boolean>}
 */
export async function saveImageFile(imageData, originalPath) {
  if (!fs || !path) {
    console.error('fs or path not available');
    return false;
  }

  try {
    const ext = path.extname(originalPath).toLowerCase();
    
    // Save directly to original path (overwrite)
    const savePath = originalPath;

    // For PNG/JPG, convert to canvas and save
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageData, 0, 0);

      const dataURL = canvas.toDataURL('image/png');
      const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(savePath, buffer);
      console.log('Image saved to:', savePath);
      return true;
    }

    // For TEX files, preserve original format or use DXT5
    if (ext === '.tex') {
      try {
        // Read original TEX to get format info
        const nodeBuffer = fs.readFileSync(originalPath);
        const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
        const originalTex = readTEX(arrayBuffer);
        
        let data;
        if (originalTex.format === 20) {
          // BGRA8 - uncompressed, convert RGBA to BGRA
          const bgra = new Uint8Array(imageData.data.length);
          for (let i = 0; i < imageData.width * imageData.height; i++) {
            const idx = i * 4;
            bgra[idx] = imageData.data[idx + 2];     // B from R
            bgra[idx + 1] = imageData.data[idx + 1]; // G stays
            bgra[idx + 2] = imageData.data[idx];     // R from B
            bgra[idx + 3] = imageData.data[idx + 3]; // A stays
          }
          data = [bgra];
        } else {
          // DXT1/DXT5 - compress
          const format = originalTex.format === 10 ? 'DXT1' : 'DXT5';
          data = [compressToDDS(imageData.data, imageData.width, imageData.height, format)];
        }
        
        // Create TEX with same format as original
        const newTex = {
          width: imageData.width,
          height: imageData.height,
          format: originalTex.format,
          mipmaps: false,
          data
        };
        
        const encodedBuffer = writeTEX(newTex);
        fs.writeFileSync(savePath, Buffer.from(encodedBuffer));
        console.log('TEX image saved to:', savePath);
        return true;
      } catch (texError) {
        console.error('Failed to encode as TEX:', texError);
        return false;
      }
    }

    // For DDS files, use native encoder with proper format
    if (ext === '.dds') {
      try {
        // Read original DDS to get format info
        const nodeBuffer = fs.readFileSync(originalPath);
        const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
        const originalDds = readDDS(arrayBuffer);
        
        let data;
        if (originalDds.format === 'BGRA8') {
          // Uncompressed - just use raw pixel data
          data = imageData.data;
        } else {
          // DXT1/DXT5 - compress
          data = compressToDDS(imageData.data, imageData.width, imageData.height, originalDds.format);
        }
        
        // Create new DDS with compressed data
        const newDds = {
          ...originalDds,
          data
        };
        
        const encodedBuffer = writeDDS(newDds);
        fs.writeFileSync(savePath, Buffer.from(encodedBuffer));
        console.log('DDS image saved to:', savePath);
        return true;
      } catch (ddsError) {
        console.error('Failed to encode as DDS:', ddsError);
        return false;
      }
    }

    // For other formats, save as PNG
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    const dataURL = canvas.toDataURL('image/png');
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const pngPath = path.join(dir, `${basename}_recolored.png`);
    fs.writeFileSync(pngPath, buffer);
    console.log('Image saved as PNG to:', pngPath);
    return true;
  } catch (error) {
    console.error('Error saving image:', error);
    return false;
  }
}

/**
 * Save single image with dialog
 * @param {ImageData} imageData - Image data to save
 * @param {string} originalPath - Original file path
 * @returns {Promise<boolean>}
 */
export async function saveImageFileWithDialog(imageData, originalPath) {
  if (!window.require || !fs || !path) {
    console.error('Electron environment not available');
    return false;
  }

  try {
    const ext = path.extname(originalPath).toLowerCase();
    const defaultPath = originalPath.replace(ext, '_recolored.png');

    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('dialog:saveFile', {
      defaultPath,
      filters: [
        { name: 'PNG Files', extensions: ['png'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    // Convert ImageData to PNG
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    // Get PNG data
    const dataURL = canvas.toDataURL('image/png');
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Write file
    fs.writeFileSync(result.filePath, buffer);
    console.log('Image saved to:', result.filePath);
    return true;
  } catch (error) {
    console.error('Error saving image:', error);
    return false;
  }
}

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color (#RRGGBB)
 * @returns {Object} { r, g, b }
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Calculate color distance
 * @param {Object} c1 - Color 1 { r, g, b }
 * @param {Object} c2 - Color 2 { r, g, b }
 * @returns {number} Distance
 */
function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Convert RGB to HSL
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Object} { h, s, l }
 */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {Object} { r, g, b }
 */
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Apply HSL adjustment to image (like FrogImg - target hue approach)
 * @param {ImageData} imageData - Original image data
 * @param {number} targetHue - Target hue in degrees (0-360)
 * @param {number} saturationBoost - Saturation boost (0-100)
 * @param {number} lightnessAdjust - Lightness adjustment (-100 to 100)
 * @returns {ImageData} New image data
 */
export function applyHSLAdjustment(imageData, targetHue, saturationBoost, lightnessAdjust) {
  const newImageData = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  const pixels = newImageData.data;
  const targetHueNormalized = targetHue / 360;
  const lightnessAdjustment = lightnessAdjust / 100;

  // Process each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels
    if (a === 0) continue;

    // Convert to HSL (normalized 0-1)
    const hsl = rgbToHsl(r, g, b);
    
    // Set to target hue (like FrogImg)
    let newHue = targetHueNormalized;
    let newSaturation = hsl.s / 100; // Normalize to 0-1
    let newLightness = hsl.l / 100; // Normalize to 0-1

    // Apply saturation boost (0-100% range)
    const saturationMultiplier = 1 + (saturationBoost / 100);
    newSaturation = Math.max(0, Math.min(1, newSaturation * saturationMultiplier));

    // Apply lightness adjustment
    newLightness = Math.max(0, Math.min(1, newLightness + lightnessAdjustment));

    // Convert back to RGB (denormalize)
    const rgb = hslToRgb(newHue * 360, newSaturation * 100, newLightness * 100);

    pixels[i] = Math.ceil(Math.max(0, Math.min(255, rgb.r)));
    pixels[i + 1] = Math.ceil(Math.max(0, Math.min(255, rgb.g)));
    pixels[i + 2] = Math.ceil(Math.max(0, Math.min(255, rgb.b)));
    // Keep alpha unchanged
  }

  return newImageData;
}

/**
 * Pick color from canvas at position
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {string} Hex color
 */
export function pickColorFromCanvas(canvas, x, y) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(x, y, 1, 1);
  const [r, g, b] = imageData.data;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Extract dominant colors from image
 * @param {ImageData} imageData - Image data
 * @param {number} count - Number of colors to extract
 * @returns {Array<string>} Array of hex colors
 */
export function extractDominantColors(imageData, count = 8) {
  const pixels = imageData.data;
  const colorMap = new Map();

  // Sample every 4th pixel for performance
  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels
    if (a < 128) continue;

    // Quantize to reduce color space
    const qr = Math.floor(r / 32) * 32;
    const qg = Math.floor(g / 32) * 32;
    const qb = Math.floor(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;

    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // Sort by frequency and get top colors
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    });

  return sortedColors;
}

/**
 * Check if image is grayscale/white/black (no color information)
 * @param {ImageData} imageData - Image data
 * @returns {boolean} True if image is grayscale/white/black
 */
export function isGrayscaleImage(imageData) {
  const pixels = imageData.data;
  let colorfulPixels = 0;
  let totalPixels = 0;

  // Sample every 8th pixel for performance
  for (let i = 0; i < pixels.length; i += 32) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels
    if (a < 128) continue;

    totalPixels++;

    // Check if pixel has color (R, G, B not equal)
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (maxDiff > 10) { // Threshold of 10 to account for compression artifacts
      colorfulPixels++;
    }
  }

  // If less than 5% of pixels have color, it's grayscale
  if (totalPixels === 0) return true;
  return (colorfulPixels / totalPixels) < 0.05;
}
