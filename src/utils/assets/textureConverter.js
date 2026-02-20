// Texture loading utilities - Browser-safe imports
import { loadTextureRGBA, rgbaToDataURL, detectFileType } from '../../filetypes/index.js';

let fs, path, os, childProcess, exec, crypto;
let ipcRenderer = null;

// Safe accessor for Node/Electron require without triggering bundlers
function getNodeRequire() {
  try {
    // Node context (main/preload/tests)
    if (typeof window === 'undefined') {
      // eslint-disable-next-line no-eval
      const r = eval('require');
      return typeof r === 'function' ? r : null;
    }
    // Electron renderer with nodeIntegration or preload-exposed require
    if (typeof window !== 'undefined' && window.require) {
      return window.require;
    }
  } catch (_) {}
  return null;
}

// Initialize modules based on environment without static imports
(function initializeModules() {
  try {
    const nodeRequire = getNodeRequire();
    if (nodeRequire) {
      fs = nodeRequire('fs');
      path = nodeRequire('path');
      os = nodeRequire('os');
      childProcess = nodeRequire('child_process');
      crypto = nodeRequire('crypto');
      exec = childProcess && childProcess.exec ? childProcess.exec : null;
      try {
        const electron = nodeRequire('electron');
        ipcRenderer = electron && electron.ipcRenderer ? electron.ipcRenderer : null;
      } catch (_) { ipcRenderer = null; }
    } else {
      fs = null; path = null; os = null; childProcess = null; crypto = null; exec = null; ipcRenderer = null;
    }
  } catch (_) {
    fs = null; path = null; os = null; childProcess = null; crypto = null; exec = null; ipcRenderer = null;
  }
})();

// Texture cache for faster conversions
let textureCache = new Map();

// AppData cache directory for PNG files
const appDataCacheDir = path ? path.join(os.homedir(), 'AppData', 'Local', 'Quartz', 'TextureCache') : null;

