import githubApi from './githubApi.js';
import { parseIndividualVFXSystems } from '../../../utils/vfx/vfxSystemParser.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
const os = window.require ? window.require('os') : null;

const defaultCollectionTemplate = `entries: map[hash,embed] = {
    #addvfxsystemswithrightbrackets
    #dontcreatenewresourceresolver
    "Characters/Aurora/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash,link] = {
            #addresourceresolverhere 
        }
    }
}`;

const ensureElectronFs = () => {
  if (!fs || !path || !os) {
    throw new Error('Local Hub requires desktop mode with filesystem access');
  }
};

const safeLower = (v) => String(v || '').toLowerCase();

const deriveCategoryFromFilename = (filename) => {
  const lower = safeLower(filename);
  let base = lower.replace(/\.py$/, '');
  base = base.replace(/vfxs?$/, '').trim().replace(/[_\s]+/g, '');
  const pluralMap = { aura: 'auras', missile: 'missiles', explosion: 'explosions' };
  return pluralMap[base] || base || 'general';
};

const sanitizeCollectionFilename = (name) => {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\.py$/i, '')
    .replace(/[^\w-]+/g, '');
  if (!base) return '';
  return `${base}.py`;
};

const cleanAssetSystemName = (value) =>
  String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

const readTextIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
};

class LocalHubService {
  getRootPath() {
    ensureElectronFs();
    return path.join(os.homedir(), 'Documents', 'Quartz', 'VFXHub');
  }

  getStructurePaths() {
    const root = this.getRootPath();
    return {
      root,
      collectionRoot: path.join(root, 'collection'),
      vfxCollectionDir: path.join(root, 'collection', 'vfx collection'),
      previewsDir: path.join(root, 'collection', 'previews'),
      assetsDir: path.join(root, 'collection', 'assets', 'vfxhub'),
    };
  }

  ensureStructure() {
    const dirs = this.getStructurePaths();
    fs.mkdirSync(dirs.vfxCollectionDir, { recursive: true });
    fs.mkdirSync(dirs.previewsDir, { recursive: true });
    fs.mkdirSync(dirs.assetsDir, { recursive: true });
    return dirs;
  }

  getTemplateCollectionContent() {
    const projectTemplatePath = path.join(process.cwd(), 'missilevfxs.py');
    const template = readTextIfExists(projectTemplatePath).trim();
    return template || defaultCollectionTemplate;
  }

  cleanPreviewKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  collectReferencedAssetBasenames(content) {
    const refs = new Set();
    const matches = String(content || '').matchAll(/ASSETS\/vfxhub\/([^"\\/\s]+?\.[A-Za-z0-9]+)/gi);
    for (const match of matches) {
      const file = String(match[1] || '').trim();
      if (file) refs.add(file.toLowerCase());
    }
    return refs;
  }

  collectAllPreviewKeysFromCollections(vfxCollectionDir) {
    const keys = new Set();
    const files = fs.readdirSync(vfxCollectionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.py'));
    for (const file of files) {
      const fullPath = path.join(vfxCollectionDir, file.name);
      const content = readTextIfExists(fullPath);
      if (!content) continue;
      const systems = githubApi.parseVFXSystemsFromContent(content);
      for (const system of systems) {
        const candidates = [
          system.displayName || '',
          system.name ? system.name.split('/').pop() : '',
          system.name || '',
        ];
        for (const candidate of candidates) {
          const key = this.cleanPreviewKey(candidate);
          if (key) keys.add(key);
        }
      }
    }
    return keys;
  }

  getPreviewDataUrl(filePath) {
    const ext = path.extname(filePath).replace('.', '').toLowerCase();
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mimeType = mimeTypes[ext] || 'image/png';
    const content = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${content.toString('base64')}`;
  }

  getPreviewsIndex() {
    const { previewsDir } = this.ensureStructure();
    const index = {};
    const entries = fs.readdirSync(previewsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) continue;
      const base = entry.name.replace(/\.[^.]+$/, '');
      const key = this.cleanPreviewKey(base);
      const fullPath = path.join(previewsDir, entry.name);
      index[key] = this.getPreviewDataUrl(fullPath);
    }
    return index;
  }

  async getVFXCollections() {
    const { vfxCollectionDir } = this.ensureStructure();
    const previewsIndex = this.getPreviewsIndex();
    const entries = fs.readdirSync(vfxCollectionDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.py'));
    const collections = [];

    for (const file of files) {
      const fullPath = path.join(vfxCollectionDir, file.name);
      const content = readTextIfExists(fullPath);
      const systems = githubApi.parseVFXSystemsFromContent(content).map((system) => {
        const candidateKeys = [
          system.displayName || '',
          system.name ? system.name.split('/').pop() : '',
        ];
        let previewUrl = null;
        for (const candidate of candidateKeys) {
          const key = this.cleanPreviewKey(candidate);
          if (previewsIndex[key]) {
            previewUrl = previewsIndex[key];
            break;
          }
        }
        return { ...system, previewUrl };
      });

      collections.push({
        name: file.name,
        category: deriveCategoryFromFilename(file.name),
        description: `${deriveCategoryFromFilename(file.name)} VFX Collection`,
        systems,
        filePath: fullPath,
      });
    }

    return { collections };
  }

  async createCategory(categoryInput) {
    const { vfxCollectionDir } = this.ensureStructure();
    const fileName = sanitizeCollectionFilename(categoryInput);
    if (!fileName) throw new Error('Invalid category name');
    const fullPath = path.join(vfxCollectionDir, fileName);
    if (fs.existsSync(fullPath)) throw new Error(`${fileName} already exists`);
    fs.writeFileSync(fullPath, this.getTemplateCollectionContent(), 'utf8');
    return { name: fileName, path: fullPath };
  }

  async deleteCategory(categoryFileName) {
    const { vfxCollectionDir } = this.ensureStructure();
    const fileName = sanitizeCollectionFilename(categoryFileName);
    if (!fileName) throw new Error('Invalid category filename');
    const fullPath = path.join(vfxCollectionDir, fileName);
    if (!fs.existsSync(fullPath)) throw new Error(`${fileName} not found`);
    fs.unlinkSync(fullPath);
    return { success: true };
  }

  async deleteVFXSystem(systemName, collectionFile) {
    const { vfxCollectionDir, assetsDir } = this.ensureStructure();
    const fileName = path.basename(collectionFile || '');
    const filePath = path.join(vfxCollectionDir, fileName);
    if (!fs.existsSync(filePath)) throw new Error(`Collection file not found: ${fileName}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const systems = parseIndividualVFXSystems(content);
    const target = systems.find((entry) => entry.name === systemName);
    if (!target) throw new Error(`System not found: ${systemName}`);

    const lines = content.split('\n');
    let startLine = target.startLine;
    while (
      startLine > 0 &&
      /^\s*#\s*VFX_HUB_/i.test(lines[startLine - 1].trim())
    ) {
      startLine -= 1;
    }

    lines.splice(startLine, target.endLine - startLine + 1);

    // Remove matching ResourceResolver mapping for this system if present.
    const resolverKey = String(target.resourceResolverKey || '').trim();
    let resolverEntriesRemoved = 0;
    const filteredLines = lines.filter((line) => {
      const trimmed = String(line || '').trim();
      const mapEntryMatch = trimmed.match(/^"([^"]+)"\s*=\s*"([^"]+)"\s*,?\s*$/);
      if (!mapEntryMatch) return true;
      const lhs = mapEntryMatch[1];
      const rhs = mapEntryMatch[2];
      const isKeyMatch = resolverKey && lhs === resolverKey;
      const isPathMatch = rhs === systemName;
      if (isKeyMatch || isPathMatch) {
        resolverEntriesRemoved += 1;
        return false;
      }
      return true;
    });

    const nextContent = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(filePath, nextContent, 'utf8');

    // Delete local assets from this system when no remaining collection file references them.
    const targetAssetFilenames = new Set(
      (target.assets || [])
        .map((assetPath) => path.basename(String(assetPath || '').replace(/\\/g, '/')))
        .filter(Boolean)
    );
    const effectNameCandidates = [
      target.metadata?.displayName,
      systemName.split('/').pop(),
      systemName,
    ].map(cleanAssetSystemName).filter(Boolean);
    if (fs.existsSync(assetsDir)) {
      const localAssetFiles = fs.readdirSync(assetsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      for (const filename of localAssetFiles) {
        const lower = filename.toLowerCase();
        if (effectNameCandidates.some((effect) => lower.includes(`_${String(effect).toLowerCase()}.`))) {
          targetAssetFilenames.add(filename);
        }
      }
    }

    const referencedByAllCollections = new Set();
    const allCollectionFiles = fs.readdirSync(vfxCollectionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.py'));
    for (const file of allCollectionFiles) {
      const fullPath = path.join(vfxCollectionDir, file.name);
      const fileContent = readTextIfExists(fullPath);
      if (!fileContent) continue;
      const refs = this.collectReferencedAssetBasenames(fileContent);
      refs.forEach((value) => referencedByAllCollections.add(value));
    }

    let deletedAssets = 0;
    for (const filename of targetAssetFilenames) {
      const key = filename.toLowerCase();
      if (referencedByAllCollections.has(key)) continue;
      const localAssetPath = path.join(assetsDir, filename);
      if (fs.existsSync(localAssetPath)) {
        fs.unlinkSync(localAssetPath);
        deletedAssets += 1;
      }
    }

    // Delete preview image(s) for this system if no remaining systems share that preview key.
    const { previewsDir } = this.getStructurePaths();
    const removedPreviewKeys = new Set();
    const deletePreviewKeys = new Set([
      this.cleanPreviewKey(target.metadata?.displayName || ''),
      this.cleanPreviewKey(systemName.split('/').pop()),
      this.cleanPreviewKey(systemName),
    ]);
    const remainingPreviewKeys = this.collectAllPreviewKeysFromCollections(vfxCollectionDir);
    if (fs.existsSync(previewsDir)) {
      const previewFiles = fs.readdirSync(previewsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.match(/\.(png|jpg|jpeg|gif|webp)$/i));
      for (const file of previewFiles) {
        const base = file.name.replace(/\.[^.]+$/, '');
        const key = this.cleanPreviewKey(base);
        if (!deletePreviewKeys.has(key)) continue;
        if (remainingPreviewKeys.has(key)) continue;
        fs.unlinkSync(path.join(previewsDir, file.name));
        removedPreviewKeys.add(key);
      }
    }

    return {
      success: true,
      deletedAssets,
      resolverEntriesRemoved,
      deletedPreviews: removedPreviewKeys.size,
    };
  }

  async uploadPreview(base64Content, effectName, extension = 'png') {
    const { previewsDir } = this.ensureStructure();
    const cleanBase = String(effectName || 'preview')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'preview';
    const ext = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(safeLower(extension))
      ? safeLower(extension)
      : 'png';
    const filePath = path.join(previewsDir, `${cleanBase}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(base64Content, 'base64'));
    return { path: filePath };
  }

  async uploadVFXSystem(uploadPreparation, collectionFile, assets = [], metadata = {}) {
    const { vfxCollectionDir, assetsDir } = this.ensureStructure();
    const fileName = sanitizeCollectionFilename(collectionFile || 'auravfx.py') || 'auravfx.py';
    const filePath = path.join(vfxCollectionDir, fileName);

    const currentContent = readTextIfExists(filePath) || this.getTemplateCollectionContent();
    const updatedContent = githubApi.addVFXSystemToCollection(currentContent, uploadPreparation, metadata);
    fs.writeFileSync(filePath, updatedContent, 'utf8');

    let uploadedAssets = 0;
    for (const asset of assets) {
      if (!asset?.exists || !asset?.resolvedPath || !asset?.vfxHubFilename) continue;
      if (!fs.existsSync(asset.resolvedPath)) continue;
      const outPath = path.join(assetsDir, asset.vfxHubFilename);
      fs.copyFileSync(asset.resolvedPath, outPath);
      uploadedAssets += 1;
    }

    return { success: true, uploadedAssets, totalAssets: assets.length };
  }

  async downloadVFXSystem(systemName, collectionFile) {
    const { vfxCollectionDir, assetsDir } = this.ensureStructure();
    const filePath = path.join(vfxCollectionDir, path.basename(collectionFile || ''));
    if (!fs.existsSync(filePath)) {
      throw new Error(`Collection file not found: ${collectionFile}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const systems = githubApi.parseVFXSystemsFromContent(content);
    const targetSystem = systems.find((entry) => entry.name === systemName);
    if (!targetSystem) throw new Error(`VFX system "${systemName}" not found`);

    const assets = (targetSystem.assets || [])
      .map((assetPath) => {
        const name = path.basename(assetPath);
        const localPath = path.join(assetsDir, name);
        return fs.existsSync(localPath)
          ? { name, path: localPath, localPath }
          : null;
      })
      .filter(Boolean);

    return {
      system: targetSystem,
      assets,
      pythonContent: targetSystem.fullContent || '',
    };
  }
}

const localHubService = new LocalHubService();
export default localHubService;
