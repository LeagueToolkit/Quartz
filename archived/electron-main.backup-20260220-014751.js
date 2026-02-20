const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const isDev = require('electron-is-dev');
const https = require('https');
const { autoUpdater } = require('electron-updater');

// Register custom protocols as privileged as early as possible
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Track if the app is in the process of quitting to avoid re-entrancy/loops
let isQuitting = false;
let isShuttingDown = false;
let textureCacheCleared = false;

// Auto-updater configuration
let updateCheckWindow = null; // Window reference for sending update events
let cachedUpdateInfo = null; // Cache update info when available event fires
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Install on app quit if update is downloaded

// Enable logging for electron-updater (helps debug issues)
autoUpdater.logger = {
  info: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'INFO'),
  warn: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'WARNING'),
  error: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'ERROR'),
  debug: (message) => logToFile(`[AUTO-UPDATER] ${message}`, 'INFO'),
};

// Force update checks in dev mode for testing
if (process.env.ENABLE_AUTO_UPDATER === 'true') {
  // Force dev update configuration - this tells electron-updater to allow checks in dev mode
  autoUpdater.forceDevUpdateConfig = true;
  // Also need to set updateCheckTimeout to allow it
  autoUpdater.updateConfigPath = null;
}

// ============================================================================
// FILE-BASED LOGGING SYSTEM FOR PRODUCTION DEBUGGING
// ============================================================================
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, `quartz-${new Date().toISOString().split('T')[0]}.log`);

// Clear old log files on app startup
function clearOldLogsOnStartup() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      return; // Directory didn't exist, nothing to clear
    }

    const files = fs.readdirSync(LOG_DIR);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      try {
        // Only delete .log files (keep other files if any)
        if (file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Failed to delete old log file ${file}:`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleared ${deletedCount} old log file(s) from logs directory`);
    }
  } catch (e) {
    console.error('Failed to clear old logs:', e);
  }
}

// Ensure log directory exists and clear old logs
try {
  clearOldLogsOnStartup();
} catch (e) {
  console.error('Failed to initialize log directory:', e);
}

// Import hash manager - handle both dev and production paths
let hashManager;
function loadHashManager() {
  if (hashManager) return hashManager;

  const pathsToTry = [
    // Development: relative path from electron-main.js
    './src/utils/io/hashManager',
    // Production: path relative to __dirname (when in app.asar root)
    path.join(__dirname, 'src', 'utils', 'io', 'hashManager'),
    // Alternative: path with .js extension
    path.join(__dirname, 'src', 'utils', 'io', 'hashManager.js'),
  ];

  for (const modulePath of pathsToTry) {
    try {
      hashManager = require(modulePath);
      logToFile(`hashManager loaded from: ${modulePath}`, 'INFO');
      return hashManager;
    } catch (e) {
      // Continue to next path
    }
  }

  // If app is available, try app path
  if (app && typeof app.isReady === 'function' && app.isReady()) {
    try {
      const appPath = app.getAppPath();
      const hashManagerPath = path.join(appPath, 'src', 'utils', 'io', 'hashManager.js');
      hashManager = require(hashManagerPath);
      logToFile(`hashManager loaded from app path: ${hashManagerPath}`, 'INFO');
      return hashManager;
    } catch (e) {
      // Continue to error handling
    }
  }

  // If all else fails, log error and return stub
  const errorMsg = 'Failed to load hashManager from all attempted paths';
  console.error(errorMsg);
  logToFile(errorMsg, 'ERROR');
  logToFile(`Tried paths: ${pathsToTry.join(', ')}`, 'ERROR');
  logToFile(`__dirname: ${__dirname}`, 'ERROR');
  if (app) {
    try {
      logToFile(`app.getAppPath(): ${app.getAppPath()}`, 'ERROR');
    } catch (e) { }
  }

  // Return a stub to prevent crashes
  return {
    checkHashes: () => ({ allPresent: false, missing: [], error: 'hashManager not loaded' }),
    downloadHashes: async () => ({ success: false, errors: ['hashManager not loaded'], downloaded: [] }),
    getHashDirectory: () => ''
  };
}

// Log function that writes to both console and file
function logToFile(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  // Write to console
  console.log(logMessage.trim());

  // Write to file
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

// ============================================================================
// HEADLESS CLI HANDLER (Context Menu Actions)
// ============================================================================

async function runContextMenuScript(scriptName, targetFile) {
  try {
    const appPath = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
    const contextMenuBase = app.isPackaged
      ? path.join(process.resourcesPath, 'context_menu')
      : path.join(__dirname, 'context_menu');

    const pythonExePath = path.join(contextMenuBase, 'python', 'python.exe');
    const scriptPath = path.join(contextMenuBase, scriptName);

    if (!fs.existsSync(pythonExePath)) throw new Error(`Python not found at: ${pythonExePath}`);
    if (!fs.existsSync(scriptPath)) throw new Error(`Script not found at: ${scriptPath}`);

    logToFile(`[CLI] Executing: ${scriptName} on ${targetFile}`, 'INFO');

    return new Promise((resolve, reject) => {
      const child = spawn(pythonExePath, [scriptPath, targetFile]);

      child.stdout.on('data', (data) => logToFile(`[${scriptName}] ${data.toString().trim()}`, 'INFO'));
      child.stderr.on('data', (data) => logToFile(`[${scriptName}] ERR: ${data.toString().trim()}`, 'ERROR'));

      child.on('close', (code) => {
        if (code === 0) {
          logToFile(`[CLI] ${scriptName} completed successfully`, 'INFO');
          resolve(true);
        } else {
          logToFile(`[CLI] ${scriptName} failed with code ${code}`, 'ERROR');
          reject(new Error(`Exit code ${code}`));
        }
      });
    });
  } catch (error) {
    logToFile(`[CLI] Execution error: ${error.message}`, 'ERROR');
    throw error;
  }
}

async function handleCommandLineArgs() {
  const args = process.argv;

  // Skip the first argument (executable path)
  const startIndex = isDev ? 2 : 1;
  const filteredArgs = args.slice(startIndex);

  const noSkinLiteIdx = filteredArgs.indexOf('--noskinlite');
  const separateVfxIdx = filteredArgs.indexOf('--separate-vfx');
  const combineLinkedIdx = filteredArgs.indexOf('--combine-linked');
  const batchSplitVfxIdx = filteredArgs.indexOf('--batch-split-vfx');

  if (noSkinLiteIdx !== -1 || separateVfxIdx !== -1 || combineLinkedIdx !== -1 || batchSplitVfxIdx !== -1) {
    const flagIdx = noSkinLiteIdx !== -1 ? noSkinLiteIdx : (separateVfxIdx !== -1 ? separateVfxIdx : (combineLinkedIdx !== -1 ? combineLinkedIdx : batchSplitVfxIdx));
    const scriptName = noSkinLiteIdx !== -1 ? 'noskinlite.py' : (separateVfxIdx !== -1 ? 'separate_vfx.py' : (combineLinkedIdx !== -1 ? 'combine_linked.py' : 'batch_split_vfx.py'));
    const targetFile = filteredArgs[flagIdx - 1]; // Path should be before the flag

    if (targetFile && fs.existsSync(targetFile)) {
      try {
        await runContextMenuScript(scriptName, targetFile);
        app.quit();
        return true;
      } catch (error) {
        app.quit();
        return true;
      }
    } else {
      logToFile(`[CLI] Target file not found: ${targetFile}`, 'ERROR');
      app.quit();
      return true;
    }
  }

  return false;
}

// Singleton check to handle multiple launches
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus window and handle file open
    if (updateCheckWindow) {
      if (updateCheckWindow.isMinimized()) updateCheckWindow.restore();
      updateCheckWindow.focus();

    }
  });

  // Run CLI handler immediately
  handleCommandLineArgs().then(handled => {
    if (handled) return;
  });
}

// Export log file path via IPC
ipcMain.handle('get-log-file-path', () => {
  return LOG_FILE;
});

// Handle texture conversion logging from renderer
ipcMain.handle('log-texture-conversion', async (event, { level, message, data }) => {
  try {
    const logMessage = `[TEXTURE-${level.toUpperCase()}] ${message}`;
    if (data) {
      logToFile(`${logMessage} - Data: ${JSON.stringify(data)}`, level.toUpperCase());
    } else {
      logToFile(logMessage, level.toUpperCase());
    }
    return { success: true };
  } catch (error) {
    logToFile(`Failed to log texture message: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
});

// Export user data path via IPC
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('getAppPath', () => {
  return app.getAppPath();
});

ipcMain.handle('getResourcesPath', () => {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    // In development, resources are in public folder
    return path.join(app.getAppPath(), 'public');
  }
});

ipcMain.handle('getCursorsPath', () => {
  // Always returns the roaming path so cursors survive app updates
  return path.join(app.getPath('userData'), 'cursors');
});

// IPC handler to open log file location
ipcMain.handle('open-log-folder', async () => {
  try {
    await shell.openPath(LOG_DIR);
    return { success: true, path: LOG_DIR };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

logToFile('='.repeat(80), 'INFO');
logToFile('Quartz Started', 'INFO');

// Load hashManager now that logToFile is available
hashManager = loadHashManager();


// Ensure ritobin_cli.exe is copied to FrogTools directory
function ensureRitobinCli() {
  try {
    // Use same path logic as hashManager - AppData/Roaming/FrogTools
    const appDataPath = process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME, 'Library', 'Application Support')
        : process.platform === 'linux'
          ? path.join(process.env.HOME, '.local', 'share')
          : path.join(process.env.HOME, 'AppData', 'Roaming'));

    const frogToolsDir = path.join(appDataPath, 'FrogTools');
    const ritobinDestPath = path.join(frogToolsDir, 'ritobin_cli.exe');

    // Skip if already exists
    if (fs.existsSync(ritobinDestPath)) {
      logToFile('ritobin_cli.exe already exists in FrogTools', 'INFO');
      return;
    }

    // Get path to bundled ritobin_cli.exe (in app resources)
    let ritobinSrcPath;
    if (app.isPackaged) {
      // In production: it's in resources/ritobin_cli.exe
      ritobinSrcPath = path.join(process.resourcesPath, 'ritobin_cli.exe');
    } else {
      // In development: use the tools directory
      ritobinSrcPath = path.join(__dirname, 'tools', 'ritobin_cli.exe');
    }

    // Ensure FrogTools directory exists
    if (!fs.existsSync(frogToolsDir)) {
      fs.mkdirSync(frogToolsDir, { recursive: true });
    }

    // Copy ritobin_cli.exe if source exists
    if (fs.existsSync(ritobinSrcPath)) {
      fs.copyFileSync(ritobinSrcPath, ritobinDestPath);
      logToFile(`Copied ritobin_cli.exe to FrogTools: ${ritobinDestPath}`, 'INFO');
    } else {
      logToFile(`ritobin_cli.exe not found at ${ritobinSrcPath}, skipping copy`, 'WARN');
    }
  } catch (error) {
    logToFile(`Error ensuring ritobin_cli.exe: ${error.message}`, 'ERROR');
  }
}

// Copy default assets to AppData/Roaming/Quartz/assets on first run
// This allows users to customize assets and they persist across reinstalls
function ensureDefaultAssets() {
  try {
    const userDataPath = app.getPath('userData');
    const assetsDestDir = path.join(userDataPath, 'assets');

    // Get path to bundled assets (in app resources)
    let assetsSrcDir;
    if (app.isPackaged) {
      // In production: it's in resources/assets
      assetsSrcDir = path.join(process.resourcesPath, 'assets');
    } else {
      // In development: use the public directory
      assetsSrcDir = path.join(__dirname, 'public');
    }

    // Ensure assets directory exists
    if (!fs.existsSync(assetsDestDir)) {
      fs.mkdirSync(assetsDestDir, { recursive: true });
    }

    // List of default assets to copy (only if they don't already exist)
    // Map source filename to destination filename
    const defaultAssets = [
      { src: 'celestia.webp', dest: 'celestia.webp' },
      { src: 'your-logo.gif', dest: 'navbar.gif' }
    ];

    if (!fs.existsSync(assetsSrcDir)) {
      logToFile(`Assets source directory not found at ${assetsSrcDir}, skipping asset copy`, 'WARN');
      return;
    }

    let copiedCount = 0;
    for (const asset of defaultAssets) {
      const srcPath = path.join(assetsSrcDir, asset.src);
      const destPath = path.join(assetsDestDir, asset.dest);

      // Only copy if source exists and destination doesn't exist (don't overwrite user customizations)
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          copiedCount++;
          logToFile(`Copied default asset: ${asset.src} -> ${asset.dest} to ${destPath}`, 'INFO');
        } catch (error) {
          logToFile(`Error copying asset ${asset.src}: ${error.message}`, 'WARN');
        }
      }
    }

    if (copiedCount > 0) {
      logToFile(`Copied ${copiedCount} default asset(s) to AppData/Roaming/Quartz/assets`, 'INFO');
    } else {
      logToFile('Default assets already exist or not found, skipping copy', 'INFO');
    }
  } catch (error) {
    logToFile(`Error ensuring default assets: ${error.message}`, 'ERROR');
  }
}

function ensureDefaultCursors() {
  try {
    const userDataPath = app.getPath('userData');
    const cursorsDestDir = path.join(userDataPath, 'cursors');

    // Source: bundled cursors in resources
    const cursorsSrcDir = app.isPackaged
      ? path.join(process.resourcesPath, 'cursors')
      : path.join(__dirname, 'public', 'cursors');

    // Ensure roaming cursors directory exists
    if (!fs.existsSync(cursorsDestDir)) {
      fs.mkdirSync(cursorsDestDir, { recursive: true });
    }

    if (!fs.existsSync(cursorsSrcDir)) return;

    // Copy bundled cursors that don't already exist in roaming (never overwrite user files)
    const files = fs.readdirSync(cursorsSrcDir);
    for (const file of files) {
      const srcPath = path.join(cursorsSrcDir, file);
      const destPath = path.join(cursorsDestDir, file);
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          logToFile(`Copied default cursor: ${file}`, 'INFO');
        } catch (e) {
          logToFile(`Error copying cursor ${file}: ${e.message}`, 'WARN');
        }
      }
    }
  } catch (error) {
    logToFile(`Error ensuring default cursors: ${error.message}`, 'ERROR');
  }
}

logToFile(`Version: ${app.getVersion()}`, 'INFO');
logToFile(`Electron: ${process.versions.electron}`, 'INFO');
logToFile(`Node: ${process.versions.node}`, 'INFO');
logToFile(`Platform: ${process.platform}`, 'INFO');
logToFile(`isDev: ${isDev}`, 'INFO');
logToFile(`isPackaged: ${app.isPackaged}`, 'INFO');
logToFile('='.repeat(80), 'INFO');

function createWindow() {
  // Create the browser window.
  let mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'divinelab.ico'),
    frame: false, // Remove default Windows title bar completely
    titleBarStyle: 'hidden', // macOS only,
    transparent: true, // Enable transparency for custom title bar and background
    backgroundColor: '#00000000', // Transparent background
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
    },
  });

  // Ensure frame is removed (Windows-specific check)
  if (process.platform === 'win32') {
    mainWindow.setMenuBarVisibility(false); // Hide menu bar if any
  }

  // Set the window reference for auto-updater
  updateCheckWindow = mainWindow;

  // Notify renderer when window state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:unmaximized');
  });

  // Handle files passed via command line on startup
  mainWindow.webContents.on('did-finish-load', () => {
    // CLI handling is done in handleCommandLineArgs
  });

  // Load the app
  const isDevelopment = isDev && !app.isPackaged;

  if (isDevelopment) {
    // In development, load from React dev server
    const devPort = process.env.PORT || '3000';
    const devUrl = process.env.ELECTRON_START_URL || `http://localhost:${devPort}`;
    console.log(`Loading from React dev server: ${devUrl}`);

    const tryLoad = () => {
      mainWindow.loadURL(devUrl).catch((err) => {
        console.log('Dev server not ready, retrying in 1s...', err?.code || err?.message || err);
        setTimeout(tryLoad, 1000);
      });
    };

    // Retry when load fails (e.g., server not started yet)
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => {
        tryLoad();
      }, 1000);
    });

    tryLoad();

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    // Disable DevTools in production
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
    try { mainWindow.removeMenu(); } catch { }
  }

  // Unified close handler: checks unsaved changes AND stops backend
  mainWindow.on('close', async (e) => {
    try {
      // If we're already quitting, allow the close
      if (isQuitting || isShuttingDown) {
        console.log('✅ Already quitting/shutting down, allowing close...');
        return;
      }

      // Always prevent first, then decide what to do
      e.preventDefault();

      // Prevent multiple close attempts
      if (isShuttingDown) {
        console.log('🔄 Shutdown already in progress, ignoring close request...');
        return;
      }

      // Check if there are unsaved changes by querying the renderer process
      let hasUnsaved = false;
      try {
        hasUnsaved = await mainWindow.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
      } catch { }

      // If there are unsaved changes, show confirmation dialog
      if (hasUnsaved) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Exit Without Saving', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Unsaved Changes',
          message: 'You have unsaved BIN changes. Exit without saving?',
          noLink: true,
        });

        if (result.response !== 0) {
          // User cancelled: do nothing, window stays open
          console.log('User cancelled close, window stays open');
          return;
        }
        // User chose to exit anyway - continue with shutdown
        console.log('User confirmed exit without saving');
      }

      // Mark that we're shutting down (prevents re-entry)
      isQuitting = true;
      isShuttingDown = true;

      // Notify renderer that we're closing
      try {
        await mainWindow.webContents.executeJavaScript('window.__DL_forceClose = true;');
        mainWindow.webContents.send('app:closing');
      } catch { }

      // Backend service removed - no cleanup needed

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clear saved bin paths before quitting
      clearSavedBinPaths();

      // Now actually close the window
      console.log('🔄 Destroying window and quitting app...');
      try { mainWindow.destroy(); } catch { }
      app.quit();
    } catch (error) {
      console.error('❌ Error in close handler:', error);
      // As a fallback, allow quitting to avoid trapping the user
      isQuitting = true;
      isShuttingDown = true;
      try { mainWindow.destroy(); } catch { }
      app.quit();
    }
  });

  // Handle window closed (after destruction)
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });

  // Prevent new windows/popups
  try {
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  } catch { }

  // Block navigation to external origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isFile = typeof url === 'string' && url.startsWith('file://');
    if (!isFile) {
      event.preventDefault();
    }
  });
}

