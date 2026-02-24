const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn, exec } = require('child_process');
const isDev = require('electron-is-dev');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const { registerDialogChannels } = require('./src/main/ipc/channels/dialogs');
const { createPrefsStore } = require('./src/main/services/prefsStore');
const { createLogger } = require('./src/main/services/logger');
const { createCliArgsHandler } = require('./src/main/services/cliArgsHandler');
const { loadHashManager } = require('./src/main/services/hashManagerLoader');
const { createDefaultResourcesService } = require('./src/main/services/defaultResources');
const { createShutdownCleanup } = require('./src/main/services/shutdownCleanup');
const { createAutoUpdaterService } = require('./src/main/services/autoUpdaterService');
const { createMainWindowService } = require('./src/main/window/mainWindowService');
const { registerAppLifecycleHandlers } = require('./src/main/services/appLifecycle');
const { registerLocalFileProtocol, runStartupTasks } = require('./src/main/services/startup');
const { registerPrefsChannels } = require('./src/main/ipc/channels/prefs');
const { registerAppInfoChannels } = require('./src/main/ipc/channels/appInfo');
const { registerWindowChannels } = require('./src/main/ipc/channels/window');
const { registerMiscChannels } = require('./src/main/ipc/channels/misc');
const { registerContextMenuChannels } = require('./src/main/ipc/channels/contextMenu');
const { registerToolsChannels } = require('./src/main/ipc/channels/tools');
const { registerHashChannels } = require('./src/main/ipc/channels/hashes');
const { registerUpdateChannels } = require('./src/main/ipc/channels/update');
const { registerAudioChannels } = require('./src/main/ipc/channels/audio');
const { registerUpscaleChannels } = require('./src/main/ipc/channels/upscale');
const { registerWadBumpathChannels } = require('./src/main/ipc/channels/wadBumpath');
const { registerModelInspectChannels } = require('./src/main/ipc/channels/modelInspect');
const { registerFileRandomizerChannels } = require('./src/main/ipc/channels/fileRandomizer');
const { registerBinToolsChannels } = require('./src/main/ipc/channels/binTools');

