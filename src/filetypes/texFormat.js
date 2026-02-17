/**
 * League of Legends .tex file format handler
 * Translated from Python GIMP plugin to JavaScript
 */

// TEX Format enumeration
export const TEXFormat = {
  ETC1: 1,
  ETC2_EAC: 2,
  ETC2: 3,
  DXT1: 10,
  DXT5: 12,
  BGRA8: 20
};

/**
 * Read a .tex file from ArrayBuffer
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {Object} TEX data object with width, height, format, and pixel data
 */
export function readTEX(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  // Read header
  const signature = view.getUint32(offset, true);
  offset += 4;
  
  if (signature !== 0x00584554) { // "TEX\0"
    throw new Error(`Invalid .tex file signature: 0x${signature.toString(16)}`);
  }

  const width = view.getUint16(offset, true);
  offset += 2;
  const height = view.getUint16(offset, true);
  offset += 2;
  
  view.getUint8(offset++); // unknown1
  const format = view.getUint8(offset++);
  view.getUint8(offset++); // unknown2
  const mipmaps = view.getUint8(offset++) !== 0;

  // Read texture data with mipmap support
  const dataArray = [];
  
  if (mipmaps && (format === TEXFormat.DXT1 || format === TEXFormat.DXT5 || format === TEXFormat.BGRA8)) {
    // Calculate mipmap count (number of times we can divide by 2 until we reach 1)
    const maxDim = Math.max(width, height);
    const mipmapCount = Math.floor(Math.log2(maxDim)) + 1;
    
    // Determine block size and bytes per block
    let blockSize, bytesPerBlock;
    if (format === TEXFormat.DXT1) {
      blockSize = 4;
      bytesPerBlock = 8;
    } else if (format === TEXFormat.DXT5) {
      blockSize = 4;
      bytesPerBlock = 16;
    } else { // BGRA8
      blockSize = 1;
      bytesPerBlock = 4;
    }
    
    // Read all mipmaps from smallest to largest (reversed order)
    for (let i = mipmapCount - 1; i >= 0; i--) {
      const currentWidth = Math.max(Math.floor(width / (1 << i)), 1);
      const currentHeight = Math.max(Math.floor(height / (1 << i)), 1);
      const blockWidth = Math.floor((currentWidth + blockSize - 1) / blockSize);
      const blockHeight = Math.floor((currentHeight + blockSize - 1) / blockSize);
      const currentSize = bytesPerBlock * blockWidth * blockHeight;
      
      const dataChunk = new Uint8Array(buffer, offset, currentSize);
      dataArray.push(dataChunk);
      offset += currentSize;
    }
  } else {
    // No mipmaps or unsupported format - read all remaining data
    const remainingData = new Uint8Array(buffer, offset);
    dataArray.push(remainingData);
  }

  return {
    width,
    height,
    format,
    mipmaps,
    data: dataArray
  };
}

/**
 * Write a .tex file to ArrayBuffer
 * @param {Object} tex - TEX data object
 * @returns {ArrayBuffer} The file buffer
 */
export function writeTEX(tex) {
  const headerSize = 12;
  
  // Calculate total data size
  let dataSize = 0;
  if (Array.isArray(tex.data)) {
    for (const chunk of tex.data) {
      dataSize += chunk.length;
    }
  } else {
    dataSize = tex.data.length;
  }
  
  const totalSize = headerSize + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Write header
  view.setUint32(offset, 0x00584554, true); // "TEX\0"
  offset += 4;
  view.setUint16(offset, tex.width, true);
  offset += 2;
  view.setUint16(offset, tex.height, true);
  offset += 2;
  view.setUint8(offset++, 1); // unknown1
  view.setUint8(offset++, tex.format);
  view.setUint8(offset++, 0); // unknown2
  view.setUint8(offset++, tex.mipmaps ? 1 : 0);

  // Write data
  if (Array.isArray(tex.data)) {
    for (const chunk of tex.data) {
      const dataArray = new Uint8Array(buffer, offset, chunk.length);
      dataArray.set(chunk);
      offset += chunk.length;
    }
  } else {
    const dataArray = new Uint8Array(buffer, offset);
    dataArray.set(tex.data);
  }

  return buffer;
}

/**
 * Decompress DXT1 block (4x4 pixels, 8 bytes)
 */
