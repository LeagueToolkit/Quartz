/**
 * DDS (DirectDraw Surface) file format handler
 * Supports DXT1, DXT5, and uncompressed formats
 */

// DXGI Format constants
export const DXGIFormat = {
  BC1_UNORM: 71,  // DXT1
  BC3_UNORM: 77,  // DXT5
};

// DDS Pixel Format flags
const DDPF_ALPHAPIXELS = 0x1;
const DDPF_ALPHA = 0x2;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDPF_RGBA = 0x41;

/**
 * Read a DDS file from ArrayBuffer
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {Object} DDS data object
 */
export function readDDS(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  // Read magic
  const magic = String.fromCharCode(
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++)
  );

  if (magic !== 'DDS ') {
    throw new Error('Not a valid DDS file');
  }

  // Read DDS_HEADER (124 bytes)
  const headerSize = view.getUint32(offset, true);
  offset += 4;
  const flags = view.getUint32(offset, true);
  offset += 4;
  const height = view.getUint32(offset, true);
  offset += 4;
  const width = view.getUint32(offset, true);
  offset += 4;
  const pitchOrLinearSize = view.getUint32(offset, true);
  offset += 4;
  const depth = view.getUint32(offset, true);
  offset += 4;
  const mipmapCount = view.getUint32(offset, true);
  offset += 4;

  // Skip reserved (44 bytes)
  offset += 44;

  // Read DDS_PIXELFORMAT (32 bytes)
  const pfSize = view.getUint32(offset, true);
  offset += 4;
  const pfFlags = view.getUint32(offset, true);
  offset += 4;
  const fourCC = String.fromCharCode(
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++)
  );

  // Skip rest of pixel format (20 bytes)
  offset += 20;

  // Skip caps (16 bytes) and reserved2 (4 bytes)
  offset += 20;

  let format = null;
  let isDX10 = false;

  // Determine format
  if (fourCC === 'DXT1') {
    format = 'DXT1';
  } else if (fourCC === 'DXT5') {
    format = 'DXT5';
  } else if (fourCC === 'DX10') {
    isDX10 = true;
    // Read DX10 header
    const dxgiFormat = view.getUint32(offset, true);
    offset += 4;
    
    if (dxgiFormat === DXGIFormat.BC3_UNORM) {
      format = 'DXT5';
    } else if (dxgiFormat === DXGIFormat.BC1_UNORM) {
      format = 'DXT1';
    } else {
      throw new Error(`Unsupported DXGI format: ${dxgiFormat}`);
    }
    
    // Skip rest of DX10 header (12 bytes)
    offset += 12;
  } else if (pfFlags & DDPF_RGB) {
    // Uncompressed BGRA8 format
    format = 'BGRA8';
  } else {
    throw new Error(`Unsupported DDS format: fourCC=${fourCC}, flags=0x${pfFlags.toString(16)}`);
  }

  // Read compressed texture data
  const compressedData = new Uint8Array(buffer, offset);

  return {
    width,
    height,
    format,
    mipmapCount,
    data: compressedData
  };
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
 * Decompress DDS data to RGBA pixel array
 * @param {Object} dds - DDS data object from readDDS
 * @returns {Uint8Array} RGBA pixel data
 */
