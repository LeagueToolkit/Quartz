import React, { useEffect, useState } from 'react';
import ModelInspectModal from './ModelInspectModal.js';

export const OPEN_INLINE_MODEL_INSPECT_EVENT = 'open-inline-model-inspect';

function getPathModule() {
  if (typeof window !== 'undefined' && window.require) {
    return window.require('path');
  }
  return null;
}

function getFsModule() {
  if (typeof window !== 'undefined' && window.require) {
    return window.require('fs');
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

function collectFilesRecursive(rootDir, path, fs) {
  const out = [];
  const wantedExt = new Set(['.skn', '.tex', '.dds', '.png', '.jpg', '.jpeg', '.tga', '.bmp', '.webp', '.bin']);
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        const ext = String(path.extname(entry.name || '') || '').toLowerCase();
        if (wantedExt.has(ext)) out.push(abs);
      }
    }
  }
  return out;
}

function skinKeyFromBinName(binName) {
  const base = String(binName || '').toLowerCase();
  if (base === 'base.bin') return 'base';
  const m = base.match(/^skin(\d+)\.bin$/i);
  if (!m) return '';
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return '';
  return `skin${n}`;
}

function formatSkinLabel(binName) {
  const low = String(binName || '').toLowerCase();
  if (low === 'base.bin') return 'base.bin (Skin 0)';
  const m = low.match(/^skin(\d+)\.bin$/i);
  if (!m) return binName;
  return `${low} (Skin ${Number(m[1])})`;
}

function collectSkinBinChoices({ allAbs, filesRoot, characterFolder }) {
  const bins = new Map();
  for (const abs of allAbs || []) {
    const rel = normalizeSlashes(toRelativePath(filesRoot, abs)).toLowerCase();
    const re = new RegExp(`^(?:assets|data)/characters/${String(characterFolder || '').toLowerCase()}/skins/([^/]+\\.bin)$`);
    const m = rel.match(re);
    if (!m) continue;
    const binName = String(m[1] || '').toLowerCase();
    if (binName === 'root.bin') continue;
    const skinKey = skinKeyFromBinName(binName);
    if (!skinKey) continue;
    bins.set(binName, {
      binName,
      skinKey,
      label: formatSkinLabel(binName),
    });
  }

  return Array.from(bins.values()).sort((a, b) => {
    const aNum = a.skinKey === 'base' ? 0 : Number(String(a.skinKey).replace(/^skin/i, ''));
    const bNum = b.skinKey === 'base' ? 0 : Number(String(b.skinKey).replace(/^skin/i, ''));
    return aNum - bNum;
  });
}

function buildManifestFromPayload(payload) {
  const modelPath = String(payload?.modelPath || payload?.path || '');
  const skeletonPath = String(payload?.skeletonPath || '');
  const animationPath = String(payload?.animationPath || '');
  const texturePath = String(payload?.texturePath || '');
  const payloadSknFiles = Array.isArray(payload?.sknFiles) ? payload.sknFiles : [];
  const payloadAnmFiles = Array.isArray(payload?.anmFiles) ? payload.anmFiles : [];
  const payloadTextureFiles = Array.isArray(payload?.textureFiles) ? payload.textureFiles : [];
  const payloadSkeletonFiles = Array.isArray(payload?.skeletonFiles) ? payload.skeletonFiles : [];
  const payloadMaterialHints = payload?.materialTextureHints && typeof payload.materialTextureHints === 'object'
    ? payload.materialTextureHints
    : null;
  const payloadDefaultBySkn = payload?.defaultTextureBySkn && typeof payload.defaultTextureBySkn === 'object'
    ? payload.defaultTextureBySkn
    : null;
  if (!modelPath) {
    throw new Error('Missing model path');
  }

  const filesRoot = detectFilesRoot(modelPath);
  const relModel = toRelativePath(filesRoot, modelPath);
  const relAnim = animationPath ? toRelativePath(filesRoot, animationPath) : '';
  const relTexture = texturePath ? toRelativePath(filesRoot, texturePath) : '';
  const characterFolder = toCharacterFolder(relModel);
  const skinKey = toSkinKey(relModel);

  const relSknFiles = payloadSknFiles
    .map((v) => toRelativePath(filesRoot, String(v || '')))
    .filter(Boolean);
  if (!relSknFiles.includes(relModel)) relSknFiles.unshift(relModel);

  const relAnmFiles = payloadAnmFiles
    .map((v) => toRelativePath(filesRoot, String(v || '')))
    .filter(Boolean);
  if (relAnim && !relAnmFiles.includes(relAnim)) relAnmFiles.unshift(relAnim);

  const relTextureFiles = payloadTextureFiles
    .map((v) => toRelativePath(filesRoot, String(v || '')))
    .filter(Boolean);
  if (relTexture && !relTextureFiles.includes(relTexture)) relTextureFiles.unshift(relTexture);

  const relSkeletonFiles = payloadSkeletonFiles
    .map((v) => toRelativePath(filesRoot, String(v || '')))
    .filter(Boolean);
  if (skeletonPath) {
    const relSkl = toRelativePath(filesRoot, skeletonPath);
    if (relSkl && !relSkeletonFiles.includes(relSkl)) relSkeletonFiles.unshift(relSkl);
  }

  const materialHints = payloadMaterialHints || (relTexture ? { __default__: relTexture } : {});
  const defaultTextureBySkn = payloadDefaultBySkn || (relTexture ? { [normalizeSlashes(relModel).toLowerCase()]: relTexture } : {});
  const materialTextureHintsByCharacterFolder = characterFolder ? { [characterFolder]: materialHints } : {};
  const defaultTextureBySknByCharacterFolder = characterFolder ? { [characterFolder]: defaultTextureBySkn } : {};

  return {
    championName: characterFolder || 'inline',
    skinKey,
    filesDir: filesRoot,
    cacheDir: filesRoot,
    sknFiles: relSknFiles,
    anmFiles: relAnmFiles,
    textureFiles: relTextureFiles,
    materialTextureHints: materialHints,
    defaultTextureBySkn,
    materialTextureHintsByCharacterFolder,
    defaultTextureBySknByCharacterFolder,
    characterFolders: characterFolder ? [characterFolder] : [],
    defaultCharacterFolder: characterFolder || '',
    chromaOptions: [],
    selectedChromaId: null,
    skeletonFiles: relSkeletonFiles,
  };
}