function decompressDXT1Block(blockData, x, y, width, height, pixels) {
  if (blockData.length < 8) return;

  const view = new DataView(blockData.buffer, blockData.byteOffset, 8);
  const color0 = view.getUint16(0, true);
  const color1 = view.getUint16(2, true);
  const bits = view.getUint32(4, true);

  // Convert 565 RGB to 888 RGB
  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  // Interpolate colors
  const colors = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    color0 > color1 
      ? [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3), 255]
      : [Math.floor((r0 + r1) / 2), Math.floor((g0 + g1) / 2), Math.floor((b0 + b1) / 2), 255],
    color0 > color1
      ? [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3), 255]
      : [0, 0, 0, 0]
  ];

  // Decode pixels
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (x + px < width && y + py < height) {
        const idx = py * 4 + px;
        const colorIdx = (bits >> (idx * 2)) & 3;
        const pixelIdx = ((y + py) * width + (x + px)) * 4;
        const color = colors[colorIdx];
        pixels[pixelIdx] = color[0];
        pixels[pixelIdx + 1] = color[1];
        pixels[pixelIdx + 2] = color[2];
        pixels[pixelIdx + 3] = color[3];
      }
    }
  }
}

/**
 * Decompress DXT5 block (4x4 pixels, 16 bytes)
 */
function decompressDXT5Block(blockData, x, y, width, height, pixels) {
  if (blockData.length < 16) return;

  const view = new DataView(blockData.buffer, blockData.byteOffset, 16);
  
  // Read alpha values
  const alpha0 = view.getUint8(0);
  const alpha1 = view.getUint8(1);
  
  // Read alpha bits (48 bits = 6 bytes)
  let alphaBits = 0n;
  for (let i = 0; i < 6; i++) {
    alphaBits |= BigInt(view.getUint8(2 + i)) << BigInt(i * 8);
  }

  // Calculate alpha palette
  const alphas = [alpha0, alpha1];
  if (alpha0 > alpha1) {
    for (let i = 1; i < 7; i++) {
      alphas.push(Math.floor(((7 - i) * alpha0 + i * alpha1) / 7));
    }
  } else {
    for (let i = 1; i < 5; i++) {
      alphas.push(Math.floor(((5 - i) * alpha0 + i * alpha1) / 5));
    }
    alphas.push(0, 255);
  }

  // Read color endpoints
  const color0 = view.getUint16(8, true);
  const color1 = view.getUint16(10, true);
  const colorBits = view.getUint32(12, true);

  // Convert 565 RGB to 888 RGB
  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  // Interpolate colors
  const colors = [
    [r0, g0, b0],
    [r1, g1, b1],
    [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3)],
    [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3)]
  ];

  // Decode pixels
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (x + px < width && y + py < height) {
        const idx = py * 4 + px;
        const alphaIdx = Number((alphaBits >> BigInt(idx * 3)) & 7n);
        const colorIdx = (colorBits >> (idx * 2)) & 3;
        const pixelIdx = ((y + py) * width + (x + px)) * 4;
        const color = colors[colorIdx];
        pixels[pixelIdx] = color[0];
        pixels[pixelIdx + 1] = color[1];
        pixels[pixelIdx + 2] = color[2];
        pixels[pixelIdx + 3] = alphas[alphaIdx];
      }
    }
  }
}

/**
 * Decompress TEX data to RGBA pixel array
 * @param {Object} tex - TEX data object from readTEX
 * @returns {Uint8Array} RGBA pixel data
 */
