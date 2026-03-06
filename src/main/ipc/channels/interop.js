const HANDOFF_STALE_SECONDS = 30;
const { spawnSync } = require('child_process');
const JADE_PATH_CACHE_TTL_MS = 30_000;
const ENABLE_REGISTRY_DETECT = String(process.env.QUARTZ_ENABLE_REGISTRY_DETECT || '').trim() === '1';
const JADE_RESOLVED_PREF_KEY = 'JadeExecutablePathResolved';
const JADE_INTEROP_PREF_KEY = 'CommunicateWithJade';
let jadePathCache = {
  key: null,
  expiresAt: 0,
  value: null,
};

function isJadeInteropEnabled(loadPrefs) {
  try {
    if (!loadPrefs) return true;
    const prefs = loadPrefs() || {};
    return prefs[JADE_INTEROP_PREF_KEY] !== false;
  } catch {
    return true;
  }
}

function getInteropDir({ app, path }) {
  return path.join(app.getPath('appData'), 'LeagueToolkit', 'Interop');
}

function ensureInteropDir({ fs, app, path }) {
  const dir = getInteropDir({ app, path });
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function writeInteropMessage({ fs, app, path }, payload) {
  const dir = ensureInteropDir({ fs, app, path });
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `handoff-${ts}-${rand}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(payload, null, 2), 'utf8');
}

function consumeInteropMessages({ fs, app, path }, targetApp) {
  const dir = getInteropDir({ app, path });
  if (!fs.existsSync(dir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(dir).filter((f) => f.startsWith('handoff-') && f.endsWith('.json'));
  } catch {
    return [];
  }

  entries.sort();

  const nowUnix = Math.floor(Date.now() / 1000);
  const results = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const handoff = JSON.parse(raw);
      const matchesTarget = (handoff?.target_app || '').toLowerCase() === targetApp.toLowerCase();
      const isStale = !!handoff.created_at_unix && (nowUnix - handoff.created_at_unix) > HANDOFF_STALE_SECONDS;

      // Never delete handoffs targeted at a different app.
      if (!matchesTarget) continue;

      // We own this message now - consume it from disk.
      try {
        fs.unlinkSync(filePath);
      } catch {}
      if (isStale) continue;

      results.push(handoff);
    } catch {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  return results;
}

function getPidFilePath({ app, path }, appName) {
  return path.join(getInteropDir({ app, path }), `${appName}.pid`);
}

function writeQuartzPidFile({ fs, app, path }) {
  const dir = ensureInteropDir({ fs, app, path });
  const pidPath = path.join(dir, 'quartz.pid');
  fs.writeFileSync(pidPath, String(process.pid), 'utf8');
}

function removeQuartzPidFile({ fs, app, path }) {
  try {
    const pidPath = getPidFilePath({ app, path }, 'quartz');
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch {}
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isJadeRunning({ fs, app, path }) {
  const pidPath = getPidFilePath({ app, path }, 'jade');
  try {
    if (!fs.existsSync(pidPath)) return false;
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    return isProcessAlive(pid);
  } catch {
    return false;
  }
}

function pickFirstExistingPath(fs, candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

function isSupportedJadeExecutablePath(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return false;
  const lower = candidatePath.toLowerCase().trim();
  if (!lower.endsWith('.exe')) return false;
  const filename = lower.split(/[\\/]/).pop() || '';
  return filename === 'jade.exe' || filename === 'jade-rust.exe' || filename.includes('jade');
}

function queryRegistryValue(keyPath, valueName = null) {
  try {
    const args = ['query', keyPath];
    if (valueName === null) {
      args.push('/ve');
    } else {
      args.push('/v', valueName);
    }
    const result = spawnSync('reg', args, {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout) return null;
    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const targetName = valueName === null ? '(Default)' : valueName;
    for (const line of lines) {
      if (!line.toLowerCase().startsWith(targetName.toLowerCase())) continue;
      const parts = line.split(/\s{2,}/).filter(Boolean);
      if (parts.length >= 3) {
        const value = parts.slice(2).join(' ').trim().replace(/^"(.*)"$/, '$1');
        return value || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function queryRegistrySubKeys(rootKeyPath) {
  try {
    const result = spawnSync('reg', ['query', rootKeyPath], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('HKEY_'));
  } catch {
    return [];
  }
}

function resolveExeFromDisplayIcon(iconValue) {
  if (!iconValue || typeof iconValue !== 'string') return null;
  let cleaned = iconValue.trim().replace(/^"(.*)"$/, '$1');
  // DisplayIcon can be: C:\Path\App.exe,0
  cleaned = cleaned.replace(/,\s*-?\d+\s*$/, '');
  return cleaned;
}

function findJadeOnPath({ fs }) {
  const probe = (name) => {
    try {
      const result = spawnSync('where', [name], {
        windowsHide: true,
        encoding: 'utf8',
      });
      if (result.status !== 0 || !result.stdout) return null;
      const lines = result.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (isSupportedJadeExecutablePath(line) && fs.existsSync(line)) {
          return line;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  return probe('Jade.exe') || probe('jade-rust.exe');
}

function findInstalledJadePath({ fs, path }) {
  // 1) App Paths (most reliable for executable resolution)
  const appPathCandidates = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Jade.exe',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Jade.exe',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\jade-rust.exe',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\jade-rust.exe',
  ];
  for (const key of appPathCandidates) {
    const exe = queryRegistryValue(key, null);
    if (exe && fs.existsSync(exe)) return exe;
  }

  // 2) Uninstall keys (DisplayName + InstallLocation/DisplayIcon)
  const uninstallRoots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  for (const root of uninstallRoots) {
    const keys = queryRegistrySubKeys(root);
    for (const key of keys) {
      const displayName = queryRegistryValue(key, 'DisplayName');
      if (!displayName || !displayName.toLowerCase().includes('jade')) continue;

      const installLocation = queryRegistryValue(key, 'InstallLocation');
      if (installLocation) {
        const fromInstall = pickFirstExistingPath(fs, [
          path.join(installLocation, 'Jade.exe'),
          path.join(installLocation, 'jade-rust.exe'),
        ]);
        if (fromInstall) return fromInstall;
      }

      const displayIcon = queryRegistryValue(key, 'DisplayIcon');
      const iconExe = resolveExeFromDisplayIcon(displayIcon);
      if (iconExe && fs.existsSync(iconExe)) return iconExe;
    }
  }

  return null;
}

function isWorkspaceDebugJadePath(candidatePath, _cwd, path) {
  if (!candidatePath) return false;
  try {
    const normalizedCandidate = path.normalize(candidatePath).toLowerCase();
    // Treat any source-workspace debug executable as non-installed by default.
    // This avoids launching stale dev builds in production (which open localhost pages).
    if (normalizedCandidate.includes(`${path.sep}src-tauri${path.sep}target${path.sep}debug${path.sep}jade-rust.exe`.toLowerCase())) {
      return true;
    }
    if (normalizedCandidate.endsWith(`${path.sep}target${path.sep}debug${path.sep}jade-rust.exe`.toLowerCase())) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolveJadePathFast({ fs, path, loadPrefs }) {
  const prefs = loadPrefs ? loadPrefs() : {};
  const preferredJadePathRaw = typeof prefs?.JadeExecutablePath === 'string'
    ? prefs.JadeExecutablePath.trim()
    : '';
  const resolvedPrefPathRawUnfiltered = typeof prefs?.[JADE_RESOLVED_PREF_KEY] === 'string'
    ? prefs[JADE_RESOLVED_PREF_KEY].trim()
    : '';

  const userProfile = process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const desktopDir = userProfile ? path.join(userProfile, 'Desktop') : '';
  const cwd = process.cwd ? process.cwd() : '';
  const envAllowsDevExe = String(process.env.QUARTZ_ALLOW_JADE_DEV_EXE || '').trim() === '1';

  const preferredLooksLikeWorkspaceDebug = isWorkspaceDebugJadePath(preferredJadePathRaw, cwd, path);
  const resolvedPrefLooksLikeWorkspaceDebug = isWorkspaceDebugJadePath(resolvedPrefPathRawUnfiltered, cwd, path);
  const preferredJadePath = (!preferredLooksLikeWorkspaceDebug || envAllowsDevExe)
    ? preferredJadePathRaw
    : '';
  const resolvedPrefPathRaw = (!resolvedPrefLooksLikeWorkspaceDebug || envAllowsDevExe)
    ? resolvedPrefPathRawUnfiltered
    : '';

  const cacheKey = `${preferredJadePath}::${resolvedPrefPathRaw}::${envAllowsDevExe ? '1' : '0'}::${cwd}`;
  const now = Date.now();
  if (
    jadePathCache.key === cacheKey &&
    jadePathCache.expiresAt > now &&
    (jadePathCache.value === null || (jadePathCache.value && fs.existsSync(jadePathCache.value)))
  ) {
    return {
      resolved: jadePathCache.value,
      preferredJadePathRaw,
      preferredJadePathUsed: preferredJadePath,
      preferredLooksLikeWorkspaceDebug,
      discoveredInstalledJade: null,
      allowDevExe: envAllowsDevExe,
      cached: true,
    };
  }

  const discoveredInstalledJade = findJadeOnPath({ fs });
  const installPathCandidates = [
    resolvedPrefPathRaw,
    discoveredInstalledJade,
    localAppData && path.join(localAppData, 'Jade', 'Jade.exe'),
    localAppData && path.join(localAppData, 'Jade', 'jade-rust.exe'),
    localAppData && path.join(localAppData, 'Programs', 'Jade', 'Jade.exe'),
    localAppData && path.join(localAppData, 'Programs', 'jade-rust', 'jade-rust.exe'),
  ];

  const resolved = pickFirstExistingPath(fs, [
    isSupportedJadeExecutablePath(preferredJadePath) ? preferredJadePath : null,
    ...installPathCandidates.filter((p) => isSupportedJadeExecutablePath(p)),
  ]);

  jadePathCache = {
    key: cacheKey,
    value: resolved || null,
    expiresAt: now + JADE_PATH_CACHE_TTL_MS,
  };

  return {
    resolved,
    preferredJadePathRaw,
    preferredJadePathUsed: preferredJadePath,
    preferredLooksLikeWorkspaceDebug,
    discoveredInstalledJade,
    allowDevExe: envAllowsDevExe,
    cached: false,
  };
}

function resolveJadePathDeep({ fs, path, loadPrefs }) {
  const fast = resolveJadePathFast({ fs, path, loadPrefs });
  if (fast.resolved || !ENABLE_REGISTRY_DETECT) {
    return fast;
  }

  const discoveredInstalledJade = findInstalledJadePath({ fs, path });
  if (!discoveredInstalledJade || !fs.existsSync(discoveredInstalledJade)) {
    return fast;
  }

  jadePathCache = {
    ...jadePathCache,
    value: discoveredInstalledJade,
    expiresAt: Date.now() + JADE_PATH_CACHE_TTL_MS,
  };

  return {
    ...fast,
    resolved: discoveredInstalledJade,
    discoveredInstalledJade,
    cached: false,
  };
}

function persistResolvedJadePath({ loadPrefs, savePrefs }, resolvedPath) {
  if (!savePrefs || !loadPrefs || !resolvedPath) return;
  try {
    const prefs = loadPrefs() || {};
    if (prefs[JADE_RESOLVED_PREF_KEY] === resolvedPath) return;
    prefs[JADE_RESOLVED_PREF_KEY] = resolvedPath;
    savePrefs(prefs);
  } catch {}
}

function launchDetached(spawn, command, args = []) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function registerInteropChannels({
  ipcMain,
  app,
  fs,
  path,
  spawn,
  loadPrefs,
  savePrefs,
}) {
  writeQuartzPidFile({ fs, app, path });
  app.on('before-quit', () => removeQuartzPidFile({ fs, app, path }));
  app.on('quit', () => removeQuartzPidFile({ fs, app, path }));

  ipcMain.handle('interop:consumeHandoff', async () => {
    try {
      const messages = consumeInteropMessages({ fs, app, path }, 'quartz');
      if (messages.length === 0) return null;
      if (messages.length === 1) return messages[0];
      return messages;
    } catch (error) {
      return { error: error.message || String(error) };
    }
  });

  ipcMain.handle('interop:sendToJade', async (_event, { binPath, sourceMode }) => {
    try {
      const startedAt = Date.now();
      console.log('[Interop][Main] sendToJade called', { binPath, sourceMode });
      if (!isJadeInteropEnabled(loadPrefs)) {
        return {
          success: false,
          disabled: true,
          error: 'Jade communication is disabled in Settings > External Tools.',
        };
      }
      if (!binPath || !fs.existsSync(binPath)) {
        console.warn('[Interop][Main] sendToJade invalid bin path', { binPath });
        return { success: false, error: `Bin path not found: ${binPath || '(empty)'}` };
      }

      const handoff = {
        target_app: 'jade',
        source_app: 'quartz',
        action: 'open-bin',
        mode: sourceMode || null,
        bin_path: binPath,
        created_at_unix: Math.floor(Date.now() / 1000),
      };
      writeInteropMessage({ fs, app, path }, handoff);
      const interopDir = getInteropDir({ app, path });
      console.log('[Interop][Main] handoff written', {
        interopDir,
        target: handoff.target_app,
        action: handoff.action,
        mode: handoff.mode,
      });

      const jadeRunning = isJadeRunning({ fs, app, path });

      const resolution = resolveJadePathFast({ fs, path, loadPrefs });
      const jadePath = resolution.resolved;
      console.log('[Interop][Main] Jade path resolution', {
        preferredJadePathRaw: resolution.preferredJadePathRaw,
        preferredJadePathUsed: resolution.preferredJadePathUsed,
        preferredLooksLikeWorkspaceDebug: resolution.preferredLooksLikeWorkspaceDebug,
        discoveredInstalledJade: resolution.discoveredInstalledJade,
        allowDevExe: resolution.allowDevExe,
        cached: resolution.cached,
        resolved: jadePath,
      });

      if (!jadePath) {
        // Kick off optional deep detection out-of-band so future attempts are instant.
        setTimeout(() => {
          try {
            const deep = resolveJadePathDeep({ fs, path, loadPrefs });
            if (deep?.resolved) {
              persistResolvedJadePath({ loadPrefs, savePrefs }, deep.resolved);
            }
          } catch {}
        }, 0);
        console.warn('[Interop][Main] Jade executable not found; handoff only');
        return {
          success: true,
          launched: null,
          alreadyRunning: jadeRunning,
          warning: 'Handoff written, but Jade executable was not found for auto-launch. Configure Jade Executable Path in Settings > External Tools or start Jade manually.',
        };
      }

      persistResolvedJadePath({ loadPrefs, savePrefs }, jadePath);

      // Always launch when we have a resolved executable path.
      // If Jade is already running, Tauri single-instance will forward args to the existing process.
      console.log('[Interop][Main] Launching Jade executable', { jadePath, binPath });
      launchDetached(spawn, jadePath, [binPath]);

      console.log('[Interop][Main] Jade launch dispatched');
      return {
        success: true,
        launched: jadePath,
        alreadyRunning: jadeRunning,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      console.error('[Interop][Main] sendToJade exception', error);
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('interop:getWatchDir', () => {
    return getInteropDir({ app, path });
  });

  ipcMain.handle('interop:getJadeInstallStatus', async () => {
    try {
      const interopEnabled = isJadeInteropEnabled(loadPrefs);
      const resolution = resolveJadePathFast({ fs, path, loadPrefs });
      return {
        success: true,
        interopEnabled,
        installed: !!resolution.resolved,
        jadePath: resolution.resolved || null,
        allowDevExe: resolution.allowDevExe,
        preferredLooksLikeWorkspaceDebug: resolution.preferredLooksLikeWorkspaceDebug,
      };
    } catch (error) {
      return {
        success: false,
        installed: false,
        error: error.message || String(error),
      };
    }
  });

  // Launch Jade without opening a specific BIN.
  ipcMain.handle('interop:launchJade', async () => {
    try {
      if (!isJadeInteropEnabled(loadPrefs)) {
        return {
          success: false,
          disabled: true,
          error: 'Jade communication is disabled in Settings > External Tools.',
        };
      }

      const resolution = resolveJadePathFast({ fs, path, loadPrefs });
      const jadePath = resolution.resolved;
      if (!jadePath || !fs.existsSync(jadePath)) {
        return {
          success: false,
          error: 'Jade executable was not found.',
        };
      }

      persistResolvedJadePath({ loadPrefs, savePrefs }, jadePath);
      console.log('[Interop][Main] Launching Jade executable (no bin)', { jadePath });
      launchDetached(spawn, jadePath, []);
      return { success: true, launched: jadePath };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  });

  // Background warmup/refresh so first user action stays instant.
  const prewarmJadePath = () => {
    try {
      if (!isJadeInteropEnabled(loadPrefs)) return;
      const deep = resolveJadePathDeep({ fs, path, loadPrefs });
      if (deep?.resolved) {
        persistResolvedJadePath({ loadPrefs, savePrefs }, deep.resolved);
      }
    } catch {}
  };
  setTimeout(prewarmJadePath, 500);
  const refreshTimer = setInterval(prewarmJadePath, 15 * 60 * 1000);
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }

  // Notify Jade that an already-open BIN was updated in Quartz.
  // This writes a reload handoff but does NOT auto-launch Jade.
  ipcMain.handle('interop:notifyJadeBinUpdated', async (_event, { binPath, sourceMode }) => {
    try {
      console.log('[Interop][Main] notifyJadeBinUpdated called', { binPath, sourceMode });
      if (!isJadeInteropEnabled(loadPrefs)) {
        return { success: true, skipped: true, disabled: true };
      }
      if (!binPath || !fs.existsSync(binPath)) {
        console.warn('[Interop][Main] notifyJadeBinUpdated invalid path', { binPath });
        return { success: false, error: `Bin path not found: ${binPath || '(empty)'}` };
      }

      const handoff = {
        target_app: 'jade',
        source_app: 'quartz',
        action: 'reload-bin',
        mode: sourceMode || null,
        bin_path: binPath,
        created_at_unix: Math.floor(Date.now() / 1000),
      };
      writeInteropMessage({ fs, app, path }, handoff);
      console.log('[Interop][Main] notifyJadeBinUpdated handoff written', {
        interopDir: getInteropDir({ app, path }),
        action: handoff.action,
        mode: handoff.mode,
      });

      const running = isJadeRunning({ fs, app, path });
      if (!running) {
        console.log('[Interop][Main] notifyJadeBinUpdated: Jade not running, handoff queued only');
        return { success: true, queued: true, jadeRunning: false };
      }

      return { success: true, queued: true, jadeRunning: true };
    } catch (error) {
      console.error('[Interop][Main] notifyJadeBinUpdated exception', error);
      return { success: false, error: error.message || String(error) };
    }
  });
}

module.exports = {
  registerInteropChannels,
};
