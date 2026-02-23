#!/usr/bin/env node

/**
 * Sync version across package.json, tauri.conf.json, and Cargo.toml
 * Run: npm run sync-version
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read package.json version (source of truth)
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

if (!version) {
    console.error('❌ No version found in package.json');
    process.exit(1);
}

console.log(`📦 Syncing version: ${version}`);

// Update tauri.conf.json
const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
const oldTauriVersion = tauriConf.version;

if (tauriConf.version !== version) {
    tauriConf.version = version;
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log(`✅ Updated tauri.conf.json: ${oldTauriVersion} → ${version}`);
} else {
    console.log(`✓  tauri.conf.json already at ${version}`);
}

// Update Cargo.toml
const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');
let cargoToml = readFileSync(cargoTomlPath, 'utf8');
const versionRegex = /^version\s*=\s*"[\d.]+"/m;
const match = cargoToml.match(versionRegex);

if (match) {
    const oldCargoVersion = match[0].match(/"([\d.]+)"/)[1];
    if (oldCargoVersion !== version) {
        cargoToml = cargoToml.replace(versionRegex, `version = "${version}"`);
        writeFileSync(cargoTomlPath, cargoToml);
        console.log(`✅ Updated Cargo.toml: ${oldCargoVersion} → ${version}`);
    } else {
        console.log(`✓  Cargo.toml already at ${version}`);
    }
} else {
    console.error('❌ Could not find version in Cargo.toml');
    process.exit(1);
}

console.log(`\n🎉 All versions synced to ${version}`);
console.log('\nNext steps:');
console.log(`  1. git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
console.log(`  2. git commit -m "Bump version to ${version}"`);
console.log(`  3. git tag v${version}`);
console.log(`  4. git push origin v${version}`);
