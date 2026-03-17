const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRequired(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required file: ${src}`);
  }
  fs.copyFileSync(src, dest);
}

function main() {
  const root = path.resolve(__dirname, '..');
  const sdkRoot = process.env.FBXSDK_ROOT || 'C:\\Program Files\\Autodesk\\FBX\\FBX SDK\\2020.3.9';
  const outDir = path.join(root, 'native', 'fbx_runtime');
  ensureDir(outDir);

  copyRequired(
    path.join(root, 'native', 'xps_fbx_bridge', 'build_release', 'xps_fbx_bridge.exe'),
    path.join(outDir, 'xps_fbx_bridge.exe')
  );
  copyRequired(
    path.join(root, 'native', 'pmx_fbx_bridge', 'build_release', 'pmx_fbx_bridge.exe'),
    path.join(outDir, 'pmx_fbx_bridge.exe')
  );
  copyRequired(
    path.join(sdkRoot, 'lib', 'x64', 'release', 'libfbxsdk.dll'),
    path.join(outDir, 'libfbxsdk.dll')
  );

  console.log(`Prepared FBX runtime payload in ${outDir}`);
}

try {
  main();
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
