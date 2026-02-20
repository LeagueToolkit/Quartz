function registerAudioChannels({
  ipcMain,
  app,
  fs,
  path,
  spawn,
  logToFile,
}) {
  const AUDIO_TOOLS_ROOT = path.join(app.getPath('appData'), 'Quartz', 'AudioTools');
  const WWISE_CONSOLE_EXE = path.join(AUDIO_TOOLS_ROOT, 'Wwise', 'WwiseApp', 'Authoring', 'x64', 'Release', 'bin', 'WwiseConsole.exe');
  const WWISE_WPROJ = path.join(AUDIO_TOOLS_ROOT, 'Wwise', 'WwiseLeagueProjects', 'WWiseLeagueProjects.wproj');
  const VGMSTREAM_EXE = path.join(AUDIO_TOOLS_ROOT, 'Decoders', 'vgmstream-cli.exe');
  const WWISE_TEMP_DIR = path.join(AUDIO_TOOLS_ROOT, 'Temp');

  // wwise:check - fast existence check
  ipcMain.handle('wwise:check', async () => {
    return { installed: fs.existsSync(WWISE_CONSOLE_EXE) };
  });

  // wwise:install - download only wiwawe + vgmstream files directly via GitHub raw API
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

      // Step 1: Fetch file tree from GitHub API
      sendProgress('Fetching file list from GitHub...');
      const treeJson = JSON.parse((await httpsGet(TREE_API)).toString('utf8'));
      if (!treeJson.tree) throw new Error('GitHub API returned unexpected response');

      const filesToDownload = treeJson.tree.filter(item =>
        item.type === 'blob' && WANTED_PREFIXES.some(p => item.path.startsWith(p))
      );

      if (filesToDownload.length === 0) throw new Error('No files found — repo structure may have changed');

      // Step 2: Download files with limited concurrency
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

      // Step 3: Verify
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

  // audio:convert-to-wem - convert wav/mp3/ogg file to .wem, return output path
  ipcMain.handle('audio:convert-to-wem', async (_event, { inputPath }) => {
    try {
      if (!fs.existsSync(WWISE_CONSOLE_EXE)) {
        return { success: false, error: 'Wwise tools not installed' };
      }

      fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });

      const ext = path.extname(inputPath).toLowerCase();
      const baseName = path.basename(inputPath, ext);
      const uniqueId = Date.now();
      let wavPath = inputPath;

      // Step 1: If MP3/OGG, decode to PCM WAV via vgmstream
      if (ext === '.mp3' || ext === '.ogg') {
        if (!fs.existsSync(VGMSTREAM_EXE)) {
          return { success: false, error: 'vgmstream decoder not installed' };
        }
        wavPath = path.join(WWISE_TEMP_DIR, `${baseName}_${uniqueId}.wav`);
        await new Promise((resolve, reject) => {
          const proc = spawn(VGMSTREAM_EXE, ['-o', wavPath, inputPath], {
            windowsHide: true,
            cwd: path.dirname(VGMSTREAM_EXE),
          });
          proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`vgmstream exit ${code}`)));
          proc.on('error', reject);
        });
      }

      // Step 2: Generate .wsources XML
      const wsourcesPath = path.join(WWISE_TEMP_DIR, `${baseName}_${uniqueId}.wsources`);
      const wsourcesXml = `<?xml version="1.0" encoding="UTF-8"?>\n<ExternalSourcesList SchemaVersion="1" Root="${WWISE_TEMP_DIR}">\n  <Source Path="${wavPath}" Conversion="Vorbis Quality High" Destination="${baseName}_${uniqueId}"/>\n</ExternalSourcesList>`;
      fs.writeFileSync(wsourcesPath, wsourcesXml, 'utf8');

      // Step 3: Run WwiseConsole convert-external-source
      const wemOutputDir = WWISE_TEMP_DIR;
      await new Promise((resolve, reject) => {
        const proc = spawn(WWISE_CONSOLE_EXE, [
          'convert-external-source',
          WWISE_WPROJ,
          '--source-file', wsourcesPath,
          '--output', wemOutputDir,
          '--platform', 'Windows',
        ], { windowsHide: true, cwd: path.dirname(WWISE_CONSOLE_EXE) });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += String(d); });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`WwiseConsole exit ${code}: ${stderr.trim()}`));
        });
        proc.on('error', reject);
      });

      // Step 4: Locate the output .wem
      const candidatePaths = [
        path.join(wemOutputDir, 'Windows', `${baseName}_${uniqueId}.wem`),
        path.join(wemOutputDir, `${baseName}_${uniqueId}.wem`),
      ];
      const wemPath = candidatePaths.find(p => fs.existsSync(p));
      if (!wemPath) {
        return { success: false, error: 'Conversion succeeded but .wem output not found' };
      }

      // Step 5: Cleanup intermediates
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

  // audio:amplify-wem - decode WEM -> amplify WAV -> re-encode to WEM
  ipcMain.handle('audio:amplify-wem', async (_event, { inputWemPath, gainDb }) => {
    try {
      if (!fs.existsSync(WWISE_CONSOLE_EXE)) return { success: false, error: 'Wwise tools not installed' };
      if (!fs.existsSync(VGMSTREAM_EXE)) return { success: false, error: 'vgmstream decoder not installed' };
      fs.mkdirSync(WWISE_TEMP_DIR, { recursive: true });

      const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const wavPath = path.join(WWISE_TEMP_DIR, `gain_${uid}.wav`);
      const baseName = `gain_${uid}`;

      // Step 1: WEM -> WAV via vgmstream
      await new Promise((resolve, reject) => {
        const proc = spawn(VGMSTREAM_EXE, ['-o', wavPath, inputWemPath], {
          windowsHide: true, cwd: path.dirname(VGMSTREAM_EXE),
        });
        proc.on('close', (c) => c === 0 ? resolve() : reject(new Error(`vgmstream exit ${c}`)));
        proc.on('error', reject);
      });

      // Step 2: amplify WAV samples in Node.js
      fs.writeFileSync(wavPath, amplifyWavBuffer(fs.readFileSync(wavPath), gainDb));

      // Step 3: WAV -> WEM via WwiseConsole
      const wsourcesPath = path.join(WWISE_TEMP_DIR, `${baseName}.wsources`);
      fs.writeFileSync(wsourcesPath,
        `<?xml version="1.0" encoding="UTF-8"?>\n<ExternalSourcesList SchemaVersion="1" Root="${WWISE_TEMP_DIR}">\n  <Source Path="${wavPath}" Conversion="Vorbis Quality High" Destination="${baseName}"/>\n</ExternalSourcesList>`,
        'utf8');
      await new Promise((resolve, reject) => {
        const proc = spawn(WWISE_CONSOLE_EXE, [
          'convert-external-source', WWISE_WPROJ,
          '--source-file', wsourcesPath,
          '--output', WWISE_TEMP_DIR,
          '--platform', 'Windows',
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

  // audio:decode-to-wav - convert WEM/MP3/OGG -> WAV using vgmstream (for AudioSplitter)
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
          windowsHide: true, cwd: path.dirname(VGMSTREAM_EXE),
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

  // wwise:reset - delete the entire AudioTools folder
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
}

module.exports = {
  registerAudioChannels,
};