// Resolve app data paths and resources
const getUserDataPath = () => {
  try {
    return app.getPath('userData');
  } catch {
    return __dirname;
  }
};

// LtMAO runtime resolution
// We support three locations, in priority order:
// 1) userData/minimal-ltmao (writable, preferred)
// 2) process.resourcesPath/minimal-ltmao (packaged extraResources)
// 3) app root ./minimal-ltmao (dev fallback)
function resolveLtmaoRuntimePath() {
  try {
    const userDataLtmao = path.join(getUserDataPath(), 'minimal-ltmao');
    console.log('🔍 Checking userData minimal-ltmao path:', userDataLtmao, 'exists:', fs.existsSync(userDataLtmao));
    if (fs.existsSync(userDataLtmao)) {
      console.log('✅ Using userData minimal-ltmao path:', userDataLtmao);
      return userDataLtmao;
    }

    const resourcesLtmao = path.join(process.resourcesPath || __dirname, 'minimal-ltmao');
    console.log('🔍 Checking resources minimal-ltmao path:', resourcesLtmao, 'exists:', fs.existsSync(resourcesLtmao));
    if (fs.existsSync(resourcesLtmao)) {
      console.log('✅ Using resources minimal-ltmao path:', resourcesLtmao);
      return resourcesLtmao;
    }

    // Development fallback - check for minimal-ltmao
    const devLtmao = path.join(process.cwd(), 'minimal-ltmao');
    console.log('🔍 Checking dev minimal-ltmao path:', devLtmao, 'exists:', fs.existsSync(devLtmao));
    if (fs.existsSync(devLtmao)) {
      console.log('✅ Using dev minimal-ltmao path:', devLtmao);
      return devLtmao;
    }

    // Additional fallback - check for LtMAO-hai (legacy)
    const legacyLtmao = path.join(process.cwd(), 'LtMAO-hai');
    console.log('🔍 Checking legacy LtMAO-hai path:', legacyLtmao, 'exists:', fs.existsSync(legacyLtmao));
    if (fs.existsSync(legacyLtmao)) {
      console.log('✅ Using legacy LtMAO-hai path:', legacyLtmao);
      return legacyLtmao;
    }

    console.warn('⚠️ No minimal-ltmao found in any expected location');
  } catch (err) {
    console.error('❌ Error resolving minimal-ltmao path:', err);
  }
  return null;
}

function getLtmaoPythonAndCli() {
  const base = resolveLtmaoRuntimePath();
  if (!base) {
    console.warn('⚠️ LtMAO runtime base path not found');
    return { base: null, pythonPath: null, cliScript: null };
  }

  // For Windows, use python.exe from cpy-minimal only (smaller bundle)
  const pythonPath = path.join(base, 'cpy-minimal', 'python.exe');
  const cliScript = path.join(base, 'src', 'cli.py');

  // Verify Python executable exists
  if (!fs.existsSync(pythonPath)) {
    console.warn(`⚠️ Python executable not found at: ${pythonPath}`);
    return { base, pythonPath: null, cliScript };
  }

  if (!fs.existsSync(cliScript)) {
    console.warn(`⚠️ CLI script not found at: ${cliScript}`);
    return { base, pythonPath, cliScript: null };
  }

  console.log('✅ LtMAO paths resolved in main process (using cpy-minimal):', { base, pythonPath, cliScript });
  return { base, pythonPath, cliScript };
}

