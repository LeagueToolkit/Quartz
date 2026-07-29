/* Shared types for the ported BnkExtract page. The node shape mirrors the
   Electron Quartz tree (events/folders/audio leaves). audioData is null for
   structural nodes and present for playable WEM/WAV/OGG leaves. */

export type ViewMode = 'normal' | 'split';
export type Pane = 'left' | 'right';
export type SortMode = 'none' | 'name-asc' | 'name-desc';
export type ExtractFormat = 'wem' | 'wav' | 'ogg' | 'mp3';

export interface AudioData {
    id: number;
    data: Uint8Array;
    offset: number;
    length: number;
    isModified?: boolean;
}

export interface BnkNode {
    id: string;
    name: string;
    audioData?: AudioData | null;
    children?: BnkNode[];
    isRoot?: boolean;
    /** A folder the user created in the reference pane (not a loaded bank or an
     *  event/wem container from the parsed tree). Only these are valid
     *  "Add to Group" targets and drag-to-sort destinations. */
    isFolder?: boolean;
    isModified?: boolean;
    originalPath?: string;
    bnkPath?: string;
    wpkPath?: string;
    binPath?: string;
}

export interface ContextMenuState {
    mouseX: number;
    mouseY: number;
    /** Undefined when the menu was opened on empty pane space rather than a row. */
    node?: BnkNode;
    pane: Pane;
}

export interface LastSelected {
    id: string | null;
    pane: Pane;
}

export interface HistoryEntry {
    left: BnkNode[];
    right: BnkNode[];
    bytes: number;
}

export interface SessionState {
    treeData: BnkNode[];
    rightTreeData: BnkNode[];
    bnkPath: string;
    wpkPath: string;
    binPath: string;
    viewMode: ViewMode;
    activePane: Pane;
}

export interface SessionMeta {
    filename: string;
    name: string;
    created: number;
}

export interface ParseHistoryEntry {
    id: string;
    label: string;
    paths: { bin: string; wpk: string; bnk: string };
    timestamp: number;
}

export interface DroppedFile {
    path: string;
    name: string;
}

export interface SplitterFile {
    path?: string;
    name?: string;
    nodeId?: string;
    pane?: Pane;
    isWem?: boolean;
    /* Raw audio bytes (WEM/WAV/OGG) of the source node, when opened from the tree. */
    data?: Uint8Array;
}

export interface SplitterSegment {
    name: string;
    data: Uint8Array;
}

export interface ModFileSet {
    audio?: string;
    events?: string;
    bin?: string;
    type?: string | null;
    modFolderName?: string;
}

export interface AutoExtractRequest {
    batchFiles: ModFileSet[];
    outputPath: string | null;
    loadToTree: boolean;
    skinId?: string;
    /** Which tree the parsed banks load into. Defaults to the main (left) pane. */
    targetPane?: Pane;
}

export interface GameChampion {
    id: number;
    name: string;
    alias?: string;
}

export interface GameSkin {
    id: number;
    name: string;
    tilePath?: string | null;
}

export interface GameBanksSelection {
    champion: GameChampion | null;
    skinIds: number[];
}

export interface GameBanksConfirm {
    champion?: GameChampion | null;
    skinIds?: number[];
    selections?: GameBanksSelection[];
    includeVoiceover: boolean;
    includeSfx: boolean;
}
