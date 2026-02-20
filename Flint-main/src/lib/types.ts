/**
 * Flint - TypeScript Type Definitions
 */

// =============================================================================
// Application State Types
// =============================================================================

export type AppStatus = 'ready' | 'working' | 'error';
export type ModalType = 'newProject' | 'settings' | 'export' | 'firstTimeSetup' | 'updateAvailable' | 'recolor' | 'checkpoint' | null;
export type ViewType = 'welcome' | 'preview' | 'editor' | 'project' | 'checkpoints' | 'extract' | 'wad-explorer';

export interface Toast {
    id: number;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    suggestion?: string | null;
    timestamp: number;
}

export interface LogEntry {
    id: number;
    timestamp: number;
    level: 'info' | 'warning' | 'error';
    message: string;
}

export interface RecentProject {
    name: string;
    champion: string;
    skin: number;
    path: string;
    lastOpened: string;
}

export interface FileTreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileTreeNode[];
}

export interface Project {
    name: string;
    display_name?: string;
    champion: string;
    skin_id: number;
    creator?: string;
    version?: string;
    description?: string;
    project_path?: string;
}

export interface Champion {
    id: string;
    name: string;
    skins: Skin[];
}

export interface Skin {
    id: number;
    name: string;
    chromas?: Chroma[];
}

export interface Chroma {
    id: number;
    name: string;
}

export interface ContextMenuState {
    x: number;
    y: number;
    options: ContextMenuOption[];
}

export interface ContextMenuOption {
    label: string;
    icon?: string;
    onClick: () => void;
    danger?: boolean;
}

export interface ProjectTab {
    id: string;
    project: Project;
    projectPath: string;
    selectedFile: string | null;
    fileTree: FileTreeNode | null;
    expandedFolders: Set<string>;
}

export interface WadChunk {
    hash: string;        // hex string e.g. "0x1a2b3c4d5e6f7a8b"
    path: string | null; // resolved path, null if hash is unknown
    size: number;
}

export interface ExtractSession {
    id: string;
    wadPath: string;
    wadName: string;              // basename of WAD for display in TabBar
    chunks: WadChunk[];
    selectedHashes: Set<string>;  // hashes checked for bulk extract
    previewHash: string | null;   // hash of the file currently being previewed
    expandedFolders: Set<string>;
    searchQuery: string;
    loading: boolean;
}

/** A WAD file discovered while scanning a game installation */
export interface GameWadInfo {
    /** Absolute path to the .wad.client file */
    path: string;
    /** Filename e.g. "Aatrox.wad.client" */
    name: string;
    /** Parent directory used as display group e.g. "Champions" */
    category: string;
}

// =============================================================================
// WAD Explorer (VFS) Types
// =============================================================================

/** A WAD file entry in the unified VFS — chunks are loaded lazily on expand */
export interface WadExplorerWad {
    path: string;
    name: string;
    category: string;
    /** 'idle' = not yet fetched | 'loading' = fetch in progress | 'loaded' | 'error' */
    status: 'idle' | 'loading' | 'loaded' | 'error';
    chunks: WadChunk[];
    error?: string;
}

export interface WadExplorerState {
    isOpen: boolean;
    wads: WadExplorerWad[];
    scanStatus: 'idle' | 'scanning' | 'ready' | 'error';
    scanError: string | null;
    /** The currently-previewed chunk */
    selected: { wadPath: string; hash: string } | null;
    /** Set of wad paths that are expanded in the tree */
    expandedWads: Set<string>;
    /** Set of `${wadPath}::${folderPath}` keys for expanded sub-folders */
    expandedFolders: Set<string>;
    searchQuery: string;
}

export interface AppState {
    // App status
    status: AppStatus;
    statusMessage: string;

    // Creator info (for repathing)
    creatorName: string | null;

    // Hash status
    hashesLoaded: boolean;
    hashCount: number;

    // League installation
    leaguePath: string | null;

    // Project state (tab-based)
    openTabs: ProjectTab[];
    activeTabId: string | null;
    recentProjects: RecentProject[];

    // WAD extract sessions
    extractSessions: ExtractSession[];
    activeExtractId: string | null;

    // WAD Explorer (unified VFS)
    wadExplorer: WadExplorerState;

    // UI state
    currentView: ViewType;
    activeModal: ModalType;
    modalOptions: Record<string, unknown> | null;

    // Champions (cached)
    champions: Champion[];
    championsLoaded: boolean;

    // Toast notifications
    toasts: Toast[];

    // Log panel
    logs: LogEntry[];
    logPanelExpanded: boolean;

    // Context menu
    contextMenu: ContextMenuState | null;

    // Skipped update version (persisted)
    skippedUpdateVersion: string | null;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface HashStatus {
    loaded_count: number;
}

export interface LeagueDetectResult {
    path: string | null;
}

export interface ExportProgress {
    stage: string;
    current: number;
    total: number;
}

export interface UpdateInfo {
    available: boolean;
    current_version: string;
    latest_version: string;
    release_notes: string;
    download_url: string;
    published_at: string;
}

// =============================================================================
// Checkpoint Types
// =============================================================================

export type AssetType = 'Texture' | 'Model' | 'Animation' | 'Bin' | 'Audio' | 'Data' | 'Unknown';

export interface FileEntry {
    path: string;
    hash: string;
    size: number;
    asset_type: AssetType;
}

export interface Checkpoint {
    id: string;
    timestamp: string; // ISO 8601
    message: string;
    author?: string;
    tags: string[];
    file_manifest: Record<string, FileEntry>;
}

export interface CheckpointDiff {
    added: FileEntry[];
    modified: [FileEntry, FileEntry][];
    deleted: FileEntry[];
}

export interface CheckpointProgress {
    phase: string;
    current: number;
    total: number;
}

export type CheckpointFileContent =
    | { type: 'image'; data: string; width: number; height: number }
    | { type: 'text'; data: string }
    | { type: 'binary'; size: number };

export interface DownloadProgress {
    downloaded: number;
    total: number;
}
