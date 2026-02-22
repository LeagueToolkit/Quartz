// Canonical implementation lives in src/utils/wad/wadTool.js (included in Electron build).
// The renderer imports through here; the main process imports from src/utils/wad directly.
export { unpackWAD } from '../../../../utils/wad/wadTool.js';
