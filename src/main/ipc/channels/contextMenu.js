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
    const appPath = app.getAppPath();

    // quartz_cli.exe lives in resources/ in production, project root in dev
    const quartzExe = isDev
      ? path.join(appPath, 'native', 'quartz_cli', 'target', 'release', 'quartz_cli.exe')
      : path.join(path.dirname(appPath), 'quartz_cli.exe');
    const appExe = processRef.execPath;
    const appLaunchPrefix = isDev
      ? `\\"${appExe}\\" \\"${appPath}\\"`
      : `\\"${appExe}\\"`;

    const iconPath = isDev
      ? path.join(appPath, 'public', 'divinelab.ico')
      : path.join(path.dirname(appPath), 'divinelab.ico');

    logToFile(`Enabling context menu. quartz_cli.exe: ${quartzExe}`, 'INFO');

    // Clean Quartz roots first so stale legacy subcommands (old python entries)
    // do not survive re-enabling integration.
    const cleanupRoots = [
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz',
      'HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz',
      'HKCU\\Software\\Classes\\Directory\\shell\\Quartz',
    ];
    for (const key of cleanupRoots) {
      try {
        await execRegistryCommand(`reg delete "${key}" /f`);
      } catch (_) {
        // key may not exist
      }
    }

    const commands = [
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz" /v "Position" /d "mid" /f`,
      // Convert .bin to .py
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\00topy" /v "MUIVerb" /d "Convert to .py" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\00topy" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\00topy" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\00topy\\command" /ve /d "\\"${quartzExe}\\" to-py \\"%1\\"" /f`,
      // Separate VFX
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02separatevfx" /v "MUIVerb" /d "Separate VFX" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02separatevfx" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02separatevfx" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\02separatevfx\\command" /ve /d "\\"${quartzExe}\\" separate-vfx \\"%1\\"" /f`,
      // Combine linked bins
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03combinelinked" /v "MUIVerb" /d "Combine Linked" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03combinelinked" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03combinelinked\\command" /ve /d "\\"${quartzExe}\\" combine-linked \\"%1\\"" /f`,
      // NoSkinLite
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04noskinlite" /v "MUIVerb" /d "NoSkinLite" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04noskinlite" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04noskinlite\\command" /ve /d "\\"${quartzExe}\\" noskinlite \\"%1\\"" /f`,
      // Batch split VFX
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx" /v "MUIVerb" /d "Batch Split VFX" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx\\command" /ve /d "\\"${quartzExe}\\" batch-split-vfx \\"%1\\"" /f`,
      // Extract BIN hashes (keep last in submenu)
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\99extracthashesbin" /v "MUIVerb" /d "Extract hashes" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\99extracthashesbin" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\99extracthashesbin\\command" /ve /d "\\"${quartzExe}\\" extract-hashes-bin \\"%1\\"" /f`,
      // Convert .py to .bin
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\shell\\01tobin" /v "MUIVerb" /d "Convert to .bin" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\shell\\01tobin" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.py\\shell\\Quartz\\shell\\01tobin\\command" /ve /d "\\"${quartzExe}\\" to-bin \\"%1\\"" /f`,
      // Model inspect from .skn
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz\\shell\\01inspectmodel" /v "MUIVerb" /d "Inspect Model" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz\\shell\\01inspectmodel" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz\\shell\\01inspectmodel\\command" /ve /d "${appLaunchPrefix} --inspect-model \\"%1\\"" /f`,
      // Texture conversions for .tex
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\01tex2dds" /v "MUIVerb" /d "QuartzTex: Convert to .dds" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\01tex2dds" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\01tex2dds\\command" /ve /d "\\"${quartzExe}\\" tex2dds \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\02tex2png" /v "MUIVerb" /d "QuartzTex: Convert to .png" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\02tex2png" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\02tex2png" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\02tex2png\\command" /ve /d "\\"${quartzExe}\\" tex2png \\"%1\\"" /f`,
      // Texture conversions for .dds
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\01dds2tex" /v "MUIVerb" /d "QuartzTex: Convert to .tex" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\01dds2tex" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\01dds2tex\\command" /ve /d "\\"${quartzExe}\\" dds2tex \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\02dds2png" /v "MUIVerb" /d "QuartzTex: Convert to .png" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\02dds2png" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\02dds2png" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\02dds2png\\command" /ve /d "\\"${quartzExe}\\" dds2png \\"%1\\"" /f`,
      // Texture conversions for .png
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\01png2tex" /v "MUIVerb" /d "QuartzTex: Convert to .tex" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\01png2tex" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\01png2tex\\command" /ve /d "\\"${quartzExe}\\" png2tex \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\02png2dds" /v "MUIVerb" /d "QuartzTex: Convert to .dds" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\02png2dds" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\02png2dds" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\02png2dds\\command" /ve /d "\\"${quartzExe}\\" png2dds \\"%1\\"" /f`,
      // WAD tools for .wad
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\01extracthashes" /v "MUIVerb" /d "WadTool: Extract hashes" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\01extracthashes" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\01extracthashes\\command" /ve /d "\\"${quartzExe}\\" extract-hashes-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\02unpackwad" /v "MUIVerb" /d "WadTool: Unpack WAD" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\02unpackwad" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\02unpackwad\\command" /ve /d "\\"${quartzExe}\\" unpack-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\03extractunpack" /v "MUIVerb" /d "WadTool: Extract hashes + Unpack" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\03extractunpack" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\03extractunpack" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz\\shell\\03extractunpack\\command" /ve /d "\\"${quartzExe}\\" extract-unpack-wad \\"%1\\"" /f`,
      // WAD tools for .wad.client
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\01extracthashes" /v "MUIVerb" /d "WadTool: Extract hashes" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\01extracthashes" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\01extracthashes\\command" /ve /d "\\"${quartzExe}\\" extract-hashes-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\02unpackwad" /v "MUIVerb" /d "WadTool: Unpack WAD" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\02unpackwad" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\02unpackwad\\command" /ve /d "\\"${quartzExe}\\" unpack-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\03extractunpack" /v "MUIVerb" /d "WadTool: Extract hashes + Unpack" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\03extractunpack" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\03extractunpack" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz\\shell\\03extractunpack\\command" /ve /d "\\"${quartzExe}\\" extract-unpack-wad \\"%1\\"" /f`,
      // .wad.client is seen by Windows as .client extension
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz" /v "MUIVerb" /d "Quartz (WAD)" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\01extracthashes" /v "MUIVerb" /d "WadTool: Extract hashes" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\01extracthashes" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\01extracthashes\\command" /ve /d "\\"${quartzExe}\\" extract-hashes-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\02unpackwad" /v "MUIVerb" /d "WadTool: Unpack WAD" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\02unpackwad" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\02unpackwad\\command" /ve /d "\\"${quartzExe}\\" unpack-wad \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\03extractunpack" /v "MUIVerb" /d "WadTool: Extract hashes + Unpack" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\03extractunpack" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\03extractunpack" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\03extractunpack\\command" /ve /d "\\"${quartzExe}\\" extract-unpack-wad \\"%1\\"" /f`,
      // Folder-level batch texture conversions
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz" /v "MUIVerb" /d "Quartz" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz" /v "SubCommands" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2py" /v "MUIVerb" /d "ritobin: Convert All BIN To PY" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2py" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2py\\command" /ve /d "\\"${quartzExe}\\" ritobindir2py \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2bin" /v "MUIVerb" /d "ritobin: Convert All PY To BIN" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2bin" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2bin\\command" /ve /d "\\"${quartzExe}\\" ritobindir2bin \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00extracthashesbindir" /v "MUIVerb" /d "ritobin: Extract hashes from BIN folder" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00extracthashesbindir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00extracthashesbindir\\command" /ve /d "\\"${quartzExe}\\" extract-hashes-bin-dir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexmissing" /v "MUIVerb" /d "pyntex: Check missing files" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexmissing" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexmissing" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexmissing\\command" /ve /d "\\"${quartzExe}\\" pyntex-missing \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexdeljunk" /v "MUIVerb" /d "pyntex: Remove junk files" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexdeljunk" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexdeljunk" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexdeljunk\\command" /ve /d "\\"${quartzExe}\\" pyntex-deljunk \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\01tex2ddsdir" /v "MUIVerb" /d "QuartzTex: Convert all .tex to .dds" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\01tex2ddsdir" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\01tex2ddsdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\01tex2ddsdir\\command" /ve /d "\\"${quartzExe}\\" tex2ddsdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\02dds2texdir" /v "MUIVerb" /d "QuartzTex: Convert all .dds to .tex" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\02dds2texdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\02dds2texdir\\command" /ve /d "\\"${quartzExe}\\" dds2texdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\03tex2pngdir" /v "MUIVerb" /d "QuartzTex: Convert all .tex to .png" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\03tex2pngdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\03tex2pngdir\\command" /ve /d "\\"${quartzExe}\\" tex2pngdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\04dds2pngdir" /v "MUIVerb" /d "QuartzTex: Convert all .dds to .png" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\04dds2pngdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\04dds2pngdir\\command" /ve /d "\\"${quartzExe}\\" dds2pngdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\05png2texdir" /v "MUIVerb" /d "QuartzTex: Convert all .png to .tex" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\05png2texdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\05png2texdir\\command" /ve /d "\\"${quartzExe}\\" png2texdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\06png2ddsdir" /v "MUIVerb" /d "QuartzTex: Convert all .png to .dds" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\06png2ddsdir" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\06png2ddsdir\\command" /ve /d "\\"${quartzExe}\\" png2ddsdir \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\07packwadclient" /v "MUIVerb" /d "WadTool: Pack to .wad.client" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\07packwadclient" /v "CommandFlags" /t REG_DWORD /d 0x20 /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\07packwadclient" /v "Icon" /d "${iconPath}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\07packwadclient\\command" /ve /d "\\"${quartzExe}\\" pack-wad \\"%1\\"" /f`,
    ];

    for (const command of commands) {
      await execRegistryCommand(command);
    }
  };

  const refreshContextMenuIfStale = async () => {
    if (processRef.platform !== 'win32') return;
    try {
      await execRegistryCommand('reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz"');

      const quartzExe = isDev
        ? path.join(app.getAppPath(), 'native', 'quartz_cli', 'target', 'release', 'quartz_cli.exe')
        : path.join(path.dirname(app.getAppPath()), 'quartz_cli.exe');
      const appExe = processRef.execPath;

      let isStale = false;
      try {
        const checks = [
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\00topy\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\99extracthashesbin\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\03combinelinked\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\04noskinlite\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.bin\\shell\\Quartz\\shell\\05batchsplitvfx\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz\\shell\\01inspectmodel\\command" /ve', expected: appExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz\\shell\\01tex2dds\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz\\shell\\01dds2tex\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz\\shell\\01png2tex\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\01extracthashes\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz\\shell\\03extractunpack\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00ritobindir2py\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00extracthashesbindir\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexmissing\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\00pyntexdeljunk\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\01tex2ddsdir\\command" /ve', expected: quartzExe },
          { query: 'reg query "HKCU\\Software\\Classes\\Directory\\shell\\Quartz\\shell\\07packwadclient\\command" /ve', expected: quartzExe },
        ];
        for (const check of checks) {
          const result = await execRegistryCommand(check.query);
          if (!result.stdout.includes(check.expected)) {
            isStale = true;
            break;
          }
        }
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
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.skn\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.tex\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.dds\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.png\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.wad.client\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\SystemFileAssociations\\.client\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\Directory\\shell\\Quartz" /f',
        'reg delete "HKCU\\Software\\Classes\\Directory\\shell\\QuartzTextures" /f',
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
