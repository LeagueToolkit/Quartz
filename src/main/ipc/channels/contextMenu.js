function registerContextMenuChannels({
  ipcMain,
  exec,
  app,
  path,
  processRef,
  isDev,
  logToFile,
}) {
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
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\command" /ve /d "${guiCommandBase} \\"%1\\"" /f`,
    ];

    for (const command of commands) {
      await execRegistryCommand(command);
    }
  };

  const refreshContextMenuIfStale = async () => {
    if (processRef.platform !== 'win32') return;
    try {
      await execRegistryCommand('reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz"');

      const exePath = app.getPath('exe');
      let isStale = false;
      try {
        const result = await execRegistryCommand(
          'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\command" /ve'
        );
        isStale = !result.stdout.includes(exePath);
      } catch {
        isStale = true;
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

  ipcMain.handle('contextMenu:isEnabled', async () => {
    if (processRef.platform !== 'win32') {
      return { enabled: false, error: 'Context menu only supported on Windows' };
    }

    try {
      const checkCommand = 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz"';
      await execRegistryCommand(checkCommand);
      return { enabled: true };
    } catch {
      return { enabled: false };
    }
  });

  ipcMain.handle('contextMenu:enable', async () => {
    if (processRef.platform !== 'win32') {
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

  ipcMain.handle('contextMenu:disable', async () => {
    if (processRef.platform !== 'win32') {
      return { success: false, error: 'Context menu only supported on Windows' };
    }

    try {
      logToFile('Disabling context menu', 'INFO');

      const commands = [
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CommandStore\\shell\\Quartz.OpenBin" /f',
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CommandStore\\shell\\Quartz.NoSkinLite" /f',
        'reg delete "HKCU\\Software\\Classes\\.bin\\shell\\QuartzMenu" /f',
        'reg delete "HKCU\\Software\\Classes\\.py\\shell\\QuartzBin" /f',
        'reg delete "HKCU\\Software\\Classes\\bin_auto_file\\shell\\QuartzMenu" /f',
      ];

      for (const command of commands) {
        try {
          await execRegistryCommand(command);
        } catch (error) {
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

  return {
    refreshContextMenuIfStale,
  };
}

module.exports = {
  registerContextMenuChannels,
};
