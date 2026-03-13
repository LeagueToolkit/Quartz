const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const MANIFEST_FILE = 'manifest.json';

const isImageFile = (fileName = '') => IMAGE_EXTENSIONS.has((fileName.match(/\.[^.]+$/)?.[0] || '').toLowerCase());

const toLocalFileSrc = (filePath = '') => {
  if (!filePath) return '';
  if (filePath.startsWith('local-file:///') || filePath.startsWith('file:///') || filePath.startsWith('http') || filePath.startsWith('data:')) {
    return filePath;
  }
  return `local-file:///${String(filePath).replace(/\\/g, '/')}`;
};

const slugifyName = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'wallpaper';

const uniqueId = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getNodeDeps = () => {
  if (!window.require) return null;
  const fs = window.require('fs');
  const path = window.require('path');
  const os = window.require('os');
  const { ipcRenderer } = window.require('electron');
  return { fs, path, os, ipcRenderer };
};

const resolveUserDataPath = async () => {
  const deps = getNodeDeps();
  if (!deps) return null;
  const { path, os, ipcRenderer } = deps;
  try {
    return await ipcRenderer.invoke('get-user-data-path');
  } catch {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Quartz');
  }
};

const readJsonSafe = (fs, filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return fallback;
  }
};

const writeJsonSafe = (fs, filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const normalizeEntry = (entry = {}) => {
  if (!entry || !entry.id || !entry.filePath) return null;
  return {
    id: String(entry.id),
    displayName: String(entry.displayName || entry.id),
    source: entry.source === 'bundled' ? 'bundled' : 'user',
    filePath: String(entry.filePath),
    createdAt: entry.createdAt || new Date().toISOString(),
    themeId: entry.themeId || null,
  };
};

const normalizeManifest = (manifest = {}) => {
  const items = Array.isArray(manifest.items) ? manifest.items.map(normalizeEntry).filter(Boolean) : [];
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return { version: 1, items: deduped };
};

const readManifest = (fs, manifestPath) => normalizeManifest(readJsonSafe(fs, manifestPath, { version: 1, items: [] }));

const ensureDir = (fs, dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const getBundledWallpaperFiles = async ({ fs, path, ipcRenderer }) => {
  const files = [];
  let appPath = null;
  let resourcesPath = null;
  try { appPath = await ipcRenderer.invoke('getAppPath'); } catch {}
  try { resourcesPath = await ipcRenderer.invoke('getResourcesPath'); } catch {}

  const candidateDirs = [
    appPath ? path.join(appPath, 'public', 'wallpapers') : null,
    resourcesPath ? path.join(resourcesPath, 'wallpapers') : null,
    resourcesPath ? path.join(resourcesPath, 'assets', 'wallpapers') : null,
  ].filter(Boolean);

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!isImageFile(entry.name)) continue;
        files.push(path.join(dir, entry.name));
      }
    } catch {}
  }

  return files;
};

const mapEntryForUi = (entry) => ({
  ...entry,
  previewSrc: toLocalFileSrc(entry.filePath),
});

