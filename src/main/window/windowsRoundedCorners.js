/**
 * windowsRoundedCorners.js — apply native Windows 11 rounded corners to an
 * Electron BrowserWindow via DwmSetWindowAttribute.
 *
 * Why this exists: frame:false windows skip the standard non-client area, so
 * Windows 11's automatic DWM rounding doesn't kick in. The DWM API still
 * accepts our explicit DWMWCP_ROUND preference, which renders the corners
 * natively (with the proper edge bleed + composition).
 */

let koffi = null;
let dwmapi = null;
let DwmSetWindowAttribute = null;

const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
// DWMWCP values
const DWMWCP_DEFAULT      = 0;
const DWMWCP_DONOTROUND   = 1;
const DWMWCP_ROUND        = 2;  // ← what we want for Win11 rounded
const DWMWCP_ROUNDSMALL   = 3;

function ensureLoaded() {
  if (DwmSetWindowAttribute) return true;
  if (process.platform !== 'win32') return false;
  try {
    // Lazy-require so non-Windows / dev environments without koffi don't break.
    koffi = koffi || require('koffi');
    if (!dwmapi) {
      dwmapi = koffi.load('dwmapi.dll');
    }
    // HRESULT DwmSetWindowAttribute(HWND hwnd, DWORD attr, LPCVOID pvAttr, DWORD cbAttr)
    DwmSetWindowAttribute = dwmapi.func(
      '__stdcall',
      'DwmSetWindowAttribute',
      'int32',
      ['void *', 'uint32', 'void *', 'uint32']
    );
    return true;
  } catch (e) {
    console.warn('[roundedCorners] koffi/dwmapi load failed:', e.message);
    return false;
  }
}

/**
 * Apply rounded corners to a BrowserWindow's HWND. Safe to call multiple times.
 * Logs and returns false on failure — never throws.
 */
function applyRoundedCorners(browserWindow) {
  if (process.platform !== 'win32') return false;
  if (!browserWindow || browserWindow.isDestroyed()) return false;
  if (!ensureLoaded()) return false;

  try {
    const handleBuffer = browserWindow.getNativeWindowHandle();
    // Decode HWND from the buffer: 8 bytes on x64.
    let hwnd;
    if (handleBuffer.length === 8) {
      // Use BigInt to keep the full 64-bit value, then convert to a Number
      // koffi can accept via its pointer-as-uint shim.
      const value = handleBuffer.readBigUInt64LE(0);
      hwnd = value;
    } else {
      hwnd = handleBuffer.readUInt32LE(0);
    }

    // Allocate a 4-byte DWORD with the corner preference.
    const prefBuf = Buffer.alloc(4);
    prefBuf.writeUInt32LE(DWMWCP_ROUND, 0);

    const hr = DwmSetWindowAttribute(
      // koffi accepts a Buffer for `void *` parameters; build one carrying
      // the HWND as a 64-bit little-endian pointer.
      bufferFromPointer(hwnd),
      DWMWA_WINDOW_CORNER_PREFERENCE,
      prefBuf,
      prefBuf.length
    );

    if (hr !== 0) {
      console.warn(`[roundedCorners] DwmSetWindowAttribute returned HRESULT 0x${hr.toString(16)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[roundedCorners] apply failed:', e.message);
    return false;
  }
}

function bufferFromPointer(value) {
  const buf = Buffer.alloc(8);
  if (typeof value === 'bigint') {
    buf.writeBigUInt64LE(value, 0);
  } else {
    buf.writeBigUInt64LE(BigInt(value), 0);
  }
  return buf;
}

module.exports = {
  applyRoundedCorners,
  DWMWCP_DEFAULT,
  DWMWCP_DONOTROUND,
  DWMWCP_ROUND,
  DWMWCP_ROUNDSMALL,
};
