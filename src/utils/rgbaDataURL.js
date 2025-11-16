/**
 * Utility for handling raw RGBA data URLs
 * Converts custom RGBA data URLs to displayable canvas data URLs
 */

/**
 * Check if a data URL is a raw RGBA format
 * @param {string} dataURL - The data URL to check
 * @returns {boolean} True if it's a raw RGBA data URL
 */
export function isRGBADataURL(dataURL) {
  return dataURL && dataURL.startsWith('data:image/rgba;');
}

/**
 * Parse raw RGBA data URL
 * @param {string} dataURL - Raw RGBA data URL
 * @returns {Object} { pixels: Uint8ClampedArray, width: number, height: number }
 */
export function parseRGBADataURL(dataURL) {
  // Format: data:image/rgba;width=W;height=H;base64,BASE64DATA
  const match = dataURL.match(/data:image\/rgba;width=(\d+);height=(\d+);base64,(.+)/);
  if (!match) {
    throw new Error('Invalid RGBA data URL format');
  }

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  const base64Data = match[3];

  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const pixels = new Uint8ClampedArray(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pixels[i] = binaryString.charCodeAt(i);
  }

  return { pixels, width, height };
}

/**
 * Convert raw RGBA data URL to canvas data URL for display
 * @param {string} rgbaDataURL - Raw RGBA data URL
 * @returns {string} Canvas PNG data URL
 */
export function rgbaDataURLToCanvas(rgbaDataURL) {
  const { pixels, width, height } = parseRGBADataURL(rgbaDataURL);

  // Create canvas and draw pixels
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const imageData = new ImageData(pixels, width, height);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

/**
 * Process data URL - converts RGBA format to canvas if needed
 * @param {string} dataURL - Any data URL
 * @returns {string} Displayable data URL
 */
export function processDataURL(dataURL) {
  if (isRGBADataURL(dataURL)) {
    return rgbaDataURLToCanvas(dataURL);
  }
  return dataURL;
}

/**
 * Set image src with automatic RGBA data URL conversion
 * @param {HTMLImageElement} imgElement - Image element
 * @param {string} dataURL - Data URL (any format)
 */
export function setImageSrc(imgElement, dataURL) {
  imgElement.src = processDataURL(dataURL);
}
