#!/usr/bin/env node
/**
 * sync-version.mjs
 *
 * Single source of truth: package.json "version"
 * Run:  npm run sync-version
 *
 * Updates:
 *   - src-tauri/tauri.conf.json  → "version"
 *   - src-tauri/Cargo.toml       → version = "..."
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Read version from package.json ──────────────────────────────────────────
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`Syncing version → ${version}`);

// ── tauri.conf.json ──────────────────────────────────────────────────────────
const tauriConfPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
const prevTauri = tauriConf.version;
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`  tauri.conf.json  ${prevTauri} → ${version}`);

// ── Cargo.toml ───────────────────────────────────────────────────────────────
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
const cargoVersionRe = /^(version\s*=\s*)"[^"]*"/m;
const match = cargo.match(cargoVersionRe);
const prevCargo = match ? match[0].match(/"([^"]*)"/)[1] : '?';
cargo = cargo.replace(cargoVersionRe, `$1"${version}"`);
writeFileSync(cargoPath, cargo);
console.log(`  Cargo.toml       ${prevCargo} → ${version}`);

console.log('Done.');