export function decompressDDS(dds) {
  const { width, height, format, data } = dds;
  const pixels = new Uint8Array(width * height * 4);

  if (format === 'DXT1') {
    // DXT1: 8 bytes per 4x4 block
    const blockSize = 8;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= data.length) {
          const blockData = data.subarray(blockIdx, blockIdx + blockSize);
          decompressDXT1Block(blockData, bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else if (format === 'DXT5') {
    // DXT5: 16 bytes per 4x4 block
    const blockSize = 16;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);

    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= data.length) {
          const blockData = data.subarray(blockIdx, blockIdx + blockSize);
          decompressDXT5Block(blockData, bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else if (format === 'BGRA8') {
    // Uncompressed BGRA8 - convert to RGBA
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      pixels[idx] = data[idx + 2];     // R from B
      pixels[idx + 1] = data[idx + 1]; // G stays
      pixels[idx + 2] = data[idx];     // B from R
      pixels[idx + 3] = data[idx + 3]; // A stays
    }
  } else {
    throw new Error(`Unsupported DDS format: ${format}`);
  }

  return pixels;
}

/**
 * Load DDS file and return ImageData
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {ImageData} Canvas ImageData object
 */
export function loadDDSAsImageData(buffer) {
  const dds = readDDS(buffer);
  const pixels = decompressDDS(dds);
  
  // Create ImageData
  const imageData = new ImageData(
    new Uint8ClampedArray(pixels),
    dds.width,
    dds.height
  );
  
  return imageData;
}

/**
 * Write DDS file from RGBA pixel data
 * @param {Object} dds - DDS data object with width, height, format, data
 * @returns {ArrayBuffer} DDS file buffer
 */
export function writeDDS(dds) {
  const { width, height, format, data } = dds;
  
  // Calculate sizes
  let dataSize;
  if (format === 'BGRA8') {
    dataSize = width * height * 4;
  } else {
    const blockSize = format === 'DXT1' ? 8 : 16;
    const blockWidth = Math.ceil(width / 4);
    const blockHeight = Math.ceil(height / 4);
    dataSize = blockWidth * blockHeight * blockSize;
  }
  
  // Total size: 4 (magic) + 124 (header) + 32 (pixel format) + 20 (caps) + data
  const totalSize = 4 + 124 + 32 + 20 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Write magic "DDS "
  view.setUint8(offset++, 0x44); // D
  view.setUint8(offset++, 0x44); // D
  view.setUint8(offset++, 0x53); // S
  view.setUint8(offset++, 0x20); // space

  // Write DDS_HEADER
  view.setUint32(offset, 124, true); offset += 4; // header size
  view.setUint32(offset, 0x1007, true); offset += 4; // flags (CAPS | HEIGHT | WIDTH | PIXELFORMAT | LINEARSIZE | MIPMAPCOUNT)
  view.setUint32(offset, height, true); offset += 4; // height
  view.setUint32(offset, width, true); offset += 4; // width
  view.setUint32(offset, dataSize, true); offset += 4; // pitch or linear size
  view.setUint32(offset, 0, true); offset += 4; // depth
  view.setUint32(offset, 1, true); offset += 4; // mipmap count

  // Skip reserved (44 bytes)
  offset += 44;

  // Write DDS_PIXELFORMAT
  view.setUint32(offset, 32, true); offset += 4; // pixel format size
  
  if (format === 'BGRA8') {
    // Uncompressed RGBA format
    view.setUint32(offset, 0x41, true); offset += 4; // flags (RGBA)
    view.setUint32(offset, 0, true); offset += 4; // fourCC (none)
    view.setUint32(offset, 32, true); offset += 4; // RGB bit count
    view.setUint32(offset, 0x00FF0000, true); offset += 4; // R mask
    view.setUint32(offset, 0x0000FF00, true); offset += 4; // G mask
    view.setUint32(offset, 0x000000FF, true); offset += 4; // B mask
    view.setUint32(offset, 0xFF000000, true); offset += 4; // A mask
  } else {
    // Compressed format
    view.setUint32(offset, 0x4, true); offset += 4; // flags (FOURCC)
    
    // Write fourCC
    const fourCC = format === 'DXT1' ? 'DXT1' : 'DXT5';
    view.setUint8(offset++, fourCC.charCodeAt(0));
    view.setUint8(offset++, fourCC.charCodeAt(1));
    view.setUint8(offset++, fourCC.charCodeAt(2));
    view.setUint8(offset++, fourCC.charCodeAt(3));

    // Skip rest of pixel format (20 bytes)
    offset += 20;
  }

  // Write caps (16 bytes)
  view.setUint32(offset, 0x1000, true); offset += 4; // DDSCAPS_TEXTURE
  view.setUint32(offset, 0, true); offset += 4;
  view.setUint32(offset, 0, true); offset += 4;
  view.setUint32(offset, 0, true); offset += 4;

  // Write reserved2 (4 bytes)
  view.setUint32(offset, 0, true); offset += 4;

  // Write data
  const dataView = new Uint8Array(buffer, offset);
  if (format === 'BGRA8') {
    // Convert RGBA to BGRA
    const rgba = new Uint8Array(data);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      dataView[idx] = rgba[idx + 2];     // B from R
      dataView[idx + 1] = rgba[idx + 1]; // G stays
      dataView[idx + 2] = rgba[idx];     // R from B
      dataView[idx + 3] = rgba[idx + 3]; // A stays
    }
  } else {
    dataView.set(new Uint8Array(data));
  }

  return buffer;
}

/**
 * Compress RGBA pixels to DXT5 block
 */
function compressDXT5Block(pixels, x, y, width, height) {
  const block = new Uint8Array(16);
  
  // Extract 4x4 block
  const blockRgba = [];
  const alphas = [];
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const imgX = x + px;
      const imgY = y + py;
      
      if (imgX < width && imgY < height) {
        const pixelIdx = (imgY * width + imgX) * 4;
        blockRgba.push([
          pixels[pixelIdx],
          pixels[pixelIdx + 1],
          pixels[pixelIdx + 2],
          pixels[pixelIdx + 3]
        ]);
        alphas.push(pixels[pixelIdx + 3]);
      } else {
        blockRgba.push([0, 0, 0, 0]);
        alphas.push(0);
      }
    }
  }

  // Compress alpha
  let alpha0 = alphas[0];
  let alpha1 = alphas[0];
  for (let i = 1; i < 16; i++) {
    alpha0 = Math.min(alpha0, alphas[i]);
    alpha1 = Math.max(alpha1, alphas[i]);
  }
  
  block[0] = alpha0;
  block[1] = alpha1;
  
  // Calculate alpha palette
  const alphaPalette = [alpha0, alpha1];
  if (alpha0 > alpha1) {
    for (let i = 1; i < 7; i++) {
      alphaPalette.push(Math.floor(((7 - i) * alpha0 + i * alpha1) / 7));
    }
  } else {
    for (let i = 1; i < 5; i++) {
      alphaPalette.push(Math.floor(((5 - i) * alpha0 + i * alpha1) / 5));
    }
    alphaPalette.push(0, 255);
  }
  
  // Encode alpha indices
  let alphaBits = 0n;
  for (let i = 0; i < 16; i++) {
    let bestIdx = 0;
    let bestDiff = Math.abs(alphas[i] - alphaPalette[0]);
    for (let j = 1; j < 8; j++) {
      const diff = Math.abs(alphas[i] - alphaPalette[j]);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }
    alphaBits |= BigInt(bestIdx & 7) << BigInt(i * 3);
  }
  
  for (let i = 0; i < 6; i++) {
    block[2 + i] = Number((alphaBits >> BigInt(i * 8)) & 0xFFn);
  }

  // Compress color - find min/max by luminance (like C++ version)
  let minLum = 999999;
  let maxLum = 0;
  let color0Rgb = [0, 0, 0];
  let color1Rgb = [0, 0, 0];
  
  for (let i = 0; i < 16; i++) {
    const lum = blockRgba[i][0] * 2 + blockRgba[i][1] * 4 + blockRgba[i][2];
    if (lum < minLum) {
      minLum = lum;
      color0Rgb = [...blockRgba[i]];
    }
    if (lum > maxLum) {
      maxLum = lum;
      color1Rgb = [...blockRgba[i]];
    }
  }

  // Convert to 565
  const color0 = ((color0Rgb[0] >> 3) << 11) | ((color0Rgb[1] >> 2) << 5) | (color0Rgb[2] >> 3);
  const color1 = ((color1Rgb[0] >> 3) << 11) | ((color1Rgb[1] >> 2) << 5) | (color1Rgb[2] >> 3);
  
  block[8] = color0 & 0xFF;
  block[9] = (color0 >> 8) & 0xFF;
  block[10] = color1 & 0xFF;
  block[11] = (color1 >> 8) & 0xFF;

  // Reconstruct colors from 565
  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  // Color palette
  const colorPalette = [
    [r0, g0, b0],
    [r1, g1, b1],
    [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3)],
    [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3)]
  ];

  // Encode color indices
  let colorBits = 0;
  for (let i = 0; i < 16; i++) {
    let bestIdx = 0;
    let bestDiff = 999999;
    for (let j = 0; j < 4; j++) {
      const dr = blockRgba[i][0] - colorPalette[j][0];
      const dg = blockRgba[i][1] - colorPalette[j][1];
      const db = blockRgba[i][2] - colorPalette[j][2];
      const diff = dr * dr + dg * dg + db * db;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }
    colorBits |= (bestIdx << (i * 2));
  }
  
  block[12] = colorBits & 0xFF;
  block[13] = (colorBits >> 8) & 0xFF;
  block[14] = (colorBits >> 16) & 0xFF;
  block[15] = (colorBits >> 24) & 0xFF;

  return block;
}

