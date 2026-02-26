import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, RefreshCw, Zap, ZapOff, Download, Settings, Upload, Database, File } from 'lucide-react';
import electronPrefs from '../../utils/core/electronPrefs.js';
import WadExplorerTree from './components/WadExplorerTree.js';
import { useWadExplorer } from './hooks/useWadExplorer.js';
import { loadImageAsDataURL } from '../../filetypes/index.js';
import WadExplorerDialog from '../../components/modals/WadExplorerDialog.js';
import WadExplorerSettingsModal from '../../components/modals/WadExplorerSettingsModal.js';
import ModelInspectModal from '../../components/model-inspect/ModelInspectModal.js';
import BinViewer from '../../components/BinViewer/BinViewer.js';
import * as S from './styles.js';

const { ipcRenderer } = window.require('electron');

function detectGamePath() {
  if (!window.require) return '';
  try {
    const path = window.require('path');
    const fs = window.require('fs');
    const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
    const candidates = [];
    for (const d of drives) {
      candidates.push(path.join(d, 'Riot Games', 'League of Legends', 'Game'));
      candidates.push(path.join(d, 'Apps', 'Riot Games', 'League of Legends', 'Game'));
      candidates.push(path.join(d, 'Program Files', 'Riot Games', 'League of Legends', 'Game'));
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch (_) { }
  return '';
}

function deriveGamePath(championsPath) {
  if (!championsPath) return '';
  const norm = championsPath.replace(/\\/g, '/');
  const idx = norm.toLowerCase().indexOf('/data/final');
  if (idx !== -1) return championsPath.slice(0, idx);
  return '';
}

async function openDirectoryDialog() {
  const result = await ipcRenderer.invoke('dialog:openDirectory');
  if (result?.canceled || !result?.filePaths?.length) return null;
  return result.filePaths[0];
}

async function openWadFileDialog(defaultPath) {
  const result = await ipcRenderer.invoke('dialog:openFile', {
    title: 'Open WAD File',
    filters: [{ name: 'WAD Client', extensions: ['wad.client'] }, { name: 'All Files', extensions: ['*'] }],
    ...(defaultPath ? { defaultPath } : {}),
  });
  if (result?.canceled || !result?.filePaths?.length) return null;
  return result.filePaths[0];
}

async function getHashDirectory() {
  try {
    const result = await ipcRenderer.invoke('hashes:get-directory');
    return result?.hashDir || '';
  } catch (_) { return ''; }
}

const COMP_LABELS = ['Raw', 'Gzip', 'Sat', 'Zstd', 'ZstdC'];
const COMP_COLORS = ['rgba(255,255,255,0.4)', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981'];

function fmtBytes(b) {
  if (!b) return '—';
  if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function DetailRow({ label, value, valueColor, mono }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: '22px', alignItems: 'flex-start' }}>
      <span style={{ width: 110, flexShrink: 0, color: 'var(--text-2)', opacity: 0.65 }}>{label}</span>
      <span style={{ flex: 1, color: valueColor || 'var(--text)', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? 11 : 12 }}>
        {value}
      </span>
    </div>
  );
}

function collectTextureFilesFromDir(node, out = []) {
  if (!node || node.type !== 'dir' || !Array.isArray(node.children)) return out;
  for (const child of node.children) {
    if (!child) continue;
    if (child.type !== 'file') continue;
    const ext = String(child.extension || child.name?.split('.').pop() || '').toLowerCase();
    if (ext === 'dds' || ext === 'tex') out.push(child);
  }
  return out;
}

function base64ToArrayBuffer(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function pathDirnamePosix(value) {
  const v = toPosixPath(value);
  const idx = v.lastIndexOf('/');
  if (idx < 0) return '';
  return v.slice(0, idx);
}

function pathBasenamePosix(value) {
  const v = toPosixPath(value);
  const idx = v.lastIndexOf('/');
  return idx < 0 ? v : v.slice(idx + 1);
}

function pathStemPosix(value) {
  const base = pathBasenamePosix(value);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(0, idx) : base;
}

function extOfPath(value) {
  const base = pathBasenamePosix(value).toLowerCase();
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1) : '';
}

function flattenFiles(nodes, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'file') out.push(node);
    else if (node.type === 'dir') flattenFiles(node.children || [], out);
  }
  return out;
}

const MODEL_TEXTURE_EXTS = new Set(['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp']);
const TEXTURE_PREVIEW_LIMIT_BYTES = 20 * 1024 * 1024;

function isTextureFilePath(filePath) {
  return MODEL_TEXTURE_EXTS.has(extOfPath(filePath));
}

