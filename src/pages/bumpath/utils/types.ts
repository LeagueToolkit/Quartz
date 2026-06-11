/* Shared data shapes for the Bumpath UI. These mirror the structures the
   original Electron BumpathCore produced so the panels/hooks stay 1:1. */

export interface ReferencedFile {
    path: string;
    exists: boolean;
    unify_file?: string;
}

export interface ScannedEntry {
    name: string;
    type_name?: string;
    prefix: string;
    referenced_files: ReferencedFile[];
}

export interface ScannedData {
    entries: Record<string, ScannedEntry>;
    all_bins?: Record<string, unknown>;
}

export interface SourceBin {
    path?: string;
    rel_path?: string;
    selected: boolean;
}

export type SourceBins = Record<string, SourceBin>;

export interface QuickBinOption {
    value: string;
    label: string;
}
