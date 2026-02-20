let cachedHashManager = null;

function loadHashManager({ app, path, baseDir, logToFile }) {
  if (cachedHashManager) return cachedHashManager;

  const pathsToTry = [
    './src/utils/io/hashManager',
    path.join(baseDir, 'src', 'utils', 'io', 'hashManager'),
    path.join(baseDir, 'src', 'utils', 'io', 'hashManager.js'),
  ];

  for (const modulePath of pathsToTry) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      cachedHashManager = require(modulePath);
      logToFile(`hashManager loaded from: ${modulePath}`, 'INFO');
      return cachedHashManager;
    } catch (_error) {
      // try next path
    }
  }

  if (app && typeof app.isReady === 'function' && app.isReady()) {
    try {
      const appPath = app.getAppPath();
      const hashManagerPath = path.join(appPath, 'src', 'utils', 'io', 'hashManager.js');
      // eslint-disable-next-line global-require, import/no-dynamic-require
      cachedHashManager = require(hashManagerPath);
      logToFile(`hashManager loaded from app path: ${hashManagerPath}`, 'INFO');
      return cachedHashManager;
    } catch (_error) {
      // fall through
    }
  }

  const errorMsg = 'Failed to load hashManager from all attempted paths';
  console.error(errorMsg);
  logToFile(errorMsg, 'ERROR');
  logToFile(`Tried paths: ${pathsToTry.join(', ')}`, 'ERROR');
  logToFile(`baseDir: ${baseDir}`, 'ERROR');
  if (app) {
    try {
      logToFile(`app.getAppPath(): ${app.getAppPath()}`, 'ERROR');
    } catch (_error) {
      // ignore
    }
  }

  return {
    checkHashes: () => ({ allPresent: false, missing: [], error: 'hashManager not loaded' }),
    downloadHashes: async () => ({ success: false, errors: ['hashManager not loaded'], downloaded: [] }),
    getHashDirectory: () => '',
  };
}

module.exports = { loadHashManager };

