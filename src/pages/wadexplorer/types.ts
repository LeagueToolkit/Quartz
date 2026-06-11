// Shared shapes for the WAD Explorer page tree.

export interface WadFileNode {
    type: 'file';
    name: string;
    path: string;
    pathHash: string;
    extension?: string | null;
    chunkId?: number;
    compressionType?: number | null;
    compressedSize?: number | null;
    decompressedSize?: number | null;
}

export interface WadDirNode {
    type: 'dir';
    name: string;
    path: string;
    children: WadTreeNode[];
}

export type WadTreeNode = WadFileNode | WadDirNode;

export interface SelectedNode {
    type: 'file' | 'dir';
    node: WadTreeNode;
    wadPath: string;
}

export interface RecentWad {
    name: string;
    path: string;
}

// A WAD found by scanning a game folder (or a single opened file).
export interface WadScanEntry {
    name: string;
    path: string;
    size?: number;
    isVoiceover?: boolean;
    isCustom?: boolean;
}

export type WadGroups = Record<string, WadScanEntry[]>;

export type WadLoadStatus = 'idle' | 'indexing' | 'indexed' | 'tree-loading' | 'loaded' | 'error';

export interface WadDataEntry {
    status: WadLoadStatus;
    paths: string[] | null;
    tree: WadTreeNode[] | null;
    chunkCount: number;
    hydrated: boolean;
    error?: string;
}

// A single extractable file resolved from the tree.
export interface ExtractItem {
    wadPath: string;
    pathHash: string;
    relPath: string;
}

// Flattened rows fed to the virtualized tree list.
export type FlatRow =
    | { type: 'group'; key: string; count: number; open: boolean }
    | ({ type: 'wad'; entry: WadScanEntry; displayName: string; open: boolean } & Partial<WadDataEntry>)
    | { type: 'wad-status'; wadPath: string; label?: string; isLoading?: boolean; isError?: boolean }
    | {
        type: 'dir';
        node: WadDirNode;
        depth: number;
        wadPath: string;
        expanded: boolean;
        hasChildren: boolean;
        compactParts?: string[];
    }
    | {
        type: 'file';
        node: WadFileNode;
        depth: number;
        wadPath: string;
        expanded: false;
        hasChildren: false;
    };

export interface ExtractSelectionState {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
}

export interface ContextTargetInfo {
    type: 'wad' | 'dir' | 'file';
    name: string;
    title: string;
}