// IPC handlers for file operations
ipcMain.handle('dialog:openFile', async (event, options) => {
  try {
    let window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      window = BrowserWindow.getFocusedWindow();
    }
    const result = await dialog.showOpenDialog(window, {
      title: options?.title || 'Open File',
      properties: options?.properties || ['openFile'],
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
  } catch (error) {
    console.error('Error opening file dialog:', error);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  try {
    let window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      window = BrowserWindow.getFocusedWindow();
    }
    const result = await dialog.showSaveDialog(window, {
      title: options?.title || 'Save File',
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
  } catch (error) {
    console.error('Error opening save dialog:', error);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('dialog:openDirectory', async (event, options) => {
  try {
    let window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      window = BrowserWindow.getFocusedWindow();
    }
    const result = await dialog.showOpenDialog(window, {
      title: options?.title || 'Select Folder',
      properties: options?.properties || ['openDirectory']
    });
    return result;
  } catch (error) {
    console.error('Error opening directory dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// IPC handler for opening external links
ipcMain.handle('openExternal', async (event, url) => {
  try {
    console.log('Opening external URL:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for opening installation directory
ipcMain.handle('openInstallDirectory', async (event) => {
  try {
    const installDir = getUpscaleInstallDir();
    console.log('Opening installation directory:', installDir);
    await shell.openPath(installDir);
    return { success: true, path: installDir };
  } catch (error) {
    console.error('Error opening installation directory:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:openFiles', async (event, options) => {
  try {
    let window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      window = BrowserWindow.getFocusedWindow();
    }
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
  } catch (error) {
    console.error('Error opening files dialog:', error);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('dialog:openRitobinExe', async (event) => {
  try {
    // Get the window that sent the request
    let window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      window = BrowserWindow.getFocusedWindow();
    }

    const result = await dialog.showOpenDialog(window || undefined, {
      title: 'Select ritobin_cli.exe',
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    });
    return result;
  } catch (error) {
    console.error('Error opening ritobin exe dialog:', error);
    logToFile(`Error opening ritobin exe dialog: ${error.message}`, 'ERROR');
    return { canceled: true, error: error.message };
  }
});

// Legacy sync handler for FileSelect
ipcMain.on('FileSelect', (event, [title, fileType]) => {
  const filters = fileType === 'Bin' ? [{ name: 'Bin Files', extensions: ['bin'] }] : [{ name: 'All Files', extensions: ['*'] }];
  let window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    window = BrowserWindow.getFocusedWindow();
  }

  dialog.showOpenDialog(window, {
    title: title || 'Select File',
    properties: ['openFile'],
    filters: filters
  }).then(result => {
    event.returnValue = result.canceled ? '' : result.filePaths[0];
  }).catch(error => {
    console.error('File selection error:', error);
    event.returnValue = '';
  });
});

// Preferences system for React app
const prefsPath = path.join(getUserDataPath(), 'preferences.json');

// Load preferences from file
const loadPrefs = () => {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
  return {};
};

// Save preferences to file
const savePrefs = (prefs) => {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Error saving preferences:', error);
  }
};

// Clear saved bin paths on app quit
const clearSavedBinPaths = () => {
  try {
    const prefs = loadPrefs();
    // Clear all saved bin paths (shared and individual)
    prefs.SharedLastBinPath = '';
    prefs.PaintLastBinPath = '';
    prefs.PortLastTargetBinPath = '';
    prefs.PortLastDonorBinPath = '';
    prefs.VFXHubLastBinPath = '';
    savePrefs(prefs);
    console.log('🧹 Cleared saved bin paths on app quit');
  } catch (error) {
    console.error('Error clearing saved bin paths:', error);
  }
};

ipcMain.handle('prefs:get', async (event, key) => {
  const prefs = loadPrefs();
  return prefs[key];
});

ipcMain.handle('prefs:set', async (event, key, value) => {
  const prefs = loadPrefs();
  prefs[key] = value;
  savePrefs(prefs);
  return true;
});

ipcMain.handle('prefs:getAll', async () => {
  return loadPrefs();
});

ipcMain.handle('prefs:reset', async () => {
  savePrefs({});
  return true;
});

// ============================================================================
// WINDOWS EXPLORER CONTEXT MENU INTEGRATION
// ============================================================================

// Helper function to execute registry commands
const execRegistryCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logToFile(`Registry command failed: ${command}`, 'ERROR');
        logToFile(`Error: ${error.message}`, 'ERROR');
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// Check if context menu is currently enabled
ipcMain.handle('contextMenu:isEnabled', async () => {
  if (process.platform !== 'win32') {
    return { enabled: false, error: 'Context menu only supported on Windows' };
  }

  try {
    // Check if the main registry key exists (using new path)
    const checkCommand = 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz"';
    await execRegistryCommand(checkCommand);
    return { enabled: true };
  } catch (error) {
    // Key doesn't exist = not enabled
    return { enabled: false };
  }
});

// Standalone function to register context menu registry entries with current paths
const doEnableContextMenu = async () => {
  const exePath = app.getPath('exe');
  const appPath = app.getAppPath();

  const guiCommandBase = isDev
    ? `\\"${exePath}\\" \\"${appPath}\\"`
    : `\\"${exePath}\\"`;

  const contextMenuBase = isDev
    ? path.join(appPath, 'context_menu')
    : path.join(path.dirname(appPath), 'context_menu');

  const pythonExePath = path.join(contextMenuBase, 'python', 'python.exe');
  const noSkinLiteScriptPath = path.join(contextMenuBase, 'noskinlite.py');
  const separateVfxScriptPath = path.join(contextMenuBase, 'separate_vfx.py');
  const combineLinkedScriptPath = path.join(contextMenuBase, 'combine_linked.py');
  const batchSplitVfxScriptPath = path.join(contextMenuBase, 'batch_split_vfx.py');
  const pythonCommandBase = `\\"${pythonExePath}\\" \\"${noSkinLiteScriptPath}\\"`;
  const separateVfxCommandBase = `\\"${pythonExePath}\\" \\"${separateVfxScriptPath}\\"`;
  const combineLinkedCommandBase = `\\"${pythonExePath}\\" \\"${combineLinkedScriptPath}\\"`;
  const batchSplitVfxCommandBase = `\\"${pythonExePath}\\" \\"${batchSplitVfxScriptPath}\\"`;

  const iconPath = isDev
    ? path.join(appPath, 'public', 'divinelab.ico')
    : path.join(path.dirname(appPath), 'divinelab.ico');

  logToFile(`Enabling context menu. Exe: ${exePath}`, 'INFO');

  const commands = [
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "SubCommands" /d "" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "Position" /d "mid" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02noskinlite" /v "MUIVerb" /d "NoSkinLite" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02noskinlite" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02noskinlite\\command" /ve /d "${pythonCommandBase} \\"%1\\"" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03separatevfx" /v "MUIVerb" /d "Separate VFX" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03separatevfx" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03separatevfx\\command" /ve /d "${separateVfxCommandBase} \\"%1\\"" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04combinelinked" /v "MUIVerb" /d "Combine Linked" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04combinelinked" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04combinelinked\\command" /ve /d "${combineLinkedCommandBase} \\"%1\\"" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx" /v "MUIVerb" /d "Batch Split VFX" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx\\command" /ve /d "${batchSplitVfxCommandBase} \\"%1\\"" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /v "MUIVerb" /d "Open with Quartz (Bin)" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
    `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\command" /ve /d "${guiCommandBase} \\"%1\\"" /f`
  ];

  for (const command of commands) {
    await execRegistryCommand(command);
  }
};

// On startup: if context menu was previously enabled, re-register with current paths.
// This silently fixes stale registry paths left behind after a reinstall/update.
const refreshContextMenuIfStale = async () => {
  if (process.platform !== 'win32') return;
  try {
    // Check if the key exists at all
    await execRegistryCommand('reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz"');

    // Key exists — check if the .py command still points to the current exe
    const exePath = app.getPath('exe');
    let isStale = false;
    try {
      const result = await execRegistryCommand(
        'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\command" /ve'
      );
      isStale = !result.stdout.includes(exePath);
    } catch {
      isStale = true; // command subkey missing — re-register
    }

    if (isStale) {
      logToFile('Context menu paths are stale after reinstall — re-registering with current paths', 'INFO');
      await doEnableContextMenu();
      logToFile('Context menu re-registered successfully', 'INFO');
    }
  } catch {
    // Key doesn't exist — nothing to do
  }
};

// Enable Windows Explorer context menu
ipcMain.handle('contextMenu:enable', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Context menu only supported on Windows' };
  }
  try {
    await doEnableContextMenu();
    logToFile('Context menu enabled successfully', 'INFO');
    return { success: true };
  } catch (error) {
    logToFile(`Failed to enable context menu: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
});

// Disable Windows Explorer context menu
ipcMain.handle('contextMenu:disable', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Context menu only supported on Windows' };
  }

  try {
    logToFile('Disabling context menu', 'INFO');

    const commands = [
      'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /f',
      'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /f',
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CommandStore\\shell\\Quartz.OpenBin" /f',
      'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CommandStore\\shell\\Quartz.NoSkinLite" /f',
      // Cleanup legacy paths if they exist
      'reg delete "HKCU\\Software\\Classes\\.bin\\shell\\QuartzMenu" /f',
      'reg delete "HKCU\\Software\\Classes\\.py\\shell\\QuartzBin" /f',
      'reg delete "HKCU\\Software\\Classes\\bin_auto_file\\shell\\QuartzMenu" /f'
    ];

    for (const command of commands) {
      try {
        await execRegistryCommand(command);
      } catch (error) {
        // Ignore errors for keys that don't exist
        logToFile(`Registry delete warning (key may not exist): ${error.message}`, 'WARN');
      }
    }

    logToFile('Context menu disabled successfully', 'INFO');
    return { success: true };
  } catch (error) {
    logToFile(`Failed to disable context menu: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
});


// Execute an external executable with optional args (triggered from Tools page)
ipcMain.handle('tools:runExe', async (event, payload) => {
  try {
    const exePath = payload?.exePath;
    if (!exePath) {
      return { code: -1, stdout: '', stderr: 'Missing exePath' };
    }
    const args = Array.isArray(payload?.args) ? payload.args : [];
    const cwd = payload?.cwd || path.dirname(exePath);
    const openConsole = Boolean(payload?.openConsole);

    // On Windows, optionally open in a visible console using `start` to get a new window
    if (process.platform === 'win32' && openConsole) {
      const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
      const consoleArgs = ['/c', 'start', '', quote(exePath), ...args.map(quote)];
      const child = spawn('cmd.exe', consoleArgs, {
        cwd,
        windowsHide: false,
        shell: false,
        detached: true,
        stdio: 'ignore',
      });
      // We do not wait for completion since it's a new window; report success once spawned
      child.on('error', (err) => {
        // Surface spawn error
      });
      try { child.unref(); } catch { }
      return { code: 0, stdout: '', stderr: '' };
    }

    return await new Promise((resolve) => {
      const child = spawn(exePath, args, {
        cwd,
        shell: false, // Don't use shell to avoid cmd.exe issues
        windowsHide: true, // Hide the GUI window
        detached: false, // Don't detach so we can capture output
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        try { stdout += d.toString(); } catch { }
      });
      child.stderr?.on('data', (d) => {
        try { stderr += d.toString(); } catch { }
      });
      child.on('error', (err) => {
        resolve({ code: -1, stdout, stderr: String(err?.message || err) });
      });
      child.on('close', (code) => {
        resolve({ code: Number(code ?? -1), stdout, stderr });
      });
    });
  } catch (error) {
    return { code: -1, stdout: '', stderr: String(error?.message || error) };
  }
});

// Robust delete path with Windows-specific handling (force delete and taskkill)
ipcMain.handle('tools:deletePath', async (event, payload) => {
  const targetPath = payload?.path;
  const exeName = payload?.exeName;
  if (!targetPath) return { ok: false, error: 'Missing path' };
  try {
    const attemptDelete = () => {
      try {
        if (fs.rmSync) {
          fs.rmSync(targetPath, { force: true });
        } else {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        }
        return true;
      } catch (err) {
        return err;
      }
    };

    // First try direct
    let res = attemptDelete();
    if (res === true) return { ok: true };

    // On Windows, try taskkill by image name, then delete again
    if (process.platform === 'win32' && exeName) {
      try {
        await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/c', 'taskkill', '/f', '/im', exeName], {
            windowsHide: true,
            shell: false,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } catch { }
      res = attemptDelete();
      if (res === true) return { ok: true };
    }

    // Rename then delete fallback
    try {
      const dir = path.dirname(targetPath);
      const base = path.basename(targetPath);
      const tmp = path.join(dir, `${base}.pendingDelete-${Date.now()}`);
      fs.renameSync(targetPath, tmp);
      if (fs.rmSync) fs.rmSync(tmp, { force: true }); else fs.unlinkSync(tmp);
      return { ok: true };
    } catch (err2) {
      return { ok: false, error: String(res?.message || res) + ' | ' + String(err2?.message || err2) };
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

// Auto-updater event handlers
function setupAutoUpdater() {
  // Only enable auto-updater in production (not in dev mode)
  // To test in dev mode, set environment variable: ENABLE_AUTO_UPDATER=true
  const enableInDev = process.env.ENABLE_AUTO_UPDATER === 'true';
  if ((isDev || !app.isPackaged) && !enableInDev) {
    logToFile('Auto-updater disabled in development mode', 'INFO');
    logToFile('To enable for testing, set ENABLE_AUTO_UPDATER=true', 'INFO');
    return;
  }

  if (enableInDev) {
    logToFile('⚠️ AUTO-UPDATER ENABLED IN DEV MODE (FOR TESTING ONLY)', 'WARNING');
  }

  logToFile('Setting up auto-updater', 'INFO');

  autoUpdater.on('checking-for-update', () => {
    logToFile('Checking for update...', 'INFO');
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    logToFile(`Update available: ${info.version}`, 'INFO');
    // Cache the update info for download
    cachedUpdateInfo = info;
    // Also ensure autoUpdater has it
    autoUpdater.updateInfo = info;
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || ''
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    logToFile(`Update not available. Current version: ${info.version}`, 'INFO');
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:not-available', {
        version: info.version
      });
    }
  });

  autoUpdater.on('error', (err) => {
    logToFile(`Auto-updater error: ${err.message}`, 'ERROR');
    logToFile(`Auto-updater error details: ${JSON.stringify(err)}`, 'ERROR');
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:error', {
        message: err.message
      });
    }
    // Fallback: Try manual GitHub API check if electron-updater fails
    if (!enableInDev) {
      logToFile('Attempting fallback GitHub API check...', 'INFO');
      checkUpdatesViaGitHubAPI().catch(fallbackErr => {
        logToFile(`Fallback check also failed: ${fallbackErr.message}`, 'ERROR');
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    logToFile(message, 'INFO');
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logToFile(`Update downloaded: ${info.version}. Will install on app quit.`, 'INFO');
    if (updateCheckWindow) {
      updateCheckWindow.webContents.send('update:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || ''
      });
    }
  });

  // Check for updates after app is ready (with delay to not block startup)
  setTimeout(() => {
    try {
      logToFile('Checking for updates...', 'INFO');
      logToFile(`Current version: ${app.getVersion()}`, 'INFO');
      logToFile(`isDev: ${isDev}, isPackaged: ${app.isPackaged}`, 'INFO');

      // In dev mode, we need to manually set the feed URL and use checkForUpdatesAndNotify
      if (enableInDev) {
        // Set feed URL manually for dev testing
        autoUpdater.setFeedURL({
          provider: 'github',
          owner: 'RitoShark',
          repo: 'Quartz'
        });
        // Force the config to allow dev checks
        autoUpdater.forceDevUpdateConfig = true;
        // Use checkForUpdatesAndNotify which is designed for dev/testing scenarios
        logToFile('Calling checkForUpdatesAndNotify (dev mode)...', 'INFO');
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
          logToFile(`Update check error: ${err.message}`, 'ERROR');
          logToFile(`Stack trace: ${err.stack}`, 'ERROR');
        });
      } else {
        // Production mode - ensure feed URL is set
        logToFile('Production mode - checking for updates via electron-updater', 'INFO');
        autoUpdater.checkForUpdates().catch(err => {
          logToFile(`Update check failed: ${err.message}`, 'ERROR');
          logToFile(`Trying fallback GitHub API check...`, 'INFO');
          checkUpdatesViaGitHubAPI().catch(fallbackErr => {
            logToFile(`Fallback check failed: ${fallbackErr.message}`, 'ERROR');
          });
        });
      }
    } catch (err) {
      logToFile(`Failed to check for updates: ${err.message}`, 'ERROR');
      logToFile(`Stack trace: ${err.stack}`, 'ERROR');
    }
  }, 3000); // Check 3 seconds after app start
}

// Fallback: Manual GitHub API check if electron-updater fails
async function checkUpdatesViaGitHubAPI() {
  return new Promise((resolve, reject) => {
    try {
      logToFile('Checking updates via GitHub API (fallback)...', 'INFO');
      const currentVersion = app.getVersion();

      const options = {
        hostname: 'api.github.com',
        path: '/repos/RitoShark/Quartz/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'Quartz-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              throw new Error(`GitHub API returned ${res.statusCode}`);
            }

            const release = JSON.parse(data);
            const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

            logToFile(`GitHub API - Current: ${currentVersion}, Latest: ${latestVersion}`, 'INFO');

            // Simple semver comparison (basic)
            const compareVersions = (v1, v2) => {
              const parts1 = v1.split('.').map(Number);
              const parts2 = v2.split('.').map(Number);
              for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                const a = parts1[i] || 0;
                const b = parts2[i] || 0;
                if (a < b) return -1;
                if (a > b) return 1;
              }
              return 0;
            };

            if (compareVersions(currentVersion, latestVersion) < 0) {
              logToFile(`Update available via GitHub API: ${latestVersion}`, 'INFO');
              if (updateCheckWindow) {
                updateCheckWindow.webContents.send('update:available', {
                  version: latestVersion,
                  releaseDate: release.published_at,
                  releaseNotes: release.body || ''
                });
              }
              resolve({ updateAvailable: true, version: latestVersion });
            } else {
              logToFile('No update available via GitHub API', 'INFO');
              if (updateCheckWindow) {
                updateCheckWindow.webContents.send('update:not-available', {
                  version: latestVersion
                });
              }
              resolve({ updateAvailable: false, version: latestVersion });
            }
          } catch (parseError) {
            logToFile(`Failed to parse GitHub API response: ${parseError.message}`, 'ERROR');
            reject(parseError);
          }
        });
      });

      req.on('error', (error) => {
        logToFile(`GitHub API request failed: ${error.message}`, 'ERROR');
        reject(error);
      });

      req.end();
    } catch (error) {
      logToFile(`GitHub API check failed: ${error.message}`, 'ERROR');
      reject(error);
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  logToFile('APP: whenReady triggered - initializing application', 'INFO');

  // Register local-file protocol to allow loading local images securely
  protocol.registerFileProtocol('local-file', (request, callback) => {
    try {
      const urlString = request.url;
      // Strip protocol and any number of leading slashes
      let filePath = urlString.replace(/^local-file:\/+/i, '');

      // Decoded first to handle spaces and special chars
      filePath = decodeURIComponent(filePath);

      // Fix Windows drive letter if it's missing the colon (e.g., "c/Users" -> "c:/Users")
      // Browser normalization often strips the colon
      if (/^[a-zA-Z]\//.test(filePath)) {
        filePath = filePath[0] + ':' + filePath.slice(1);
      }

      // Ensure it's an absolute path
      const absolutePath = path.resolve(filePath);

      logToFile(`[PROTOCOL] Request: ${urlString} -> Resolved: ${absolutePath}`, 'INFO');

      if (!fs.existsSync(absolutePath)) {
        logToFile(`[PROTOCOL] File not found: ${absolutePath}`, 'ERROR');
      }

      return callback({ path: absolutePath });
    } catch (error) {
      logToFile(`[PROTOCOL] Critical error: ${error.message}`, 'ERROR');
      return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
    }
  });

  try { app.setAppUserModelId('com.github.ritoshark.quartz'); } catch { }
  createWindow();

  // Setup auto-updater (only in production)
  setupAutoUpdater();

  // Copy ritobin_cli.exe to FrogTools (if needed)
  ensureRitobinCli();

  // Copy default assets to AppData/Roaming/Quartz/assets on first run (if needed)
  ensureDefaultAssets();

  // Copy bundled cursors to AppData/Roaming/Quartz/cursors on first run (if needed)
  ensureDefaultCursors();

  // Re-register context menu if paths are stale after reinstall
  refreshContextMenuIfStale();

  // Check for hash files (in background, non-blocking)
  setTimeout(() => {
    try {
      const result = hashManager.checkHashes();
      if (!result.allPresent && result.missing.length > 0) {
        logToFile(`Hash files missing (${result.missing.length}): ${result.missing.join(', ')}. Auto-download will be triggered on first use.`, 'INFO');
      } else {
        logToFile('All hash files present', 'INFO');
      }
    } catch (err) {
      logToFile(`Hash check error: ${err.message}`, 'WARNING');
    }
  }, 1000);

  // Backend service startup disabled - using JavaScript implementations instead
  // logToFile('APP: Scheduling backend service startup', 'INFO');
  // const delay = isDev && !app.isPackaged ? 2000 : 5000;
  // setTimeout(() => {
  //   logToFile(`APP: Starting backend service (delay: ${delay}ms)`, 'INFO');
  //   ensureBackendService();
  // }, delay);
  logToFile('APP: Backend service startup disabled - using JavaScript implementations', 'INFO');
});

// LtMAO related IPC
ipcMain.handle('ltmao:getPath', async () => {
  const { base, pythonPath, cliScript } = getLtmaoPythonAndCli();
  return { base, pythonPath, cliScript };
});

ipcMain.handle('ltmao:testPython', async () => {
  try {
    const { base, pythonPath } = getLtmaoPythonAndCli();
    if (!base || !pythonPath || !fs.existsSync(pythonPath)) {
      return { ok: false, error: 'LtMAO runtime or python not found' };
    }
    return await new Promise((resolve) => {
      const child = spawn(pythonPath, ['--version'], { cwd: base, windowsHide: true, shell: false });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => { out += String(d); });
      child.stderr?.on('data', (d) => { err += String(d); });
      child.on('close', (code) => resolve({ ok: code === 0, code, stdout: out.trim(), stderr: err.trim() }));
      child.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Clear texture cache on app quit
function clearTextureCacheOnQuit() {
  // Only clear once
  if (textureCacheCleared) {
    return;
  }
  textureCacheCleared = true;

  try {
    const os = require('os');
    const appDataCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'Quartz', 'TextureCache');

    if (fs.existsSync(appDataCacheDir)) {
      const files = fs.readdirSync(appDataCacheDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.png')) {
          const filePath = path.join(appDataCacheDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (error) {
            logToFile(`Failed to delete cache file ${file}: ${error.message}`, 'WARN');
          }
        }
      }

      if (deletedCount > 0) {
        logToFile(`Cleared ${deletedCount} cached texture files from TextureCache`, 'INFO');
      } else {
        logToFile(`Texture cache directory was empty, nothing to clear`, 'INFO');
      }
    } else {
      logToFile(`Texture cache directory does not exist, nothing to clear`, 'INFO');
    }
  } catch (error) {
    logToFile(`Error clearing texture cache: ${error.message}`, 'ERROR');
  }
}

// Clean up PyInstaller _MEI* temporary folders
function cleanupMeiFolders() {
  try {
    const os = require('os');
    const tempDir = os.tmpdir();

    if (!fs.existsSync(tempDir)) {
      return;
    }

    // Find all _MEI* folders
    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    const meiFolders = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('_MEI'))
      .map(entry => path.join(tempDir, entry.name));

    if (meiFolders.length === 0) {
      return;
    }

    console.log(`🧹 Found ${meiFolders.length} _MEI* folder(s) to clean up...`);
    logToFile(`Found ${meiFolders.length} _MEI* folder(s) to clean up`, 'INFO');

    let totalSize = 0;
    let deletedCount = 0;

    for (const meiFolder of meiFolders) {
      try {
        // Calculate folder size
        let folderSize = 0;
        const calculateSize = (dir) => {
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              const itemPath = path.join(dir, item.name);
              try {
                if (item.isDirectory()) {
                  calculateSize(itemPath);
                } else {
                  const stats = fs.statSync(itemPath);
                  folderSize += stats.size;
                }
              } catch (e) {
                // Skip files/folders we can't access
              }
            }
          } catch (e) {
            // Skip directories we can't read
          }
        };

        calculateSize(meiFolder);

        // Try to delete the folder
        try {
          fs.rmSync(meiFolder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          totalSize += folderSize;
          deletedCount++;
          const sizeMB = (folderSize / (1024 * 1024)).toFixed(2);
          console.log(`✅ Deleted: ${path.basename(meiFolder)} (${sizeMB} MB)`);
          logToFile(`Deleted _MEI folder: ${path.basename(meiFolder)} (${sizeMB} MB)`, 'INFO');
        } catch (deleteError) {
          // Folder might be in use, skip it
          console.log(`⚠️ Could not delete ${path.basename(meiFolder)}: ${deleteError.message}`);
          logToFile(`Could not delete _MEI folder ${path.basename(meiFolder)}: ${deleteError.message}`, 'WARN');
        }
      } catch (error) {
        console.log(`⚠️ Error processing ${path.basename(meiFolder)}: ${error.message}`);
        logToFile(`Error processing _MEI folder ${path.basename(meiFolder)}: ${error.message}`, 'WARN');
      }
    }

    if (deletedCount > 0) {
      const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup complete: Deleted ${deletedCount} folder(s), freed ${totalMB} MB`);
      logToFile(`_MEI cleanup complete: Deleted ${deletedCount} folder(s), freed ${totalMB} MB`, 'INFO');
    } else {
      console.log(`ℹ️ No _MEI* folders were deleted (may be in use)`);
      logToFile(`No _MEI* folders were deleted (may be in use)`, 'INFO');
    }
  } catch (error) {
    console.error(`❌ Error during _MEI* cleanup: ${error.message}`);
    logToFile(`Error during _MEI* cleanup: ${error.message}`, 'ERROR');
  }
}

// Quit when all windows are closed.
app.on('window-all-closed', async () => {
  // Clear texture cache before closing
  clearTextureCacheOnQuit();

  // Clean up _MEI* folders on app close
  cleanupMeiFolders();

  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app-level quit (e.g., Cmd+Q / File->Quit) with unsaved guard
app.on('before-quit', async (e) => {
  // Clear texture cache on app quit
  clearTextureCacheOnQuit();

  try {
    console.log('📌 before-quit event triggered');

    // If already quitting/shutting down, allow it
    if (isQuitting || isShuttingDown) {
      console.log('✅ Already quitting/shutting down, allowing quit...');
      return;
    }

    const wins = BrowserWindow.getAllWindows();
    const win = wins && wins.length ? wins[0] : null;
    if (!win) {
      console.log('No windows to check, proceeding with quit');
      isQuitting = true;
      isShuttingDown = true;
      // Clear texture cache before quitting
      clearTextureCacheOnQuit();
      // Clean up _MEI* folders on app close
      cleanupMeiFolders();
      // Clear saved bin paths before quitting (only when actually shutting down)
      clearSavedBinPaths();
      return;
    }

    // Check unsaved flag from renderer
    let hasUnsaved = false;
    try {
      hasUnsaved = await win.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
    } catch { }

    if (!hasUnsaved) {
      console.log('No unsaved changes, proceeding with quit');
      isQuitting = true;
      isShuttingDown = true;
      try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch { }
      // Clear texture cache before quitting
      clearTextureCacheOnQuit();
      // Clean up _MEI* folders on app close
      cleanupMeiFolders();
      // Clear saved bin paths before quitting (only when actually shutting down)
      clearSavedBinPaths();
      return;
    }

    // Prevent quit and show dialog
    e.preventDefault();
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Exit Without Saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved Changes',
      message: 'You have unsaved BIN changes. Exit without saving?',
      noLink: true,
    });

    if (result.response === 0) {
      console.log('User confirmed quit without saving');
      isQuitting = true;
      isShuttingDown = true;
      try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch { }
      // Clear texture cache before quitting
      clearTextureCacheOnQuit();
      // Clean up _MEI* folders on app close
      cleanupMeiFolders();
      // Clear saved bin paths before quitting (only when actually shutting down)
      clearSavedBinPaths();
      const w = win; // reference before async quit
      try { w?.destroy?.(); } catch { }
      app.quit();
    } else {
      console.log('User cancelled quit');
      // Cancelled: do nothing
    }
  } catch (err) {
    console.error('❌ Error in before-quit handler:', err);
    // On error, allow quit to avoid trapping
    isQuitting = true;
    isShuttingDown = true;
    // Clear texture cache before quitting
    clearTextureCacheOnQuit();
    // Clean up _MEI* folders on app close
    cleanupMeiFolders();
    // Clear saved bin paths before quitting (only when actually shutting down)
    clearSavedBinPaths();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ---------------- Headless Upscale backend (Upscayl ncnn CLI for Windows) ----------------
// Use Upscayl's ncnn fork that publishes Windows zips
const REAL_ESRGAN_RELEASE_API = 'https://api.github.com/repos/upscayl/upscayl-ncnn/releases/latest';
const REAL_ESRGAN_RELEASES_API = 'https://api.github.com/repos/upscayl/upscayl-ncnn/releases';
const NIHUI_RELEASE_API = 'https://api.github.com/repos/nihui/realesrgan-ncnn-vulkan/releases/latest';
const NIHUI_RELEASES_API = 'https://api.github.com/repos/nihui/realesrgan-ncnn-vulkan/releases';
const UPSCAYL_UA_OPTIONS = { headers: { 'User-Agent': 'Quartz', 'Accept': 'application/octet-stream' } };

// Download configuration
const UPSCALE_DOWNLOADS = {
  binary: {
    name: "Upscayl Binary",
    url: "https://github.com/upscayl/upscayl-ncnn/releases/download/20240601-103425/upscayl-bin-20240601-103425-windows.zip",
    filename: "upscayl-bin-20240601-103425-windows.zip",
    size: "~50MB",
    required: true
  },
  models: [
    {
      name: "Upscayl Standard 4x",
      files: [
        {
          filename: "upscayl-standard-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.bin",
          size: "32MB"
        },
        {
          filename: "upscayl-standard-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.param",
          size: "1MB"
        }
      ],
      required: true
    },
    {
      name: "Upscayl Lite 4x",
      files: [
        {
          filename: "upscayl-lite-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.bin",
          size: "2.3MB"
        },
        {
          filename: "upscayl-lite-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.param",
          size: "1MB"
        }
      ],
      required: true
    },
    {
      name: "Digital Art 4x",
      files: [
        {
          filename: "digital-art-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.bin",
          size: "8.5MB"
        },
        {
          filename: "digital-art-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "High Fidelity 4x",
      files: [
        {
          filename: "high-fidelity-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.bin",
          size: "32MB"
        },
        {
          filename: "high-fidelity-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Ultrasharp 4x",
      files: [
        {
          filename: "ultrasharp-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.bin",
          size: "32MB"
        },
        {
          filename: "ultrasharp-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Remacri 4x",
      files: [
        {
          filename: "remacri-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.bin",
          size: "32MB"
        },
        {
          filename: "remacri-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Ultramix Balanced 4x",
      files: [
        {
          filename: "ultramix-balanced-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.bin",
          size: "32MB"
        },
        {
          filename: "ultramix-balanced-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.param",
          size: "1MB"
        }
      ],
      required: false
    }
  ]
};

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const jsonHeaders = { headers: { 'User-Agent': 'Quartz', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
    https.get(url, jsonHeaders, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function httpDownloadToFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl, remaining) => {
      https.get(currentUrl, UPSCAYL_UA_OPTIONS, (res) => {
        const status = Number(res.statusCode || 0);
        // Handle redirects (GitHub often returns 302 to S3)
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = res.headers?.location;
          res.resume(); // discard body
          if (location && remaining > 0) {
            const nextUrl = new URL(location, currentUrl).toString();
            return doRequest(nextUrl, remaining - 1);
          }
          return reject(new Error(`HTTP ${status} with no redirect location`));
        }

        if (status !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }

        try { fs.mkdirSync(path.dirname(destPath), { recursive: true }); } catch { }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destPath)));
        file.on('error', (err) => {
          try { file.close?.(); } catch { }
          try { fs.unlinkSync(destPath); } catch { }
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    };
    doRequest(url, redirectsLeft);
  });
}

function getUpscaleInstallDir() {
  return path.join(getUserDataPath(), 'upscale-backends');
}

function getUpscaleModelsDir() {
  return path.join(getUpscaleInstallDir(), 'upscayl-bin-20240601-103425-windows', 'models');
}

function findRealEsrganWindowsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  // Prefer Upscayl ncnn Windows zip patterns, e.g. upscayl-bin-YYYYMMDD-HHMMSS-windows.zip
  let candidate = assets.find((a) => /windows/i.test(a.name) && /upscayl.*bin.*windows.*\.zip$/i.test(a.name));
  if (candidate) return candidate;
  // Fallback: any windows zip
  candidate = assets.find((a) => /(windows|win64|win|x64)/i.test(a.name) && /\.zip$/i.test(a.name));
  return candidate || null;
}

function findNihuiWindowsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  // Typical names: realesrgan-ncnn-vulkan-YYYYMMDD-windows.zip
  let candidate = assets.find((a) => /windows/i.test(a.name) && /realesrgan.*ncnn.*vulkan.*\.zip$/i.test(a.name));
  if (candidate) return candidate;
  candidate = assets.find((a) => /(windows|win64|win|x64)/i.test(a.name) && /\.zip$/i.test(a.name));
  return candidate || null;
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch { }
}

function copyDirRecursive(src, dest) {
  try {
    if (!fs.existsSync(src)) return false;
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) {
        copyDirRecursive(s, d);
      } else if (e.isFile()) {
        fs.copyFileSync(s, d);
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Windows-specific: robust download via PowerShell (handles redirects reliably)
async function downloadWithPowershell(url, destPath) {
  return await new Promise((resolve) => {
    try { fs.mkdirSync(path.dirname(destPath), { recursive: true }); } catch { }
    const cmd = `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing -Headers @{ 'User-Agent' = 'Quartz' }`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, shell: false });
    ps.on('error', () => resolve({ ok: false }));
    ps.on('close', (code) => resolve({ ok: code === 0 }));
  });
}

// Minimal zip extraction using PowerShell (Windows-only) to avoid extra deps
async function extractZipWindows(zipPath, outDir) {
  return await new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`], {
      windowsHide: true,
      shell: false,
    });
    ps.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
    ps.on('close', (code) => {
      resolve({ ok: code === 0, code });
    });
  });
}

function findExeRecursively(rootDir, preferCli = true) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  let found = '';
  for (const e of entries) {
    const p = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      const sub = findExeRecursively(p, preferCli);
      if (sub) return sub;
    } else if (e.isFile()) {
      const name = e.name.toLowerCase();
      if (name.endsWith('.exe')) {
        if (preferCli && name.includes('ncnn')) return p;
        if (!found) found = p;
      }
    }
  }
  return found;
}

// Check if upscale components are installed
ipcMain.handle('upscale:check-status', async () => {
  try {
    // Check downloaded components only
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');
    const downloadedExePath = path.join(binaryDir, 'upscayl-bin.exe');

    const status = {
      binary: {
        installed: fs.existsSync(downloadedExePath),
        path: downloadedExePath,
        bundled: false
      },
      models: {
        installed: [],
        missing: [],
        total: UPSCALE_DOWNLOADS.models.length
      }
    };

    // Check each model
    for (const model of UPSCALE_DOWNLOADS.models) {
      let allFilesExist = true;
      const installedFiles = [];

      for (const file of model.files) {
        const filePath = path.join(modelsDir, file.filename);
        if (fs.existsSync(filePath)) {
          installedFiles.push(file.filename);
        } else {
          allFilesExist = false;
        }
      }

      if (allFilesExist) {
        status.models.installed.push(model.name);
      } else {
        status.models.missing.push(model);
      }
    }

    return status;
  } catch (e) {
    console.log('❌ Error checking upscale status:', e.message);
    throw e;
  }
});

// Download all upscale components
ipcMain.handle('upscale:download-all', async (event) => {
  try {
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');

    // Send initial status
    event.sender.send('upscale:progress', {
      step: 'init',
      message: 'Initializing download...',
      progress: 0
    });

    // Ensure install directory exists
    try {
      ensureDir(installDir);
      event.sender.send('upscale:log', `✅ Install directory: ${installDir}`);
    } catch (e) {
      const errorMsg = `Failed to create install directory: ${e.message}`;
      event.sender.send('upscale:log', `❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Step 1: Download and extract binary
    event.sender.send('upscale:progress', {
      step: 'binary',
      message: 'Downloading Upscayl Binary...',
      progress: 0
    });

    const zipPath = path.join(installDir, UPSCALE_DOWNLOADS.binary.filename);

    // Try Node.js download first, fallback to PowerShell if it fails
    let downloadSuccess = false;
    try {
      event.sender.send('upscale:log', '🔍 Attempting Node.js download...');
      await httpDownloadToFile(UPSCALE_DOWNLOADS.binary.url, zipPath);
      downloadSuccess = true;
      event.sender.send('upscale:log', '✅ Node.js download successful');
    } catch (nodeError) {
      event.sender.send('upscale:log', `❌ Node.js download failed: ${nodeError.message}`);
      event.sender.send('upscale:log', '🔍 Attempting PowerShell download...');

      try {
        const psResult = await downloadWithPowershell(UPSCALE_DOWNLOADS.binary.url, zipPath);
        if (psResult.ok) {
          downloadSuccess = true;
          event.sender.send('upscale:log', '✅ PowerShell download successful');
        } else {
          throw new Error('PowerShell download failed');
        }
      } catch (psError) {
        event.sender.send('upscale:log', `❌ PowerShell download failed: ${psError.message}`);
        throw new Error(`Download failed with both methods. Node.js error: ${nodeError.message}, PowerShell error: ${psError.message}`);
      }
    }

    event.sender.send('upscale:progress', {
      step: 'binary',
      message: 'Extracting Binary...',
      progress: 50
    });

    const extractResult = await extractZipWindows(zipPath, installDir);
    if (!extractResult.ok) {
      const errorMsg = `Failed to extract binary: ${extractResult.error || 'Unknown error'}`;
      event.sender.send('upscale:log', `❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    event.sender.send('upscale:log', '✅ Binary extraction successful');

    // Clean up zip file
    try {
      fs.unlinkSync(zipPath);
      event.sender.send('upscale:log', '✅ Cleaned up zip file');
    } catch { }

    event.sender.send('upscale:progress', {
      step: 'binary',
      message: 'Binary Ready!',
      progress: 100
    });

    // Step 2: Download models
    ensureDir(modelsDir);

    for (let i = 0; i < UPSCALE_DOWNLOADS.models.length; i++) {
      const model = UPSCALE_DOWNLOADS.models[i];

      event.sender.send('upscale:progress', {
        step: 'models',
        message: `Downloading ${model.name}...`,
        progress: (i / UPSCALE_DOWNLOADS.models.length) * 100,
        current: i + 1,
        total: UPSCALE_DOWNLOADS.models.length
      });

      try {
        // Download all files for this model
        for (const file of model.files) {
          const filePath = path.join(modelsDir, file.filename);

          // Try Node.js download first, fallback to PowerShell if it fails
          let fileDownloadSuccess = false;
          try {
            await httpDownloadToFile(file.url, filePath);
            fileDownloadSuccess = true;
            event.sender.send('upscale:log', `✅ Downloaded ${file.filename}`);
          } catch (nodeError) {
            event.sender.send('upscale:log', `❌ Node.js download failed for ${file.filename}: ${nodeError.message}`);

            try {
              const psResult = await downloadWithPowershell(file.url, filePath);
              if (psResult.ok) {
                fileDownloadSuccess = true;
                event.sender.send('upscale:log', `✅ Downloaded ${file.filename} (PowerShell)`);
              } else {
                throw new Error('PowerShell download failed');
              }
            } catch (psError) {
              event.sender.send('upscale:log', `❌ PowerShell download failed for ${file.filename}: ${psError.message}`);
              throw new Error(`Failed to download ${file.filename} with both methods`);
            }
          }

          if (!fileDownloadSuccess) {
            throw new Error(`Failed to download ${file.filename}`);
          }
        }
      } catch (e) {
        event.sender.send('upscale:log', `❌ Failed to download ${model.name}: ${e.message}`);
        // Continue with other models
      }
    }

    event.sender.send('upscale:progress', {
      step: 'complete',
      message: 'All components downloaded successfully!',
      progress: 100
    });

    // Save the binary path
    const exePath = path.join(binaryDir, 'upscayl-bin.exe');
    const savedPrefs = loadPrefs();
    savedPrefs.RealesrganExePath = exePath;
    savePrefs(savedPrefs);

    return { success: true, exePath };

  } catch (e) {
    event.sender.send('upscale:log', `❌ Error downloading upscale components: ${e.message}`);
    event.sender.send('upscale:log', `❌ Install directory: ${installDir}`);
    event.sender.send('upscale:log', `❌ Binary directory: ${binaryDir}`);
    event.sender.send('upscale:log', `❌ Models directory: ${modelsDir}`);

    event.sender.send('upscale:progress', {
      step: 'error',
      message: `Download failed: ${e.message}`,
      progress: 0
    });
    throw e;
  }
});

// Stream upscaling process with real-time output
ipcMain.handle('upscayl:stream', async (event, { exePath, args, cwd }) => {
  try {
    console.log('🔍 Starting upscayl stream with:', { exePath, args, cwd });

    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');

      const process = spawn(exePath, args, {
        cwd: cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Store process reference for cancellation
      global.currentUpscaylProcess = process;

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log('Upscayl stdout:', output);
        // Send real-time updates to renderer
        event.sender.send('upscayl:log', output);
      });

      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('Upscayl stderr:', output);

        // Parse progress percentage from stderr
        const progressMatch = output.match(/(\d+(?:,\d+)?)%/);
        if (progressMatch) {
          const progressStr = progressMatch[1].replace(',', '.');
          const progress = parseFloat(progressStr);
          if (!isNaN(progress) && progress >= 0 && progress <= 100) {
            console.log('Parsed progress:', progress);
            event.sender.send('upscayl:progress', progress);
          }
        }

        // Send real-time updates to renderer
        event.sender.send('upscayl:log', output);
      });

      process.on('close', (code) => {
        console.log('Upscayl process exited with code:', code);
        resolve({ code, stdout, stderr });
      });

      process.on('error', (error) => {
        console.error('Upscayl process error:', error);
        reject(error);
      });

      // Handle process termination
      process.on('exit', (code, signal) => {
        console.log('Upscayl process exit:', { code, signal });
        if (signal) {
          reject(new Error(`Process killed with signal: ${signal}`));
        }
      });
    });

  } catch (error) {
    console.error('❌ Error in upscayl:stream:', error);
    throw error;
  }
});

// Cancel running upscayl process (best-effort)
ipcMain.handle('upscayl:cancel', async () => {
  try {
    const proc = global.currentUpscaylProcess;
    if (!proc) return { ok: true };

    // Try graceful kill first
    try { proc.kill('SIGTERM'); } catch { }

    // On Windows, ensure the entire tree is terminated
    if (process.platform === 'win32' && proc.pid) {
      try {
        await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/c', 'taskkill', '/PID', String(proc.pid), '/T', '/F'], {
            windowsHide: true,
            shell: false,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } catch { }
    }

    // Clear reference
    global.currentUpscaylProcess = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Batch processing handler for multiple files
ipcMain.handle('upscayl:batch-process', async (event, { inputFolder, outputFolder, model, scale, extraArgs, exePath }) => {
  try {
    console.log('🔍 Starting batch processing:', { inputFolder, outputFolder, model, scale, exePath });
    console.log('🔍 Batch processing parameters received:', { inputFolder, outputFolder, model, scale, extraArgs, exePath });

    // Ensure output directory exists
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Discover image files in the input folder
    const imageFiles = discoverImageFiles(inputFolder);
    console.log(`📁 Found ${imageFiles.length} image files in folder`);

    if (imageFiles.length === 0) {
      throw new Error('No supported image files found in the selected folder');
    }

    // Send initial batch info
    event.sender.send('upscayl:batch-start', {
      totalFiles: imageFiles.length,
      files: imageFiles.map(f => path.basename(f))
    });

    const results = {
      total: imageFiles.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process files sequentially
    for (let i = 0; i < imageFiles.length; i++) {
      const inputFile = imageFiles[i];
      const fileName = path.basename(inputFile);
      const fileExt = path.extname(inputFile);
      const baseName = path.basename(inputFile, fileExt);

      // Create output filename
      const outputFileName = `${baseName}_x${scale}${fileExt}`;
      const outputFile = path.join(outputFolder, outputFileName);

      console.log(`🔄 Processing file ${i + 1}/${imageFiles.length}: ${fileName}`);

      // Send batch progress update
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1,
        totalFiles: imageFiles.length,
        currentFileName: fileName,
        overallProgress: Math.round(((i) / imageFiles.length) * 100),
        fileProgress: 0
      });

      try {
        // Build upscayl arguments for this file
        const args = [
          '-i', inputFile,
          '-o', outputFile,
          '-s', String(scale),
          '-n', model
        ];

        if (extraArgs && extraArgs.trim().length) {
          args.push(...extraArgs.split(' ').filter(Boolean));
        }

        const exeDir = path.dirname(exePath);

        // Process this file using the existing streaming mechanism
        const { code, stdout, stderr } = await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');

          const process = spawn(exePath, args, {
            cwd: exeDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          // Store process reference for cancellation
          global.currentUpscaylProcess = process;

          let stdout = '';
          let stderr = '';

          process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            event.sender.send('upscayl:log', output);
          });

          process.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;

            // Parse progress percentage from stderr for individual file
            const progressMatch = output.match(/(\d+(?:,\d+)?)%/);
            if (progressMatch) {
              const progressStr = progressMatch[1].replace(',', '.');
              const progress = parseFloat(progressStr);
              if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                event.sender.send('upscayl:batch-progress', {
                  currentFile: i + 1,
                  totalFiles: imageFiles.length,
                  currentFileName: fileName,
                  overallProgress: Math.round(((i) / imageFiles.length) * 100),
                  fileProgress: progress
                });
              }
            }

            event.sender.send('upscayl:log', output);
          });

          process.on('close', (code) => {
            resolve({ code, stdout, stderr });
          });

          process.on('error', (error) => {
            reject(error);
          });
        });

        if (code === 0) {
          results.successful++;
          console.log(`✅ Successfully processed: ${fileName}`);
        } else {
          results.failed++;
          const error = `Failed to process ${fileName}: ${stderr}`;
          results.errors.push(error);
          console.log(`❌ Failed to process: ${fileName}`);
          event.sender.send('upscayl:log', `❌ ${error}\n`);
        }

      } catch (fileError) {
        results.failed++;
        const error = `Error processing ${fileName}: ${fileError.message}`;
        results.errors.push(error);
        console.log(`❌ Error processing: ${fileName}`, fileError);
        event.sender.send('upscayl:log', `❌ ${error}\n`);
      }

      // Send updated overall progress
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1,
        totalFiles: imageFiles.length,
        currentFileName: fileName,
        overallProgress: Math.round(((i + 1) / imageFiles.length) * 100),
        fileProgress: 100
      });
    }

    // Send batch completion
    event.sender.send('upscayl:batch-complete', results);

    console.log(`✅ Batch processing complete: ${results.successful}/${results.total} successful`);
    return results;

  } catch (error) {
    console.error('❌ Error in batch processing:', error);
    throw error;
  }
});

