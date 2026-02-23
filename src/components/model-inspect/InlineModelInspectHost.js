import React, { useEffect, useState } from 'react';
import ModelInspectModal from './ModelInspectModal.js';

export const OPEN_INLINE_MODEL_INSPECT_EVENT = 'open-inline-model-inspect';

function getPathModule() {
  if (typeof window !== 'undefined' && window.require) {
    return window.require('path');
  }
  return null;
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function detectFilesRoot(absPath) {
  const normalized = normalizeSlashes(absPath);
  const assetsIndex = normalized.toLowerCase().indexOf('/assets/');
  const dataIndex = normalized.toLowerCase().indexOf('/data/');
  const cut = assetsIndex >= 0 ? assetsIndex : dataIndex;
  if (cut > 0) return absPath.slice(0, cut);
  const path = getPathModule();
  return path ? path.dirname(absPath) : '';
}

function toRelativePath(filesRoot, absPath) {
  if (!absPath) return '';
  const path = getPathModule();
  if (!path) return absPath;
  const normRoot = normalizeSlashes(filesRoot).toLowerCase();
  const normAbs = normalizeSlashes(absPath);
  if (normRoot && normAbs.toLowerCase().startsWith(`${normRoot}/`)) {
    return normAbs.slice(normRoot.length + 1);
  }
  return absPath;
}

function toSkinKey(relModelPath) {
  const normalized = normalizeSlashes(relModelPath).toLowerCase();
  const match = normalized.match(/\/skins\/([^/]+)\//i);
  return match?.[1] || 'custom';
}

function toCharacterFolder(relModelPath) {
  const normalized = normalizeSlashes(relModelPath).toLowerCase();
  const match = normalized.match(/\/characters\/([^/]+)\//i);
  return match?.[1] || '';
}

function buildManifestFromPayload(payload) {
  const modelPath = String(payload?.modelPath || payload?.path || '');
  const skeletonPath = String(payload?.skeletonPath || '');
  const animationPath = String(payload?.animationPath || '');
  const texturePath = String(payload?.texturePath || '');
  if (!modelPath) {
    throw new Error('Missing model path');
  }

  const filesRoot = detectFilesRoot(modelPath);
  const relModel = toRelativePath(filesRoot, modelPath);
  const relAnim = animationPath ? toRelativePath(filesRoot, animationPath) : '';
  const relTexture = texturePath ? toRelativePath(filesRoot, texturePath) : '';
  const characterFolder = toCharacterFolder(relModel);
  const skinKey = toSkinKey(relModel);

  const materialHints = relTexture ? { __default__: relTexture } : {};
  const defaultTextureBySkn = relTexture ? { [normalizeSlashes(relModel).toLowerCase()]: relTexture } : {};
  const materialTextureHintsByCharacterFolder = characterFolder ? { [characterFolder]: materialHints } : {};
  const defaultTextureBySknByCharacterFolder = characterFolder ? { [characterFolder]: defaultTextureBySkn } : {};

  return {
    championName: characterFolder || 'inline',
    skinKey,
    filesDir: filesRoot,
    cacheDir: filesRoot,
    sknFiles: [relModel],
    anmFiles: relAnim ? [relAnim] : [],
    textureFiles: relTexture ? [relTexture] : [],
    materialTextureHints: materialHints,
    defaultTextureBySkn,
    materialTextureHintsByCharacterFolder,
    defaultTextureBySknByCharacterFolder,
    characterFolders: characterFolder ? [characterFolder] : [],
    defaultCharacterFolder: characterFolder || '',
    chromaOptions: [],
    selectedChromaId: null,
    skeletonFiles: skeletonPath ? [toRelativePath(filesRoot, skeletonPath)] : [],
  };
}

export default function InlineModelInspectHost() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    const onOpen = (event) => {
      setError('');
      setLoading(true);
      setProgressMessage('Preparing model inspect...');
      try {
        const nextManifest = buildManifestFromPayload(event?.detail || {});
        setManifest(nextManifest);
        setOpen(true);
      } catch (e) {
        setError(e?.message || 'Failed to prepare inline model inspect');
        setOpen(true);
      } finally {
        setLoading(false);
        setProgressMessage('');
      }
    };

    window.addEventListener(OPEN_INLINE_MODEL_INSPECT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INLINE_MODEL_INSPECT_EVENT, onOpen);
  }, []);

  return (
    <ModelInspectModal
      open={open}
      loading={loading}
      error={error}
      progressMessage={progressMessage}
      manifest={manifest}
      onSelectChroma={() => {}}
      onClose={() => {
        setOpen(false);
        setLoading(false);
        setError('');
        setProgressMessage('');
        setManifest(null);
      }}
    />
  );
}
