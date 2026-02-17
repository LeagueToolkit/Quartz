/**
 * File type handlers for native TEX and DDS support
 * Integrates with FrogImg for seamless image loading
 */

import { loadTEXAsImageData, readTEX, writeTEX, decompressTEX, TEXFormat, compressToBC3 } from './texFormat.js';
import { loadDDSAsImageData, readDDS, decompressDDS, writeDDS, compressToDDS } from './ddsFormat.js';

/**
 * Detect file type from buffer
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {string|null} File type ('tex', 'dds', 'png', 'jpg', etc.) or null
 */
export function detectFileType(buffer) {
  const view = new DataView(buffer);
  
  // Check TEX signature (0x00584554 = "TEX\0")
  if (buffer.byteLength >= 4) {
    const sig = view.getUint32(0, true);
    if (sig === 0x00584554) return 'tex';
  }
  
  // Check DDS signature ("DDS ")
  if (buffer.byteLength >= 4) {
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    if (magic === 'DDS ') return 'dds';
  }
  
  // Check PNG signature
  if (buffer.byteLength >= 8) {
    if (view.getUint8(0) === 0x89 && 
        view.getUint8(1) === 0x50 && 
        view.getUint8(2) === 0x4E && 
        view.getUint8(3) === 0x47) {
      return 'png';
    }
  }
  
  // Check JPEG signature
  if (buffer.byteLength >= 2) {
    if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
      return 'jpg';
    }
  }
  
  return null;
}

/**
 * Load any supported image format and return ImageData
 * @param {ArrayBuffer} buffer - The file buffer
 * @param {string} [fileType] - Optional file type hint
 * @returns {Promise<ImageData>} Canvas ImageData object
 */
export async function loadImageData(buffer, fileType = null) {
  // Auto-detect if not provided
  if (!fileType) {
    fileType = detectFileType(buffer);
  }
  
  if (!fileType) {
    throw new Error('Unknown file format');
  }
  
  // Handle TEX files natively
  if (fileType === 'tex') {
    return loadTEXAsImageData(buffer);
  }
  
  // Handle DDS files natively
  if (fileType === 'dds') {
    return loadDDSAsImageData(buffer);
  }
  
  // For standard formats (PNG, JPG, etc.), use browser's built-in decoder
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
 * Convert RGBA pixel data to data URL for display
 * @param {Uint8Array} pixels - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} Data URL with raw RGBA data
 */
export function rgbaToDataURL(pixels, width, height) {
  // Create a data URL with base64-encoded raw RGBA data
  // Format: data:image/rgba;width=W;height=H;base64,BASE64DATA
  const base64 = Buffer.from(pixels).toString('base64');
  return `data:image/rgba;width=${width};height=${height};base64,${base64}`;
}

/**
 * Convert ImageData to data URL for display (browser only)
 * @param {ImageData} imageData - Canvas ImageData
 * @returns {string} Data URL
 */
export function imageDataToDataURL(imageData) {
  // Check if we're in a browser environment
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }
  
  // Node.js environment - return raw RGBA data URL
  return rgbaToDataURL(imageData.data, imageData.width, imageData.height);
}

/**
 * Load TEX/DDS and return raw RGBA data (Node.js optimized)
 * @param {ArrayBuffer} buffer - The file buffer
 * @param {string} fileType - File type ('tex' or 'dds')
 * @returns {Object} { pixels: Uint8Array, width: number, height: number }
 */
export function loadTextureRGBA(buffer, fileType) {
  if (fileType === 'tex') {
    const tex = readTEX(buffer);
    const pixels = decompressTEX(tex);
    return { pixels, width: tex.width, height: tex.height };
  } else if (fileType === 'dds') {
    const dds = readDDS(buffer);
    const pixels = decompressDDS(dds);
    return { pixels, width: dds.width, height: dds.height };
  }
  throw new Error(`Unsupported file type: ${fileType}`);
}

/**
 * Load image file and return data URL for display
 * @param {ArrayBuffer} buffer - The file buffer
 * @param {string} [fileType] - Optional file type hint
 * @returns {Promise<string>} Data URL
 */
export async function loadImageAsDataURL(buffer, fileType = null) {
  const imageData = await loadImageData(buffer, fileType);
  return imageDataToDataURL(imageData);
}

// Export format-specific functions
export {
  // TEX format
  loadTEXAsImageData,
  readTEX,
  writeTEX,
  decompressTEX,
  TEXFormat,
  compressToBC3,
  
  // DDS format
  loadDDSAsImageData,
  readDDS,
  decompressDDS,
  writeDDS,
  compressToDDS
};