const wallpaperManager = {
  async getPaths() {
    const deps = getNodeDeps();
    if (!deps) return null;
    const { path } = deps;
    const userDataPath = await resolveUserDataPath();
    if (!userDataPath) return null;
    const wallpapersDir = path.join(userDataPath, 'wallpapers');
    const manifestPath = path.join(wallpapersDir, MANIFEST_FILE);
    return { ...deps, userDataPath, wallpapersDir, manifestPath };
  },

  async listWallpapers() {
    const paths = await this.getPaths();
    if (!paths) return [];
    const { fs, path, wallpapersDir, manifestPath, ipcRenderer } = paths;
    ensureDir(fs, wallpapersDir);

    let manifest = readManifest(fs, manifestPath);
    const now = new Date().toISOString();

    // Ensure local files in roaming dir are indexed.
    const dirFiles = fs
      .readdirSync(wallpapersDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== MANIFEST_FILE && isImageFile(entry.name))
      .map((entry) => path.join(wallpapersDir, entry.name));

    for (const filePath of dirFiles) {
      const exists = manifest.items.some((item) => item.filePath === filePath);
      if (!exists) {
        manifest.items.push({
          id: uniqueId('user'),
          displayName: path.basename(filePath, path.extname(filePath)),
          source: 'user',
          filePath,
          createdAt: now,
          themeId: null,
        });
      }
    }

    // Build bundled wallpapers as read-only runtime entries.
    // Do not persist them into roaming manifest (avoids dev absolute paths leaking there).
    const bundledFiles = await getBundledWallpaperFiles({ fs, path, ipcRenderer });
    const bundledItems = [];
    for (const filePath of bundledFiles) {
      const base = path.basename(filePath, path.extname(filePath));
      const id = `bundled:${slugifyName(base)}`;
      bundledItems.push({
        id,
        displayName: base,
        source: 'bundled',
        filePath,
        createdAt: now,
        themeId: null,
      });
    }

    // Remove stale entries and keep only user-managed files in roaming manifest.
    manifest.items = manifest.items.filter((item) => {
      if (!item?.filePath) return false;
      if (item.source === 'bundled') return false;
      return fs.existsSync(item.filePath);
    });

    manifest = normalizeManifest(manifest);
    writeJsonSafe(fs, manifestPath, manifest);

    return [...manifest.items, ...bundledItems]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(mapEntryForUi);
  },

  async importWallpaper(sourcePath) {
    const paths = await this.getPaths();
    if (!paths || !sourcePath) return null;
    const { fs, path, wallpapersDir, manifestPath } = paths;
    if (!fs.existsSync(sourcePath)) return null;
    if (!isImageFile(sourcePath)) return null;

    ensureDir(fs, wallpapersDir);
    const ext = path.extname(sourcePath).toLowerCase();
    const id = uniqueId('user');
    const targetPath = path.join(wallpapersDir, `${id}${ext}`);
    fs.copyFileSync(sourcePath, targetPath);

    const manifest = readManifest(fs, manifestPath);
    const entry = {
      id,
      displayName: path.basename(sourcePath, ext),
      source: 'user',
      filePath: targetPath,
      createdAt: new Date().toISOString(),
      themeId: null,
    };
    manifest.items.unshift(entry);
    writeJsonSafe(fs, manifestPath, normalizeManifest(manifest));
    return mapEntryForUi(entry);
  },

  async deleteWallpaper(id) {
    const paths = await this.getPaths();
    if (!paths || !id) return false;
    const { fs, path, wallpapersDir, manifestPath } = paths;
    const manifest = readManifest(fs, manifestPath);
    const target = manifest.items.find((item) => item.id === id);
    if (!target || target.source === 'bundled') return false;

    // Safety: only allow deleting user wallpapers stored in roaming wallpapersDir.
    const normalizedDir = path.resolve(wallpapersDir).toLowerCase();
    const normalizedFile = path.resolve(String(target.filePath || '')).toLowerCase();
    if (!normalizedFile.startsWith(normalizedDir + path.sep) && normalizedFile !== normalizedDir) {
      return false;
    }

    try {
      if (fs.existsSync(target.filePath)) fs.unlinkSync(target.filePath);
    } catch {}
    manifest.items = manifest.items.filter((item) => item.id !== id);
    writeJsonSafe(fs, manifestPath, normalizeManifest(manifest));
    return true;
  },

  async resolveById(id) {
    const wallpapers = await this.listWallpapers();
    return wallpapers.find((item) => item.id === id) || null;
  },

  async migrateLegacyWallpaperPath(legacyPath = '') {
    const clean = String(legacyPath || '').trim();
    if (!clean) return null;
    const paths = await this.getPaths();
    if (!paths) return null;
    const { fs, path, wallpapersDir, manifestPath } = paths;

    const manifest = readManifest(fs, manifestPath);
    const existingByPath = manifest.items.find((item) => item.filePath === clean);
    if (existingByPath && fs.existsSync(existingByPath.filePath)) {
      return mapEntryForUi(existingByPath);
    }

    if (!fs.existsSync(clean) || !isImageFile(clean)) return null;

    // If already inside roaming wallpapers dir, index it directly.
    const normalizedDir = path.resolve(wallpapersDir).toLowerCase();
    const normalizedFile = path.resolve(clean).toLowerCase();
    let entry = null;

    if (normalizedFile.startsWith(normalizedDir)) {
      entry = {
        id: uniqueId('user'),
        displayName: path.basename(clean, path.extname(clean)),
        source: 'user',
        filePath: clean,
        createdAt: new Date().toISOString(),
        themeId: null,
      };
    } else {
      entry = await this.importWallpaper(clean);
      return entry;
    }

    manifest.items.unshift(entry);
    writeJsonSafe(fs, manifestPath, normalizeManifest(manifest));
    return mapEntryForUi(entry);
  },
};

export default wallpaperManager;
