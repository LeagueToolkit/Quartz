const path = require('path');
const os = require('os');

const MODEL_EXTENSIONS = new Set(['.skn', '.skl', '.scb', '.sco']);
const ANIMATION_EXTENSIONS = new Set(['.anm']);
const TEXTURE_EXTENSIONS = new Set(['.dds', '.tex', '.png', '.jpg', '.jpeg', '.tga', '.bmp', '.webp']);
const EXTRA_EXTENSIONS = new Set(['.bin']);

const CHAMPION_SPECIAL_CASES = {
  wukong: 'monkeyking',
  monkeyking: 'monkeyking',
  'nunu & willump': 'nunu',
  nunu: 'nunu',
};

function getChampionFileName(championName) {
  const lower = String(championName || '').toLowerCase();
  return CHAMPION_SPECIAL_CASES[lower] || lower.replace(/['"\s]/g, '');
}

function toSkinKey(skinId) {
  const normalized = Number(skinId) >= 1000 ? Number(skinId) % 1000 : Number(skinId);
  return normalized === 0 ? 'base' : `skin${String(normalized).padStart(2, '0')}`;
}

function toPosix(input) {
  return String(input || '').replace(/\\/g, '/');
}

function extOf(input) {
  return path.extname(String(input || '')).toLowerCase();
}

function normalizeMaterialName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function looksLikeTexturePath(value) {
  const lower = String(value || '').toLowerCase().replace(/\\/g, '/');
  return /\.(dds|tex|png|jpg|jpeg|tga|bmp|webp)$/i.test(lower) && (lower.includes('/') || lower.includes('assets'));
}

async function walkFiles(fs, rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;

  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }

  return out;
}

// Loads only BIN-specific hash tables (FNV-1a field/type/entry names).
// Much smaller than the full game hashtable load (~800MB). WAD chunk hashes
// (xxh64) are resolved via the native LMDB addon instead.
async function loadBinHashtablesSafe(loadJsRitoModule, hashPath) {
  if (!hashPath) return null;
  const { loadHashtables } = await loadJsRitoModule();
  return loadHashtables(hashPath, {
    tables: [
      'hashes.binentries.txt',
      'hashes.binhashes.txt',
      'hashes.bintypes.txt',
      'hashes.binfields.txt',
    ],
  });
}

// Fallback: full load when native addon is unavailable (old behaviour).
async function loadFullHashtablesSafe(loadJsRitoModule, hashPath) {
  if (!hashPath) return null;
  const { loadHashtables } = await loadJsRitoModule();
  return loadHashtables(hashPath, {
    tables: [
      'hashes.game.txt',
      'hashes.lcu.txt',
      'hashes.binentries.txt',
      'hashes.binhashes.txt',
      'hashes.bintypes.txt',
      'hashes.binfields.txt',
    ],
  });
}

async function discoverMaterialTextureHints({
  fs,
  filesDir,
  hashtables,
  skinId,
  skinKey,
  characterFolder = '',
  allFiles: providedFiles = null,
  loadBinModule,
  loadBinHasherModule,
  loadWadHasherModule,
}) {
  const { BIN } = await loadBinModule();
  const { BINHasher } = await loadBinHasherModule();
  const { WADHasher } = await loadWadHasherModule();

  const allFiles = Array.isArray(providedFiles) ? providedFiles : await walkFiles(fs, filesDir);
  const isHexBasename = (filePath) => /^[0-9a-f]{16}$/i.test(path.basename(String(filePath || '')));
  const isLikelyBinByMagic = async (filePath) => {
    try {
      const fd = await fs.promises.open(filePath, 'r');
      try {
        const header = Buffer.alloc(4);
        const { bytesRead } = await fd.read(header, 0, 4, 0);
        if (bytesRead < 4) return false;
        const sig = header.toString('ascii');
        return sig === 'PROP' || sig === 'PTCH';
      } finally {
        await fd.close().catch(() => {});
      }
    } catch (_) {
      return false;
    }
  };
  const binFiles = [];
  for (const filePath of allFiles) {
    const ext = extOf(filePath);
    if (ext === '.bin') {
      binFiles.push(filePath);
      continue;
    }
    // Unresolved hashed files can miss extension; probe likely candidates by magic.
    if (ext === '' && isHexBasename(filePath)) {
      if (await isLikelyBinByMagic(filePath)) {
        binFiles.push(filePath);
      }
    }
  }
  const selectedSkinId = Number(skinId) >= 1000 ? Number(skinId) % 1000 : Number(skinId);
  const selectedCharacterFolder = String(characterFolder || '').toLowerCase();
  const selectedSkinKey = String(skinKey || '').toLowerCase();
  const selectedSkinFolders = new Set([selectedSkinKey]);
  if (selectedSkinKey === 'base') {
    selectedSkinFolders.add('skin0');
    selectedSkinFolders.add('skin00');
  } else {
    const skinNum = selectedSkinId;
    selectedSkinFolders.add(`skin${skinNum}`);
    selectedSkinFolders.add(`skin${String(skinNum).padStart(2, '0')}`);
  }
  const textureMatchesSelectedCharacter = (texturePath) => {
    if (!selectedCharacterFolder) return true;
    const low = normalizeKey(texturePath);
    // Allow global/shared textures, but block textures from other champion folders.
    if (low.includes('/shared/') || low.includes('/global/') || low.includes('/common/')) return true;
    if (!low.includes(`/characters/${selectedCharacterFolder}/`)) return false;
    const skinMatch = low.match(/\/skins\/([^/]+)\//);
    if (!skinMatch) return true;
    return selectedSkinFolders.has(String(skinMatch[1] || '').toLowerCase());
  };
  const selectedSkinTokenA = `skin${selectedSkinId}.bin`;
  const selectedSkinTokenB = `skin${String(selectedSkinId).padStart(2, '0')}.bin`;
  const selectedSkinTokenC = `${String(skinKey || '').toLowerCase()}.bin`;
  const filteredBinFiles = binFiles.filter((absPath) => {
    const rel = toPosix(path.relative(filesDir, absPath)).toLowerCase();
    if (!rel.endsWith('.bin')) return false;
    if (characterFolder) {
      const folderMatch = rel.match(/^(?:assets|data)\/characters\/([^/]+)\//);
      const folder = folderMatch ? String(folderMatch[1] || '').toLowerCase() : '';
      if (folder !== String(characterFolder).toLowerCase()) return false;
      // Character-folder mode: allow all BINs from that character's skins root.
      // Downstream texture/path filters enforce the selected texture skin.
      return /^(?:assets|data)\/characters\/[^/]+\/skins\/[^/]+\.bin$/.test(rel);
    }
    if (rel.endsWith('/skins/root.bin')) return true;
    if (rel.endsWith(`/skins/${selectedSkinTokenA}`)) return true;
    if (rel.endsWith(`/skins/${selectedSkinTokenB}`)) return true;
    if (selectedSkinTokenC && rel.endsWith(`/skins/${selectedSkinTokenC}`)) return true;
    return false;
  });
  const hints = {};
  const discoveredTextureRefs = new Set();

  const resolveFieldName = (hex) => String(BINHasher.hexToRaw(hashtables, hex) || hex);
  const resolveTypeName = (hex) => String(BINHasher.hexToRaw(hashtables, hex) || hex);
  const resolveEntryName = (hex) => String(BINHasher.hexToRaw(hashtables, hex) || hex);
  const resolveLinkName = (hex) => String(BINHasher.hexToRaw(hashtables, hex) || hex);
  const resolveFileHash = (hex64) => String(WADHasher.hexToRaw(hashtables, hex64) || hex64);

  const normalizeKey = (value) => String(value || '').toLowerCase().replace(/\\/g, '/');
  const normalizeSimple = (value) => normalizeMaterialName(value);
  const fieldNameMatches = (name, expected) => {
    const low = normalizeKey(name);
    return low === expected || low.endsWith(`/${expected}`);
  };
  const getFieldsFromEmbed = (field) => {
    if (!field || typeof field !== 'object') return [];
    if (Array.isArray(field.data)) return field.data;
    return [];
  };
  const getFieldByName = (fields, target) => {
    for (const f of fields || []) {
      const fieldName = resolveFieldName(f.hash);
      if (fieldNameMatches(fieldName, target)) return f;
    }
    return null;
  };
  const readStringLike = (field) => {
    if (!field) return '';
    if (field.type === 16) return String(field.data || '');
    if (field.type === 17 || field.type === 132) return String(resolveLinkName(field.data || ''));
    if (field.type === 18) return String(resolveFileHash(field.data || ''));
    return '';
  };
  const addMaterialAlias = (map, materialRef, texturePath) => {
    if (!materialRef || !texturePath) return;
    const refPath = normalizeKey(materialRef);
    const refBase = path.basename(refPath);
    const refNoInst = refBase.replace(/_inst$/i, '');
    map.set(refPath, texturePath);
    map.set(normalizeSimple(refPath), texturePath);
    map.set(refBase, texturePath);
    map.set(normalizeSimple(refBase), texturePath);
    map.set(refNoInst, texturePath);
    map.set(normalizeSimple(refNoInst), texturePath);
  };

  const submeshToMaterial = new Map();
  const submeshToTexture = new Map();
  const materialToTexture = new Map();
  const skinMeshDefaultCandidates = [];
  const isContainerType = (type) => type === 128 || type === 129 || type === 131 || type === 133 || type === 134;
  const readOptionPayload = (field) => {
    if (!field || field.type !== 133) return null;
    return field.data && typeof field.data === 'object' ? field.data : null;
  };
  const readMapPayload = (field) => {
    if (!field || field.type !== 134 || !field.data || typeof field.data !== 'object') return [];
    return Object.values(field.data);
  };
  const tryExtractOverrideFromEmbed = (embedFields) => {
    if (!Array.isArray(embedFields) || !embedFields.length) return;
    const submeshField = getFieldByName(embedFields, 'submesh');
    const materialField = getFieldByName(embedFields, 'material');
    const textureField = getFieldByName(embedFields, 'texture');
    const submeshName = readStringLike(submeshField);
    if (!submeshName) return;
    const materialRef = readStringLike(materialField);
    if (materialRef) {
      submeshToMaterial.set(normalizeSimple(submeshName), materialRef);
    }
    // Some overrides specify texture directly instead of a Material link.
    const texturePath = readStringLike(textureField).replace(/\\/g, '/');
    if (looksLikeTexturePath(texturePath) && textureMatchesSelectedCharacter(texturePath)) {
      submeshToTexture.set(normalizeSimple(submeshName), texturePath);
      hints[normalizeSimple(submeshName)] = texturePath;
      discoveredTextureRefs.add(texturePath.toLowerCase());
    }
  };
  const scanForMaterialOverrides = (field) => {
    if (!field || typeof field !== 'object') return;

    // Direct LIST/LIST2 of EMBED objects often used by materialOverride.
    if ((field.type === 128 || field.type === 129) && Array.isArray(field.data)) {
      for (const item of field.data) {
        if (item && typeof item === 'object' && item.type === 131) {
          tryExtractOverrideFromEmbed(getFieldsFromEmbed(item));
        }
      }
      for (const item of field.data) {
        if (item && typeof item === 'object' && isContainerType(item.type)) {
          scanForMaterialOverrides(item);
        }
      }
      return;
    }

    if (field.type === 131) {
      const fields = getFieldsFromEmbed(field);
      tryExtractOverrideFromEmbed(fields);
      for (const child of fields) scanForMaterialOverrides(child);
      return;
    }

    if (field.type === 133) {
      const payload = readOptionPayload(field);
      if (payload && isContainerType(payload.type)) scanForMaterialOverrides(payload);
      return;
    }

    if (field.type === 134) {
      for (const value of readMapPayload(field)) {
        if (value && typeof value === 'object' && isContainerType(value.type)) {
          scanForMaterialOverrides(value);
        }
      }
      return;
    }
  };
  const scanForSkinMeshDefaults = (field) => {
    if (!field || typeof field !== 'object') return;

    if (field.type === 131) {
      const embedType = normalizeKey(resolveTypeName(field.hashType));
      const fields = getFieldsFromEmbed(field);
      const fieldNames = new Set((fields || []).map((f) => normalizeKey(resolveFieldName(f.hash))));
      const isSkinMesh =
        (embedType.includes('skinmeshdataproperties') && !embedType.includes('materialoverride')) ||
        fieldNames.has('simpleskin') ||
        (fieldNames.has('materialoverride') && fieldNames.has('texture'));

      if (isSkinMesh) {
        const simpleSkinField = getFieldByName(fields, 'simpleskin');
        const materialField = getFieldByName(fields, 'material');
        const textureField = getFieldByName(fields, 'texture');
        const simpleSkinPath = readStringLike(simpleSkinField).replace(/\\/g, '/');
        const materialRef = readStringLike(materialField);
        const texturePath = readStringLike(textureField).replace(/\\/g, '/');
        if (simpleSkinPath || materialRef || texturePath) {
          skinMeshDefaultCandidates.push({
            simpleSkinPath,
            materialRef,
            texturePath,
          });
        }
      }

      for (const child of fields) scanForSkinMeshDefaults(child);
      return;
    }

    if ((field.type === 128 || field.type === 129) && Array.isArray(field.data)) {
      for (const item of field.data) {
        if (item && typeof item === 'object') scanForSkinMeshDefaults(item);
      }
      return;
    }

    if (field.type === 133) {
      const payload = readOptionPayload(field);
      if (payload && typeof payload === 'object') scanForSkinMeshDefaults(payload);
      return;
    }

    if (field.type === 134) {
      for (const value of readMapPayload(field)) {
        if (value && typeof value === 'object') scanForSkinMeshDefaults(value);
      }
    }
  };
  const resolveTextureByMaterialRef = (materialRef) => {
    const materialRefPath = normalizeKey(materialRef);
    const materialRefBase = path.basename(materialRefPath);
    const materialRefNoInst = materialRefBase.replace(/_inst$/i, '');
    return (
      materialToTexture.get(materialRefPath) ||
      materialToTexture.get(normalizeSimple(materialRefPath)) ||
      materialToTexture.get(materialRefBase) ||
      materialToTexture.get(normalizeSimple(materialRefBase)) ||
      materialToTexture.get(materialRefNoInst) ||
      materialToTexture.get(normalizeSimple(materialRefNoInst)) ||
      ''
    );
  };

  for (const binPath of filteredBinFiles) {
    try {
      // Read bytes via Electron main fs first, then parse from Buffer.
      // This avoids environment-specific fs bootstrap issues inside jsritofile BIN.read(path).
      const raw = await fs.promises.readFile(binPath);
      const bin = await new BIN().read(raw, hashtables);
      for (const entry of bin.entries || []) {
        const entryType = resolveTypeName(entry.type);
        const entryName = resolveEntryName(entry.hash);

        // Pass 1a: explicit materialOverride submesh -> material link
        const materialOverrideField = getFieldByName(entry.data, 'materialoverride');
        if (materialOverrideField && (materialOverrideField.type === 128 || materialOverrideField.type === 129)) {
          for (const item of materialOverrideField.data || []) {
            const overrideFields = getFieldsFromEmbed(item);
            if (!overrideFields.length) continue;
            const submeshField = getFieldByName(overrideFields, 'submesh');
            const materialField = getFieldByName(overrideFields, 'material');
            const submeshName = readStringLike(submeshField);
            const materialRef = readStringLike(materialField);
            if (submeshName && materialRef) {
              submeshToMaterial.set(normalizeSimple(submeshName), materialRef);
            }
          }
        }

        // Pass 1b: content-based scan (covers unresolved/renamed parent fields)
        for (const field of entry.data || []) {
          scanForMaterialOverrides(field);
          scanForSkinMeshDefaults(field);
        }

        // Pass 2: StaticMaterialDef entry -> Diffuse_Texture texturePath
        const isStaticMaterialDef =
          normalizeKey(entryType).includes('staticmaterialdef') ||
          normalizeKey(entryName).includes('/materials/');
        if (isStaticMaterialDef) {
          let materialRefName = entryName;
          const nameField = getFieldByName(entry.data, 'name');
          const nameValue = readStringLike(nameField);
          if (nameValue) materialRefName = nameValue;

          const samplerValuesField = getFieldByName(entry.data, 'samplervalues');
          if (samplerValuesField && (samplerValuesField.type === 128 || samplerValuesField.type === 129)) {
            for (const samplerItem of samplerValuesField.data || []) {
              const samplerFields = getFieldsFromEmbed(samplerItem);
              if (!samplerFields.length) continue;
              const textureNameField = getFieldByName(samplerFields, 'texturename');
              const texturePathField = getFieldByName(samplerFields, 'texturepath');
              const textureName = readStringLike(textureNameField);
              if (!normalizeKey(textureName).includes('diffuse_texture')) continue;
              const texturePath = readStringLike(texturePathField).replace(/\\/g, '/');
              if (!looksLikeTexturePath(texturePath)) continue;
              if (!textureMatchesSelectedCharacter(texturePath)) continue;
              discoveredTextureRefs.add(texturePath.toLowerCase());
              addMaterialAlias(materialToTexture, materialRefName, texturePath);
            }
          }
        }

      }
    } catch (error) {
      console.warn(`[modelInspect] BIN parse skipped (${path.basename(binPath)}): ${error.message}`);
    }
  }

  // Join pass output: submesh -> material -> texturePath
  for (const [submeshKey, materialRef] of submeshToMaterial.entries()) {
    const explicitTexture = submeshToTexture.get(submeshKey);
    const texturePath = explicitTexture || resolveTextureByMaterialRef(materialRef);

    if (texturePath && looksLikeTexturePath(texturePath) && textureMatchesSelectedCharacter(texturePath)) {
      hints[submeshKey] = texturePath;
    }
  }

  // Fallback for submeshes without explicit materialOverride:
  // use the owning SkinMeshDataProperties entry (material has priority over texture path).
  const defaultTextureBySkn = {};
  let defaultTextureHint = '';
  for (const candidate of skinMeshDefaultCandidates) {
    const fromMaterial = resolveTextureByMaterialRef(candidate.materialRef);
    const fromTexture = candidate.texturePath || '';
    const resolved = (fromMaterial && looksLikeTexturePath(fromMaterial)) ? fromMaterial : fromTexture;
    if (!resolved || !looksLikeTexturePath(resolved) || !textureMatchesSelectedCharacter(resolved)) continue;

    const simpleSkinKey = normalizeKey(candidate.simpleSkinPath || '');
    if (simpleSkinKey && !defaultTextureBySkn[simpleSkinKey]) {
      defaultTextureBySkn[simpleSkinKey] = resolved;
    }
    if (!defaultTextureHint) defaultTextureHint = resolved;
  }
  if (defaultTextureHint) {
    hints.__default__ = defaultTextureHint;
    discoveredTextureRefs.add(defaultTextureHint.toLowerCase());
  }

  return {
    materialTextureHints: hints,
    defaultTextureBySkn,
    discoveredTextureRefs: Array.from(discoveredTextureRefs),
  };
}

function registerModelInspectChannels({
  ipcMain,
  fs,
  app,
  getHashPath,
  getNativeAddon,
  loadWadModule,
  loadJsRitoModule,
  loadBinModule,
  loadBinHasherModule,
  loadWadHasherModule,
}) {
  // Clean up entire model-inspect cache directory.
  ipcMain.handle('modelInspect:cleanup', async () => {
    try {
      const userDataPath = app?.getPath?.('userData') || path.join(os.homedir(), 'AppData', 'Roaming', 'Quartz');
      const cacheRoot = path.join(userDataPath, 'cache', 'model-inspect');
      if (fs.existsSync(cacheRoot)) {
        fs.rmSync(cacheRoot, { recursive: true, force: true });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('modelInspect:prepareSkinAssets', async (event, data = {}) => {
    try {
      const {
        championName,
        skinId,
        chromaId = null,
        skinName = '',
        leaguePath,
        hashPath: rawHashPath,
      } = data;

      if (!championName || skinId == null || !leaguePath) {
        return { error: 'Missing required parameters: championName, skinId, leaguePath' };
      }

      const championFileName = getChampionFileName(championName);
      const normalizedModelSkinId = Number(skinId) >= 1000 ? Number(skinId) % 1000 : Number(skinId);
      const modelSkinKey = toSkinKey(normalizedModelSkinId);
      const normalizedTextureSkinId = chromaId != null
        ? (Number(chromaId) >= 1000 ? Number(chromaId) % 1000 : Number(chromaId))
        : normalizedModelSkinId;
      const textureSkinKey = toSkinKey(normalizedTextureSkinId);
      const wadFilePath = path.join(leaguePath, `${championFileName}.wad.client`);
      if (!fs.existsSync(wadFilePath)) {
        return { error: `WAD file not found: ${wadFilePath}` };
      }

      const hashPath = getHashPath(rawHashPath);

      // Use native LMDB addon for WAD hash resolution when available.
      // Falls back to loading full JS hashtables (old behaviour) when not.
      const nativeAddon = getNativeAddon?.();
      let hashtables = null;   // used only in fallback path + BIN parsing
      let hashResolver = null; // native LMDB path

      if (nativeAddon?.resolveHashes && hashPath) {
        hashResolver = (hexHashes) => nativeAddon.resolveHashes(hexHashes, hashPath);
        // BIN parsing still needs FNV-1a tables — load only the small bin files.
        hashtables = hashPath && fs.existsSync(hashPath)
          ? await loadBinHashtablesSafe(loadJsRitoModule, hashPath)
          : null;
        console.log('[modelInspect] Using native LMDB for WAD hashes + bin-only JS tables for BIN parsing');
      } else {
        // Native addon unavailable — load full hashtables as before.
        hashtables = hashPath && fs.existsSync(hashPath)
          ? await loadFullHashtablesSafe(loadJsRitoModule, hashPath)
          : null;
        if (!hashtables) {
          return { error: 'Hash tables are required for Model Inspect path resolution. Download hashes first.' };
        }
        console.log('[modelInspect] Native addon unavailable — using full JS hashtables');
      }

      const userDataPath = app?.getPath?.('userData') || path.join(os.homedir(), 'AppData', 'Roaming', 'Quartz');
      const cacheRoot = path.join(userDataPath, 'cache', 'model-inspect', championFileName, modelSkinKey);
      const filesDir = path.join(cacheRoot, 'files');
      const metaPath = path.join(cacheRoot, 'meta.json');

      if (fs.existsSync(cacheRoot)) {
        fs.rmSync(cacheRoot, { recursive: true, force: true });
      }
      fs.mkdirSync(filesDir, { recursive: true });

      const championPrefix = `assets/characters/${championFileName}`.toLowerCase();
      const dataChampionPrefix = `data/characters/${championFileName}`.toLowerCase();
      const skinsPrefix = `${championPrefix}/skins/`;
      const dataSkinsPrefix = `${dataChampionPrefix}/skins/`;
      const modelSkinPrefix = `${skinsPrefix}${modelSkinKey}`.toLowerCase();
      const dataModelSkinPrefix = `${dataSkinsPrefix}${modelSkinKey}`.toLowerCase();
      const textureSkinPrefix = `${skinsPrefix}${textureSkinKey}`.toLowerCase();
      const dataTextureSkinPrefix = `${dataSkinsPrefix}${textureSkinKey}`.toLowerCase();
      const modelSkinNum = Number(normalizedModelSkinId);
      const modelSkinBinNameA = `skin${modelSkinNum}.bin`; // e.g. skin0.bin, skin1.bin
      const modelSkinBinNameB = `skin${String(modelSkinNum).padStart(2, '0')}.bin`; // e.g. skin00.bin, skin01.bin
      const textureSkinNum = Number(normalizedTextureSkinId);
      const textureSkinBinNameA = `skin${textureSkinNum}.bin`;
      const textureSkinBinNameB = `skin${String(textureSkinNum).padStart(2, '0')}.bin`;
      const forcedBinPaths = new Set([
        `${skinsPrefix}${modelSkinBinNameA}`,
        `${skinsPrefix}${modelSkinBinNameB}`,
        `${dataSkinsPrefix}${modelSkinBinNameA}`,
        `${dataSkinsPrefix}${modelSkinBinNameB}`,
        `${skinsPrefix}${textureSkinBinNameA}`,
        `${skinsPrefix}${textureSkinBinNameB}`,
        `${dataSkinsPrefix}${textureSkinBinNameA}`,
        `${dataSkinsPrefix}${textureSkinBinNameB}`,
      ]);
      const allowedExt = new Set([...MODEL_EXTENSIONS, ...ANIMATION_EXTENSIONS, ...TEXTURE_EXTENSIONS, ...EXTRA_EXTENSIONS]);

      const sendProgress = (message) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('modelInspect:progress', { message });
          }
        } catch (_) {
          // Ignore if renderer no longer exists.
        }
      };

      sendProgress('Preparing model inspection assets...');
      const { unpackWAD } = await loadWadModule();
      // Pass hashResolver (native LMDB) when available; null hashtables since chunks are
      // resolved via hashResolver inside unpackWAD. Falls back to JS hashtables when native
      // addon is not present (hashtables is populated in that path above).
      await unpackWAD(
        wadFilePath,
        filesDir,
        hashResolver ? null : hashtables,
        (hash, chunk) => {
          const rel = toPosix(hash).toLowerCase();
          // Unresolved hashes can still contain required BINs; include them and rely on
          // runtime extension guessing + downstream selection.
          if (!rel.includes('/')) {
            return true;
          }
          const extFromPath = extOf(rel);
          const extFromChunk = String(chunk?.extension || '').toLowerCase();
          const effectiveExt = extFromPath || (extFromChunk ? `.${extFromChunk}` : '');
          const inAnySkinFolder = (targetSkinKey) => {
            if (!targetSkinKey) return false;
            return new RegExp(`^(?:assets|data)/characters/[^/]+/skins/${String(targetSkinKey).toLowerCase()}/`).test(rel);
          };
          // BIN metadata can live at skins root (e.g. skin0.bin) instead of skins/base|skinXX.
          if (effectiveExt === '.bin') {
            if (forcedBinPaths.has(rel)) return true;
            // Include all BIN chunks even when path is unresolved hash.
            if (!rel.includes('/')) return true;
            if (rel.endsWith('/skins/root.bin')) return true;
            if (rel.endsWith(`/skins/${modelSkinBinNameA}`)) return true;
            if (rel.endsWith(`/skins/${modelSkinBinNameB}`)) return true;
            if (rel.endsWith(`/skins/${textureSkinBinNameA}`)) return true;
            if (rel.endsWith(`/skins/${textureSkinBinNameB}`)) return true;
            if (modelSkinKey.toLowerCase() === 'base' && rel.endsWith('/skins/base.bin')) return true;
            if (textureSkinKey.toLowerCase() === 'base' && rel.endsWith('/skins/base.bin')) return true;
            return false;
          }
          if (!allowedExt.has(effectiveExt)) return false;
          const inModelSkin =
            rel.startsWith(modelSkinPrefix) ||
            rel.startsWith(dataModelSkinPrefix) ||
            inAnySkinFolder(modelSkinKey);
          const inTextureSkin =
            rel.startsWith(textureSkinPrefix) ||
            rel.startsWith(dataTextureSkinPrefix) ||
            inAnySkinFolder(textureSkinKey);
          if (MODEL_EXTENSIONS.has(effectiveExt) || ANIMATION_EXTENSIONS.has(effectiveExt)) {
            return inModelSkin;
          }
          if (TEXTURE_EXTENSIONS.has(effectiveExt)) {
            return inTextureSkin || inModelSkin;
          }
          return inModelSkin || inTextureSkin;
        },
        (_count, message) => {
          if (message) sendProgress(message);
        },
        hashResolver ? { hashResolver } : {}
      );

      sendProgress('Scanning extracted model subset...');
      const allFiles = await walkFiles(fs, filesDir);
      const toRel = (abs) => toPosix(path.relative(filesDir, abs));

      const relInModelSkin = (absPath) => {
        const rel = toPosix(path.relative(filesDir, absPath)).toLowerCase();
        if (rel.startsWith(modelSkinPrefix) || rel.startsWith(dataModelSkinPrefix)) return true;
        return new RegExp(`^(?:assets|data)/characters/[^/]+/skins/${String(modelSkinKey).toLowerCase()}/`).test(rel);
      };
      const sknFiles = allFiles.filter((f) => extOf(f) === '.skn' && relInModelSkin(f)).map(toRel);
      const sklFiles = allFiles.filter((f) => extOf(f) === '.skl' && relInModelSkin(f)).map(toRel);
      const anmFiles = allFiles.filter((f) => ANIMATION_EXTENSIONS.has(extOf(f)) && relInModelSkin(f)).map(toRel);
      const textureFiles = allFiles.filter((f) => TEXTURE_EXTENSIONS.has(extOf(f))).map(toRel);
      const modelFiles = allFiles.filter((f) => MODEL_EXTENSIONS.has(extOf(f))).map(toRel);
      const characterFolders = Array.from(
        new Set(
          allFiles
            .map((f) => {
              const rel = toPosix(path.relative(filesDir, f)).toLowerCase();
              const match = rel.match(/^data\/characters\/([^/]+)\//);
              return match ? match[1] : '';
            })
            .filter(Boolean)
        )
      ).sort();
      const defaultCharacterFolder = characterFolders.includes(championFileName.toLowerCase())
        ? championFileName.toLowerCase()
        : (characterFolders[0] || '');
      const materialTextureHintsByCharacterFolder = {};
      const defaultTextureBySknByCharacterFolder = {};
      const discoveredTextureRefSet = new Set();

      for (const folder of characterFolders) {
        const result = await discoverMaterialTextureHints({
          fs,
          filesDir,
          hashtables,
          skinId: normalizedTextureSkinId,
          skinKey: textureSkinKey,
          characterFolder: folder,
          allFiles,
          loadBinModule,
          loadBinHasherModule,
          loadWadHasherModule,
        });
        materialTextureHintsByCharacterFolder[folder] = result.materialTextureHints || {};
        defaultTextureBySknByCharacterFolder[folder] = result.defaultTextureBySkn || {};
        for (const ref of (result.discoveredTextureRefs || [])) {
          discoveredTextureRefSet.add(ref);
        }
      }

      const fallbackHintResult = await discoverMaterialTextureHints({
        fs,
        filesDir,
        hashtables,
        skinId: normalizedTextureSkinId,
        skinKey: textureSkinKey,
        allFiles,
        loadBinModule,
        loadBinHasherModule,
        loadWadHasherModule,
      });

      const defaultFolderHints = materialTextureHintsByCharacterFolder[defaultCharacterFolder] || {};
      const defaultFolderTextureBySkn = defaultTextureBySknByCharacterFolder[defaultCharacterFolder] || {};
      const materialTextureHints = Object.keys(defaultFolderHints).length > 0
        ? defaultFolderHints
        : (fallbackHintResult.materialTextureHints || {});
      const defaultTextureBySkn = Object.keys(defaultFolderTextureBySkn).length > 0
        ? defaultFolderTextureBySkn
        : (fallbackHintResult.defaultTextureBySkn || {});
      for (const ref of (fallbackHintResult.discoveredTextureRefs || [])) {
        discoveredTextureRefSet.add(ref);
      }

      const manifest = {
        championName,
        championFileName,
        skinId: normalizedModelSkinId,
        textureSkinId: normalizedTextureSkinId,
        chromaId,
        skinName,
        skinKey: modelSkinKey,
        textureSkinKey,
        createdAt: new Date().toISOString(),
        cacheRoot,
        filesDir,
        modelFiles,
        sknFiles,
        sklFiles,
        anmFiles,
        textureFiles,
        characterFolders,
        defaultCharacterFolder,
        materialTextureHints,
        materialTextureHintsByCharacterFolder,
        defaultTextureBySkn,
        defaultTextureBySknByCharacterFolder,
        discoveredTextureRefs: Array.from(discoveredTextureRefSet),
      };

      fs.writeFileSync(metaPath, JSON.stringify(manifest, null, 2), 'utf-8');
      sendProgress('Model inspection assets are ready.');
      return { success: true, ...manifest };
    } catch (error) {
      console.error('[modelInspect:prepareSkinAssets] Error:', error);
      return { error: error.message, stack: error.stack };
    }
  });
}

module.exports = {
  registerModelInspectChannels,
  discoverMaterialTextureHints,
};