// Helper function to discover image files in a folder
function discoverImageFiles(folderPath) {
  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
  const imageFiles = [];

  try {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          imageFiles.push(filePath);
        }
      }
    }

    // Sort files alphabetically for consistent processing order
    return imageFiles.sort();

  } catch (error) {
    console.error('Error discovering image files:', error);
    throw new Error(`Failed to read folder: ${error.message}`);
  }
}

// Ensure Upscayl-bin is available (development only - production uses downloads)
ipcMain.handle('realesrgan.ensure', async () => {
  try {
    console.log('🔍 realesrgan.ensure called - checking setup...');
    const savedPrefs = loadPrefs();

    // In development, check for local upscale-backend directory
    const devPath = path.join(__dirname, 'upscale-backend', 'upscayl-bin-20240601-103425-windows', 'upscayl-bin.exe');
    console.log('🔍 Checking development path:', devPath);

    if (fs.existsSync(devPath)) {
      console.log('✅ Development executable found, saving path...');
      // Save the path for future use
      savedPrefs.RealesrganExePath = devPath;
      savePrefs(savedPrefs);
      return devPath;
    }

    // Fall back to any previously saved path if it exists
    if (savedPrefs?.RealesrganExePath && fs.existsSync(savedPrefs.RealesrganExePath)) {
      console.log('✅ Using saved path:', savedPrefs.RealesrganExePath);
      return savedPrefs.RealesrganExePath;
    }

    console.log('❌ No executable found - user needs to download from settings');
    // Return null to indicate user should download from settings
    return null;
  } catch (e) {
    console.log('❌ Error in realesrgan.ensure:', e.message);
    throw e;
  }
});





