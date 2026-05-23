// Recent-items store for WAD Explorer landing screen.
// Tracks recently opened .wad.client files and .bin files clicked inside the
// WAD tree. Persisted via localStorage; capped to MAX_PER_KIND entries each.
//
// Entry shapes:
//   wad: { path, name, openedAt }
//   bin: { wadPath, internalPath, name, chunkId, openedAt }

const STORAGE_KEY = 'Quartz.RecentItems.v1';
const MAX_PER_KIND = 12;

function safeRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { wad: [], bin: [] };
    const parsed = JSON.parse(raw);
    return {
      wad: Array.isArray(parsed?.wad) ? parsed.wad : [],
      bin: Array.isArray(parsed?.bin) ? parsed.bin : [],
    };
  } catch {
    return { wad: [], bin: [] };
  }
}

function safeWrite(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('quartz-recent-items-changed'));
  } catch { }
}

function basename(p) {
  if (!p) return '';
  const norm = String(p).replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx < 0 ? norm : norm.slice(idx + 1);
}

function dedupKey(kind, entry) {
  if (kind === 'wad') return String(entry.path || '').toLowerCase();
  if (kind === 'bin') return `${String(entry.wadPath || '').toLowerCase()}::${String(entry.internalPath || '').toLowerCase()}`;
  return '';
}

function pushEntry(kind, entry) {
  if (!entry) return;
  const state = safeRead();
  const list = state[kind] || [];
  const key = dedupKey(kind, entry);
  if (!key) return;
  const filtered = list.filter(item => dedupKey(kind, item) !== key);
  filtered.unshift({ ...entry, openedAt: Date.now() });
  state[kind] = filtered.slice(0, MAX_PER_KIND);
  safeWrite(state);
}

export function addRecentWad(filePath) {
  if (!filePath) return;
  pushEntry('wad', { path: filePath, name: basename(filePath) });
}

export function addRecentBin({ wadPath, internalPath, name, chunkId } = {}) {
  if (!wadPath || !internalPath) return;
  pushEntry('bin', {
    wadPath,
    internalPath,
    name: name || basename(internalPath),
    chunkId: Number.isFinite(chunkId) ? chunkId : null,
  });
}

export function getRecentItems() {
  return safeRead();
}

export function removeRecent(kind, entry) {
  if (!entry) return;
  const state = safeRead();
  const list = state[kind] || [];
  const key = dedupKey(kind, entry);
  if (!key) return;
  state[kind] = list.filter(item => dedupKey(kind, item) !== key);
  safeWrite(state);
}

export function clearRecent(kind) {
  const state = safeRead();
  if (kind) state[kind] = [];
  else { state.wad = []; state.bin = []; }
  safeWrite(state);
}

export function subscribeRecentItems(callback) {
  const handler = () => callback(safeRead());
  window.addEventListener('quartz-recent-items-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('quartz-recent-items-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
