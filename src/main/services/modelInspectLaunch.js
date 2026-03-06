function createModelInspectLaunchService({ fs, logToFile, getMainWindow }) {
  let pendingModelInspectPath = null;

  const log = (message, level = 'INFO') => {
    try {
      logToFile(message, level);
    } catch (_) {}
  };

  const extractModelInspectPath = (args = []) => {
    const list = Array.isArray(args) ? args : [];
    log(`[ModelInspectLaunch] argv: ${JSON.stringify(list)}`, 'INFO');

    const findSknArg = (arr) => {
      for (const arg of arr) {
        if (typeof arg !== 'string') continue;
        const lower = arg.toLowerCase();
        if (lower.endsWith('.skn')) return arg;
      }
      return null;
    };

    const inspectFlagIdx = list.indexOf('--inspect-model');
    if (inspectFlagIdx !== -1) {
      // In dev, Electron may inject Chromium flags after our custom flag.
      // Prefer first .skn argument after --inspect-model.
      const afterFlag = list.slice(inspectFlagIdx + 1);
      const flaggedSkn = findSknArg(afterFlag);
      if (flaggedSkn) {
        log(`[ModelInspectLaunch] detected --inspect-model target: ${flaggedSkn}`, 'INFO');
        return flaggedSkn;
      }
      const candidate = list[inspectFlagIdx + 1];
      if (typeof candidate === 'string' && candidate.trim() && !candidate.startsWith('--')) {
        log(`[ModelInspectLaunch] detected --inspect-model fallback target: ${candidate}`, 'INFO');
        return candidate;
      }
      return null;
    }

    for (const arg of list) {
      if (typeof arg !== 'string') continue;
      const lower = arg.toLowerCase();
      if (lower.endsWith('.skn')) {
        log(`[ModelInspectLaunch] detected direct .skn arg: ${arg}`, 'INFO');
        return arg;
      }
    }

    return null;
  };

  const sendModelInspectToRenderer = (targetPath) => {
    if (!targetPath) {
      log('[ModelInspectLaunch] send skipped: empty targetPath', 'WARN');
      return false;
    }
    if (!fs.existsSync(targetPath)) {
      log(`[ModelInspectLaunch] send skipped: file does not exist: ${targetPath}`, 'WARN');
      return false;
    }

    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      log('[ModelInspectLaunch] send deferred: main window missing/destroyed', 'WARN');
      return false;
    }

    const payload = { path: targetPath };
    log(`[ModelInspectLaunch] sending payload to renderer: ${JSON.stringify(payload)}`, 'INFO');

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        try {
          log('[ModelInspectLaunch] renderer finished load, sending deferred payload', 'INFO');
          win.webContents.send('app:open-model-inspect', payload);
        } catch (e) {
          log(`[ModelInspectLaunch] deferred send failed: ${e.message}`, 'ERROR');
        }
      });
    } else {
      try {
        win.webContents.send('app:open-model-inspect', payload);
      } catch (e) {
        log(`[ModelInspectLaunch] immediate send failed: ${e.message}`, 'ERROR');
        return false;
      }
    }

    log('[ModelInspectLaunch] payload send success', 'INFO');
    return true;
  };

  return {
    initFromStartupArgs(args) {
      pendingModelInspectPath = extractModelInspectPath(args);
      return pendingModelInspectPath;
    },
    handleSecondInstanceArgs(args) {
      const targetPath = extractModelInspectPath(args);
      log(`[ModelInspectLaunch] second-instance target: ${targetPath || '(none)'}`, 'INFO');
      if (targetPath && !sendModelInspectToRenderer(targetPath)) {
        pendingModelInspectPath = targetPath;
        log(`[ModelInspectLaunch] queued pending target from second-instance: ${targetPath}`, 'WARN');
      }
      return targetPath;
    },
    flushPendingOnReady() {
      if (!pendingModelInspectPath) return;
      const initialPath = pendingModelInspectPath;
      pendingModelInspectPath = null;
      log(`[ModelInspectLaunch] processing pending startup target: ${initialPath}`, 'INFO');
      if (!sendModelInspectToRenderer(initialPath)) {
        setTimeout(() => {
          log('[ModelInspectLaunch] retrying pending payload after delay', 'INFO');
          sendModelInspectToRenderer(initialPath);
        }, 1200);
      }
    },
  };
}

module.exports = { createModelInspectLaunchService };