// ============================================================================
//  File Handlerr IPC Handlers
// ============================================================================

ipcMain.handle('filerandomizer:createBackup', async (event, { targetFolder, replacementFiles }) => {
  try {
    console.log('💾 Creating backup of target folder:', targetFolder);

    // Create backup folder with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = path.join(path.dirname(targetFolder), `backup_${path.basename(targetFolder)}_${timestamp}`);

    // Ensure backup folder exists
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }

    // Copy entire target folder to backup
    const copyFolder = (src, dest) => {
      if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        files.forEach(file => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          copyFolder(srcPath, destPath);
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };

    copyFolder(targetFolder, backupFolder);
    console.log('✅ Backup created successfully:', backupFolder);

    return {
      success: true,
      backupPath: backupFolder
    };
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:discoverFiles', async (event, { targetFolder, replacementFiles, smartNameMatching, filterMode, filterKeywords, scanSubdirectories }) => {
  try {
    // Detect if this is for renaming (no replacement files) or randomizing
    const isRenaming = !replacementFiles || replacementFiles.length === 0;

    if (isRenaming) {
      console.log('🔍 Discovering files for renaming in:', targetFolder);
    } else {
      console.log('🔍 Discovering files for replacement in:', targetFolder);
    }

    console.log('🧠 Smart name matching:', smartNameMatching);
    console.log('🔍 Filter mode:', filterMode);
    console.log('🔍 Filter keywords:', filterKeywords);

    // Validate target folder path
    if (!targetFolder || !fs.existsSync(targetFolder)) {
      throw new Error('Target folder does not exist or is invalid');
    }

    // Check if target folder is in a safe location
    const targetPath = path.resolve(targetFolder);
    const userProfile = process.env.USERPROFILE || process.env.HOME;
    const userProfilePath = path.resolve(userProfile);

    // Only allow scanning within user's own directories
    if (!targetPath.startsWith(userProfilePath)) {
      throw new Error('Target folder must be within your user profile directory for safety');
    }

    const discoveredFiles = {};
    let totalFiles = 0;
    let filteredFiles = 0;

    // Parse filter keywords
    const keywords = filterKeywords ? filterKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];

    // Function to check if file should be included based on filtering
    const shouldIncludeFile = (fileName) => {
      if (keywords.length === 0) return true;

      const fileNameLower = fileName.toLowerCase();
      const hasKeyword = keywords.some(keyword => fileNameLower.includes(keyword));

      if (filterMode === 'skip') {
        // Skip files containing keywords
        return !hasKeyword;
      } else {
        // Replace only files containing keywords
        return hasKeyword;
      }
    };

    let targetExtensions = [];
    if (isRenaming) {
      // For renaming, look for ALL files regardless of extension
      targetExtensions = null; // null means no extension restriction
      console.log('📁 Renamer mode: will scan for ALL files regardless of extension');
      console.log('🔍 Renamer mode detected - will scan for all files');
    } else {
      // For randomizing, use extensions from replacement files
      targetExtensions = [...new Set(replacementFiles.map(f => f.extension))];
      console.log('📁 Looking for files with extensions:', targetExtensions);
      console.log('🔍 Randomizer mode detected - will scan for specific file types');
    }
    console.log('📁 Subdirectory scanning:', scanSubdirectories ? 'ENABLED' : 'DISABLED');

    // Recursively scan for files with matching extensions
    const scanDirectory = (dir) => {
      try {
        if (!fs.existsSync(dir)) return;

        const items = fs.readdirSync(dir);
        for (const item of items) {
          try {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              // Skip system and protected directories
              const skipPatterns = [
                'node_modules', '.git', 'backup_', 'temp', 'tmp',
                'AppData', 'ProgramData', 'Windows', 'System32', 'Program Files',
                '$Recycle.Bin', 'System Volume Information', 'Recovery',
                'Local Settings', 'Application Data', 'LocalLow'
              ];
              const shouldSkip = skipPatterns.some(skip =>
                item.toLowerCase().includes(skip.toLowerCase()) ||
                fullPath.toLowerCase().includes(skip.toLowerCase())
              );

              // Additional safety: only scan within user profile
              if (!shouldSkip && fullPath.startsWith(userProfilePath)) {
                // Only scan subdirectories if the toggle is enabled
                if (scanSubdirectories) {
                  console.log(`📁 Scanning subdirectory: ${fullPath}`);
                  scanDirectory(fullPath);
                } else {
                  console.log(`🚫 Skipping subdirectory (disabled): ${fullPath}`);
                }
              }
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              console.log(`🔍 Checking file: ${item} with extension: ${ext}`);

              // Check if file should be included based on extension and filtering
              let shouldProcessFile = false;
              if (isRenaming) {
                // In renamer mode, process ALL files regardless of extension
                shouldProcessFile = true;
                console.log(`✅ Renamer mode: processing file ${item} (${ext})`);
              } else {
                // In randomizer mode, only process files with matching extensions
                shouldProcessFile = targetExtensions.includes(ext);
                if (shouldProcessFile) {
                  console.log(`✅ Extension ${ext} matches target extensions`);
                } else {
                  console.log(`❌ Extension ${ext} not in target extensions: ${targetExtensions.join(', ')}`);
                }
              }

              if (shouldProcessFile) {
                // Apply filtering
                if (shouldIncludeFile(item)) {
                  if (!discoveredFiles[ext]) {
                    discoveredFiles[ext] = [];
                  }
                  discoveredFiles[ext].push(fullPath);
                  totalFiles++;
                  console.log(`✅ Found matching file: ${item} (${ext})`);
                } else {
                  filteredFiles++;
                  console.log(`🚫 Filtered out file: ${item} (${ext})`);
                }
              }
            }
          } catch (itemError) {
            console.log(`⚠️ Skipping item ${item} due to error:`, itemError.message);
            continue;
          }
        }
      } catch (dirError) {
        console.log(`⚠️ Skipping directory ${dir} due to error:`, dirError.message);
      }
    };

    // Start scanning from target folder and climb up within project boundaries only
    let currentDir = targetFolder;
    const maxDepth = 10; // Allow deeper project scanning
    let depth = 0;

    // Find the project root by looking for common project indicators
    const findProjectRoot = (startDir) => {
      let dir = startDir;
      let projectRoot = startDir;

      // Look for project root indicators (go up to 5 levels max to avoid going too far)
      for (let i = 0; i < 5; i++) {
        if (dir === path.dirname(dir)) break; // Reached root

        try {
          const items = fs.readdirSync(dir);

          // Check for strong project indicators
          const hasStrongIndicators = items.some(item =>
            ['.git', 'package.json', 'Quartz-main'].includes(item)
          );

          // Check for moderate project indicators
          const hasModerateIndicators = items.some(item =>
            ['mod', 'assets', 'src', 'project.config'].some(indicator =>
              item.toLowerCase().includes(indicator.toLowerCase())
            )
          );

          // Only set as project root if we find strong indicators
          if (hasStrongIndicators) {
            projectRoot = dir;
            console.log(`✅ Found strong project indicator in: ${dir}`);
            break; // Stop here, don't go further up
          } else if (hasModerateIndicators && i === 0) {
            // Only use moderate indicators if we're at the starting directory
            projectRoot = dir;
            console.log(`✅ Found moderate project indicator in: ${dir}`);
          }

          dir = path.dirname(dir);
        } catch (error) {
          console.log(`⚠️ Cannot read directory ${dir}:`, error.message);
          break;
        }
      }

      return projectRoot;
    };

    const projectRoot = findProjectRoot(targetFolder);
    console.log(`🔍 Project root detected:`, projectRoot);

    // Scan the target folder and all its subdirectories (climbing down, not up)
    console.log(`🔍 Starting scan from target folder: ${targetFolder}`);

    // Just scan the target folder directly - scanDirectory will handle subdirectories recursively
    scanDirectory(targetFolder);

    console.log(`✅ Completed scanning target folder and all subdirectories`);

    if (isRenaming) {
      console.log(`✅ File discovery completed: ${totalFiles} files found for renaming, ${filteredFiles} filtered out`);
    } else {
      console.log(`✅ File discovery completed: ${totalFiles} files found for replacement, ${filteredFiles} filtered out`);
    }
    return {
      success: true,
      discoveredFiles,
      totalFiles,
      filteredFiles
    };
  } catch (error) {
    console.error('❌ Error discovering files:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:replaceFiles', async (event, { targetFolder, replacementFiles, discoveredFiles, smartNameMatching }) => {
  try {
    console.log('🔄 Starting file replacement process...');
    console.log(`🧠 Smart name matching: ${smartNameMatching ? 'ENABLED' : 'DISABLED'}`);

    let replacedCount = 0;
    const errors = [];
    let totalFiles = 0;

    // Calculate total files to process
    Object.values(discoveredFiles).forEach(files => {
      totalFiles += files.length;
    });

    // If smart name matching is enabled, create a mapping of base names to replacement files
    const baseNameToReplacement = new Map();

    // Process each file extension
    for (const [extension, filePaths] of Object.entries(discoveredFiles)) {
      console.log(`🔄 Processing ${extension} files:`, filePaths.length);

      // Get replacement files for this extension
      const extensionReplacementFiles = replacementFiles.filter(f => f.extension === extension);
      if (extensionReplacementFiles.length === 0) {
        console.log(`⚠️ No replacement files found for extension: ${extension}`);
        continue;
      }

      // Replace each file with progress updates
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        try {
          let selectedReplacement;

          if (smartNameMatching) {
            // Extract base name (everything before the last underscore)
            const fileName = path.basename(filePath, extension);
            const baseName = fileName.replace(/_[^_]*$/, ''); // Remove last suffix

            console.log(`🔍 File: ${fileName}, Base name: ${baseName}`);

            // Check if we already have a replacement for this base name
            if (baseNameToReplacement.has(baseName)) {
              selectedReplacement = baseNameToReplacement.get(baseName);
              console.log(`🔄 Using existing replacement for base name: ${baseName}`);
            } else {
              // Randomly select a new replacement for this base name
              selectedReplacement = extensionReplacementFiles[Math.floor(Math.random() * extensionReplacementFiles.length)];
              baseNameToReplacement.set(baseName, selectedReplacement);
              console.log(`🎲 New replacement selected for base name: ${baseName}`);
            }
          } else {
            // Random selection for each file (original behavior)
            const randomIndex = Math.floor(Math.random() * extensionReplacementFiles.length);
            selectedReplacement = extensionReplacementFiles[randomIndex];
          }

          console.log(`🔄 Replacing: ${filePath} with ${selectedReplacement.path}`);

          // Copy replacement file to target location
          fs.copyFileSync(selectedReplacement.path, filePath);
          replacedCount++;

          // Send progress update every 10 files or at the end
          if (replacedCount % 10 === 0 || replacedCount === totalFiles) {
            event.sender.send('filerandomizer:progress', {
              current: replacedCount,
              total: totalFiles,
              percentage: Math.round((replacedCount / totalFiles) * 100)
            });
          }

        } catch (error) {
          console.error(`❌ Error replacing file ${filePath}:`, error);
          errors.push({ file: filePath, error: error.message });
        }
      }
    }

    console.log(`✅ File replacement completed. Replaced ${replacedCount} files.`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during replacement.`);
    }

    return {
      success: true,
      replacedCount,
      errors
    };
  } catch (error) {
    console.error('❌ Error during file replacement:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:stop', async () => {
  try {
    console.log('🛑  File Handlerr stop requested');
    // Currently no long-running process to stop, but keeping for consistency
    return { success: true };
  } catch (error) {
    console.error('❌ Error stopping  File Handlerr:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('filerandomizer:renameFiles', async (event, { targetFolder, textToFind, textToReplaceWith, prefixToAdd, suffixToAdd, discoveredFiles }) => {
  try {
    console.log('✂️ Starting file renaming process...');
    console.log(`📁 Target folder: ${targetFolder}`);

    if (textToFind && textToReplaceWith !== undefined) {
      // Text replacement mode
      console.log(`✂️ Text to find: "${textToFind}"`);
      if (textToReplaceWith) {
        console.log(`🔄 Replace with: "${textToReplaceWith}"`);
      } else {
        console.log(`🗑️ Replace with: (delete completely)`);
      }
    } else if (prefixToAdd || suffixToAdd) {
      // Add prefix/suffix mode
      console.log(`🔧 Add prefix/suffix mode`);
      if (prefixToAdd) {
        console.log(`➕ Prefix to add: "${prefixToAdd}"`);
      }
      if (suffixToAdd) {
        console.log(`➕ Suffix to add: "${suffixToAdd}"`);
      }
    }

    let renamedCount = 0;
    const errors = [];
    let totalFiles = 0;

    // Calculate total files to process
    Object.values(discoveredFiles).forEach(files => {
      totalFiles += files.length;
    });

    console.log(`📊 Total files to rename: ${totalFiles}`);

    // Process each file extension
    for (const [extension, filePaths] of Object.entries(discoveredFiles)) {
      console.log(`✂️ Processing ${extension} files:`, filePaths.length);

      // Rename each file
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        try {
          const dir = path.dirname(filePath);
          const oldFileName = path.basename(filePath);
          let newFileName = oldFileName;

          if (textToFind && textToReplaceWith !== undefined) {
            // Text replacement mode
            newFileName = oldFileName.replace(new RegExp(textToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), textToReplaceWith || '');
          }

          // Add prefix if specified
          if (prefixToAdd) {
            newFileName = prefixToAdd + newFileName;
          }

          // Add suffix if specified (before the file extension)
          if (suffixToAdd) {
            const lastDotIndex = newFileName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
              // Insert suffix before the extension
              newFileName = newFileName.substring(0, lastDotIndex) + suffixToAdd + newFileName.substring(lastDotIndex);
            } else {
              // No extension, just add suffix
              newFileName = newFileName + suffixToAdd;
            }
          }

          // Skip if no change would be made
          if (newFileName === oldFileName) {
            console.log(`⏭️ No change needed for: ${oldFileName}`);
            continue;
          }

          // Check if new filename already exists
          const newFilePath = path.join(dir, newFileName);
          if (fs.existsSync(newFilePath)) {
            console.log(`⚠️ Skipping ${oldFileName} - new name already exists: ${newFileName}`);
            continue;
          }

          console.log(`✂️ Renaming: ${oldFileName} → ${newFileName}`);

          // Rename the file
          fs.renameSync(filePath, newFilePath);
          renamedCount++;

          // Send progress update every 10 files or at the end
          if (renamedCount % 10 === 0 || renamedCount === totalFiles) {
            event.sender.send('filerandomizer:progress', {
              current: renamedCount,
              total: totalFiles,
              percentage: Math.round((renamedCount / totalFiles) * 100)
            });
          }

        } catch (error) {
          console.error(`❌ Error renaming file ${filePath}:`, error);
          errors.push({ file: filePath, error: error.message });
        }
      }
    }

    console.log(`✅ File renaming completed. Renamed ${renamedCount} files.`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during renaming.`);
    }

    return {
      success: true,
      renamedCount,
      errors
    };
  } catch (error) {
    console.error('❌ Error during file renaming:', error);
    return {
      success: false,
      error: error.message
    };
  }
});


