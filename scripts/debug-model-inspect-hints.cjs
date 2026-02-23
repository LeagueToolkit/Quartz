const fs = require('fs');
const path = require('path');

const { discoverMaterialTextureHints } = require('../src/main/ipc/channels/modelInspect.js');

const args = process.argv.slice(2);
const argMap = new Map();
for (let i = 0; i < args.length; i++) {
  const token = args[i];
  if (token.startsWith('--')) {
    const key = token.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    argMap.set(key, value);
  }
}

const filesDir = path.resolve(argMap.get('filesDir') || process.cwd());
const hashPath = path.resolve(
  argMap.get('hashPath') || 'C:\\Users\\Frog\\AppData\\Roaming\\FrogTools\\hashes'
);

const printUsageAndExit = () => {
  console.log('Usage: node scripts/debug-model-inspect-hints.cjs --filesDir <dir> [--hashPath <dir>]');
  process.exit(1);
};

if (!fs.existsSync(filesDir)) {
  console.error(`[debug] filesDir does not exist: ${filesDir}`);
  printUsageAndExit();
}
if (!fs.existsSync(hashPath)) {
  console.error(`[debug] hashPath does not exist: ${hashPath}`);
  printUsageAndExit();
}

const loadBinModule = async () => import('../src/jsritofile/bin.js');
const loadBinHasherModule = async () => import('../src/jsritofile/binHasher.js');
const loadWadHasherModule = async () => import('../src/jsritofile/wadHasher.js');
const loadJsRitoModule = async () => import('../src/jsritofile/bin.js');

const toTypeName = (valueType) => {
  switch (valueType) {
    case 16: return 'STRING';
    case 17: return 'HASH';
    case 18: return 'FILE';
    case 128: return 'LIST';
    case 129: return 'LIST2';
    case 131: return 'EMBED';
    case 132: return 'LINK';
    default: return String(valueType);
  }
};

async function loadHashtables(hashDir, includeWadTables) {
  const { loadHashtables } = await loadJsRitoModule();
  const tables = [
    'hashes.binentries.txt',
    'hashes.binhashes.txt',
    'hashes.bintypes.txt',
    'hashes.binfields.txt',
  ];
  if (includeWadTables) {
    tables.unshift('hashes.game.txt', 'hashes.lcu.txt');
  }
  return loadHashtables(hashDir, {
    tables,
  });
}

async function dumpBinStructure({ filesDir: rootDir, hashtables }) {
  const binFiles = fs.readdirSync(rootDir)
    .filter((name) => name.toLowerCase().endsWith('.bin'))
    .map((name) => path.join(rootDir, name));
  if (!binFiles.length) {
    console.log('[debug] no .bin files found in filesDir');
    return;
  }

  const { BIN } = await loadBinModule();
  const { BINHasher } = await loadBinHasherModule();

  const resolve = (hex) => String(BINHasher.hexToRaw(hashtables, hex) || hex);
  const fieldMatch = (name, expected) => {
    const n = String(name || '').toLowerCase();
    return n === expected || n.endsWith(`/${expected}`);
  };

  for (const binPath of binFiles) {
    console.log(`\n=== BIN: ${binPath} ===`);
    const bin = await new BIN().read(binPath, hashtables);
    console.log(`[debug] entries: ${bin.entries.length}`);

    for (const entry of bin.entries) {
      const entryType = resolve(entry.type);
      const entryName = resolve(entry.hash);
      let hasInteresting = false;
      let materialOverrideField = null;
      let samplerValuesField = null;

      for (const f of entry.data || []) {
        const fieldName = resolve(f.hash);
        if (fieldMatch(fieldName, 'materialoverride')) {
          hasInteresting = true;
          materialOverrideField = f;
        }
        if (fieldMatch(fieldName, 'samplervalues')) {
          hasInteresting = true;
          samplerValuesField = f;
        }
      }
      if (!hasInteresting) continue;

      console.log(`\n[entry] type=${entryType} hash=${entryName}`);
      if (materialOverrideField) {
        console.log(`[materialOverride] type=${toTypeName(materialOverrideField.type)} items=${(materialOverrideField.data || []).length}`);
        for (const item of materialOverrideField.data || []) {
          const fields = Array.isArray(item?.data) ? item.data : [];
          let submesh = '';
          let material = '';
          for (const child of fields) {
            const childName = resolve(child.hash);
            if (fieldMatch(childName, 'submesh') && child.type === 16) submesh = String(child.data || '');
            if (fieldMatch(childName, 'material')) material = String(resolve(child.data || ''));
          }
          console.log(`  - submesh="${submesh}" material="${material}"`);
        }
      }

      if (samplerValuesField) {
        console.log(`[samplerValues] type=${toTypeName(samplerValuesField.type)} items=${(samplerValuesField.data || []).length}`);
        for (const item of samplerValuesField.data || []) {
          const fields = Array.isArray(item?.data) ? item.data : [];
          let textureName = '';
          let texturePath = '';
          for (const child of fields) {
            const childName = resolve(child.hash);
            if (fieldMatch(childName, 'texturename') && child.type === 16) textureName = String(child.data || '');
            if (fieldMatch(childName, 'texturepath')) {
              if (child.type === 16) texturePath = String(child.data || '');
              if (child.type === 18) texturePath = String(resolve(child.data || ''));
            }
          }
          if (textureName || texturePath) {
            console.log(`  - TextureName="${textureName}" texturePath="${texturePath}"`);
          }
        }
      }
    }
  }
}

(async () => {
  console.log(`[debug] filesDir = ${filesDir}`);
  console.log(`[debug] hashPath = ${hashPath}`);
  const includeWadTables = String(argMap.get('includeWad') || 'false').toLowerCase() === 'true';
  console.log(`[debug] includeWadTables = ${includeWadTables}`);
  console.log('[debug] loading hashtables...');
  const hashtables = await loadHashtables(hashPath, includeWadTables);
  console.log('[debug] hashtables loaded');
  const tableCounts = Object.fromEntries(Object.entries(hashtables).map(([k, v]) => [k, Object.keys(v || {}).length]));
  console.log('[debug] loaded hash tables:', tableCounts);

  const result = await discoverMaterialTextureHints({
    fs,
    filesDir,
    hashtables,
    loadBinModule,
    loadBinHasherModule,
    loadWadHasherModule,
  });

  console.log('\n=== discoverMaterialTextureHints result ===');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n=== BIN structure dump (materialOverride/samplerValues) ===');
  await dumpBinStructure({ filesDir, hashtables });
})().catch((error) => {
  console.error('[debug] failed:', error);
  process.exit(1);
});
