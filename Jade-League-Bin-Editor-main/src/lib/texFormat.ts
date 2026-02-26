/**
 * League of Legends .tex file format handler
 * TypeScript port of Quartz-main/src/filetypes/texFormat.js
 */

export const TEXFormat = {
  ETC1: 1,
  ETC2_EAC: 2,
  ETC2: 3,
  DXT1: 10,
  DXT5: 12,
  BGRA8: 20
} as const;

export type TEXFormatValue = typeof TEXFormat[keyof typeof TEXFormat];

export interface TEXData {
  width: number;
  height: number;
  format: TEXFormatValue;
  mipmaps: boolean;
  data: Uint8Array[];
}

export function readTEX(buffer: ArrayBuffer): TEXData {
  const view = new DataView(buffer);
  let offset = 0;

  const signature = view.getUint32(offset, true);
  offset += 4;

  if (signature !== 0x00584554) {
    throw new Error(`Invalid .tex file signature: 0x${signature.toString(16)}`);
  }

  const width = view.getUint16(offset, true);
  offset += 2;
  const height = view.getUint16(offset, true);
  offset += 2;

  view.getUint8(offset++); // unknown1
  const format = view.getUint8(offset++) as TEXFormatValue;
  view.getUint8(offset++); // unknown2
  const mipmaps = view.getUint8(offset++) !== 0;

  const dataArray: Uint8Array[] = [];

  if (mipmaps && (format === TEXFormat.DXT1 || format === TEXFormat.DXT5 || format === TEXFormat.BGRA8)) {
    const maxDim = Math.max(width, height);
    const mipmapCount = Math.floor(Math.log2(maxDim)) + 1;

    let blockSize: number, bytesPerBlock: number;
    if (format === TEXFormat.DXT1) {
      blockSize = 4;
      bytesPerBlock = 8;
    } else if (format === TEXFormat.DXT5) {
      blockSize = 4;
      bytesPerBlock = 16;
    } else {
      blockSize = 1;
      bytesPerBlock = 4;
    }

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
    const remainingData = new Uint8Array(buffer, offset);
    dataArray.push(remainingData);
  }

  return { width, height, format, mipmaps, data: dataArray };
}

function decompressDXT1Block(
  blockData: Uint8Array,
  x: number, y: number,
  width: number, height: number,
  pixels: Uint8Array
): void {
  if (blockData.length < 8) return;
  const view = new DataView(blockData.buffer, blockData.byteOffset, 8);
  const color0 = view.getUint16(0, true);
  const color1 = view.getUint16(2, true);
  const bits = view.getUint32(4, true);

  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  const colors: [number, number, number, number][] = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    color0 > color1
      ? [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3), 255]
      : [Math.floor((r0 + r1) / 2), Math.floor((g0 + g1) / 2), Math.floor((b0 + b1) / 2), 255],
    color0 > color1
      ? [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3), 255]
      : [0, 0, 0, 0]
  ];

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

function decompressDXT5Block(
  blockData: Uint8Array,
  x: number, y: number,
  width: number, height: number,
  pixels: Uint8Array
): void {
  if (blockData.length < 16) return;
  const view = new DataView(blockData.buffer, blockData.byteOffset, 16);

  const alpha0 = view.getUint8(0);
  const alpha1 = view.getUint8(1);

  let alphaBits = 0n;
  for (let i = 0; i < 6; i++) {
    alphaBits |= BigInt(view.getUint8(2 + i)) << BigInt(i * 8);
  }

  const alphas: number[] = [alpha0, alpha1];
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

  const color0 = view.getUint16(8, true);
  const color1 = view.getUint16(10, true);
  const colorBits = view.getUint32(12, true);

  const r0 = ((color0 >> 11) & 0x1F) << 3;
  const g0 = ((color0 >> 5) & 0x3F) << 2;
  const b0 = (color0 & 0x1F) << 3;
  const r1 = ((color1 >> 11) & 0x1F) << 3;
  const g1 = ((color1 >> 5) & 0x3F) << 2;
  const b1 = (color1 & 0x1F) << 3;

  const colors: [number, number, number][] = [
    [r0, g0, b0],
    [r1, g1, b1],
    [Math.floor((r0 * 2 + r1) / 3), Math.floor((g0 * 2 + g1) / 3), Math.floor((b0 * 2 + b1) / 3)],
    [Math.floor((r0 + r1 * 2) / 3), Math.floor((g0 + g1 * 2) / 3), Math.floor((b0 + b1 * 2) / 3)]
  ];

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

export function decompressTEX(tex: TEXData): Uint8Array {
  const { width, height, format, mipmaps, data } = tex;
  const pixels = new Uint8Array(width * height * 4);
  const textureData = (mipmaps && data.length > 1) ? data[data.length - 1] : data[0];

  if (format === TEXFormat.BGRA8) {
    for (let i = 0; i < textureData.length; i += 4) {
      pixels[i] = textureData[i + 2];
      pixels[i + 1] = textureData[i + 1];
      pixels[i + 2] = textureData[i];
      pixels[i + 3] = textureData[i + 3];
    }
  } else if (format === TEXFormat.DXT1) {
    const blockSize = 8;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);
    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= textureData.length) {
          decompressDXT1Block(textureData.subarray(blockIdx, blockIdx + blockSize), bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else if (format === TEXFormat.DXT5) {
    const blockSize = 16;
    const blockWidth = Math.floor((width + 3) / 4);
    const blockHeight = Math.floor((height + 3) / 4);
    for (let by = 0; by < blockHeight; by++) {
      for (let bx = 0; bx < blockWidth; bx++) {
        const blockIdx = (by * blockWidth + bx) * blockSize;
        if (blockIdx + blockSize <= textureData.length) {
          decompressDXT5Block(textureData.subarray(blockIdx, blockIdx + blockSize), bx * 4, by * 4, width, height, pixels);
        }
      }
    }
  } else {
    throw new Error(`Unsupported texture format: ${format}`);
  }

  return pixels;
}

export function loadTEXAsImageData(buffer: ArrayBuffer): ImageData {
  const tex = readTEX(buffer);
  const pixels = decompressTEX(tex);
  return new ImageData(new Uint8ClampedArray(pixels), tex.width, tex.height);
}

/** Decode a .tex ArrayBuffer and render it to a canvas, returning a PNG data URL. */
export function texBufferToDataURL(buffer: ArrayBuffer): { dataURL: string; width: number; height: number; format: number } {
  const tex = readTEX(buffer);
  const pixels = decompressTEX(tex);
  const canvas = document.createElement('canvas');
  canvas.width = tex.width;
  canvas.height = tex.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = new ImageData(new Uint8ClampedArray(pixels), tex.width, tex.height);
  ctx.putImageData(imageData, 0, 0);
  return {
    dataURL: canvas.toDataURL('image/png'),
    width: tex.width,
    height: tex.height,
    format: tex.format,
  };
}

export function formatName(format: number): string {
  switch (format) {
    case TEXFormat.DXT1: return 'DXT1 (BC1)';
    case TEXFormat.DXT5: return 'DXT5 (BC3)';
    case TEXFormat.BGRA8: return 'BGRA8';
    case TEXFormat.ETC1: return 'ETC1';
    case TEXFormat.ETC2_EAC: return 'ETC2 EAC';
    case TEXFormat.ETC2: return 'ETC2';
    default: return `Unknown (${format})`;
  }
}