// Backend service removed - using JavaScript implementations instead

// WAD extraction handler - Using JavaScript implementation instead of Python backend
ipcMain.handle('wad:extract', async (event, data) => {
  try {
    console.log('🎯 WAD extraction request received:', JSON.stringify(data, null, 2));

    // Validate required parameters
    if (!data || !data.wadPath || !data.outputDir || data.skinId === undefined || data.skinId === null) {
      console.error('❌ Missing required parameters:', {
        wadPath: data?.wadPath,
        outputDir: data?.outputDir,
        skinId: data?.skinId
      });
      return { error: 'Missing required parameters: wadPath, outputDir, skinId' };
    }

    // Validate WAD file exists
    if (!fs.existsSync(data.wadPath)) {
      return { error: `WAD file not found: ${data.wadPath}` };
    }

    // Use integrated hash location if not provided
    const hashPath = getHashPath(data.hashPath);
    console.log('📁 Using hash path:', hashPath);

    // Import ES modules using relative paths (they're part of the project)
    const { unpackWAD } = await import('./src/utils/wad/index.js');
    const { loadHashtables } = await import('./src/jsritofile/index.js');

    // Load hashtables if hash path exists
    let hashtables = null;
    if (hashPath && fs.existsSync(hashPath)) {
      try {
        console.log('📚 Loading hashtables from:', hashPath);
        hashtables = await loadHashtables(hashPath);
        console.log('✅ Hashtables loaded successfully');
      } catch (hashError) {
        console.warn('⚠️ Failed to load hashtables, continuing without them:', hashError.message);
      }
    } else {
      console.log('ℹ️ No hashtables path provided, files will use hash names');
    }

    // Progress callback
    let lastProgress = 0;
    const progressCallback = (count, message) => {
      if (count > lastProgress + 50 || message) {
        console.log(`[WAD Progress] ${message || `Extracted ${count} files...`}`);
        lastProgress = count;
      }
    };

    // Extract WAD file using JavaScript implementation
    console.log('🚀 Starting WAD extraction with JavaScript implementation...');
    const result = await unpackWAD(
      data.wadPath,
      data.outputDir,
      hashtables,
      null, // no filter
      progressCallback
    );

    console.log('✅ WAD extraction completed:', {
      extractedCount: result.extractedCount,
      outputDir: result.outputDir,
      hashedFilesCount: Object.keys(result.hashedFiles || {}).length
    });

    return {
      success: true,
      extractedCount: result.extractedCount,
      outputDir: result.outputDir,
      hashedFiles: result.hashedFiles || {}
    };

  } catch (error) {
    console.error('❌ WAD extraction error:', error);
    return { error: error.message, stack: error.stack };
  }
});