function deriveCharacterAndSkin(pathValue) {
  const norm = toPosixPath(pathValue).toLowerCase();
  const m = norm.match(/\/characters\/([^/]+)\/skins\/([^/]+)\//);
  return {
    character: m?.[1] || '',
    skinKey: m?.[2] || '',
  };
}

function deriveSkinRoot(pathValue) {
  const norm = toPosixPath(pathValue);
  const m = norm.match(/^(.*\/characters\/[^/]+\/skins\/[^/]+)\//i);
  return m?.[1] || pathDirnamePosix(norm);
}

function normalizeHintKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildMaterialTextureHints(texturePaths, { character = '', skinKey = '' } = {}) {
  const hints = {};
  const addHint = (key, relPath) => {
    const k = normalizeHintKey(key);
    if (!k) return;
    if (!hints[k]) hints[k] = relPath;
  };

  for (const relPath of texturePaths) {
    const base = pathBasenamePosix(relPath);
    const stem = pathStemPosix(relPath).toLowerCase();
    const cleanStem = stem.replace(/\.(dds|tex|png|jpg|jpeg|tga|bmp|webp)$/i, '');

    addHint(cleanStem, relPath);
    addHint(base.toLowerCase(), relPath);

    const charPrefix = character ? `${character.toLowerCase()}_` : '';
    const skinPrefix = skinKey ? `${skinKey.toLowerCase()}_` : '';

    let reduced = cleanStem;
    if (charPrefix && reduced.startsWith(charPrefix)) reduced = reduced.slice(charPrefix.length);
    if (skinPrefix && reduced.startsWith(skinPrefix)) reduced = reduced.slice(skinPrefix.length);

    reduced = reduced
      .replace(/_tx(_cm|_hm|_nm|_sm|_ao|_mra)?$/i, '')
      .replace(/_(cm|hm|nm|sm|ao|mra)$/i, '')
      .replace(/^tx_/, '');

    addHint(reduced, relPath);

    const parts = reduced.split('_').filter((p) => p.length >= 3);
    for (const part of parts) addHint(part, relPath);
  }

  return hints;
}

function pickCompanionFiles(files, selectedPath) {
  const selectedNorm = toPosixPath(selectedPath);
  const selectedDir = pathDirnamePosix(selectedNorm);
  const selectedStem = pathStemPosix(selectedNorm).toLowerCase();
  const selectedExt = extOfPath(selectedNorm);
  const skinRoot = deriveSkinRoot(selectedNorm);
  const filesInSkin = files.filter((f) => {
    const p = toPosixPath(f.path);
    return p.startsWith(`${skinRoot}/`) || pathDirnamePosix(p) === skinRoot;
  });
  const filesInDir = files.filter((f) => pathDirnamePosix(f.path) === selectedDir);

  const byExt = (ext, source = filesInSkin) => source.filter((f) => extOfPath(f.path) === ext);
  const pickByStem = (list, stem) => list.find((f) => pathStemPosix(f.path).toLowerCase() === stem) || null;

  const sknFiles = byExt('skn');
  const sklFiles = byExt('skl');
  const anmFiles = byExt('anm');
  const texFiles = filesInSkin.filter((f) => isTextureFilePath(f.path));
  const texFilesInDir = filesInDir.filter((f) => isTextureFilePath(f.path));

  let modelFile = null;
  if (selectedExt === 'skn') modelFile = files.find((f) => toPosixPath(f.path) === selectedNorm) || null;
  else modelFile = pickByStem(sknFiles, selectedStem) || sknFiles.find((f) => pathDirnamePosix(f.path) === selectedDir) || sknFiles[0] || null;

  const skeletonFile = selectedExt === 'skl'
    ? (files.find((f) => toPosixPath(f.path) === selectedNorm) || null)
    : (pickByStem(sklFiles, modelFile ? pathStemPosix(modelFile.path).toLowerCase() : selectedStem) || pickByStem(sklFiles, selectedStem) || sklFiles[0] || null);

  const animationFile = selectedExt === 'anm'
    ? (files.find((f) => toPosixPath(f.path) === selectedNorm) || null)
    : (pickByStem(anmFiles, modelFile ? pathStemPosix(modelFile.path).toLowerCase() : selectedStem) || pickByStem(anmFiles, selectedStem) || anmFiles[0] || null);

  const textureFile =
    pickByStem(texFilesInDir, modelFile ? pathStemPosix(modelFile.path).toLowerCase() : selectedStem) ||
    pickByStem(texFiles, modelFile ? pathStemPosix(modelFile.path).toLowerCase() : selectedStem) ||
    texFilesInDir[0] ||
    texFiles[0] ||
    null;

  const { character, skinKey } = deriveCharacterAndSkin(selectedNorm);
  const texturePaths = texFiles.map((f) => toPosixPath(f.path));
  const materialTextureHints = buildMaterialTextureHints(texturePaths, { character, skinKey });
  if (textureFile?.path) materialTextureHints.__default__ = toPosixPath(textureFile.path);

  const defaultTextureBySkn = {};
  for (const skn of sknFiles) {
    const sknStem = pathStemPosix(skn.path).toLowerCase();
    const best = pickByStem(texFiles, sknStem) || textureFile || null;
    if (best?.path) defaultTextureBySkn[toPosixPath(skn.path).toLowerCase()] = toPosixPath(best.path);
  }

  return {
    modelFile,
    skeletonFile,
    animationFile,
    textureFile,
    sknFiles,
    sklFiles,
    anmFiles,
    texFiles,
    materialTextureHints,
    defaultTextureBySkn,
  };
}

function FolderTextureGallery({ selectedNode, hashPath }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [largePreviewPrompt, setLargePreviewPrompt] = useState(null);
  const [allowLargePreview, setAllowLargePreview] = useState(false);

  useEffect(() => {
    setAllowLargePreview(false);
  }, [selectedNode?.wadPath, selectedNode?.node?.path]);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setError('');
    setLoading(false);
    setLargePreviewPrompt(null);

    if (!selectedNode || selectedNode.type !== 'dir') return () => { cancelled = true; };

    const { node, wadPath } = selectedNode;
    const initialFiles = collectTextureFilesFromDir(node, []);
    if (initialFiles.length === 0) return () => { cancelled = true; };

    const run = async () => {
      let files = initialFiles;
      let candidates = files.filter((f) => Number.isInteger(Number(f.chunkId)) && Number(f.chunkId) >= 0);

      // If no chunkIds found, we might be in a fast-path tree. Try to mount the WAD to get full metadata.
      if (candidates.length === 0) {
        setLoading(true);
        try {
          const res = await window.electronAPI?.wad?.mountTree?.({ wadPath, hashPath });
          if (cancelled) return;
          if (res?.error) throw new Error(res.error);
          if (Array.isArray(res?.tree)) {
            const allFiles = flattenFiles(res.tree, []);
            const targetDir = toPosixPath(node.path);
            files = allFiles.filter(f => {
              const p = toPosixPath(f.path);
              return pathDirnamePosix(p) === targetDir && (extOfPath(p) === 'dds' || extOfPath(p) === 'tex');
            });
            candidates = files.filter((f) => Number.isInteger(Number(f.chunkId)) && Number(f.chunkId) >= 0);
          }
        } catch (e) {
          if (cancelled) return;
          setError(e.message || 'Failed to load WAD metadata');
          setLoading(false);
          return;
        }
      }

      if (candidates.length === 0) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      const totalPreviewBytes = candidates.reduce((sum, file) => sum + (Number(file.decompressedSize) || 0), 0);
      if (!allowLargePreview && totalPreviewBytes > TEXTURE_PREVIEW_LIMIT_BYTES) {
        if (!cancelled) {
          setLargePreviewPrompt({
            count: candidates.length,
            totalSize: totalPreviewBytes,
          });
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const CONCURRENCY = 4;
      let idx = 0;

      const worker = async () => {
        while (!cancelled) {
          const i = idx++;
          if (i >= candidates.length) break;
          const file = candidates[i];
          const ext = String(file.extension || file.name?.split('.').pop() || '').toLowerCase();
          try {
            const chunkId = Number(file.chunkId);
            const res = await window.electronAPI?.wad?.readChunkData?.({ wadPath, chunkId });
            if (cancelled) return;
            if (!res || res.error) throw new Error(res?.error || 'Failed to read chunk');
            const url = await loadImageAsDataURL(base64ToArrayBuffer(String(res.dataBase64 || '')), ext);
            if (cancelled) return;
            setItems(prev => [...prev, { path: file.path, name: file.name, url }]);
          } catch (_) {
            // Ignore per-file preview failures
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (!cancelled) setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [selectedNode, hashPath, allowLargePreview]);

  if (!selectedNode || selectedNode.type !== 'dir') return null;

  return (
    <div style={{ ...S.rightPanel, flexDirection: 'column', padding: '18px 20px', gap: 8, overflowY: 'auto' }}>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
        Textures in {selectedNode.node?.name}
      </div>

      {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.7 }}>Loading textures…</div>}
      {largePreviewPrompt && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.9 }}>
            This folder will preview {largePreviewPrompt.count} textures ({fmtBytes(largePreviewPrompt.totalSize)}). Load them?
          </div>
          <div>
            <button
              type="button"
              onClick={() => setAllowLargePreview(true)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'var(--text)',
                borderRadius: 6,
                fontSize: 12,
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Load textures
            </button>
          </div>
        </div>
      )}
      {!loading && items.length === 0 && !error && !largePreviewPrompt && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.6 }}>No .dds/.tex files found in this folder.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {items.map((it) => (
          <div key={it.path} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.14)' }}>
            <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
              <img src={it.url} alt={it.name} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
            </div>
            <div title={it.path} style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileDetailPanel({ selectedNode, hashPath, wadData }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLarge, setPreviewLarge] = useState(null);
  const [previewForceKey, setPreviewForceKey] = useState('');
  const [manifest, setManifest] = useState(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState('');
  const [binContent, setBinContent] = useState(null);
  const [binLoading, setBinLoading] = useState(false);
  const [binError, setBinError] = useState('');

  // Ref so loadManifest reads current wadData without being in its deps
  const wadDataRef = useRef(null);
  useEffect(() => { wadDataRef.current = wadData; }, [wadData]);

  // Track the current model preview temp dir so we can clean it up
  const tempDirRef = useRef(null);
  const cleanupTempDir = useCallback(() => {
    const dir = tempDirRef.current;
    if (!dir) return;
    tempDirRef.current = null;
    try {
      const fs = window.require?.('fs');
      if (fs) fs.rm(dir, { recursive: true, force: true }, () => { });
    } catch (_) { }
  }, []);

  // Clean up temp dir on unmount
  useEffect(() => () => cleanupTempDir(), [cleanupTempDir]);

  useEffect(() => {
    setPreviewForceKey('');
  }, [selectedNode?.wadPath, selectedNode?.node?.chunkId]);

  // Texture preview for dds/tex files
  useEffect(() => {
    let cancelled = false;
    setPreviewUrl('');
    setPreviewError('');
    setPreviewLoading(false);
    setPreviewLarge(null);

    if (!selectedNode || selectedNode.type !== 'file') return () => { cancelled = true; };

    const { node, wadPath } = selectedNode;
    const ext = String(node.extension || node.name?.split('.').pop() || '').toLowerCase();
    const shouldPreview = ext === 'dds' || ext === 'tex';
    if (!shouldPreview) return () => { cancelled = true; };

    const chunkId = Number(node.chunkId);
    if (!Number.isInteger(chunkId) || chunkId < 0) {
      setPreviewError('Preview unavailable: open this WAD and select the file from loaded tree.');
      return () => { cancelled = true; };
    }

    const previewKey = `${wadPath}:${chunkId}`;
    const decompressedSize = Number(node.decompressedSize) || 0;
    if (decompressedSize > TEXTURE_PREVIEW_LIMIT_BYTES && previewForceKey !== previewKey) {
      setPreviewLarge({ size: decompressedSize, previewKey });
      return () => { cancelled = true; };
    }

    setPreviewLoading(true);
    window.electronAPI?.wad?.readChunkData?.({ wadPath, chunkId })
      ?.then(async (result) => {
        if (cancelled) return;
        if (!result || result.error) throw new Error(result?.error || 'Failed to read chunk');
        const b64 = String(result.dataBase64 || '');
        if (!b64) throw new Error('Empty chunk payload');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = await loadImageAsDataURL(bytes.buffer, ext);
        if (cancelled) return;
        setPreviewUrl(url);
      })
      ?.catch((e) => {
        if (cancelled) return;
        setPreviewError(e?.message || 'Failed to render preview');
      })
      ?.finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedNode, previewForceKey]);

  // Bin preview for .bin files
  useEffect(() => {
    let cancelled = false;
    setBinContent(null);
    setBinError('');
    setBinLoading(false);

    if (!selectedNode || selectedNode.type !== 'file') return () => { cancelled = true; };

    const { node, wadPath } = selectedNode;
    const ext = String(node.extension || node.name?.split('.').pop() || '').toLowerCase();
    if (ext !== 'bin') return () => { cancelled = true; };

    const chunkId = Number(node.chunkId);
    if (!Number.isInteger(chunkId) || chunkId < 0) {
      setBinError('Preview unavailable: open this WAD and select the file from the loaded tree.');
      return () => { cancelled = true; };
    }

    setBinLoading(true);
    window.electronAPI?.wad?.readBinAsText?.({ wadPath, chunkId })
      ?.then((result) => {
        if (cancelled) return;
        if (!result || result.error) throw new Error(result?.error || 'Conversion failed');
        setBinContent(result.text);
      })
      ?.catch((e) => {
        if (cancelled) return;
        setBinError(e?.message || 'Failed to convert bin');
      })
      ?.finally(() => {
        if (!cancelled) setBinLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedNode]);

  const node = selectedNode?.node || null;
  const wadPath = selectedNode?.wadPath || '';
  const nodeExt = String(node?.extension || node?.name?.split('.').pop() || '').toLowerCase();
  const canOpenModelInspect = selectedNode?.type === 'file' && (nodeExt === 'skn' || nodeExt === 'skl' || nodeExt === 'anm');

  const loadManifest = useCallback(async () => {
    if (!canOpenModelInspect || !node || !wadPath) return;
    setManifestLoading(true);
    setManifestError('');
    setManifest(null);

    try {
      // Use cached already-dehashed tree — no mountTree re-call needed
      let allFiles;
      const cachedData = wadDataRef.current?.get?.(wadPath);
      if (cachedData?.status === 'loaded' && Array.isArray(cachedData.tree)) {
        allFiles = flattenFiles(cachedData.tree, []);
      } else {
        const treeResult = await window.electronAPI?.wad?.mountTree?.({ wadPath, hashPath });
        if (!treeResult || treeResult.error || !Array.isArray(treeResult.tree)) {
          throw new Error(treeResult?.error || 'Failed to load WAD tree');
        }
        allFiles = flattenFiles(treeResult.tree, []);
      }

      const selectedPath = toPosixPath(node.path);
      const companions = pickCompanionFiles(allFiles, selectedPath);
      if (!companions.modelFile) throw new Error('No SKN model found near selected file');

      const skinRoot = deriveSkinRoot(selectedPath);
      const binFiles = allFiles.filter((f) =>
        extOfPath(f.path) === 'bin' && toPosixPath(f.path).startsWith(skinRoot + '/')
      );

      const toExtract = [
        ...(companions.sknFiles || []),
        ...(companions.sklFiles || []),
        ...(companions.anmFiles || []),
        ...(companions.texFiles || []),
        ...binFiles,
      ]
        .filter(Boolean)
        .filter((f, idx, arr) => arr.findIndex((x) => x.path === f.path) === idx);

      const fs = window.require?.('fs');
      const os = window.require?.('os');
      const path = window.require?.('path');
      if (!fs || !os || !path) throw new Error('Node fs/path unavailable');

      cleanupTempDir();
      const rootDir = path.join(os.tmpdir(), 'quartz-wad-preview', String(Date.now()));
      tempDirRef.current = rootDir;
      await fs.promises.mkdir(rootDir, { recursive: true });

      const writeExtracted = async (fileNode) => {
        const chunkId = Number(fileNode?.chunkId);
        if (!Number.isInteger(chunkId) || chunkId < 0) return null;
        const readResult = await window.electronAPI?.wad?.readChunkData?.({ wadPath, chunkId });
        if (!readResult || readResult.error || !readResult.dataBase64) return null;
        const relPath = toPosixPath(fileNode.path);
        const absPath = path.join(rootDir, ...relPath.split('/').filter(Boolean));
        await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
        await fs.promises.writeFile(absPath, Buffer.from(String(readResult.dataBase64), 'base64'));
        return relPath;
      };

      const written = new Set();
      for (const fileNode of toExtract) {
        const rel = await writeExtracted(fileNode);
        if (rel) written.add(rel);
      }

      const filesDir = rootDir;
      const { character, skinKey } = deriveCharacterAndSkin(toPosixPath(companions.modelFile.path));

      let materialTextureHints = companions.materialTextureHints || {};
      let defaultTextureBySkn = companions.defaultTextureBySkn || {};
      if (binFiles.length > 0 && window.electronAPI?.wad?.parseSknBins) {
        try {
          const binResult = await window.electronAPI.wad.parseSknBins({
            filesDir, skinKey: skinKey || 'base', characterFolder: character || '', hashPath,
          });
          if (binResult && !binResult.error) {
            materialTextureHints = { ...materialTextureHints, ...binResult.materialTextureHints };
            defaultTextureBySkn = { ...defaultTextureBySkn, ...binResult.defaultTextureBySkn };
          }
        } catch (_) { }
      }

      const sknRelPaths = (companions.sknFiles || []).map((f) => toPosixPath(f.path)).filter((p) => written.has(p));
      const sklRelPaths = (companions.sklFiles || []).map((f) => toPosixPath(f.path)).filter((p) => written.has(p));
      const anmRelPaths = (companions.anmFiles || []).map((f) => toPosixPath(f.path)).filter((p) => written.has(p));
      const texRelPaths = (companions.texFiles || []).map((f) => toPosixPath(f.path)).filter((p) => written.has(p));

      const materialHintsByFolder = character ? { [character]: materialTextureHints } : {};
      const defaultBySknByFolder = character ? { [character]: defaultTextureBySkn } : {};

      setManifest({
        championName: character || 'unknown',
        skinKey: skinKey || 'base',
        filesDir,
        cacheDir: filesDir,
        sknFiles: sknRelPaths,
        skeletonFiles: sklRelPaths,
        anmFiles: anmRelPaths,
        textureFiles: texRelPaths,
        materialTextureHints,
        defaultTextureBySkn,
        materialTextureHintsByCharacterFolder: materialHintsByFolder,
        defaultTextureBySknByCharacterFolder: defaultBySknByFolder,
        characterFolders: character ? [character] : [],
        defaultCharacterFolder: character || '',
        chromaOptions: [],
        selectedChromaId: null,
      });
    } catch (e) {
      setManifestError(e?.message || 'Failed to prepare model preview');
    } finally {
      setManifestLoading(false);
    }
  }, [canOpenModelInspect, cleanupTempDir, hashPath, node, wadPath]);

  useEffect(() => {
    if (!canOpenModelInspect) {
      setManifest(null);
      setManifestLoading(false);
      setManifestError('');
      return;
    }
    let cancelled = false;
    (async () => {
      await loadManifest();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [canOpenModelInspect, loadManifest, node?.path, wadPath]);

  if (!selectedNode) {
    return (
      <div style={{ ...S.rightPanel, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ opacity: 0.28, fontSize: 13, color: 'var(--text-2)' }}>Select a file to inspect</span>
      </div>
    );
  }

  if (selectedNode.type === 'dir') {
    return <FolderTextureGallery selectedNode={selectedNode} hashPath={hashPath} />;
  }

  // SKN / SKL / ANM: show full inline model inspect
  if (canOpenModelInspect) {
    return (
      <div style={{ ...S.rightPanel }}>
        <ModelInspectModal
          inline={true}
          open={true}
          loading={manifestLoading}
          error={manifestError}
          progressMessage={manifestLoading ? 'Extracting model assets...' : ''}
          manifest={manifest}
          onSelectChroma={() => { }}
          onClose={() => { }}
        />
      </div>
    );
  }

  // .bin files: Monaco bin viewer
  if (nodeExt === 'bin') {
    return (
      <div style={{ ...S.rightPanel, flexDirection: 'column', overflow: 'hidden' }}>
        <BinViewer
          content={binContent}
          loading={binLoading}
          error={binError}
          fileName={node?.name}
        />
      </div>
    );
  }

  // Other files: detail panel with optional texture preview
  const compLabel = COMP_LABELS[node.compressionType] ?? `t${node.compressionType}`;
  const compColor = COMP_COLORS[node.compressionType] ?? 'rgba(255,255,255,0.4)';
  const wadName = wadPath?.split(/[\\/]/).pop()?.replace(/\.wad\.client$/i, '') ?? '';

  return (
    <div style={{ ...S.rightPanel, flexDirection: 'column', padding: '22px 24px', gap: 4, overflowY: 'auto' }}>
      {(previewLoading || previewUrl || previewError || previewLarge) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.75, marginBottom: 6 }}>Preview</div>
          {previewLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.75 }}>Rendering texture…</div>
          ) : previewLarge ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.88 }}>
                This texture is {fmtBytes(previewLarge.size)}. Load it?
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setPreviewForceKey(previewLarge.previewKey)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'var(--text)',
                    borderRadius: 6,
                    fontSize: 12,
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Load anyway
                </button>
              </div>
            </div>
          ) : previewError ? (
            <div style={{ fontSize: 12, color: '#ef4444', opacity: 0.9 }}>{previewError}</div>
          ) : (
            <img
              src={previewUrl}
              alt={node.name}
              style={{
                maxWidth: '100%',
                maxHeight: 260,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                imageRendering: 'auto',
                display: 'block',
              }}
            />
          )}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12, wordBreak: 'break-all' }}>
        {node.name}
      </div>
      <DetailRow label="Path" value={node.path} mono />
      <DetailRow label="WAD" value={wadName} />
      <DetailRow label="Compression" value={compLabel} valueColor={compColor} />
      <DetailRow label="Compressed" value={fmtBytes(node.compressedSize)} />
      <DetailRow label="Decompressed" value={fmtBytes(node.decompressedSize)} />
    </div>
  );
}

function WadLandingPanel({ onOpenWad, onIndexGame, isDragOver, isLoading }) {
  return (
    <div
      style={{
        ...S.rightPanel,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 32,
        position: 'relative',
        outline: isDragOver ? '2px dashed var(--accent)' : '2px dashed transparent',
        outlineOffset: -8,
        borderRadius: 8,
        transition: 'outline-color 0.18s',
        background: isDragOver ? 'rgba(139,92,246,0.06)' : undefined,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', opacity: 0.7 }}>WAD Explorer</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', opacity: 0.45, textAlign: 'center', maxWidth: 260 }}>
          {isLoading ? 'Preparing hashes for fast extraction...' : 'Open a single WAD file or index your League of Legends game folder.'}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px' }}>
          <div style={S.spinner} />
          <span style={{ fontSize: 12, color: 'var(--accent)', opacity: 0.85 }}>Loading Hashes...</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: '20px 28px', cursor: 'pointer',
                color: 'var(--text)', transition: 'background 0.15s, border-color 0.15s',
              }}
              onClick={onOpenWad}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            >
              <FolderOpen size={26} style={{ color: 'var(--accent)', opacity: 0.85 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', opacity: 0.85 }}>Open WAD</span>
              <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.5, marginTop: -4 }}>.wad.client file</span>
            </button>

            <button
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: '20px 28px', cursor: 'pointer',
                color: 'var(--text)', transition: 'background 0.15s, border-color 0.15s',
              }}
              onClick={onIndexGame}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            >
              <Database size={26} style={{ color: '#10b981', opacity: 0.85 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', opacity: 0.85 }}>Index Game</span>
              <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: 0.5, marginTop: -4 }}>scan game folder</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Upload size={16} style={{ color: 'var(--text-2)', opacity: isDragOver ? 0.9 : 0.3, transition: 'opacity 0.18s' }} />
            <span style={{ fontSize: 11, color: 'var(--text-2)', opacity: isDragOver ? 0.7 : 0.28, transition: 'opacity 0.18s' }}>
              or drop a .wad.client here
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function WadExplorer() {
  const [gamePath, setGamePath] = useState('');
  const [hashPath, setHashPath] = useState('');
  const [indexHashReady, setIndexHashReady] = useState(false);
  const [warmHashCache, setWarmHashCache] = useState(false);
  const [isPrimeLoading, setIsPrimeLoading] = useState(false);
  const [isWarmLoading, setIsWarmLoading] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState({ open: false, title: '', message: '', detail: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [treeRowHeight, setTreeRowHeight] = useState(24);
  const [treeFontSize, setTreeFontSize] = useState(12);
  const [treePanelWidth, setTreePanelWidth] = useState(320);
  const [treeSymbolSize, setTreeSymbolSize] = useState(12);
  const [isDragOver, setIsDragOver] = useState(false);
  const [wadContextMenu, setWadContextMenu] = useState({ open: false, x: 0, y: 0, entry: null });
  const pendingExtractRef = useRef(null);
  const skipDevCleanupOnceRef = useRef(process.env.NODE_ENV === 'development');
  const isHashPreloading = isPrimeLoading || isWarmLoading;

  const {
    scanLoading, scanError, total, scan, loadSingleWad,
    toggleGroup, toggleWad, reloadWad, toggleDir,
    selectedNode, setSelectedNode,
    search, setSearch,
    flatRows,
    indexingProgress,
    wadData,
    extractSelectedItems,
    extractSelectedCount,
    clearExtractSelection,
    getExtractSelectionState,
    toggleExtractSelection,
  } = useWadExplorer({ hashPath, indexReady: indexHashReady });
  const [extractBusy, setExtractBusy] = useState(false);

  // ── Load saved settings on mount ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await electronPrefs.initPromise;
      const savedGame = electronPrefs.obj.WadExplorerGamePath || '';
      const savedWarm = electronPrefs.obj.WadExplorerWarmHashCache !== false;
      const savedRowHeight = Number(electronPrefs.obj.WadExplorerRowHeight || 24);
      const savedFontSize = Number(electronPrefs.obj.WadExplorerFontSize || 12);
      const savedPanelWidth = Number(electronPrefs.obj.WadExplorerPanelWidth || 320);
      const savedSymbolSize = Number(electronPrefs.obj.WadExplorerSymbolSize || 12);
      const savedHashUncacheTime = Number(electronPrefs.obj.WadExplorerHashUncacheTime);
      const resolvedHash = await getHashDirectory();
      const resolved = savedGame
        || deriveGamePath(electronPrefs.obj.FrogChangerLeaguePath || '')
        || detectGamePath();

      setGamePath(resolved);
      setHashPath(resolvedHash);
      setIndexHashReady(!resolvedHash);
      setWarmHashCache(savedWarm);
      setTreeRowHeight(Number.isFinite(savedRowHeight) ? Math.max(20, Math.min(34, savedRowHeight)) : 24);
      setTreeFontSize(Number.isFinite(savedFontSize) ? Math.max(11, Math.min(15, savedFontSize)) : 12);
      setTreePanelWidth(Number.isFinite(savedPanelWidth) ? Math.max(300, Math.min(540, savedPanelWidth)) : 320);
      setTreeSymbolSize(Number.isFinite(savedSymbolSize) ? Math.max(10, Math.min(18, savedSymbolSize)) : 12);
      setSettingsLoaded(true);
    })();
  }, []);

  // ── Mark hash ready immediately — primeWad is called lazily on user action ──
  useEffect(() => {
    if (!settingsLoaded) return;
    setIndexHashReady(true);
  }, [settingsLoaded]);

  // ── Warm hash cache ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded || !warmHashCache) return;
    if (!hashPath) return;
    let cancelled = false;
    const onWarmProgress = () => {
      if (cancelled) return;
    };
    setIsWarmLoading(true);
    window.electronAPI?.hashtable?.setKeepAlive?.(true).catch(() => { });
    window.electronAPI?.hashtable?.onWarmProgress?.(onWarmProgress);
    window.electronAPI?.hashtable?.warmCache?.(hashPath)
      ?.catch(e => console.warn('[WadExplorer] Hash warm failed:', e?.message))
      ?.finally(() => {
        window.electronAPI?.hashtable?.offWarmProgress?.(onWarmProgress);
        if (!cancelled) setIsWarmLoading(false);
      });
    return () => {
      cancelled = true;
      window.electronAPI?.hashtable?.offWarmProgress?.(onWarmProgress);
    };
  }, [settingsLoaded, warmHashCache, hashPath]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (!warmHashCache) window.electronAPI?.hashtable?.setKeepAlive?.(false).catch(() => { });
  }, [settingsLoaded, warmHashCache]);

  useEffect(() => {
    return () => {
      // React StrictMode in dev mounts/unmounts once to detect side effects.
      // Skip that first synthetic cleanup so cache/indexing state is not reset.
      if (skipDevCleanupOnceRef.current) {
        skipDevCleanupOnceRef.current = false;
        return;
      }
      window.electronAPI?.hashtable?.setKeepAlive?.(false).catch(() => { });
      window.electronAPI?.hashtable?.clearCache?.();
    };
  }, []);




  const indexingActive = Boolean(indexingProgress?.active);
  // ── Actions ───────────────────────────────────────────────────────────────
  const pickGamePath = useCallback(async () => {
    const result = await openDirectoryDialog();
    if (!result) return;
    setGamePath(result);
    electronPrefs.obj.WadExplorerGamePath = result;
    electronPrefs.save();
    scan(result);
  }, [scan]);

  const handleRescan = useCallback(() => {
    if (gamePath) scan(gamePath);
  }, [gamePath, scan]);

  const handleIndexGame = useCallback(async () => {
    if (hashPath) {
      setIsPrimeLoading(true);
      await window.electronAPI?.hashtable?.primeWad?.(hashPath)?.catch(() => { });
      setIsPrimeLoading(false);
    }
    if (gamePath) {
      scan(gamePath);
    } else {
      await pickGamePath();
    }
  }, [gamePath, scan, pickGamePath, hashPath]);

  const handleWarmToggle = useCallback(() => {
    const next = !warmHashCache;
    setWarmHashCache(next);
    electronPrefs.obj.WadExplorerWarmHashCache = next;
    electronPrefs.save();
  }, [warmHashCache]);

  const handleOpenSingleWad = useCallback(async () => {
    const nodePath = window.require?.('path');
    const defaultDir = gamePath && nodePath
      ? nodePath.join(gamePath, 'DATA', 'FINAL')
      : (gamePath || undefined);
    const filePath = await openWadFileDialog(defaultDir);
    if (!filePath) return;
    if (hashPath) {
      setIsPrimeLoading(true);
      await window.electronAPI?.hashtable?.primeWad?.(hashPath)?.catch(() => { });
      setIsPrimeLoading(false);
    }
    loadSingleWad(filePath);
  }, [loadSingleWad, hashPath, gamePath]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const hasWad = [...(e.dataTransfer.items || [])].some(item =>
      item.kind === 'file' && (item.type === '' || item.getAsFile()?.name?.toLowerCase().endsWith('.wad.client'))
    );
    if (hasWad || e.dataTransfer.items?.length > 0) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = [...(e.dataTransfer.files || [])];
    const wadFile = files.find(f => f.name.toLowerCase().endsWith('.wad.client'));
    if (!wadFile?.path) return;
    console.log('[drop] wadFile.path:', wadFile.path, 'hashPath:', hashPath);
    if (hashPath) {
      setIsPrimeLoading(true);
      const primeResult = await window.electronAPI?.hashtable?.primeWad?.(hashPath)?.catch(e => ({ error: e.message }));
      console.log('[drop] primeWad result:', primeResult);
      setIsPrimeLoading(false);
    } else {
      console.warn('[drop] no hashPath — skipping prime + extractHashes');
    }
    loadSingleWad(wadFile.path);
  }, [loadSingleWad, hashPath]);

  const handleGamePathBlur = useCallback((e) => {
    const val = e.target.value.trim();
    if (val) {
      electronPrefs.obj.WadExplorerGamePath = val;
      electronPrefs.save();
    }
  }, []);

  const handleGamePathKey = useCallback((e) => {
    if (e.key === 'Enter' && gamePath) scan(gamePath);
  }, [gamePath, scan]);

  const handleWadContextMenu = useCallback((e, entry) => {
    setWadContextMenu({ open: true, x: e.clientX, y: e.clientY, entry });
  }, []);

  const closeWadContextMenu = useCallback(() => {
    setWadContextMenu({ open: false, x: 0, y: 0, entry: null });
  }, []);

  const handleExtractHashes = useCallback(async () => {
    const entry = wadContextMenu.entry;
    closeWadContextMenu();
    if (!entry || !hashPath) return;

    setIsPrimeLoading(true);
    await window.electronAPI?.hashtable?.primeWad?.(hashPath)?.catch(() => { });
    setIsPrimeLoading(false);

    try {
      const result = await window.electronAPI?.wad?.extractHashes?.({
        wadPath: entry.path,
        hashDir: hashPath
      });
      if (result?.error) throw new Error(result.error);

      // Reload WAD to see resolved names
      reloadWad(entry.path);
      toggleWad(entry, { forceLoad: true, forceMount: true });
    } catch (err) {
      setNoticeDialog({
        open: true,
        title: 'Extract Hashes Failed',
        message: err.message || 'Unknown error',
        detail: '',
      });
    }
  }, [wadContextMenu, hashPath, reloadWad, toggleWad]);

  const handleReloadWad = useCallback(() => {
    const entry = wadContextMenu.entry;
    closeWadContextMenu();
    if (!entry) return;
    reloadWad(entry.path);
    toggleWad(entry, { forceLoad: true, forceMount: true });
  }, [wadContextMenu, reloadWad, toggleWad]);

  const handleTreeRowHeightChange = useCallback((v) => {
    setTreeRowHeight(v);
    electronPrefs.obj.WadExplorerRowHeight = v;
    electronPrefs.save();
  }, []);

  const handleTreeFontSizeChange = useCallback((v) => {
    setTreeFontSize(v);
    electronPrefs.obj.WadExplorerFontSize = v;
    electronPrefs.save();
  }, []);

  const handleTreePanelWidthChange = useCallback((v) => {
    setTreePanelWidth(v);
    electronPrefs.obj.WadExplorerPanelWidth = v;
    electronPrefs.save();
  }, []);

  const handleTreeSymbolSizeChange = useCallback((v) => {
    setTreeSymbolSize(v);
    electronPrefs.obj.WadExplorerSymbolSize = v;
    electronPrefs.save();
  }, []);

  const handleExtractSelected = useCallback(async () => {
    if (extractBusy || extractSelectedCount === 0) return;
    const outputDir = await openDirectoryDialog();
    if (!outputDir) return;
    const fs = window.require?.('fs');
    let hasExisting = false;
    try {
      const entries = fs?.readdirSync(outputDir);
      hasExisting = Array.isArray(entries) && entries.length > 0;
    } catch (_) { }

    if (hasExisting) {
      pendingExtractRef.current = { outputDir };
      setReplaceConfirmOpen(true);
      return;
    }

    const runExtract = async (replaceExisting) => {
      setExtractBusy(true);
      try {
        const result = await window.electronAPI?.wad?.extractSelected?.({
          items: extractSelectedItems,
          outputDir,
          replaceExisting,
        });
        if (result?.error) {
          setNoticeDialog({
            open: true,
            title: 'Extract Selected Failed',
            message: result.error,
            detail: '',
          });
          return;
        }
        const extracted = Number(result?.extractedCount || 0);
        const skipped = Number(result?.skippedCount || 0);
        clearExtractSelection();
        setNoticeDialog({
          open: true,
          title: 'Extract Selected Complete',
          message: `Extracted ${extracted} file(s).`,
          detail: skipped > 0 ? `Skipped ${skipped} file(s).` : '',
        });
      } catch (e) {
        setNoticeDialog({
          open: true,
          title: 'Extract Selected Failed',
          message: e?.message || 'Unknown error',
          detail: '',
        });
      } finally {
        setExtractBusy(false);
      }
    };

    await runExtract(true);
  }, [clearExtractSelection, extractBusy, extractSelectedCount, extractSelectedItems]);

  const runPendingExtract = useCallback(async (replaceExisting) => {
    const pending = pendingExtractRef.current;
    pendingExtractRef.current = null;
    setReplaceConfirmOpen(false);
    if (!pending) return;
    setExtractBusy(true);
    try {
      const result = await window.electronAPI?.wad?.extractSelected?.({
        items: extractSelectedItems,
        outputDir: pending.outputDir,
        replaceExisting,
      });
      if (result?.error) {
        setNoticeDialog({
          open: true,
          title: 'Extract Selected Failed',
          message: result.error,
          detail: '',
        });
        return;
      }
      const extracted = Number(result?.extractedCount || 0);
      const skipped = Number(result?.skippedCount || 0);
      clearExtractSelection();
      setNoticeDialog({
        open: true,
        title: 'Extract Selected Complete',
        message: `Extracted ${extracted} file(s).`,
        detail: skipped > 0 ? `Skipped ${skipped} file(s).` : '',
      });
    } catch (e) {
      setNoticeDialog({
        open: true,
        title: 'Extract Selected Failed',
        message: e?.message || 'Unknown error',
        detail: '',
      });
    } finally {
      setExtractBusy(false);
    }
  }, [clearExtractSelection, extractSelectedItems]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ ...S.container, position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top bar */}
      <div style={{ ...S.topBar }}>
        <span style={S.topBarLabel}>Game</span>
        <input
          style={S.pathInput}
          value={gamePath}
          onChange={e => setGamePath(e.target.value)}
          onBlur={handleGamePathBlur}
          onKeyDown={handleGamePathKey}
          placeholder="C:\Riot Games\League of Legends\Game"
          spellCheck={false}
        />
        <button style={S.iconBtn} onClick={pickGamePath} title="Browse Game folder">
          <FolderOpen size={13} />
        </button>
        <button
          style={S.iconBtn}
          onClick={handleRescan}
          title="Rescan"
          disabled={!gamePath || scanLoading}
        >
          <RefreshCw size={13} style={scanLoading ? { animation: 'spin 0.7s linear infinite' } : {}} />
        </button>

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 6px', flexShrink: 0 }} />

        <button
          style={{ ...S.iconBtn, gap: 5, color: warmHashCache ? 'var(--accent)' : 'var(--text-2)', borderColor: warmHashCache ? 'var(--accent)' : 'rgba(255,255,255,0.10)' }}
          onClick={handleWarmToggle}
          title={warmHashCache ? 'Hash cache: ON (click to disable)' : 'Hash cache: OFF (click to enable)'}
        >
          {warmHashCache ? <Zap size={13} /> : <ZapOff size={13} />}
          <span style={{ fontSize: 11 }}>
            {isHashPreloading ? 'Loading hashes...' : (warmHashCache ? 'Hashes loaded' : 'Hashes')}
          </span>
        </button>

        <button
          style={{
            ...S.iconBtn,
            gap: 5,
            color: extractSelectedCount > 0 ? 'var(--accent)' : 'var(--text-2)',
            borderColor: extractSelectedCount > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.10)',
            opacity: extractBusy ? 0.7 : 1,
          }}
          onClick={handleExtractSelected}
          title={extractSelectedCount > 0 ? `Extract ${extractSelectedCount} selected file(s)` : 'Select files/folders in tree first'}
          disabled={extractBusy || extractSelectedCount === 0}
        >
          <Download size={13} />
          <span style={{ fontSize: 11 }}>{extractBusy ? 'Extracting...' : `Extract Selected${extractSelectedCount > 0 ? ` (${extractSelectedCount})` : ''}`}</span>
        </button>

        <button
          style={{ ...S.iconBtn, gap: 5 }}
          onClick={() => setSettingsOpen(true)}
          title="WAD Explorer Settings"
        >
          <Settings size={13} />
          <span style={{ fontSize: 11 }}>Settings</span>
        </button>



      </div>

      {/* Body */}
      <div style={{ ...S.body }}>
        {/* Left: unified WAD + file tree */}
        {scanError ? (
          <div style={{ ...S.leftPanel, alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <span style={{ color: '#ef4444', fontSize: 12, textAlign: 'center' }}>{scanError}</span>
          </div>
        ) : (
          <WadExplorerTree
            flatRows={flatRows}
            search={search}
            setSearch={setSearch}
            toggleGroup={toggleGroup}
            toggleWad={toggleWad}
            toggleDir={toggleDir}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            loading={scanLoading}
            getExtractSelectionState={getExtractSelectionState}
            toggleExtractSelection={toggleExtractSelection}
            onWadContextMenu={handleWadContextMenu}
            rowHeight={treeRowHeight}
            fontSize={treeFontSize}
            panelWidth={treePanelWidth}
            symbolSize={treeSymbolSize}
            selectionMode={selectionMode}
            onToggleSelectionMode={() => setSelectionMode(v => !v)}
          />
        )}

        {/* Right: landing or file detail */}
        {total === 0 && !scanLoading && !scanError ? (
          <WadLandingPanel
            onOpenWad={handleOpenSingleWad}
            onIndexGame={handleIndexGame}
            isDragOver={isDragOver}
            isLoading={isHashPreloading}
          />
        ) : (
          <>
            <FileDetailPanel selectedNode={selectedNode} hashPath={hashPath} wadData={wadData} />
            {isDragOver && (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 100,
                background: 'rgba(120, 80, 255, 0.12)',
                backdropFilter: 'blur(4px)',
                border: '2px dashed var(--accent)',
                borderRadius: 8,
                margin: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'var(--surface)',
                  padding: '16px 24px',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  color: 'var(--text)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <Upload size={20} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600 }}>Drop to open WAD</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>


      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes wadIntroPulse {
          0% { transform: scale(0.985); opacity: 0.85; }
          50% { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(0.985); opacity: 0.85; }
        }
      `}</style>

      <WadExplorerDialog
        open={replaceConfirmOpen}
        onClose={() => { setReplaceConfirmOpen(false); pendingExtractRef.current = null; }}
        title="Replace Existing Files?"
        message="The output folder already contains files."
        detail="Do you want to replace files with the same path?"
        actions={[
          {
            id: 'no',
            label: 'No, Keep Existing',
            onClick: () => runPendingExtract(false),
            primary: false,
          },
          {
            id: 'yes',
            label: 'Yes, Replace',
            onClick: () => runPendingExtract(true),
            primary: true,
          },
        ]}
      />

      <WadExplorerDialog
        open={noticeDialog.open}
        onClose={() => setNoticeDialog({ open: false, title: '', message: '', detail: '' })}
        title={noticeDialog.title}
        message={noticeDialog.message}
        detail={noticeDialog.detail}
        actions={[
          {
            id: 'ok',
            label: 'OK',
            onClick: () => setNoticeDialog({ open: false, title: '', message: '', detail: '' }),
            primary: true,
          },
        ]}
      />

      <WadExplorerSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        rowHeight={treeRowHeight}
        fontSize={treeFontSize}
        panelWidth={treePanelWidth}
        symbolSize={treeSymbolSize}
        onRowHeightChange={handleTreeRowHeightChange}
        onFontSizeChange={handleTreeFontSizeChange}
        onPanelWidthChange={handleTreePanelWidthChange}
        onSymbolSizeChange={handleTreeSymbolSizeChange}
      />
      {/* Wad Context Menu */}
      {wadContextMenu.open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
          onClick={closeWadContextMenu}
          onContextMenu={e => { e.preventDefault(); closeWadContextMenu(); }}
        >
          <div style={{
            position: 'absolute',
            left: wadContextMenu.x,
            top: wadContextMenu.y,
            background: 'rgba(25, 25, 35, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px)',
            padding: '5px 0',
            minWidth: 160,
            overflow: 'hidden',
          }}>
            <div
              style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-3)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
              title={wadContextMenu.entry?.name}
            >
              {wadContextMenu.entry?.name}
            </div>
            <button
              style={{ ...S.contextMenuItem, color: 'var(--accent)' }}
              onClick={handleExtractHashes}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Zap size={14} />
              <span>Extract Hashes</span>
            </button>
            <button
              style={S.contextMenuItem}
              onClick={handleReloadWad}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              <RefreshCw size={14} />
              <span>Reload WAD</span>
            </button>
            <div style={{ margin: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
            <div
              style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', opacity: 0.5 }}
            >
              <File size={14} />
              <span>Copy Path</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
