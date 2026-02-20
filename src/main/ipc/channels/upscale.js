function registerUpscaleChannels({
  ipcMain,
  fs,
  path,
  spawn,
  https,
  processRef,
  logToFile,
  getUpscaleInstallDir,
  loadPrefs,
  savePrefs,
  baseDir,
}) {
  const UPSCALE_DOWNLOADS = {
    binary: {
      name: 'Upscayl Binary',
      url: 'https://github.com/upscayl/upscayl-ncnn/releases/download/20240601-103425/upscayl-bin-20240601-103425-windows.zip',
      filename: 'upscayl-bin-20240601-103425-windows.zip',
      size: '~50MB',
      required: true,
    },
    models: [
      {
        name: 'Upscayl Standard 4x',
        files: [
          {
            filename: 'upscayl-standard-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.bin',
            size: '32MB',
          },
          {
            filename: 'upscayl-standard-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.param',
            size: '1MB',
          },
        ],
        required: true,
      },
      {
        name: 'Upscayl Lite 4x',
        files: [
          {
            filename: 'upscayl-lite-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.bin',
            size: '2.3MB',
          },
          {
            filename: 'upscayl-lite-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.param',
            size: '1MB',
          },
        ],
        required: true,
      },
      {
        name: 'Digital Art 4x',
        files: [
          {
            filename: 'digital-art-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.bin',
            size: '8.5MB',
          },
          {
            filename: 'digital-art-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.param',
            size: '1MB',
          },
        ],
        required: false,
      },
      {
        name: 'High Fidelity 4x',
        files: [
          {
            filename: 'high-fidelity-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.bin',
            size: '32MB',
          },
          {
            filename: 'high-fidelity-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.param',
            size: '1MB',
          },
        ],
        required: false,
      },
      {
        name: 'Ultrasharp 4x',
        files: [
          {
            filename: 'ultrasharp-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.bin',
            size: '32MB',
          },
          {
            filename: 'ultrasharp-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.param',
            size: '1MB',
          },
        ],
        required: false,
      },
      {
        name: 'Remacri 4x',
        files: [
          {
            filename: 'remacri-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.bin',
            size: '32MB',
          },
          {
            filename: 'remacri-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.param',
            size: '1MB',
          },
        ],
        required: false,
      },
      {
        name: 'Ultramix Balanced 4x',
        files: [
          {
            filename: 'ultramix-balanced-4x.bin',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.bin',
            size: '32MB',
          },
          {
            filename: 'ultramix-balanced-4x.param',
            url: 'https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.param',
            size: '1MB',
          },
        ],
        required: false,
      },
    ],
  };

  function ensureDir(p) {
    try { fs.mkdirSync(p, { recursive: true }); } catch { }
  }

  function httpDownloadToFile(url, destPath, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
      const doRequest = (currentUrl, remaining) => {
        https.get(currentUrl, { headers: { 'User-Agent': 'Quartz', 'Accept': 'application/octet-stream' } }, (res) => {
          const status = Number(res.statusCode || 0);
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = res.headers?.location;
            res.resume();
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
        }).on('error', reject);
      };
      doRequest(url, redirectsLeft);
    });
  }

  async function downloadWithPowershell(url, destPath) {
    return await new Promise((resolve) => {
      try { fs.mkdirSync(path.dirname(destPath), { recursive: true }); } catch { }
      const cmd = `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing -Headers @{ 'User-Agent' = 'Quartz' }`;
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, shell: false });
      ps.on('error', () => resolve({ ok: false }));
      ps.on('close', (code) => resolve({ ok: code === 0 }));
    });
  }

  async function extractZipWindows(zipPath, outDir) {
    return await new Promise((resolve) => {
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`], {
        windowsHide: true,
        shell: false,
      });
      ps.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
      ps.on('close', (code) => resolve({ ok: code === 0, code }));
    });
  }

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
      return imageFiles.sort();
    } catch (error) {
      throw new Error(`Failed to read folder: ${error.message}`);
    }
  }

  ipcMain.handle('upscale:check-status', async () => {
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');
    const downloadedExePath = path.join(binaryDir, 'upscayl-bin.exe');
    const status = {
      binary: { installed: fs.existsSync(downloadedExePath), path: downloadedExePath, bundled: false },
      models: { installed: [], missing: [], total: UPSCALE_DOWNLOADS.models.length },
    };
    for (const model of UPSCALE_DOWNLOADS.models) {
      let allFilesExist = true;
      for (const file of model.files) {
        if (!fs.existsSync(path.join(modelsDir, file.filename))) allFilesExist = false;
      }
      if (allFilesExist) status.models.installed.push(model.name);
      else status.models.missing.push(model);
    }
    return status;
  });

  ipcMain.handle('upscale:download-all', async (event) => {
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');
    try {
      event.sender.send('upscale:progress', { step: 'init', message: 'Initializing download...', progress: 0 });
      ensureDir(installDir);
      event.sender.send('upscale:progress', { step: 'binary', message: 'Downloading Upscayl Binary...', progress: 0 });
      const zipPath = path.join(installDir, UPSCALE_DOWNLOADS.binary.filename);
      try {
        await httpDownloadToFile(UPSCALE_DOWNLOADS.binary.url, zipPath);
      } catch (nodeError) {
        const psResult = await downloadWithPowershell(UPSCALE_DOWNLOADS.binary.url, zipPath);
        if (!psResult.ok) throw nodeError;
      }
      event.sender.send('upscale:progress', { step: 'binary', message: 'Extracting Binary...', progress: 50 });
      const extractResult = await extractZipWindows(zipPath, installDir);
      if (!extractResult.ok) throw new Error(`Failed to extract binary: ${extractResult.error || 'Unknown error'}`);
      try { fs.unlinkSync(zipPath); } catch { }
      event.sender.send('upscale:progress', { step: 'binary', message: 'Binary Ready!', progress: 100 });
      ensureDir(modelsDir);
      for (let i = 0; i < UPSCALE_DOWNLOADS.models.length; i++) {
        const model = UPSCALE_DOWNLOADS.models[i];
        event.sender.send('upscale:progress', {
          step: 'models',
          message: `Downloading ${model.name}...`,
          progress: (i / UPSCALE_DOWNLOADS.models.length) * 100,
          current: i + 1,
          total: UPSCALE_DOWNLOADS.models.length,
        });
        for (const file of model.files) {
          const filePath = path.join(modelsDir, file.filename);
          try {
            await httpDownloadToFile(file.url, filePath);
          } catch {
            const psResult = await downloadWithPowershell(file.url, filePath);
            if (!psResult.ok) throw new Error(`Failed to download ${file.filename}`);
          }
        }
      }
      event.sender.send('upscale:progress', { step: 'complete', message: 'All components downloaded successfully!', progress: 100 });
      const exePath = path.join(binaryDir, 'upscayl-bin.exe');
      const savedPrefs = loadPrefs();
      savedPrefs.RealesrganExePath = exePath;
      savePrefs(savedPrefs);
      return { success: true, exePath };
    } catch (e) {
      event.sender.send('upscale:progress', { step: 'error', message: `Download failed: ${e.message}`, progress: 0 });
      throw e;
    }
  });

  ipcMain.handle('upscayl:stream', async (event, { exePath, args, cwd }) => {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(exePath, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      global.currentUpscaylProcess = childProcess;
      let stdout = '';
      let stderr = '';
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        event.sender.send('upscayl:log', output);
      });
      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        const progressMatch = output.match(/(\d+(?:,\d+)?)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1].replace(',', '.'));
          if (!isNaN(progress) && progress >= 0 && progress <= 100) {
            event.sender.send('upscayl:progress', progress);
          }
        }
        event.sender.send('upscayl:log', output);
      });
      childProcess.on('close', (code) => resolve({ code, stdout, stderr }));
      childProcess.on('error', reject);
      childProcess.on('exit', (_code, signal) => {
        if (signal) reject(new Error(`Process killed with signal: ${signal}`));
      });
    });
  });

  ipcMain.handle('upscayl:cancel', async () => {
    try {
      const proc = global.currentUpscaylProcess;
      if (!proc) return { ok: true };
      try { proc.kill('SIGTERM'); } catch { }
      if (processRef.platform === 'win32' && proc.pid) {
        await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/c', 'taskkill', '/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, shell: false });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      }
      global.currentUpscaylProcess = null;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('upscayl:batch-process', async (event, { inputFolder, outputFolder, model, scale, extraArgs, exePath }) => {
    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });
    const imageFiles = discoverImageFiles(inputFolder);
    if (!imageFiles.length) throw new Error('No supported image files found in the selected folder');
    event.sender.send('upscayl:batch-start', { totalFiles: imageFiles.length, files: imageFiles.map(f => path.basename(f)) });
    const results = { total: imageFiles.length, successful: 0, failed: 0, errors: [] };
    for (let i = 0; i < imageFiles.length; i++) {
      const inputFile = imageFiles[i];
      const fileName = path.basename(inputFile);
      const fileExt = path.extname(inputFile);
      const baseName = path.basename(inputFile, fileExt);
      const outputFile = path.join(outputFolder, `${baseName}_x${scale}${fileExt}`);
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1, totalFiles: imageFiles.length, currentFileName: fileName,
        overallProgress: Math.round((i / imageFiles.length) * 100), fileProgress: 0,
      });
      try {
        const args = ['-i', inputFile, '-o', outputFile, '-s', String(scale), '-n', model];
        if (extraArgs && extraArgs.trim().length) args.push(...extraArgs.split(' ').filter(Boolean));
        const exeDir = path.dirname(exePath);
        const { code, stderr } = await new Promise((resolve, reject) => {
          const childProcess = spawn(exePath, args, { cwd: exeDir, stdio: ['pipe', 'pipe', 'pipe'] });
          global.currentUpscaylProcess = childProcess;
          let out = '';
          let err = '';
          childProcess.stdout.on('data', (d) => { out += d.toString(); event.sender.send('upscayl:log', d.toString()); });
          childProcess.stderr.on('data', (d) => {
            const text = d.toString();
            err += text;
            const progressMatch = text.match(/(\d+(?:,\d+)?)%/);
            if (progressMatch) {
              const progress = parseFloat(progressMatch[1].replace(',', '.'));
              if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                event.sender.send('upscayl:batch-progress', {
                  currentFile: i + 1, totalFiles: imageFiles.length, currentFileName: fileName,
                  overallProgress: Math.round((i / imageFiles.length) * 100), fileProgress: progress,
                });
              }
            }
            event.sender.send('upscayl:log', text);
          });
          childProcess.on('close', (c) => resolve({ code: c, stdout: out, stderr: err }));
          childProcess.on('error', reject);
        });
        if (code === 0) results.successful++;
        else {
          results.failed++;
          results.errors.push(`Failed to process ${fileName}: ${stderr}`);
        }
      } catch (fileError) {
        results.failed++;
        results.errors.push(`Error processing ${fileName}: ${fileError.message}`);
      }
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1, totalFiles: imageFiles.length, currentFileName: fileName,
        overallProgress: Math.round(((i + 1) / imageFiles.length) * 100), fileProgress: 100,
      });
    }
    event.sender.send('upscayl:batch-complete', results);
    return results;
  });

  ipcMain.handle('realesrgan.ensure', async () => {
    const savedPrefs = loadPrefs();
    const devPath = path.join(baseDir, 'upscale-backend', 'upscayl-bin-20240601-103425-windows', 'upscayl-bin.exe');
    if (fs.existsSync(devPath)) {
      savedPrefs.RealesrganExePath = devPath;
      savePrefs(savedPrefs);
      return devPath;
    }
    if (savedPrefs?.RealesrganExePath && fs.existsSync(savedPrefs.RealesrganExePath)) {
      return savedPrefs.RealesrganExePath;
    }
    return null;
  });
}

module.exports = {
  registerUpscaleChannels,
};
