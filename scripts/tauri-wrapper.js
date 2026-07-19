#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tauriCliEntrypoint = join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const releaseBundleScript = join(__dirname, 'generate-release-bundle.js');
const tauriConfigPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const args = process.argv.slice(2);

function runNodeScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Process exited with signal ${signal}`));
        return;
      }

      resolve(code ?? 0);
    });
  });
}

function getPrimaryCommand(cliArgs) {
  return cliArgs.find((arg) => !arg.startsWith('-')) || '';
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function shouldSkipPreflight(cliArgs) {
  return cliArgs.includes('--help') || cliArgs.includes('-h');
}

function needsUpdaterSigning(config) {
  return Boolean(
    config?.bundle?.createUpdaterArtifacts &&
    config?.plugins?.updater?.pubkey
  );
}

function decodeMaybeBase64(value) {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function isEncryptedPrivateKey(keyValue) {
  const decoded = decodeMaybeBase64(String(keyValue || '').trim());
  return decoded.includes('encrypted secret key');
}

function ensureUpdaterSigningEnv() {
  const tauriConfig = readJson(tauriConfigPath);
  if (!needsUpdaterSigning(tauriConfig)) {
    return;
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    const defaultKeyPath =
      process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ||
      join(homedir(), '.tauri', 'quartz.key');

    if (existsSync(defaultKeyPath)) {
      const loadedKey = readFileSync(defaultKeyPath, 'utf8').trim();
      if (loadedKey) {
        process.env.TAURI_SIGNING_PRIVATE_KEY = loadedKey;
        console.log(`[tauri-wrapper] Auto-loaded updater private key from ${defaultKeyPath}`);
      }
    }
  }

  const privateKey = String(process.env.TAURI_SIGNING_PRIVATE_KEY || '').trim();
  if (!privateKey) {
    throw new Error(
      'Updater signing is enabled, but no private key is loaded. Set TAURI_SIGNING_PRIVATE_KEY or place your key at %USERPROFILE%\\.tauri\\quartz.key before building.'
    );
  }

  if (isEncryptedPrivateKey(privateKey) && !String(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '').trim()) {
    throw new Error(
      'Your updater private key is encrypted, but TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. Set the password env var before building, or generate a passwordless key if that is what you want.'
    );
  }
}

async function main() {
  const command = getPrimaryCommand(args);
  const isBuildCommand = command === 'build' && !shouldSkipPreflight(args);

  if (isBuildCommand) {
    ensureUpdaterSigningEnv();
  }

  const tauriExitCode = await runNodeScript(tauriCliEntrypoint, args);

  if (tauriExitCode !== 0) {
    process.exit(tauriExitCode);
  }

  const shouldBundleRelease = isBuildCommand;

  if (!shouldBundleRelease) {
    return;
  }

  console.log('[tauri-wrapper] Build succeeded. Generating updater release bundle...');
  const bundleExitCode = await runNodeScript(releaseBundleScript);
  process.exit(bundleExitCode);
}

main().catch((error) => {
  console.error(`[tauri-wrapper] ${error.message}`);
  process.exit(1);
});