export function decompressTEX(tex) {
  const { width, height, format, mipmaps, data } = tex;
  const pixels = new Uint8Array(width * height * 4);

  // When mipmaps exist, data[0] is the smallest mipmap, data[data.length-1] is the largest (full resolution)
  // When no mipmaps, data[0] is the only data
  const textureData = (mipmaps && data.length > 1) ? data[data.length - 1] : data[0];

  if (format === TEXFormat.BGRA8) {
    // BGRA8 is uncompressed - just copy with byte swap
    for (let i = 0; i < textureData.length; i += 4) {
      pixels[i] = textureData[i + 2];     // R
      pixels[i + 1] = textureData[i + 1]; // G
      pixels[i + 2] = textureData[i];     // B
      pixels[i + 3] = textureData[i + 3]; // A
    }
  } else if (format === TEXFormat.DXT1) {
    // DXT1: 8 bytes per 4x4 block
    const blockSize = 8;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= textureData.length) {
          const blockData = textureData.subarray(blockIdx, blockIdx + blockSize);
          decompressDXT1Block(blockData, bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else if (format === TEXFormat.DXT5) {
    // DXT5: 16 bytes per 4x4 block
    const blockSize = 16;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= textureData.length) {
          const blockData = textureData.subarray(blockIdx, blockIdx + blockSize);
          decompressDXT5Block(blockData, bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else {
    throw new Error(`Unsupported texture format: ${format}`);
  }

  return pixels;
}

/**
 * Load TEX file and return ImageData
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {ImageData} Canvas ImageData object
 */
export function loadTEXAsImageData(buffer) {
  const tex = readTEX(buffer);
  const pixels = decompressTEX(tex);
  
  // Create ImageData
  const imageData = new ImageData(
    new Uint8ClampedArray(pixels),
    tex.width,
    tex.height
  );
  
  return imageData;
}

/**
 * Compress RGBA pixels to DXT5 block (BC3)
 */
function compressDXT5Block(pixels, x, y, width, height) {
  const block = new Uint8Array(16);
  
  // Extract 4x4 pixels
  const pixelData = [];
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const px2 = Math.min(x + px, width - 1);
      const py2 = Math.min(y + py, height - 1);
      const idx = (py2 * width + px2) * 4;
      pixelData.push({
        r: pixels[idx],
        g: pixels[idx + 1],
        b: pixels[idx + 2],
        a: pixels[idx + 3]
      });
    }
  }

  // Compress alpha
  const alphas = pixelData.map(p => p.a);
  const minAlpha = Math.min(...alphas);
  const maxAlpha = Math.max(...alphas);
  
  block[0] = maxAlpha;
  block[1] = minAlpha;
  
  // Encode alpha indices (3 bits per pixel)
  let alphaBits = 0n;
  for (let i = 0; i < 16; i++) {
    let alphaIdx = 0;
    if (maxAlpha > minAlpha) {
      alphaIdx = Math.round(((alphas[i] - minAlpha) / (maxAlpha - minAlpha)) * 7);
    }
    alphaBits |= BigInt(alphaIdx & 7) << BigInt(i * 3);
  }
  
  for (let i = 0; i < 6; i++) {
    block[2 + i] = Number((alphaBits >> BigInt(i * 8)) & 0xFFn);
  }

  // Compress color (DXT1-style)
  const colors = pixelData.map(p => ({ r: p.r, g: p.g, b: p.b }));
  
  // Find min/max colors
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const c of colors) {
    minR = Math.min(minR, c.r);
    maxR = Math.max(maxR, c.r);
    minG = Math.min(minG, c.g);
    maxG = Math.max(maxG, c.g);
    minB = Math.min(minB, c.b);
    maxB = Math.max(maxB, c.b);
  }

  // Convert to 565
  const color0 = ((maxR >> 3) << 11) | ((maxG >> 2) << 5) | (maxB >> 3);
  const color1 = ((minR >> 3) << 11) | ((minG >> 2) << 5) | (minB >> 3);
  
  block[8] = color0 & 0xFF;
  block[9] = (color0 >> 8) & 0xFF;
  block[10] = color1 & 0xFF;
  block[11] = (color1 >> 8) & 0xFF;

  // Encode color indices
  let colorBits = 0;
  for (let i = 0; i < 16; i++) {
    const c = colors[i];
    let colorIdx = 0;
    
    // Simple nearest color
    const dist0 = Math.abs(c.r - maxR) + Math.abs(c.g - maxG) + Math.abs(c.b - maxB);
    const dist1 = Math.abs(c.r - minR) + Math.abs(c.g - minG) + Math.abs(c.b - minB);
    
    if (dist1 < dist0) colorIdx = 1;
    
    colorBits |= (colorIdx & 3) << (i * 2);
  }
  
  block[12] = colorBits & 0xFF;
  block[13] = (colorBits >> 8) & 0xFF;
  block[14] = (colorBits >> 16) & 0xFF;
  block[15] = (colorBits >> 24) & 0xFF;

  return block;
}

/**
 * Compress RGBA pixels to DXT5 (BC3) format
 * @param {Uint8Array} pixels - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8Array} Compressed DXT5 data
 */
export function compressToBC3(pixels, width, height) {
  const blockSize = 16; // DXT5
  const blockWidth = Math.ceil(width / 4);
  const blockHeight = Math.ceil(height / 4);
  const dataSize = blockWidth * blockHeight * blockSize;
  
  const compressedData = new Uint8Array(dataSize);
  let offset = 0;

  for (let by = 0; by < blockHeight; by++) {
    for (let bx = 0; bx < blockWidth; bx++) {
      const block = compressDXT5Block(pixels, bx * 4, by * 4, width, height);
      compressedData.set(block, offset);
      offset += blockSize;
    }
  }

  return compressedData;
}
