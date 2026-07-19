import type { ScannedWad, WadExplorerEntry, WadExplorerIndex } from '@/lib/api/wad';

export interface WadFileNode extends WadExplorerEntry {
    kind: 'file';
    name: string;
    extension: string;
}

export interface WadDirectoryNode {
    kind: 'directory';
    name: string;
    path: string;
    children: WadNode[];
}

export type WadNode = WadFileNode | WadDirectoryNode;

export interface WadRuntimeState {
    status: 'idle' | 'indexing' | 'indexed' | 'loading' | 'loaded' | 'error';
    index?: WadExplorerIndex;
    entries?: WadExplorerEntry[];
    tree?: WadNode[];
    error?: string;
}

export interface SelectedWadNode {
    wad: ScannedWad;
    node: WadNode;
}

export type WadTreeRow =
    | { kind: 'group'; key: string; count: number; open: boolean }
    | { kind: 'wad'; wad: ScannedWad; open: boolean; state: WadRuntimeState }
    | { kind: 'status'; wad: ScannedWad; label: string; error?: boolean }
    | { kind: 'directory'; wad: ScannedWad; node: WadDirectoryNode; depth: number; open: boolean }
    | { kind: 'file'; wad: ScannedWad; node: WadFileNode; depth: number };