// Bumpath repath handler - Using JavaScript implementation instead of Python backend
ipcMain.handle('bumpath:repath', async (event, data) => {
  try {
    console.log('🎯 Bumpath repath request received:', JSON.stringify(data, null, 2));

    // Validate required parameters
    if (!data || !data.sourceDir || !data.outputDir || !data.selectedSkinIds) {
      console.error('❌ Missing required parameters:', {
        sourceDir: data?.sourceDir,
        outputDir: data?.outputDir,
        selectedSkinIds: data?.selectedSkinIds
      });
      return { error: 'Missing required parameters: sourceDir, outputDir, selectedSkinIds' };
    }

    // Validate source directory exists
    if (!fs.existsSync(data.sourceDir)) {
      return { error: `Source directory not found: ${data.sourceDir}` };
    }

    // Use integrated hash location if not provided
    const hashPath = getHashPath(data.hashPath);
    console.log('📁 Using hash path:', hashPath);

    const ignoreMissing = data.ignoreMissing !== false; // Default true
    const combineLinked = data.combineLinked !== false; // Default true
    const customPrefix = data.customPrefix || 'bum';
    const processTogether = data.processTogether || false;

    // Import ES modules using relative paths (they're part of the project)
    const { BumpathCore } = await import('./src/utils/bumpath/bumpathCore.js');

    // Progress callback
    let lastProgress = 0;
    const progressCallback = (count, message) => {
      if (count > lastProgress + 10 || message) {
        console.log(`[Bumpath Progress] ${message || `Processed ${count} files...`}`);
        lastProgress = count;
      }
    };

    if (processTogether) {
      // Process all skins together
      console.log(`🚀 Processing ${data.selectedSkinIds.length} skins together...`);

      const bumInstance = new BumpathCore();

      // Add source directory
      console.log(`📂 Adding source directory: ${data.sourceDir}`);
      await bumInstance.addSourceDirs([data.sourceDir]);

      // Reset all BIN files to unselected
      const binSelections = {};
      for (const unifyFile in bumInstance.sourceBins) {
        binSelections[unifyFile] = false;
      }

      // Select BIN files matching selected skin IDs
      let selectedCount = 0;
      for (const unifyFile in bumInstance.sourceBins) {
        const fileInfo = bumInstance.sourceFiles[unifyFile];
        if (fileInfo && fileInfo.relPath.toLowerCase().endsWith('.bin')) {
          const relPath = fileInfo.relPath.toLowerCase();
          if (relPath.includes('skin')) {
            // Extract skin ID from path (e.g., /skins/skin0.bin -> 0)
            const skinMatch = relPath.match(/\/skins\/skin(\d+)\.bin/);
            if (skinMatch) {
              const skinId = parseInt(skinMatch[1]);
              if (data.selectedSkinIds.includes(skinId)) {
                binSelections[unifyFile] = true;
                selectedCount++;
                console.log(`  ✅ Selected: ${fileInfo.relPath} (skin ${skinId})`);
              }
            }
          }
        }
      }

      bumInstance.updateBinSelection(binSelections);
      console.log(`📋 Marked ${selectedCount} BIN files for skins ${data.selectedSkinIds.join(', ')}`);

      // Scan
      console.log('🔍 Scanning BIN files...');
      await bumInstance.scan(hashPath);
      console.log(`✅ Found ${Object.keys(bumInstance.scannedTree).length} entries`);

      // Apply custom prefix if provided
      if (customPrefix !== 'bum') {
        console.log(`🏷️  Applying custom prefix '${customPrefix}' to all entries...`);
        const allEntryHashes = Object.keys(bumInstance.entryPrefix).filter(hash => hash !== 'All_BINs');
        bumInstance.applyPrefix(allEntryHashes, customPrefix);
        console.log(`✅ Applied prefix to ${allEntryHashes.length} entries`);
      }

      // Process
      console.log('⚙️  Starting Bumpath process...');
      await bumInstance.process(data.outputDir, ignoreMissing, combineLinked, progressCallback);
      console.log('✅ Bumpath repath completed');

      return {
        success: true,
        message: `Processed ${data.selectedSkinIds.length} skins together`
      };

    } else {
      // Process each skin individually
      console.log(`🚀 Processing ${data.selectedSkinIds.length} skins individually...`);

      const results = [];

      for (let i = 0; i < data.selectedSkinIds.length; i++) {
        const skinId = data.selectedSkinIds[i];
        console.log(`\n--- Processing skin ${skinId} (${i + 1}/${data.selectedSkinIds.length}) ---`);

        const bumInstance = new BumpathCore();

        // Add source directory
        await bumInstance.addSourceDirs([data.sourceDir]);

        // Reset all BIN files to unselected
        const binSelections = {};
        for (const unifyFile in bumInstance.sourceBins) {
          binSelections[unifyFile] = false;
        }

        // Select only the current skin's BIN file
        let selectedCount = 0;
        for (const unifyFile in bumInstance.sourceBins) {
          const fileInfo = bumInstance.sourceFiles[unifyFile];
          if (fileInfo && fileInfo.relPath.toLowerCase().endsWith('.bin')) {
            const relPath = fileInfo.relPath.toLowerCase();
            if (relPath.includes('skin')) {
              const skinMatch = relPath.match(/\/skins\/skin(\d+)\.bin/);
              if (skinMatch) {
                const currentSkinId = parseInt(skinMatch[1]);
                if (currentSkinId === skinId) {
                  binSelections[unifyFile] = true;
                  selectedCount++;
                  console.log(`  ✅ Selected: ${fileInfo.relPath} (skin ${currentSkinId})`);
                }
              }
            }
          }
        }

        bumInstance.updateBinSelection(binSelections);
        console.log(`📋 Marked ${selectedCount} BIN files for skin ${skinId}`);

        // Scan
        console.log(`🔍 Scanning BIN files for skin ${skinId}...`);
        await bumInstance.scan(hashPath);
        console.log(`✅ Found ${Object.keys(bumInstance.scannedTree).length} entries`);

        // Apply custom prefix if provided
        if (customPrefix !== 'bum') {
          console.log(`🏷️  Applying custom prefix '${customPrefix}' to all entries...`);
          const allEntryHashes = Object.keys(bumInstance.entryPrefix).filter(hash => hash !== 'All_BINs');
          bumInstance.applyPrefix(allEntryHashes, customPrefix);
        }

        // Process
        console.log(`⚙️  Starting Bumpath process for skin ${skinId}...`);
        await bumInstance.process(data.outputDir, ignoreMissing, combineLinked, progressCallback);
        console.log(`✅ Completed skin ${skinId}`);

        results.push({ skinId, success: true });
      }

      console.log('✅ Bumpath repath completed for all skins');
      return {
        success: true,
        message: `Processed ${data.selectedSkinIds.length} skins individually`,
        results
      };
    }

  } catch (error) {
    console.error('❌ Bumpath repath error:', error);
    return { error: error.message, stack: error.stack };
  }
});

// Hash management IPC handlers
ipcMain.handle('hashes:check', async () => {
  try {
    const result = hashManager.checkHashes();
    return result;
  } catch (error) {
    console.error('❌ Hash check error:', error);
    return { allPresent: false, missing: [], hashDir: '', error: error.message };
  }
});

ipcMain.handle('hashes:download', async (event, progressCallback) => {
  try {
    let lastProgress = '';
    const result = await hashManager.downloadHashes((message, current, total) => {
      if (progressCallback) {
        progressCallback(message, current, total);
      }
      lastProgress = message;
      logToFile(`Hash download: ${message}`, 'INFO');
    });


    if (result.success) {
      logToFile(`Hash download completed: ${result.downloaded.length} files, ${result.errors.length} errors`, 'INFO');

      // Clear backend hashtables cache so subsequent operations use new hashes
      try {
        const { clearHashtablesCache } = await import('./src/jsritofile/index.js');
        clearHashtablesCache();
        logToFile('Backend hashtables cache cleared', 'INFO');
      } catch (cacheError) {
        logToFile(`Failed to clear backend hashtables cache: ${cacheError.message}`, 'WARN');
      }
    } else {
      logToFile(`Hash download failed: ${result.errors.length} errors`, 'ERROR');
    }

    return result;
  } catch (error) {
    console.error('❌ Hash download error:', error);
    logToFile(`Hash download error: ${error.message}`, 'ERROR');
    return { success: false, downloaded: [], errors: [error.message], hashDir: hashManager.getHashDirectory() };
  }
});

ipcMain.handle('hashes:get-directory', async () => {
  try {
    const hashDir = hashManager.getHashDirectory();
    logToFile(`Hash directory requested: ${hashDir}`, 'INFO');
    logToFile(`  - process.env.APPDATA: ${process.env.APPDATA || 'undefined'}`, 'INFO');
    logToFile(`  - process.env.HOME: ${process.env.HOME || 'undefined'}`, 'INFO');
    logToFile(`  - process.platform: ${process.platform}`, 'INFO');
    logToFile(`  - os.homedir(): ${require('os').homedir()}`, 'INFO');

    // Verify directory exists and is writable
    const fs = require('fs');
    if (fs.existsSync(hashDir)) {
      try {
        // Test write access
        const testFile = path.join(hashDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        logToFile(`  - Directory is writable: YES`, 'INFO');
      } catch (writeError) {
        logToFile(`  - Directory is writable: NO - ${writeError.message}`, 'WARN');
      }
    } else {
      logToFile(`  - Directory exists: NO`, 'WARN');
    }

    return { hashDir };
  } catch (error) {
    logToFile(`❌ Get hash directory error: ${error.message}`, 'ERROR');
    logToFile(`  - Stack: ${error.stack}`, 'ERROR');
    console.error('❌ Get hash directory error:', error);
    return { hashDir: '', error: error.message };
  }
});

// Get default ritobin path (FrogTools location)
ipcMain.handle('ritobin:get-default-path', async () => {
  try {
    // Use same path logic as hashManager - AppData/Roaming/FrogTools
    const appDataPath = process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME, 'Library', 'Application Support')
        : process.platform === 'linux'
          ? path.join(process.env.HOME, '.local', 'share')
          : path.join(process.env.HOME, 'AppData', 'Roaming'));

    const ritobinPath = path.join(appDataPath, 'FrogTools', 'ritobin_cli.exe');
    const exists = fs.existsSync(ritobinPath);

    return {
      path: ritobinPath,
      exists,
      isDefault: true
    };
  } catch (error) {
    console.error('❌ Get default ritobin path error:', error);
    return { path: '', exists: false, error: error.message };
  }
});

// Open folder location in file explorer
ipcMain.handle('file:open-folder', async (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, error: 'Path does not exist' };
    }

    // Use showItemInFolder for files, openPath for directories
    const stats = fs.statSync(folderPath);
    if (stats.isFile()) {
      // Show file in folder (highlights the file)
      shell.showItemInFolder(folderPath);
    } else {
      // Open directory
      await shell.openPath(folderPath);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Open folder error:', error);
    return { success: false, error: error.message };
  }
});

// Auto-updater IPC handlers
ipcMain.handle('update:check', async () => {
  try {
    if (isDev || !app.isPackaged) {
      // In dev mode, use GitHub API fallback
      if (process.env.ENABLE_AUTO_UPDATER === 'true') {
        const result = await checkUpdatesViaGitHubAPI();
        return { success: true, updateAvailable: result.updateAvailable };
      }
      return { success: false, error: 'Update checking is only available in production builds' };
    }
    // checkForUpdates returns a Promise, handle it properly
    autoUpdater.checkForUpdates().catch(async (err) => {
      logToFile(`electron-updater check failed, trying GitHub API: ${err.message}`, 'WARNING');
      try {
        await checkUpdatesViaGitHubAPI();
      } catch (fallbackErr) {
        logToFile(`Fallback also failed: ${fallbackErr.message}`, 'ERROR');
      }
    });
    return { success: true };
  } catch (error) {
    logToFile(`Update check error: ${error.message}`, 'ERROR');
    // Try fallback on error
    try {
      await checkUpdatesViaGitHubAPI();
      return { success: true, usedFallback: true };
    } catch (fallbackErr) {
      return { success: false, error: error.message };
    }
  }
});