function importLocalModule(relativePath) {
  const rel = String(relativePath || '').replace(/^\.?[\\/]/, '').replace(/\//g, path.sep);
  const candidatePaths = [];

  // In production, ESM import() cannot read from .asar archives —
  // try the unpacked location first (asarUnpack puts files here).
  if (process.resourcesPath) {
    candidatePaths.push(path.join(process.resourcesPath, 'app.asar.unpacked', rel));
  }

  // In dev, __dirname is the real project folder (not asar), so this works.
  candidatePaths.push(path.join(__dirname, rel));

  const uniqueCandidates = [...new Set(candidatePaths)];

  const load = async () => {
    let lastError = null;
    for (const candidate of uniqueCandidates) {
      try {
        const specifier = pathToFileURL(candidate).href;
        return await import(specifier);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`Failed to import module: ${relativePath}`);
  };

  return load();
}

// Register custom protocols as privileged as early as possible
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Track if the app is in the process of quitting to avoid re-entrancy/loops
let isQuitting = false;
let isShuttingDown = false;
const getQuitState = () => ({ isQuitting, isShuttingDown });
const setQuitState = ({ isQuitting: nextIsQuitting, isShuttingDown: nextIsShuttingDown }) => {
  if (typeof nextIsQuitting === 'boolean') isQuitting = nextIsQuitting;
  if (typeof nextIsShuttingDown === 'boolean') isShuttingDown = nextIsShuttingDown;
};

const { logToFile, initLogDirectory, logDir: LOG_DIR, logFile: LOG_FILE } = createLogger({ app, fs, path });
initLogDirectory();

const {
  setupAutoUpdater,
  checkUpdatesViaGitHubAPI,
  setUpdateWindow,
  getUpdateWindow,
  getCachedUpdateInfo,
} = createAutoUpdaterService({
  autoUpdater,
  app,
  isDev,
  processRef: process,
  https,
  logToFile,
});

let hashManager;

const { handleCommandLineArgs } = createCliArgsHandler({
  app,
  path,
  processRef: process,
  isDev,
  fs,
  spawn,
  logToFile,
  baseDir: __dirname,
});

// Singleton check to handle multiple launches
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus window and handle file open
    const updateCheckWindow = getUpdateWindow();
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

registerAppInfoChannels({
  ipcMain,
  app,
  shell,
  path,
  processRef: process,
  LOG_DIR,
  LOG_FILE,
  logToFile,
});

logToFile('='.repeat(80), 'INFO');
logToFile('Quartz Started', 'INFO');

// Load hashManager now that logToFile is available
hashManager = loadHashManager({ app, path, baseDir: __dirname, logToFile });

const { ensureRitobinCli, ensureDefaultAssets, ensureDefaultCursors } = createDefaultResourcesService({
  app,
  fs,
  path,
  processRef: process,
  baseDir: __dirname,
  logToFile,
});

const { clearTextureCacheOnQuit, cleanupMeiFolders } = createShutdownCleanup({
  fs,
  path,
  logToFile,
});

logToFile(`Version: ${app.getVersion()}`, 'INFO');
logToFile(`Electron: ${process.versions.electron}`, 'INFO');
logToFile(`Node: ${process.versions.node}`, 'INFO');
logToFile(`Platform: ${process.platform}`, 'INFO');
logToFile(`isDev: ${isDev}`, 'INFO');
logToFile(`isPackaged: ${app.isPackaged}`, 'INFO');
logToFile('='.repeat(80), 'INFO');

// Resolve app data paths and resources
const getUserDataPath = () => {
  try {
    return app.getPath('userData');
  } catch {
    return __dirname;
  }
};

// IPC handlers for dialogs / external open
registerDialogChannels({
  ipcMain,
  BrowserWindow,
  dialog,
  shell,
  getUpscaleInstallDir,
  logToFile,
});

// Preferences system for React app
const {
  loadPrefs,
  savePrefs,
  clearSavedBinPaths,
} = createPrefsStore({ fs, path, getUserDataPath });

const { createWindow } = createMainWindowService({
  app,
  BrowserWindow,
  dialog,
  path,
  isDev,
  processRef: process,
  baseDir: __dirname,
  setUpdateWindow,
  clearSavedBinPaths,
  getQuitState,
  setQuitState,
});

registerPrefsChannels({
  ipcMain,
  loadPrefs,
  savePrefs,
});

// ============================================================================
// WINDOWS EXPLORER CONTEXT MENU INTEGRATION
// ============================================================================

const { refreshContextMenuIfStale } = registerContextMenuChannels({
  ipcMain,
  exec,
  app,
  path,
  processRef: process,
  isDev,
  logToFile,
});


registerToolsChannels({
  ipcMain,
  spawn,
  fs,
  path,
  processRef: process,
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  logToFile('APP: whenReady triggered - initializing application', 'INFO');

  registerLocalFileProtocol({ protocol, path, fs, logToFile });

  runStartupTasks({
    app,
    isDev,
    logToFile,
    createWindow,
    setupAutoUpdater,
    ensureRitobinCli,
    ensureDefaultAssets,
    ensureDefaultCursors,
    refreshContextMenuIfStale,
    hashManager,
  });
});

registerAppLifecycleHandlers({
  app,
  BrowserWindow,
  dialog,
  processRef: process,
  createWindow,
  clearTextureCacheOnQuit,
  cleanupMeiFolders,
  clearSavedBinPaths,
  getQuitState,
  setQuitState,
});
// ---------------- Headless Upscale backend (Upscayl ncnn CLI for Windows) ----------------
function getUpscaleInstallDir() {
  return path.join(getUserDataPath(), 'upscale-backends');
}

registerUpscaleChannels({
  ipcMain,
  fs,
  path,
  spawn,
  https,
  processRef: process,
  logToFile,
  getUpscaleInstallDir,
  loadPrefs,
  savePrefs,
  baseDir: __dirname,
});

// ============================================================================
//  File Randomizer IPC Handlers
// ============================================================================

registerFileRandomizerChannels({
  ipcMain,
  fs,
  path,
  processRef: process,
});

registerBinToolsChannels({
  ipcMain,
  fs,
  path,
  loadBinModule: async () => importLocalModule('./src/jsritofile/bin.js'),
});

// Backend service removed - using JavaScript implementations instead
// WAD + Bumpath handlers
registerWadBumpathChannels({
  ipcMain,
  fs,
  getHashPath,
  loadWadModule: async () => importLocalModule('./src/utils/wad/index.js'),
  loadJsRitoModule: async () => importLocalModule('./src/jsritofile/bin.js'),
  loadBumpathModule: async () => importLocalModule('./src/utils/bumpath/bumpathCore.js'),
});

registerModelInspectChannels({
  ipcMain,
  fs,
  app,
  getHashPath,
  loadWadModule: async () => importLocalModule('./src/utils/wad/index.js'),
  loadJsRitoModule: async () => importLocalModule('./src/jsritofile/bin.js'),
  loadBinModule: async () => importLocalModule('./src/jsritofile/bin.js'),
  loadBinHasherModule: async () => importLocalModule('./src/jsritofile/binHasher.js'),
  loadWadHasherModule: async () => importLocalModule('./src/jsritofile/wadHasher.js'),
});

registerHashChannels({
  ipcMain,
  hashManager,
  logToFile,
  processRef: process,
  path,
  fs,
  clearBackendHashCache: async () => {
    const { clearHashtablesCache } = await importLocalModule('./src/jsritofile/bin.js');
    clearHashtablesCache();
  },
  getHomeDir: () => require('os').homedir(),
});

registerMiscChannels({
  ipcMain,
  fs,
  path,
  processRef: process,
  shell,
  getUpdateVersionInfo: () => {
    const packageJson = require('./package.json');
    return {
      success: true,
      version: packageJson.version,
      isDev: isDev,
      isPackaged: app.isPackaged,
    };
  },
});
// Auto-updater IPC handlers
registerUpdateChannels({
  ipcMain,
  isDev,
  app,
  processRef: process,
  autoUpdater,
  logToFile,
  checkUpdatesViaGitHubAPI,
  shell,
  getCachedUpdateInfo,
});

// Window control IPC handlers for custom title bar
registerWindowChannels({
  ipcMain,
  BrowserWindow,
});


// ============================================================================
// WWISE AUDIO TOOLS IPC HANDLERS
// ============================================================================

registerAudioChannels({
  ipcMain,
  app,
  fs,
  path,
  spawn,
  logToFile,
});

// Helper function to get hash path (uses integrated location if not provided)
function getHashPath(userProvidedPath) {
  if (userProvidedPath && userProvidedPath.trim() && fs.existsSync(userProvidedPath)) {
    return userProvidedPath;
  }
  // Fall back to integrated location
  return hashManager.getHashDirectory();
}