function CustomDropdown({ value, options, onChange, placeholder = '(None)', style }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = () => setOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div style={{ position: 'relative', ...style }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--accent2), transparent 45%)' : 'rgba(255,255,255,0.1)'}`,
          color: 'var(--text)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: '0.74rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: open ? '0 0 14px color-mix(in srgb, var(--accent2), transparent 75%)' : 'none',
          transition: 'all 0.18s ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
          {selectedLabel}
        </span>
        <span style={{ opacity: 0.8 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 30,
            background: 'rgba(20,18,30,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            maxHeight: 220,
            overflow: 'auto',
            boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value || '__none__'}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: active ? 'color-mix(in srgb, var(--accent2), transparent 82%)' : 'transparent',
                  color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.88)',
                  padding: '8px 10px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TextureLookupChoiceModal({
  open,
  autoSkinKey,
  binChoices,
  selectedBinName,
  setSelectedBinName,
  onAuto,
  onUseSelected,
  onSkip,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(720px, 96vw)',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 14,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        }}
      >
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))' }} />
        <div style={{ padding: 16 }}>
          <h3 style={{ margin: 0, marginBottom: 8, fontSize: '0.95rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Texture Lookup Source
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.78)', marginBottom: 14 }}>
            Choose which BIN should be used for material to texture lookup before opening Model Inspect.
          </div>

          <div style={{
            padding: 10,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 12,
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.85)',
          }}>
            Auto detect target: <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>{String(autoSkinKey || 'unknown')}</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent2)', marginBottom: 6 }}>
              Manual BIN selection
            </div>
            <CustomDropdown
              value={selectedBinName}
              onChange={setSelectedBinName}
              options={(binChoices || []).map((choice) => ({
                value: choice.binName,
                label: choice.label,
              }))}
              placeholder="No skin bins found"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={onAuto}
              style={{
                border: '1px solid color-mix(in srgb, var(--accent2), transparent 40%)',
                background: 'color-mix(in srgb, var(--accent2), transparent 80%)',
                color: 'var(--accent2)',
                padding: '7px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.78rem',
              }}
            >
              Auto Detect
            </button>
            <button
              onClick={onUseSelected}
              disabled={!selectedBinName}
              style={{
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: selectedBinName ? 'var(--text)' : 'rgba(255,255,255,0.45)',
                padding: '7px 12px',
                borderRadius: 7,
                cursor: selectedBinName ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontSize: '0.78rem',
              }}
            >
              Use Selected BIN
            </button>
            <button
              onClick={onSkip}
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.03)',
                color: 'rgba(255,255,255,0.85)',
                padding: '7px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.78rem',
              }}
            >
              Skip Textures
            </button>
            <button
              onClick={onCancel}
              style={{
                marginLeft: 'auto',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.7)',
                padding: '7px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.78rem',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InlineModelInspectHost() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [manifest, setManifest] = useState(null);

  const [choiceModalOpen, setChoiceModalOpen] = useState(false);
  const [choiceBaseManifest, setChoiceBaseManifest] = useState(null);
  const [choiceCharacterFolder, setChoiceCharacterFolder] = useState('');
  const [choiceAutoSkinKey, setChoiceAutoSkinKey] = useState('base');
  const [choiceBins, setChoiceBins] = useState([]);
  const [choiceSelectedBinName, setChoiceSelectedBinName] = useState('');

  const applyTextureMode = async ({ mode, selectedBinName = '' }) => {
    const nextManifest = choiceBaseManifest ? { ...choiceBaseManifest } : null;
    if (!nextManifest) return;

    setChoiceModalOpen(false);
    setLoading(true);
    setProgressMessage('Preparing model inspect...');

    try {
      if (mode !== 'skip') {
        const manualChoice = (choiceBins || []).find((b) => b.binName === selectedBinName);
        const skinKey = mode === 'manual'
          ? (manualChoice?.skinKey || choiceAutoSkinKey)
          : choiceAutoSkinKey;

        const binHints = await window.electronAPI?.wad?.parseSknBins?.({
          filesDir: nextManifest.filesDir,
          skinKey,
          characterFolder: choiceCharacterFolder,
          exactBinName: mode === 'manual' ? selectedBinName : '',
        });
        if (binHints && !binHints.error) {
          nextManifest.materialTextureHints = {
            ...(nextManifest.materialTextureHints || {}),
            ...(binHints.materialTextureHints || {}),
          };
          nextManifest.defaultTextureBySkn = {
            ...(nextManifest.defaultTextureBySkn || {}),
            ...(binHints.defaultTextureBySkn || {}),
          };
          // Keep per-character maps in sync, because ModelInspectModal prefers them
          // when a character folder is selected.
          if (choiceCharacterFolder) {
            nextManifest.materialTextureHintsByCharacterFolder = {
              ...(nextManifest.materialTextureHintsByCharacterFolder || {}),
              [choiceCharacterFolder]: {
                ...((nextManifest.materialTextureHintsByCharacterFolder || {})[choiceCharacterFolder] || {}),
                ...(binHints.materialTextureHints || {}),
              },
            };
            nextManifest.defaultTextureBySknByCharacterFolder = {
              ...(nextManifest.defaultTextureBySknByCharacterFolder || {}),
              [choiceCharacterFolder]: {
                ...((nextManifest.defaultTextureBySknByCharacterFolder || {})[choiceCharacterFolder] || {}),
                ...(binHints.defaultTextureBySkn || {}),
              },
            };
          }
        }
      }

      setManifest(nextManifest);
      setOpen(true);
    } catch (e) {
      console.error('[ModelInspectLaunch][InlineHost] failed to prepare manifest:', e);
      setError(e?.message || 'Failed to prepare inline model inspect');
      setOpen(true);
    } finally {
      setLoading(false);
      setProgressMessage('');
    }
  };

  useEffect(() => {
    const onOpen = async (event) => {
      setError('');
      setLoading(true);
      setProgressMessage('Preparing model inspect...');
      try {
        const payload = event?.detail || {};
        const nextManifest = buildManifestFromPayload(payload);

        // Auto-enrich right-click .skn launches with local texture/bin context.
        const path = getPathModule();
        const fs = getFsModule();
        const relModel = String(nextManifest?.sknFiles?.[0] || '');
        const characterFolder = toCharacterFolder(relModel);
        const skinKey = toSkinKey(relModel);

        if (path && fs && nextManifest.filesDir && characterFolder) {
          const allAbs = collectFilesRecursive(nextManifest.filesDir, path, fs);
          const toRel = (abs) => toRelativePath(nextManifest.filesDir, abs);
          const relTextures = allAbs
            .map(toRel)
            .filter((p) => /\.(dds|tex|png|jpg|jpeg|tga|bmp|webp)$/i.test(String(p || '')));
          const relSkn = allAbs
            .map(toRel)
            .filter((p) => /\.skn$/i.test(String(p || '')));

          nextManifest.textureFiles = Array.from(new Set([...(nextManifest.textureFiles || []), ...relTextures]));
          nextManifest.sknFiles = Array.from(new Set([...(nextManifest.sknFiles || []), ...relSkn]));

          const binChoices = collectSkinBinChoices({
            allAbs,
            filesRoot: nextManifest.filesDir,
            characterFolder,
          });

          const defaultBinName = (() => {
            const direct = String(skinKey || '').toLowerCase();
            const normalized = direct === 'base' ? 'skin0' : direct;
            const exact = binChoices.find((b) => b.skinKey.toLowerCase() === normalized);
            return exact?.binName || (binChoices[0]?.binName || '');
          })();

          setChoiceBaseManifest(nextManifest);
          setChoiceCharacterFolder(characterFolder);
          setChoiceAutoSkinKey(skinKey || 'base');
          setChoiceBins(binChoices);
          setChoiceSelectedBinName(defaultBinName);
          setChoiceModalOpen(true);
        } else {
          // Fallback when we cannot build local context: open directly with auto.
          setManifest(nextManifest);
          setOpen(true);
        }
      } catch (e) {
        console.error('[ModelInspectLaunch][InlineHost] failed to prepare manifest:', e);
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
    <>
      <TextureLookupChoiceModal
        open={choiceModalOpen}
        autoSkinKey={choiceAutoSkinKey}
        binChoices={choiceBins}
        selectedBinName={choiceSelectedBinName}
        setSelectedBinName={setChoiceSelectedBinName}
        onAuto={() => applyTextureMode({ mode: 'auto' })}
        onUseSelected={() => applyTextureMode({ mode: 'manual', selectedBinName: choiceSelectedBinName })}
        onSkip={() => applyTextureMode({ mode: 'skip' })}
        onCancel={() => {
          setChoiceModalOpen(false);
          setChoiceBaseManifest(null);
          setChoiceCharacterFolder('');
          setChoiceAutoSkinKey('base');
          setChoiceBins([]);
          setChoiceSelectedBinName('');
        }}
      />

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
    </>
  );
}
