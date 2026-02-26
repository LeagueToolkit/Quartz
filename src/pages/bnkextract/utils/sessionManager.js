const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
const os = window.require ? window.require('os') : null;

const getUserDataBasePath = () => {
    if (!path) return null;
    const proc = typeof process !== 'undefined' ? process : null;
    const env = proc?.env || {};
    const platform = proc?.platform || (os?.platform ? os.platform() : null);
    const home = env.HOME || env.USERPROFILE || (os?.homedir ? os.homedir() : null);

    if (!platform) return null;
    if (platform === 'win32') {
        return env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : null);
    }
    if (platform === 'darwin') {
        return home ? path.join(home, 'Library', 'Application Support') : null;
    }
    return env.XDG_DATA_HOME || (home ? path.join(home, '.local', 'share') : null);
};

const getSessionDirectory = () => {
    if (!path) return null;
    try {
        const userDataBasePath = getUserDataBasePath();
        if (!userDataBasePath) return null;
        return path.join(userDataBasePath, 'Quartz', 'bnk_sessions');
    } catch (e) {
        return null;
    }
};

export const getSessionDirectoryPath = () => getSessionDirectory();

const ensureSessionDirectory = () => {
    const sessionDir = getSessionDirectory();
    if (!fs || !sessionDir) return false;
    try {
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error('Error creating session directory:', error);
        return false;
    }
};

// Recursive function to serialize tree data, only saving audio data if it was modified
const serializeTree = (nodes, parentForceFull = false) => {
    if (!nodes) return null;
    return nodes.map(node => {
        // Strip heavy hidden caches that might have leaked into the tree state
        const {
            originalAudioFiles,
            originalAudioFilesMap,
            _binaryCache,
            audioFiles,
            ...cleanNode
        } = node;

        const newNode = { ...cleanNode };

        // A node needs a full save if:
        // 1. It's a root that has no rehydration source (e.g., a "Converted Files" group)
        // 2. Its parent was forced to full save (e.g., children of a converted group)
        const isRoot = newNode.isRoot;
        const hasSource = newNode.bnkPath || newNode.wpkPath || newNode.originalPath;
        const currentForceFull = parentForceFull || (isRoot && !hasSource);

        const hasAudioData = newNode.audioData?.data;
        // Modified = either manually flagged, OR it's a new file without a rehydration source
        const isModified = newNode.audioData?.isModified || newNode.isModified || currentForceFull;

        if (hasAudioData) {
            if (isModified) {
                // If modified/new, we MUST save the data (as base64)
                newNode.audioData = {
                    ...newNode.audioData,
                    data: Buffer.from(newNode.audioData.data).toString('base64')
                };
            } else {
                // If unmodified and rehydratable, we skip the data entirely
                newNode.audioData = {
                    ...newNode.audioData,
                    data: null // Rehydrated from original file on load
                };
            }
        }

        if (newNode.children && newNode.children.length > 0) {
            newNode.children = serializeTree(newNode.children, currentForceFull);
        }
        return newNode;
    });
};

// Recursive function to deserialize tree data, converting base64 back to Uint8Array
const deserializeTree = (nodes) => {
    if (!nodes) return null;
    return nodes.map(node => {
        const newNode = { ...node };
        if (newNode.audioData?.data && typeof newNode.audioData.data === 'string') {
            newNode.audioData = {
                ...newNode.audioData,
                data: new Uint8Array(Buffer.from(newNode.audioData.data, 'base64'))
            };
        }
        if (newNode.children) {
            newNode.children = deserializeTree(newNode.children);
        }
        return newNode;
    });
};

// Update or create the sessions index
const updateIndex = (metadata, isDelete = false) => {
    const sessionDir = getSessionDirectory();
    const indexPath = path.join(sessionDir, 'index.json');
    let index = [];
    try {
        if (fs.existsSync(indexPath)) {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to read session index:', e);
    }

    if (isDelete) {
        index = index.filter(s => s.filename !== metadata.filename);
    } else {
        // Remove existing entry with same filename if any
        index = index.filter(s => s.filename !== metadata.filename);
        index.unshift(metadata);
    }

    try {
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch (e) {
        console.error('Failed to write session index:', e);
    }
};

export const saveSession = (state, name) => {
    if (!ensureSessionDirectory()) {
        throw new Error('Could not create session directory');
    }

    const sessionDir = getSessionDirectory();
    const isAutoSave = name === 'AutoSave_Exit';
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Auto-save always uses the same fixed filename to prevent clutter and index bloat
    const filename = isAutoSave ? 'autosave_exit.json' : `${sanitizedName}_${Date.now()}.json`;
    const filepath = path.join(sessionDir, filename);

    const serializedState = {
        name: name,
        created: new Date().toISOString(),
        treeData: serializeTree(state.treeData),
        rightTreeData: serializeTree(state.rightTreeData),
        paths: {
            bnk: state.bnkPath,
            wpk: state.wpkPath,
            bin: state.binPath
        },
        viewMode: state.viewMode,
        activePane: state.activePane,
        isDelta: true // Flag to indicate this session uses optimized delta saving
    };

    try {
        fs.writeFileSync(filepath, JSON.stringify(serializedState));

        // Update index with metadata only
        updateIndex({
            name: name,
            created: serializedState.created,
            filename: filename,
            isAutoSave: isAutoSave
        });

        return { success: true, filename, filepath };
    } catch (error) {
        console.error('[SessionManager] Error saving session:', error);
        throw new Error(`Failed to save session: ${error.message}`);
    }
};

export const loadAllSessions = () => {
    const sessionDir = getSessionDirectory();
    if (!fs || !sessionDir || !fs.existsSync(sessionDir)) return [];

    const indexPath = path.join(sessionDir, 'index.json');
    if (fs.existsSync(indexPath)) {
        try {
            return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        } catch (e) {
            console.error('Failed to read session index:', e);
        }
    }

    // Fallback: Rebuild index if missing or corrupted
    try {
        const files = fs.readdirSync(sessionDir);
        const index = [];
        files.forEach(filename => {
            if (filename.endsWith('.json') && filename !== 'index.json') {
                try {
                    const filepath = path.join(sessionDir, filename);
                    const fileContent = fs.readFileSync(filepath, 'utf8');
                    const session = JSON.parse(fileContent);
                    index.push({
                        name: session.name,
                        created: session.created,
                        filename: filename,
                        isAutoSave: session.name === 'AutoSave_Exit'
                    });
                } catch (e) { }
            }
        });
        const sorted = index.sort((a, b) => new Date(b.created) - new Date(a.created));
        fs.writeFileSync(indexPath, JSON.stringify(sorted, null, 2));
        return sorted;
    } catch (error) {
        return [];
    }
};

export const loadSessionDetail = (filename) => {
    const sessionDir = getSessionDirectory();
    if (!fs || !sessionDir) return null;
    const filepath = path.join(sessionDir, filename);
    try {
        const fileContent = fs.readFileSync(filepath, 'utf8');
        const session = JSON.parse(fileContent);
        return {
            ...session,
            treeData: deserializeTree(session.treeData),
            rightTreeData: deserializeTree(session.rightTreeData)
        };
    } catch (error) {
        console.error(`[SessionManager] Error loading session detail ${filename}:`, error);
        return null;
    }
};

export const deleteSession = (filename) => {
    const sessionDir = getSessionDirectory();
    if (!fs || !sessionDir) return false;
    const filepath = path.join(sessionDir, filename);
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            updateIndex({ filename }, true);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting session:', error);
        throw new Error(`Failed to delete session: ${error.message}`);
    }
};
