#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { tryLoadNativeWadIndexer } = require('../src/main/ipc/channels/wadBumpath');

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function normalizeRelPathLower(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function normalizeLinkCandidate(linkValue) {
  const raw = normalizeRelPathLower(linkValue);
  if (!raw) return [];
  const candidates = [raw];
  if (!raw.endsWith('.bin')) candidates.push(`${raw}.bin`);
  return [...new Set(candidates)];
}

function toAbsFromRel(rootDir, relPathLower) {
  return path.join(rootDir, ...String(relPathLower || '').split('/'));
}

async function main() {
  const wadPath = getArg('wad');
  const hashPath = getArg('hash', '');
  const skinArg = getArg('skin', '0');
  const skinNum = Number(skinArg);

  if (!wadPath || !fs.existsSync(wadPath)) {
    throw new Error('Missing/invalid --wad path');
  }
  if (!Number.isFinite(skinNum) || skinNum < 0) {
    throw new Error('Invalid --skin value');
  }

  const nativeAddon = tryLoadNativeWadIndexer();
  if (!nativeAddon || typeof nativeAddon.extractSelectedAsync !== 'function') {
    throw new Error('Native addon extractSelectedAsync is required');
  }

  const jsRito = await import(pathToFileURL(path.resolve(__dirname, '../src/jsritofile/index.js')).href);
  const { WAD, BIN, loadHashtables } = jsRito;

  let binHashtables = null;
  if (hashPath && fs.existsSync(hashPath)) {
    try {
      binHashtables = await loadHashtables(hashPath, {
        tables: ['hashes.binentries.txt', 'hashes.binhashes.txt', 'hashes.bintypes.txt', 'hashes.binfields.txt'],
      });
      console.log('[debug] Loaded BIN hashtables');
    } catch (e) {
      console.warn('[debug] Failed to load BIN hashtables:', e.message);
    }
  }

  const fd = await fs.promises.open(wadPath, 'r');
  let wad;
  try {
    const stat = await fd.stat();
    const tocSize = Math.min(4 * 1024 * 1024, stat.size);
    const tocBuffer = Buffer.alloc(tocSize);
    const { bytesRead } = await fd.read(tocBuffer, 0, tocSize, 0);
    const buf = bytesRead < tocSize ? tocBuffer.subarray(0, bytesRead) : tocBuffer;
    wad = await new WAD().read(buf);
  } finally {
    await fd.close().catch(() => { });
  }

  for (const chunk of wad.chunks) {
    if (!chunk.path_hash_hex) chunk.path_hash_hex = chunk.hash;
  }

  if (hashPath && fs.existsSync(hashPath) && typeof nativeAddon.resolveHashes === 'function') {
    const resolved = nativeAddon.resolveHashes(wad.chunks.map(c => c.hash), hashPath);
    for (let i = 0; i < wad.chunks.length; i++) {
      const r = resolved?.[i];
      if (r && r !== wad.chunks[i].hash) wad.chunks[i].hash = r;
    }
  } else {
    console.warn('[debug] hash path missing or resolveHashes unavailable; running with unresolved TOC paths');
  }

  const chunkByPath = new Map();
  const chunkByPathHashHex = new Map();
  for (const chunk of wad.chunks) {
    const relPath = normalizeRelPathLower(chunk.hash);
    if (!relPath || chunkByPath.has(relPath)) continue;
    const hashHex = String(chunk.path_hash_hex || '').toLowerCase();
    chunkByPath.set(relPath, {
      relPath,
      pathHashHex: hashHex,
    });
    if (/^[0-9a-f]{16}$/i.test(hashHex) && !chunkByPathHashHex.has(hashHex)) {
      chunkByPathHashHex.set(hashHex, relPath);
    }
  }

  const championFileName = path.basename(wadPath).replace(/\.wad\.client$/i, '').toLowerCase();
  const candidateMainBins = [
    `assets/characters/${championFileName}/skins/skin${skinNum}.bin`,
    `assets/characters/${championFileName}/skins/skin${String(skinNum).padStart(2, '0')}.bin`,
    `data/characters/${championFileName}/skins/skin${skinNum}.bin`,
    `data/characters/${championFileName}/skins/skin${String(skinNum).padStart(2, '0')}.bin`,
  ].map(normalizeRelPathLower);
  const mainBinPath = candidateMainBins.find(p => chunkByPath.has(p));
  if (!mainBinPath) {
    throw new Error(`Main skin BIN not found for ${championFileName} skin ${skinNum}`);
  }

  const tempRoot = path.join(os.tmpdir(), 'Quartz', 'debug-linked-bins', `${championFileName}_skin${skinNum}_${Date.now()}`);
  fs.mkdirSync(tempRoot, { recursive: true });
  console.log('[debug] tempRoot:', tempRoot);
  console.log('[debug] mainBin:', mainBinPath);

  const unresolved = [];
  const resolvedByHash = [];
  const resolvedDirect = [];

  const resolveLinkedBinPath = (linkValue) => {
    for (const candidate of normalizeLinkCandidate(linkValue)) {
      if (chunkByPath.has(candidate)) return { relPath: candidate, via: 'direct' };
    }
    const rawNorm = normalizeRelPathLower(linkValue);
    const hashLike = rawNorm.replace(/\.bin$/i, '');
    if (/^[0-9a-f]{16}$/i.test(hashLike)) {
      const mapped = chunkByPathHashHex.get(hashLike);
      if (mapped) return { relPath: mapped, via: 'hash-map' };
      const withExt = `${hashLike}.bin`;
      if (chunkByPath.has(withExt)) return { relPath: withExt, via: 'hash-ext' };
    }
    return null;
  };

  const runExtractOne = async (relPath) => {
    const info = chunkByPath.get(relPath);
    if (!info) return false;
    if (!/^[0-9a-f]{16}$/i.test(info.pathHashHex || '')) return false;
    const r = await nativeAddon.extractSelectedAsync([{
      wadPath,
      pathHash: info.pathHashHex,
      relPath: info.relPath,
    }], tempRoot, true, true);
    if (r?.error) throw new Error(r.error);
    return true;
  };

  const selected = new Set([mainBinPath]);
  const parsed = new Set();
  const queue = [mainBinPath];

  while (queue.length > 0) {
    const relPath = queue.shift();
    if (parsed.has(relPath)) continue;
    parsed.add(relPath);
    await runExtractOne(relPath);
    const abs = toAbsFromRel(tempRoot, relPath);
    if (!fs.existsSync(abs)) continue;

    let binObj;
    try {
      const raw = await fs.promises.readFile(abs);
      binObj = await new BIN().read(raw, binHashtables);
    } catch (e) {
      console.warn('[debug] Failed to parse BIN:', relPath, e.message);
      continue;
    }

    const links = Array.isArray(binObj?.links) ? binObj.links : [];
    for (const link of links) {
      const resolved = resolveLinkedBinPath(link);
      if (!resolved) {
        unresolved.push({ from: relPath, link: String(link || '') });
        continue;
      }
      if (!resolved.relPath.endsWith('.bin')) continue;
      if (resolved.via === 'hash-map' || resolved.via === 'hash-ext') {
        resolvedByHash.push({ from: relPath, link: String(link || ''), to: resolved.relPath, via: resolved.via });
      } else {
        resolvedDirect.push({ from: relPath, link: String(link || ''), to: resolved.relPath });
      }
      if (!selected.has(resolved.relPath)) {
        selected.add(resolved.relPath);
        queue.push(resolved.relPath);
      }
    }
  }

  const unresolvedUnique = new Map();
  for (const it of unresolved) {
    const key = normalizeRelPathLower(it.link);
    if (!unresolvedUnique.has(key)) unresolvedUnique.set(key, it);
  }

  console.log('\n=== Summary ===');
  console.log('Selected BIN graph size:', selected.size);
  console.log('Resolved direct links:', resolvedDirect.length);
  console.log('Resolved hash links:', resolvedByHash.length);
  console.log('Unresolved links:', unresolved.length, 'unique:', unresolvedUnique.size);

  const unresolvedSample = Array.from(unresolvedUnique.values()).slice(0, 80);
  if (unresolvedSample.length > 0) {
    console.log('\n=== Unresolved Link Sample ===');
    for (const row of unresolvedSample) {
      console.log(`FROM=${row.from}`);
      console.log(`  LINK=${row.link}`);
    }
  }

  console.log('\n[debug] done');
}

main().catch((e) => {
  console.error('[debug] failed:', e);
  process.exitCode = 1;
});