// Initialize cache directory
function initializeCacheDirectory() {
  if (!fs || !appDataCacheDir) return;
  
  try {
    if (!fs.existsSync(appDataCacheDir)) {
      fs.mkdirSync(appDataCacheDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

// Get cached PNG path for a texture
function getCachedPngPath(texturePath) {
  if (!path || !appDataCacheDir) return null;
  
  // crypto is already defined at the top
  if (!crypto) return null;
  
  const hash = crypto.createHash('md5').update(texturePath).digest('hex');
  return path.join(appDataCacheDir, `${hash}.png`);
}

// Clear texture cache
function clearTextureCache() {
  if (!fs || !appDataCacheDir) return;
  
  try {
    if (fs.existsSync(appDataCacheDir)) {
      const files = fs.readdirSync(appDataCacheDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.png')) {
          const filePath = path.join(appDataCacheDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      // Clear in-memory cache too
      textureCache.clear();

      return deletedCount;
    }
  } catch (error) {
    console.error('Failed to clear texture cache:', error);
    throw error;
  }
}

// Resolve a project root by walking up until both 'data' and 'assets' folders are found
function resolveProjectRoot(startDir) {
  if (!fs || !path || !startDir) return null;
  let current = startDir;
  try {
    while (current && current !== path.dirname(current)) {
      const hasData = fs.existsSync(path.join(current, 'data')) || fs.existsSync(path.join(current, 'DATA'));
      const hasAssets = fs.existsSync(path.join(current, 'assets')) || fs.existsSync(path.join(current, 'ASSETS'));
      if (hasData && hasAssets) return current;
      // Fallback: if no combined root, accept directory that has assets
      if (hasAssets && !hasData) return current;
      current = path.dirname(current);
    }
  } catch (_) {
    // ignore
  }
  return null;
}

// Normalize an in-file texture path to use forward slashes and trim leading slashes
function normalizeTextureRelPath(texPath) {
  const p = String(texPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return p;
}

// Find actual texture file path in the file system (root-aware)
function findActualTexturePath(texturePath, targetBinPath = null, donorBinPath = null, basePath = null) {
  if (!fs || !path) return null;

  // If it's an absolute path, use it directly
  if (path.isAbsolute(texturePath)) {
    return fs.existsSync(texturePath) ? texturePath : null;
  }

  const normalizedRel = normalizeTextureRelPath(texturePath);
  const relNoAssets = normalizedRel.replace(/^assets\//i, '').replace(/^ASSETS\//, '');

  // Derive roots from donor/target bin files
  const donorDir = donorBinPath ? path.dirname(donorBinPath) : null;
  const targetDir = targetBinPath ? path.dirname(targetBinPath) : null;
  const donorRoot = resolveProjectRoot(donorDir) || donorDir;
  const targetRoot = resolveProjectRoot(targetDir) || targetDir;

  // Base path (e.g., location where .py was saved) if provided
  const extraBase = basePath && fs.existsSync(basePath) ? basePath : null;

  // Build candidate absolute paths in priority order (donor root first, then target)
  const candidateBases = [];
  if (donorRoot) candidateBases.push(donorRoot);
  if (targetRoot && targetRoot !== donorRoot) candidateBases.push(targetRoot);
  if (donorDir && !candidateBases.includes(donorDir)) candidateBases.push(donorDir);
  if (targetDir && !candidateBases.includes(targetDir)) candidateBases.push(targetDir);
  if (extraBase) candidateBases.push(extraBase);

  const candidates = [];

  for (const base of candidateBases) {
    // Prefer root/assets mapping
    candidates.push(path.join(base, normalizedRel));
    candidates.push(path.join(base, relNoAssets));
    candidates.push(path.join(base, 'assets', relNoAssets));
    candidates.push(path.join(base, 'ASSETS', relNoAssets));
    // Fallbacks near the bin dir
    candidates.push(path.join(base, path.basename(normalizedRel)));
  }

  // Also try CWD assets as a last resort
  candidates.push(path.join(process.cwd(), normalizedRel));
  candidates.push(path.join(process.cwd(), 'assets', relNoAssets));

  for (const abs of candidates) {
    try {
      if (abs && fs.existsSync(abs)) return abs;
    } catch (_) {
      // ignore
    }
  }

  return null;
}

// Load texture directly as data URL (no conversion needed!)
async function convertTextureToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    const ext = path.extname(inputPath).toLowerCase();

    // Handle data URL files specially
    if (ext === '.dataurl') {
      // Read and return the data URL content directly
      const dataURLContent = fs.readFileSync(inputPath, 'utf8');
      return dataURLContent;
    }

    // Try to detect file type by reading the header
    const data = fs.readFileSync(inputPath);
    const header = data.slice(0, 4).toString();

    if (ext === '.dds' || header === 'DDS ') {
      return await convertDDSToAppDataPNG(inputPath, outputPath);
    } else if (ext === '.tex' || header === 'TEX\x00') {
      return await convertTEXToAppDataPNG(inputPath, outputPath);
    } else {
      // For unknown formats, return null
      console.warn(`Unknown texture format: ${ext}, header: ${header}`);
      return null;
    }
  } catch (error) {
    console.error(`Error loading texture: ${error.message}`);
    return null;
  }
}

// Load DDS directly (returns data URL)
async function convertDDSToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    // Use native DDS decoder - returns data URL directly
    const dataURL = await convertDDSToPNG(inputPath, outputPath);
    return dataURL;
  } catch (error) {
    console.error(`DDS loading error: ${error.message}`);
    return null;
  }
}

// Load TEX directly (returns data URL)
async function convertTEXToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    // Use native TEX decoder - returns data URL directly
    const dataURL = await convertTEXToPNG(inputPath, outputPath);
    return dataURL;
  } catch (error) {
    console.error(`TEX loading error: ${error.message}`);
    return null;
  }
}

// Enhanced logging system for production debugging
function logTextureConversion(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [TEXTURE-${level}] ${message}`;
  
  console.log(logMessage);
  if (data) {
    console.log(`[TEXTURE-${level}] Data:`, data);
  }
  
  // Send to main process logging (which writes to the actual log files)
  try {
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      ipcRenderer.invoke('log-texture-conversion', {
        level: level.toLowerCase(),
        message: message,
        data: data
      }).catch(() => {
        // Ignore IPC errors - logging is best effort
      });
    }
  } catch (e) {
    // Ignore logging errors
  }
}

// Load DDS directly as RGBA data URL (no PNG conversion!)
async function convertDDSToPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  logTextureConversion('INFO', 'Loading DDS natively (no conversion)', {
    inputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  try {
    // Read DDS file as Buffer, then convert to ArrayBuffer
    const nodeBuffer = fs.readFileSync(inputPath);
    const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
    
    logTextureConversion('INFO', 'DDS file read, decoding with native JS', {
      bufferSize: arrayBuffer.byteLength
    });

    // Decode DDS to raw RGBA pixels
    const { pixels, width, height } = loadTextureRGBA(arrayBuffer, 'dds');
    
    // Create data URL with raw RGBA data (no PNG encoding!)
    const dataURL = rgbaToDataURL(pixels, width, height);
    
    logTextureConversion('SUCCESS', 'DDS decoded to raw RGBA data URL', { 
      width,
      height,
      pixelCount: pixels.length / 4
    });
    
    // Return data URL directly - no file writing needed!
    return dataURL;

  } catch (error) {
    logTextureConversion('ERROR', 'Native DDS decoding failed', {
      error: error.message,
      stack: error.stack,
      inputPath
    });
    return null;
  }
}

// Smart format detection and native loading (no conversion!)
async function smartConvertToPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  logTextureConversion('INFO', 'Loading texture natively', {
    inputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  const ext = path.extname(inputPath).toLowerCase();
  
  logTextureConversion('INFO', 'Detected file format', { 
    extension: ext,
    filename: path.basename(inputPath)
  });
  
  // Native loading for supported formats
  if (ext === '.dds') {
    logTextureConversion('INFO', 'Loading DDS file natively');
    return await convertDDSToPNG(inputPath, outputPath);
  } else if (ext === '.tex') {
    logTextureConversion('INFO', 'Loading TEX file natively');
    return await convertTEXToPNG(inputPath, outputPath);
  } else if (ext === '.tga' || ext === '.bmp') {
    logTextureConversion('WARN', 'TGA/BMP not supported', {
      extension: ext,
      inputPath
    });
    return null;
  }
  
  logTextureConversion('WARN', 'Unknown file format', {
    extension: ext,
    inputPath
  });
  return null;
}

// Load TEX directly as RGBA data URL (no PNG conversion!)
async function convertTEXToPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  logTextureConversion('INFO', 'Loading TEX natively (no conversion)', {
    inputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  try {
    // Read TEX file as Buffer, then convert to ArrayBuffer
    const nodeBuffer = fs.readFileSync(inputPath);
    const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
    
    logTextureConversion('INFO', 'TEX file read, decoding with native JS', {
      bufferSize: arrayBuffer.byteLength
    });

    // Decode TEX to raw RGBA pixels
    const { pixels, width, height } = loadTextureRGBA(arrayBuffer, 'tex');
    
    // Create data URL with raw RGBA data (no PNG encoding!)
    const dataURL = rgbaToDataURL(pixels, width, height);
    
    logTextureConversion('SUCCESS', 'TEX decoded to raw RGBA data URL', { 
      width,
      height,
      pixelCount: pixels.length / 4
    });
    
    // Return data URL directly - no file writing needed!
    return dataURL;

  } catch (error) {
    logTextureConversion('ERROR', 'Native TEX decoding failed', {
      error: error.message,
      stack: error.stack,
      inputPath
    });
    return null;
  }
}

// Placeholder functions removed - native decoding doesn't need them!

// Main texture loading function - returns data URL directly (no conversion!)
async function convertTextureToPNG(texturePath, targetPath = null, donorPath = null, basePath = null) {
  if (!fs || !path || !os) {
    logTextureConversion('ERROR', 'Required Node.js modules not available', {
      fs: !!fs,
      path: !!path,
      os: !!os
    });
    return null;
  }
  
  logTextureConversion('INFO', 'Loading texture natively', {
    texturePath,
    targetPath,
    donorPath,
    basePath,
    isAbsolute: path.isAbsolute(texturePath)
  });
  
  try {
    // Handle absolute paths directly
    let actualFilePath = texturePath;
    
    // If it's not an absolute path, try to find it
    if (!path.isAbsolute(texturePath)) {
      logTextureConversion('INFO', 'Resolving relative texture path', { texturePath });
      actualFilePath = findActualTexturePath(texturePath, targetPath, donorPath, basePath);
      
      if (!actualFilePath) {
        logTextureConversion('ERROR', 'Could not resolve texture path', {
          originalPath: texturePath,
          targetPath,
          donorPath,
          basePath
        });
        return null;
      }
      
      logTextureConversion('INFO', 'Texture path resolved successfully', {
        originalPath: texturePath,
        resolvedPath: actualFilePath,
        exists: fs.existsSync(actualFilePath)
      });
    } else {
      logTextureConversion('INFO', 'Using absolute texture path', {
        path: actualFilePath,
        exists: fs.existsSync(actualFilePath)
      });
    }

    const ext = path.extname(actualFilePath).toLowerCase();

    // Handle data URL files specially
    if (ext === '.dataurl') {
      logTextureConversion('INFO', 'Processing data URL file', { actualFilePath });
      const dataURLContent = fs.readFileSync(actualFilePath, 'utf8');
      return dataURLContent;
    }

    // Try to detect file type by reading the header
    try {
      const nodeBuffer = fs.readFileSync(actualFilePath);
      const header = nodeBuffer.slice(0, 4).toString();

      logTextureConversion('INFO', 'File analysis completed', {
        extension: ext,
        header: header,
        fileSize: nodeBuffer.length,
        actualFilePath
      });

      if (ext === '.dds' || header === 'DDS ') {
        logTextureConversion('INFO', 'Loading DDS file natively');
        return await smartConvertToPNG(actualFilePath, null);
      } else if (ext === '.tex' || header === 'TEX\x00') {
        logTextureConversion('INFO', 'Loading TEX file natively');
        return await smartConvertToPNG(actualFilePath, null);
      } else if (ext === '.tga' || ext === '.bmp') {
        logTextureConversion('INFO', 'TGA/BMP not supported');
        return null;
      } else {
        // Unknown format
        logTextureConversion('WARN', 'Unknown file format', {
          extension: ext,
          header: header,
          actualFilePath
        });
        return null;
      }
    } catch (error) {
      logTextureConversion('ERROR', 'Failed to read file', {
        error: error.message,
        actualFilePath
      });
      throw new Error(`Failed to read file: ${error.message}`);
    }
  } catch (error) {
    logTextureConversion('ERROR', 'Texture loading failed', {
      error: error.message,
      texturePath,
      targetPath,
      donorPath,
      basePath
    });
    return null;
  }
}

// Initialize cache on load
if (appDataCacheDir) {
  initializeCacheDirectory();
}

// Test function to verify logging is working
export function testTextureLogging() {
  logTextureConversion('INFO', 'Testing texture conversion logging system', {
    timestamp: new Date().toISOString(),
    testData: { test: true, number: 42 }
  });
  
  logTextureConversion('ERROR', 'Test error message', {
    error: 'This is a test error',
    stack: 'Test stack trace'
  });
  
  logTextureConversion('SUCCESS', 'Test success message', {
    result: 'Logging system is working'
  });
  
  console.log('✅ Texture logging test completed - check log files for results');
}

export {
  convertTextureToPNG,
  convertTextureToAppDataPNG,
  getCachedPngPath,
  clearTextureCache,
  textureCache,
  appDataCacheDir,
  findActualTexturePath,
  smartConvertToPNG,
  logTextureConversion
}; 

