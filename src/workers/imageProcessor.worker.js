/**
 * Web Worker for image processing
 * Handles HSL adjustments off the main thread
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

self.onmessage = (event) => {
  const { pixelData, width, height, targetHue, saturationBoost, lightnessAdjust, id } = event.data;

  const pixels = new Uint8ClampedArray(pixelData);
  const lightnessAdjustment = lightnessAdjust / 100;
  const saturationMultiplier = saturationBoost / 100; // 0-100 maps to 0-1

  // Process each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels
    if (a === 0) continue;

    // Convert to HSL
    const hsl = rgbToHsl(r, g, b);
    
    // Apply adjustments
    let newHue = targetHue; // Already in degrees (0-360)
    let newSaturation = Math.max(0, Math.min(1, saturationMultiplier)); // Direct value 0-1
    let newLightness = Math.max(0, Math.min(1, (hsl.l / 100) + lightnessAdjustment));

    // Convert back to RGB
    const rgb = hslToRgb(newHue, newSaturation * 100, newLightness * 100);

    pixels[i] = Math.ceil(Math.max(0, Math.min(255, rgb.r)));
    pixels[i + 1] = Math.ceil(Math.max(0, Math.min(255, rgb.g)));
    pixels[i + 2] = Math.ceil(Math.max(0, Math.min(255, rgb.b)));
  }

  self.postMessage({ pixelData: pixels.buffer, width, height, id }, [pixels.buffer]);
};