ipcMain.handle('update:download', async () => {
  try {
    if (isDev || !app.isPackaged) {
      return { success: false, error: 'Update downloading is only available in production builds' };
    }

    // Check if update info is available - use cached version if available
    if (cachedUpdateInfo) {
      autoUpdater.updateInfo = cachedUpdateInfo;
      logToFile(`Using cached update info: ${cachedUpdateInfo.version}`, 'INFO');
    }

    // Check if update info is available, if not, wait for it
    // The update-available event should have already fired, but updateInfo might not be set immediately
    if (!autoUpdater.updateInfo) {
      let retries = 0;
      const maxRetries = 10;

      while (!autoUpdater.updateInfo && retries < maxRetries) {
        logToFile(`Waiting for update info... (${retries + 1}/${maxRetries})`, 'INFO');
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
    }

    // If still no update info, try checking again
    if (!autoUpdater.updateInfo) {
      logToFile('Update info still not available, triggering check...', 'INFO');
      try {
        await autoUpdater.checkForUpdates();
        // Wait for update-available event
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Check cached again
        if (cachedUpdateInfo) {
          autoUpdater.updateInfo = cachedUpdateInfo;
        }
      } catch (checkError) {
        logToFile(`Update check failed: ${checkError.message}`, 'ERROR');
      }
    }

    // If still no update info, use fallback
    if (!autoUpdater.updateInfo) {
      logToFile('No update info from electron-updater, using fallback...', 'WARNING');
      const fallbackResult = await checkUpdatesViaGitHubAPI();
      if (fallbackResult.updateAvailable) {
        const { shell } = require('electron');
        await shell.openExternal(`https://github.com/RitoShark/Quartz/releases/tag/v${fallbackResult.version}`);
        return {
          success: true,
          manualDownload: true,
          message: 'Opening GitHub release page for manual download (electron-updater not available)'
        };
      }
      return { success: false, error: 'No update information available' };
    }

    logToFile(`Downloading update: ${autoUpdater.updateInfo.version}`, 'INFO');
    // Try to download with electron-updater
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    logToFile(`Update download error: ${error.message}`, 'ERROR');

    // If download fails, offer manual download as fallback
    if (error.message.includes('check update first') || error.message.includes('latest.yml') || !autoUpdater.updateInfo) {
      try {
        const fallbackResult = await checkUpdatesViaGitHubAPI();
        if (fallbackResult.updateAvailable) {
          const { shell } = require('electron');
          await shell.openExternal(`https://github.com/RitoShark/Quartz/releases/tag/v${fallbackResult.version}`);
          return {
            success: true,
            manualDownload: true,
            message: 'Opening GitHub release page for manual download'
          };
        }
      } catch (fallbackError) {
        logToFile(`Fallback also failed: ${fallbackError.message}`, 'ERROR');
      }
    }

    return { success: false, error: error.message };
  }
});

ipcMain.handle('update:install', async () => {
  try {
    if (isDev || !app.isPackaged) {
      return { success: false, error: 'Update installation is only available in production builds' };
    }
    // Quit and install - this will trigger the installation
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    logToFile(`Update install error: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
});

// Window control IPC handlers for custom title bar
ipcMain.handle('window:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.minimize();
  }
});

ipcMain.handle('window:maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('window:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});

ipcMain.handle('window:isMaximized', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? window.isMaximized() : false;
});

ipcMain.handle('update:get-version', async () => {
  try {
    const packageJson = require('./package.json');
    return {
      success: true,
      version: packageJson.version,
      isDev: isDev,
      isPackaged: app.isPackaged
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// WWISE AUDIO TOOLS IPC HANDLERS
// ============================================================================

const AUDIO_TOOLS_ROOT = path.join(app.getPath('appData'), 'Quartz', 'AudioTools');
const WWISE_CONSOLE_EXE = path.join(AUDIO_TOOLS_ROOT, 'Wwise', 'WwiseApp', 'Authoring', 'x64', 'Release', 'bin', 'WwiseConsole.exe');
const WWISE_WPROJ = path.join(AUDIO_TOOLS_ROOT, 'Wwise', 'WwiseLeagueProjects', 'WWiseLeagueProjects.wproj');
const VGMSTREAM_EXE = path.join(AUDIO_TOOLS_ROOT, 'Decoders', 'vgmstream-cli.exe');
const WWISE_TEMP_DIR = path.join(AUDIO_TOOLS_ROOT, 'Temp');

// wwise:check — fast existence check
ipcMain.handle('wwise:check', async () => {
  return { installed: fs.existsSync(WWISE_CONSOLE_EXE) };
});

// wwise:install — download only wiwawe + vgmstream files directly via GitHub raw API
ipcMain.handle('wwise:install', async (event) => {
  const sendProgress = (msg) => {
    try { event.sender.send('wwise:install-progress', msg); } catch (_) { }
  };

  const REPO = 'tarngaina/LtMAO';
  const BRANCH = 'hai';
  const TREE_API = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

  // Only download files under these repo paths
  const WANTED_PREFIXES = ['res/wiwawe/', 'res/tools/vgmstream/'];

  // Map repo path prefix -> local destination folder
  const destMap = [
    { prefix: 'res/wiwawe/', dest: path.join(AUDIO_TOOLS_ROOT, 'Wwise') },
    { prefix: 'res/tools/vgmstream/', dest: path.join(AUDIO_TOOLS_ROOT, 'Decoders') },
  ];

  // Helper: HTTPS GET returning full body as Buffer
  const httpsGet = (url) => new Promise((resolve, reject) => {
    const doReq = (u, hops = 0) => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      require('https').get(u, { headers: { 'User-Agent': 'Quartz-App' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return doReq(res.headers.location, hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} — ${u}`)); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    doReq(url);
  });

  // Helper: download a single file to disk
  const downloadFile = (url, destPath) => new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    file.on('error', (err) => { try { file.destroy(); } catch (_) { } reject(err); });
    const doReq = (u, hops = 0) => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      require('https').get(u, { headers: { 'User-Agent': 'Quartz-App' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return doReq(res.headers.location, hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    doReq(url);
  });

  try {
    fs.mkdirSync(AUDIO_TOOLS_ROOT, { recursive: true });
    fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });

    // --- Step 1: Fetch file tree from GitHub API ---
    sendProgress('Fetching file list from GitHub...');
    const treeJson = JSON.parse((await httpsGet(TREE_API)).toString('utf8'));
    if (!treeJson.tree) throw new Error('GitHub API returned unexpected response');

    const filesToDownload = treeJson.tree.filter(item =>
      item.type === 'blob' && WANTED_PREFIXES.some(p => item.path.startsWith(p))
    );

    if (filesToDownload.length === 0) throw new Error('No files found — repo structure may have changed');

    // --- Step 2: Download files with limited concurrency ---
    const total = filesToDownload.length;
    let done = 0;
    sendProgress(`Installing audio tools (0 / ${total} files)...`);

    const CONCURRENCY = 8;
    let idx = 0;
    const worker = async () => {
      while (idx < filesToDownload.length) {
        const item = filesToDownload[idx++];
        const mapping = destMap.find(m => item.path.startsWith(m.prefix));
        if (!mapping) continue;
        const relPath = item.path.slice(mapping.prefix.length);
        const destPath = path.join(mapping.dest, ...relPath.split('/'));
        await downloadFile(RAW_BASE + item.path, destPath);
        done++;
        sendProgress(`Installing audio tools (${done} / ${total} files)...`);
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // --- Step 3: Verify ---
    if (!fs.existsSync(WWISE_CONSOLE_EXE)) {
      return { success: false, error: 'WwiseConsole.exe not found after install — repo structure may have changed.' };
    }

    sendProgress('Done!');
    return { success: true };
  } catch (err) {
    logToFile(`[wwise:install] Error: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
});

// audio:convert-to-wem — convert wav/mp3/ogg file to .wem, return output path
ipcMain.handle('audio:convert-to-wem', async (event, { inputPath }) => {
  try {
    if (!fs.existsSync(WWISE_CONSOLE_EXE)) {
      return { success: false, error: 'Wwise tools not installed' };
    }

    fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });

    const ext = path.extname(inputPath).toLowerCase();
    const baseName = path.basename(inputPath, ext);
    const uniqueId = Date.now();
    let wavPath = inputPath;

    // --- Step 1: If MP3/OGG, decode to PCM WAV via vgmstream ---
    if (ext === '.mp3' || ext === '.ogg') {
      if (!fs.existsSync(VGMSTREAM_EXE)) {
        return { success: false, error: 'vgmstream decoder not installed' };
      }
      wavPath = path.join(WWISE_TEMP_DIR, `${baseName}_${uniqueId}.wav`);
      await new Promise((resolve, reject) => {
        const proc = spawn(VGMSTREAM_EXE, ['-o', wavPath, inputPath], {
          windowsHide: true,
          cwd: path.dirname(VGMSTREAM_EXE)
        });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`vgmstream exit ${code}`)));
        proc.on('error', reject);
      });
    }

    // --- Step 2: Generate .wsources XML ---
    const wsourcesPath = path.join(WWISE_TEMP_DIR, `${baseName}_${uniqueId}.wsources`);
    const wsourcesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<ExternalSourcesList SchemaVersion="1" Root="${WWISE_TEMP_DIR}">\n  <Source Path="${wavPath}" Conversion="Vorbis Quality High" Destination="${baseName}_${uniqueId}"/>\n</ExternalSourcesList>`;
    fs.writeFileSync(wsourcesPath, wsourcesXml, 'utf8');

    // --- Step 3: Run WwiseConsole convert-external-source ---
    const wemOutputDir = WWISE_TEMP_DIR;
    await new Promise((resolve, reject) => {
      const proc = spawn(WWISE_CONSOLE_EXE, [
        'convert-external-source',
        WWISE_WPROJ,
        '--source-file', wsourcesPath,
        '--output', wemOutputDir,
        '--platform', 'Windows'
      ], { windowsHide: true, cwd: path.dirname(WWISE_CONSOLE_EXE) });
      let stderr = '';
      proc.stderr?.on('data', (d) => { stderr += String(d); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`WwiseConsole exit ${code}: ${stderr.trim()}`));
      });
      proc.on('error', reject);
    });

    // --- Step 4: Locate the output .wem ---
    // WwiseConsole places the .wem inside a Windows/ subfolder matching the source name
    const candidatePaths = [
      path.join(wemOutputDir, 'Windows', `${baseName}_${uniqueId}.wem`),
      path.join(wemOutputDir, `${baseName}_${uniqueId}.wem`),
    ];
    const wemPath = candidatePaths.find(p => fs.existsSync(p));
    if (!wemPath) {
      return { success: false, error: 'Conversion succeeded but .wem output not found' };
    }

    // --- Step 5: Cleanup intermediates ---
    try { fs.unlinkSync(wsourcesPath); } catch (_) { }
    if (wavPath !== inputPath) {
      try { fs.unlinkSync(wavPath); } catch (_) { }
    }

    return { success: true, wemPath };
  } catch (err) {
    logToFile(`[audio:convert-to-wem] Error: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
});

// Helper: amplify PCM/float WAV buffer by gainDb decibels
function amplifyWavBuffer(buf, gainDb) {
  const gain = Math.pow(10, gainDb / 20);
  const result = Buffer.from(buf);
  let pos = 12;
  let audioFormat = 1, bitsPerSample = 16;
  let dataStart = -1, dataSize = 0;
  while (pos < buf.length - 8) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      audioFormat = buf.readUInt16LE(pos + 8);
      bitsPerSample = buf.readUInt16LE(pos + 8 + 14);
    } else if (id === 'data') {
      dataStart = pos + 8;
      dataSize = size;
      break;
    }
    pos += 8 + (size % 2 !== 0 ? size + 1 : size);
  }
  if (dataStart === -1) throw new Error('WAV: no data chunk found');
  const end = Math.min(dataStart + dataSize, result.length);
  if (audioFormat === 1 && bitsPerSample === 16) {
    for (let i = dataStart; i + 1 < end; i += 2) {
      let s = Math.round(result.readInt16LE(i) * gain);
      result.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i);
    }
  } else if (audioFormat === 1 && bitsPerSample === 24) {
    for (let i = dataStart; i + 2 < end; i += 3) {
      let s = result[i] | (result[i + 1] << 8) | (result[i + 2] << 16);
      if (s & 0x800000) s |= ~0xFFFFFF;
      s = Math.round(s * gain);
      s = Math.max(-8388608, Math.min(8388607, s));
      result[i] = s & 0xFF; result[i + 1] = (s >> 8) & 0xFF; result[i + 2] = (s >> 16) & 0xFF;
    }
  } else if (audioFormat === 1 && bitsPerSample === 32) {
    for (let i = dataStart; i + 3 < end; i += 4) {
      let s = Math.round(result.readInt32LE(i) * gain);
      result.writeInt32LE(Math.max(-2147483648, Math.min(2147483647, s)), i);
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = dataStart; i + 3 < end; i += 4) {
      result.writeFloatLE(Math.max(-1, Math.min(1, result.readFloatLE(i) * gain)), i);
    }
  }
  return result;
}

// audio:amplify-wem — decode WEM → amplify WAV → re-encode to WEM
ipcMain.handle('audio:amplify-wem', async (event, { inputWemPath, gainDb }) => {
  try {
    if (!fs.existsSync(WWISE_CONSOLE_EXE)) return { success: false, error: 'Wwise tools not installed' };
    if (!fs.existsSync(VGMSTREAM_EXE)) return { success: false, error: 'vgmstream decoder not installed' };
    fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });

    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const wavPath = path.join(WWISE_TEMP_DIR, `gain_${uid}.wav`);
    const baseName = `gain_${uid}`;

    // Step 1: WEM → WAV via vgmstream
    await new Promise((resolve, reject) => {
      const proc = spawn(VGMSTREAM_EXE, ['-o', wavPath, inputWemPath], {
        windowsHide: true, cwd: path.dirname(VGMSTREAM_EXE)
      });
      proc.on('close', (c) => c === 0 ? resolve() : reject(new Error(`vgmstream exit ${c}`)));
      proc.on('error', reject);
    });

    // Step 2: amplify WAV samples in Node.js
    fs.writeFileSync(wavPath, amplifyWavBuffer(fs.readFileSync(wavPath), gainDb));

    // Step 3: WAV → WEM via WwiseConsole
    const wsourcesPath = path.join(WWISE_TEMP_DIR, `${baseName}.wsources`);
    fs.writeFileSync(wsourcesPath,
      `<?xml version="1.0" encoding="UTF-8"?>\n<ExternalSourcesList SchemaVersion="1" Root="${WWISE_TEMP_DIR}">\n  <Source Path="${wavPath}" Conversion="Vorbis Quality High" Destination="${baseName}"/>\n</ExternalSourcesList>`,
      'utf8');
    await new Promise((resolve, reject) => {
      const proc = spawn(WWISE_CONSOLE_EXE, [
        'convert-external-source', WWISE_WPROJ,
        '--source-file', wsourcesPath,
        '--output', WWISE_TEMP_DIR,
        '--platform', 'Windows'
      ], { windowsHide: true, cwd: path.dirname(WWISE_CONSOLE_EXE) });
      let stderr = '';
      proc.stderr?.on('data', d => { stderr += String(d); });
      proc.on('close', c => c === 0 ? resolve() : reject(new Error(`WwiseConsole exit ${c}: ${stderr.trim()}`)));
      proc.on('error', reject);
    });

    const wemPath = [
      path.join(WWISE_TEMP_DIR, 'Windows', `${baseName}.wem`),
      path.join(WWISE_TEMP_DIR, `${baseName}.wem`),
    ].find(p => fs.existsSync(p));
    if (!wemPath) return { success: false, error: 'Output WEM not found after conversion' };

    try { fs.unlinkSync(wavPath); } catch (_) { }
    try { fs.unlinkSync(wsourcesPath); } catch (_) { }
    return { success: true, wemPath };
  } catch (err) {
    logToFile(`[audio:amplify-wem] ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
});

// audio:decode-to-wav — convert WEM/MP3/OGG → WAV using vgmstream (for AudioSplitter)
ipcMain.handle('audio:decode-to-wav', async (_event, { inputPath }) => {
  try {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.wav') return { success: true, wavPath: inputPath };
    if (!fs.existsSync(VGMSTREAM_EXE)) return { success: false, error: 'vgmstream decoder not installed' };
    fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const wavPath = path.join(WWISE_TEMP_DIR, `split_${uid}.wav`);
    await new Promise((resolve, reject) => {
      const proc = spawn(VGMSTREAM_EXE, ['-o', wavPath, inputPath], {
        windowsHide: true, cwd: path.dirname(VGMSTREAM_EXE)
      });
      proc.on('close', (c) => c === 0 ? resolve() : reject(new Error(`vgmstream exit ${c}`)));
      proc.on('error', reject);
    });
    return { success: true, wavPath };
  } catch (err) {
    logToFile(`[audio:decode-to-wav] ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
});

// wwise:reset — delete the entire AudioTools folder
ipcMain.handle('wwise:reset', async () => {
  try {
    if (fs.existsSync(AUDIO_TOOLS_ROOT)) {
      fs.rmSync(AUDIO_TOOLS_ROOT, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Helper function to get hash path (uses integrated location if not provided)
function getHashPath(userProvidedPath) {
  if (userProvidedPath && userProvidedPath.trim() && fs.existsSync(userProvidedPath)) {
    return userProvidedPath;
  }
  // Fall back to integrated location
  return hashManager.getHashDirectory();
}
