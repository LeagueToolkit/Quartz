const nodeFs = window.require ? window.require('fs') : null;
const nodePath = window.require ? window.require('path') : null;

export function resolvePyPathFromBinOrPy(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return null;
  if (/\.py$/i.test(sourcePath)) return sourcePath;
  if (/\.bin$/i.test(sourcePath)) return sourcePath.replace(/\.bin$/i, '.py');
  if (!nodePath) return null;

  const dir = nodePath.dirname(sourcePath);
  const base = nodePath.basename(sourcePath, nodePath.extname(sourcePath));
  return nodePath.join(dir, `${base}.py`);
}

export function deleteParsedPyForPath(sourcePath) {
  if (!nodeFs) return false;

  const pyPath = resolvePyPathFromBinOrPy(sourcePath);
  if (!pyPath) return false;
  if (!nodeFs.existsSync(pyPath)) return false;

  nodeFs.unlinkSync(pyPath);
  return true;
}

export async function reparseBinWithFreshPy({ sourcePath, reparseFn, logPrefix = '[RitoBin]' }) {
  if (!sourcePath || typeof reparseFn !== 'function') return false;

  try {
    deleteParsedPyForPath(sourcePath);
  } catch (error) {
    console.warn(`${logPrefix} Failed deleting .py before reparse:`, error);
  }

  await reparseFn(sourcePath);
  return true;
}
