#!/usr/bin/env node

/* Syncs the version from package.json (source of truth) into
   src-tauri/tauri.conf.json and src-tauri/Cargo.toml. Run: npm run sync-version */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

if (!version) {
    console.error('No version found in package.json');
    process.exit(1);
}

console.log(`Syncing version: ${version}`);

// tauri.conf.json
const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
if (tauriConf.version !== version) {
    const old = tauriConf.version;
    tauriConf.version = version;
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log(`tauri.conf.json: ${old} -> ${version}`);
} else {
    console.log(`tauri.conf.json already at ${version}`);
}

// Cargo.toml (first version key = the [package] version)
const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');
let cargoToml = readFileSync(cargoTomlPath, 'utf8');
const versionRegex = /^version\s*=\s*"[\d.]+"/m;
const match = cargoToml.match(versionRegex);

if (match) {
    const old = match[0].match(/"([\d.]+)"/)[1];
    if (old !== version) {
        cargoToml = cargoToml.replace(versionRegex, `version = "${version}"`);
        writeFileSync(cargoTomlPath, cargoToml);
        console.log(`Cargo.toml: ${old} -> ${version}`);
    } else {
        console.log(`Cargo.toml already at ${version}`);
    }
} else {
    console.error('Could not find version in Cargo.toml');
    process.exit(1);
}

console.log(`\nAll versions synced to ${version}`);
console.log('Next: commit, then `git tag v' + version + '` and `git push origin v' + version + '`');