/**
 * Compress RGBA pixels to DDS format
 * @param {Uint8Array} pixels - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string} format - Compression format ('DXT5' or 'DXT1')
 * @returns {Uint8Array} Compressed DDS data
 */
export function compressToDDS(pixels, width, height, format = 'DXT5') {
  const blockSize = format === 'DXT1' ? 8 : 16;
  const blockWidth = Math.ceil(width / 4);
  const blockHeight = Math.ceil(height / 4);
  const dataSize = blockWidth * blockHeight * blockSize;
  
  const compressedData = new Uint8Array(dataSize);
  let offset = 0;

  for (let by = 0; by < blockHeight; by++) {
    for (let bx = 0; bx < blockWidth; bx++) {
      const block = format === 'DXT1' 
        ? compressDXT1Block(pixels, bx * 4, by * 4, width, height)
        : compressDXT5Block(pixels, bx * 4, by * 4, width, height);
      
      if (offset + blockSize <= compressedData.length) {
        compressedData.set(block, offset);
        offset += blockSize;
      }
    }
  }

  return compressedData;
}

/**
 * Compress RGBA pixels to DXT1 block
 */
function compressDXT1Block(pixels, x, y, width, height) {
  const block = new Uint8Array(8);
  
  // Extract 4x4 block
  const blockRgba = [];
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      const imgX = x + px;
      const imgY = y + py;
      
      if (imgX < width && imgY < height) {
        const pixelIdx = (imgY * width + imgX) * 4;
        blockRgba.push([
          pixels[pixelIdx],
          pixels[pixelIdx + 1],
          pixels[pixelIdx + 2]
        ]);
      } else {
        blockRgba.push([0, 0, 0]);
      }
    }
  }

  // Find min/max by luminance
  let minLum = 999999;
  let maxLum = 0;
  let color0Rgb = [0, 0, 0];
  let color1Rgb = [0, 0, 0];
  
  for (let i = 0; i < 16; i++) {
    const lum = blockRgba[i][0] * 2 + blockRgba[i][1] * 4 + blockRgba[i][2];
    if (lum < minLum) {
      minLum = lum;
      color0Rgb = [...blockRgba[i]];
    }
    if (lum > maxLum) {
      maxLum = lum;
      color1Rgb = [...blockRgba[i]];
    }
  }

  // Convert to 565
  let color0 = ((color1Rgb[0] >> 3) << 11) | ((color1Rgb[1] >> 2) << 5) | (color1Rgb[2] >> 3);
  let color1 = ((color0Rgb[0] >> 3) << 11) | ((color0Rgb[1] >> 2) << 5) | (color0Rgb[2] >> 3);
  
  // Ensure color0 > color1 for DXT1 (4-color mode)
  if (color0 < color1) {
    const temp = color0;
    color0 = color1;
    color1 = temp;
    const tempRgb = color0Rgb;
    color0Rgb = color1Rgb;
    color1Rgb = tempRgb;
  }
  
  block[0] = color0 & 0xFF;
  block[1] = (color0 >> 8) & 0xFF;
  block[2] = color1 & 0xFF;
  block[3] = (color1 >> 8) & 0xFF;

  // Reconstruct colors from 565
  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  // Color palette
  const colorPalette = [
    [r0, g0, b0],
    [r1, g1, b1],
    [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3)],
    [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3)]
  ];

  // Encode color indices
  let colorBits = 0;
  for (let i = 0; i < 16; i++) {
    let bestIdx = 0;
    let bestDiff = 999999;
    for (let j = 0; j < 4; j++) {
      const dr = blockRgba[i][0] - colorPalette[j][0];
      const dg = blockRgba[i][1] - colorPalette[j][1];
      const db = blockRgba[i][2] - colorPalette[j][2];
      const diff = dr * dr + dg * dg + db * db;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }
    colorBits |= (bestIdx << (i * 2));
  }
  
  block[4] = colorBits & 0xFF;
  block[5] = (colorBits >> 8) & 0xFF;
  block[6] = (colorBits >> 16) & 0xFF;
  block[7] = (colorBits >> 24) & 0xFF;

  return block;
}
