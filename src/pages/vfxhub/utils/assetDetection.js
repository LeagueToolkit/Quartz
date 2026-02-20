const path = window.require ? window.require('path') : null;
const fs = window.require ? window.require('fs') : null;

/**
 * Find the project root by walking up from a start path and finding
 * the first parent that contains a data folder.
 *
 * Rule:
 * - stop at the first directory containing data/DATA
 * - do not use assets-only fallbacks
 * - return null if no data root is found
 */
export const findProjectRoot = (startPath) => {
  if (!path || !fs || !startPath) return null;

  let currentPath = startPath;
  while (currentPath && currentPath !== path.dirname(currentPath)) {
    const hasDataFolder =
      fs.existsSync(path.join(currentPath, 'data')) ||
      fs.existsSync(path.join(currentPath, 'DATA'));

    if (hasDataFolder) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }
  return null;
};

export default findProjectRoot;
