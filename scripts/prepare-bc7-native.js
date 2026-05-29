// Fetches Bc7Native.dll (DirectXTex BC7 GPU encoder) from the RitoShark
// Paint.NET Tex plugin release and places it in native/bc7_native/ so
// electron-builder can bundle it next to quartz_cli.exe. Idempotent: skips the
// download if the DLL is already present. Windows-only (uses Expand-Archive),
// matching the rest of the native build.

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execFileSync } = require('child_process');

const RELEASE_ZIP_URL =
  'https://github.com/RitoShark/Paint.NET-Tex-Plugin/releases/download/3.0/TexFileType-3.0.0.zip';
const DLL_NAME = 'Bc7Native.dll';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'quartz-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on('finish', () => f.close(resolve));
        f.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'native', 'bc7_native');
  const outDll = path.join(outDir, DLL_NAME);
  fs.mkdirSync(outDir, { recursive: true });

  if (fs.existsSync(outDll) && fs.statSync(outDll).size > 0) {
    console.log(`Bc7Native.dll already present: ${outDll}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc7-native-'));
  const zipPath = path.join(tmpDir, 'plugin.zip');
  console.log('Downloading Bc7Native.dll from plugin release...');
  await download(RELEASE_ZIP_URL, zipPath);

  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force`,
    ],
    { stdio: 'inherit' }
  );

  const extracted = path.join(tmpDir, DLL_NAME);
  if (!fs.existsSync(extracted)) {
    throw new Error(`${DLL_NAME} not found inside the release zip`);
  }
  fs.copyFileSync(extracted, outDll);
  console.log(`Prepared ${outDll}`);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
