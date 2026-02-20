function registerToolsChannels({
  ipcMain,
  spawn,
  fs,
  path,
  processRef,
}) {
  ipcMain.handle('tools:runExe', async (_event, payload) => {
    try {
      const exePath = payload?.exePath;
      if (!exePath) {
        return { code: -1, stdout: '', stderr: 'Missing exePath' };
      }
      const args = Array.isArray(payload?.args) ? payload.args : [];
      const cwd = payload?.cwd || path.dirname(exePath);
      const openConsole = Boolean(payload?.openConsole);

      if (processRef.platform === 'win32' && openConsole) {
        const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
        const consoleArgs = ['/c', 'start', '', quote(exePath), ...args.map(quote)];
        const child = spawn('cmd.exe', consoleArgs, {
          cwd,
          windowsHide: false,
          shell: false,
          detached: true,
          stdio: 'ignore',
        });
        child.on('error', () => {
          // Surface spawn error via return path if needed later.
        });
        try { child.unref(); } catch { }
        return { code: 0, stdout: '', stderr: '' };
      }

      return await new Promise((resolve) => {
        const child = spawn(exePath, args, {
          cwd,
          shell: false,
          windowsHide: true,
          detached: false,
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

  ipcMain.handle('tools:deletePath', async (_event, payload) => {
    const targetPath = payload?.path;
    const exeName = payload?.exeName;
    if (!targetPath) return { ok: false, error: 'Missing path' };
    try {
      const attemptDelete = () => {
        try {
          if (fs.rmSync) {
            fs.rmSync(targetPath, { force: true });
          } else if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
          return true;
        } catch (err) {
          return err;
        }
      };

      let res = attemptDelete();
      if (res === true) return { ok: true };

      if (processRef.platform === 'win32' && exeName) {
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

      try {
        const dir = path.dirname(targetPath);
        const base = path.basename(targetPath);
        const tmp = path.join(dir, `${base}.pendingDelete-${Date.now()}`);
        fs.renameSync(targetPath, tmp);
        if (fs.rmSync) fs.rmSync(tmp, { force: true });
        else fs.unlinkSync(tmp);
        return { ok: true };
      } catch (err2) {
        return { ok: false, error: String(res?.message || res) + ' | ' + String(err2?.message || err2) };
      }
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
}

module.exports = {
  registerToolsChannels,
};
