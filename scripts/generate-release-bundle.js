#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const packageJsonPath = join(rootDir, 'package.json');
const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const nsisDir = join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const rootLatestJsonPath = join(rootDir, 'latest.json');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseGithubRepoFromEndpoint(endpoint) {
  const match = String(endpoint || '').match(/github\.com\/([^/]+)\/([^/]+)\/releases\//i);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function getReleaseBaseUrl(tauriConf, version) {
  const envBaseUrl = process.env.TAURI_RELEASE_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/, '');
  }

  const endpoint = tauriConf?.plugins?.updater?.endpoints?.[0];
  const repo = parseGithubRepoFromEndpoint(endpoint);
  if (!repo) {
    throw new Error(
      'Could not infer the GitHub release URL from tauri.conf.json. Set TAURI_RELEASE_BASE_URL to continue.'
    );
  }

  const tag = process.env.TAURI_RELEASE_TAG?.trim() || `v${version}`;
  return `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}`;
}

function detectArchKey(installerName) {
  const match = installerName.match(/_(x64|x86|arm64)-setup\.exe$/i);
  const token = match?.[1]?.toLowerCase();

  switch (token) {
    case 'x86':
      return 'i686';
    case 'arm64':
      return 'aarch64';
    case 'x64':
    default:
      return 'x86_64';
  }
}

function parseVersionFromInstallerName(installerName) {
  const match = installerName.match(/_(\d+\.\d+\.\d+(?:-[^_]+)?)_/);
  return match?.[1] || null;
}

function findInstaller(version) {
  if (!existsSync(nsisDir)) {
    throw new Error(`NSIS bundle folder not found: ${nsisDir}`);
  }

  const installers = readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => ({
      name,
      path: join(nsisDir, name),
      sigPath: join(nsisDir, `${name}.sig`),
      stat: statSync(join(nsisDir, name)),
      version: parseVersionFromInstallerName(name),
    }))
    .filter((entry) => existsSync(entry.sigPath))
    .sort((a, b) => {
      const aVersionMatch = a.version === version ? 1 : 0;
      const bVersionMatch = b.version === version ? 1 : 0;
      if (aVersionMatch !== bVersionMatch) {
        return bVersionMatch - aVersionMatch;
      }

      return b.stat.mtimeMs - a.stat.mtimeMs;
    });

  if (!installers.length) {
    throw new Error(`No signed NSIS installer was found in ${nsisDir}`);
  }

  return installers[0];
}

function loadExistingNotes(version) {
  if (!existsSync(rootLatestJsonPath)) {
    return undefined;
  }

  try {
    const existing = readJson(rootLatestJsonPath);
    if (existing.version === version && typeof existing.notes === 'string' && existing.notes.trim()) {
      return existing.notes;
    }
  } catch {
    // Ignore stale or partially edited manifests and regenerate from scratch.
  }

  return undefined;
}

function main() {
  const packageJson = readJson(packageJsonPath);
  const tauriConf = readJson(tauriConfPath);
  const version = String(tauriConf.version || '').trim();

  if (!version) {
    throw new Error('No version found in src-tauri/tauri.conf.json');
  }

  if (packageJson.version && packageJson.version !== version) {
    console.warn(
      `[release-bundle] Warning: package.json version (${packageJson.version}) does not match tauri.conf.json version (${version}).`
    );
  }

  const installer = findInstaller(version);
  const signature = readFileSync(installer.sigPath, 'utf8').trim();
  const archKey = detectArchKey(installer.name);
  const releaseBaseUrl = getReleaseBaseUrl(tauriConf, version);
  const releaseUrl = `${releaseBaseUrl}/${installer.name}`;
  const pubDate = process.env.TAURI_RELEASE_DATE?.trim() || installer.stat.mtime.toISOString();
  const notes = process.env.TAURI_RELEASE_NOTES ?? loadExistingNotes(version);

  const latestManifest = {
    version,
    pub_date: pubDate,
    platforms: {
      [`windows-${archKey}-nsis`]: {
        signature,
        url: releaseUrl,
      },
      [`windows-${archKey}`]: {
        signature,
        url: releaseUrl,
      },
    },
  };

  if (typeof notes === 'string') {
    latestManifest.notes = notes;
  }

  const releaseTag = process.env.TAURI_RELEASE_TAG?.trim() || `v${version}`;
  const releaseAssetsDir = join(
    rootDir,
    'src-tauri',
    'target',
    'release',
    'bundle',
    'release-assets',
    releaseTag
  );
  const bundleLatestJsonPath = join(nsisDir, 'latest.json');
  const releaseLatestJsonPath = join(releaseAssetsDir, 'latest.json');

  mkdirSync(releaseAssetsDir, { recursive: true });

  writeJson(rootLatestJsonPath, latestManifest);
  writeJson(bundleLatestJsonPath, latestManifest);
  writeJson(releaseLatestJsonPath, latestManifest);

  copyFileSync(installer.path, join(releaseAssetsDir, installer.name));
  copyFileSync(installer.sigPath, join(releaseAssetsDir, `${installer.name}.sig`));

  console.log(`[release-bundle] Wrote ${rootLatestJsonPath}`);
  console.log(`[release-bundle] Wrote ${bundleLatestJsonPath}`);
  console.log(`[release-bundle] Prepared ${releaseAssetsDir}`);
  console.log(`[release-bundle] Upload these files from the release folder:`);
  console.log(`  - ${join(releaseAssetsDir, installer.name)}`);
  console.log(`  - ${join(releaseAssetsDir, `${installer.name}.sig`)}`);
  console.log(`  - ${releaseLatestJsonPath}`);
}

try {
  main();
} catch (error) {
  console.error(`[release-bundle] ${error.message}`);
  process.exit(1);
}
