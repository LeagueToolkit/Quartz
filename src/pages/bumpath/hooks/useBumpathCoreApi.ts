import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { bumpathRepath } from '@/lib/api/bumpath';
import type { ScannedData, SourceBins } from '../utils/types';

/* The original Electron build ran a client-side `BumpathCore` (jsritofile + fs)
   that enumerated source folders, parsed BINs, scanned referenced assets and
   wrote the repathed output entirely in the renderer. Under Tauri the same work
   is done server-side: `bumpath_enumerate_sources` lists the source BINs,
   `bumpath_scan_entries` previews their entries/assets, and `bumpath_repath`
   scans + repaths a whole folder in one shot.

   This hook keeps the original endpoint surface so the panels/hooks stay 1:1. */

export interface ApiResult {
    success: boolean;
    error?: string;
    source_files?: Record<string, unknown>;
    source_bins?: SourceBins;
    data?: ScannedData;
    total_files?: number;
    processedFiles?: number;
    output_dir?: string;
    warnings?: string[];
}

interface ApiCallData {
    sourceDirs?: string[];
    binSelections?: Record<string, boolean>;
    hashesPath?: string;
    entryHashes?: string[];
    prefix?: string;
    outputPath?: string;
    ignoreMissing?: boolean;
    combineLinked?: boolean;
    splitVfx?: boolean;
    consolidateAssets?: boolean;
    // The selected source folder(s) the real backend should repath.
    folders?: string[];
    // Skin ids to repath, parity with backend `selectedSkinIds`.
    selectedSkinIds?: number[];
    selectedBinPaths?: string[];
    entryPrefixes?: Record<string, string>;
}

interface UseBumpathCoreApiArgs {
    addLog: (message: string) => void;
}

export type BumpathApiCall = (endpoint: string, data?: ApiCallData) => Promise<ApiResult>;

export default function useBumpathCoreApi({ addLog }: UseBumpathCoreApiArgs): BumpathApiCall {
    return useCallback(async (endpoint: string, data: ApiCallData = {}): Promise<ApiResult> => {
        try {
            switch (endpoint) {
                case 'add-source-dirs': {
                    // Enumerate every .bin under the source folders, keyed by absolute path.
                    const result = await invoke<{
                        source_files: Record<string, unknown>;
                        source_bins: SourceBins;
                    }>('bumpath_enumerate_sources', {
                        folders: data.sourceDirs || [],
                    });
                    return {
                        success: true,
                        source_files: result.source_files || {},
                        source_bins: result.source_bins || {},
                    };
                }

                case 'update-bin-selection':
                    // Selection is tracked in component state; nothing to persist backend-side.
                    return { success: true };

                case 'scan': {
                    // Open the selected BINs and preview their entries + referenced assets.
                    const binPaths = Object.entries(data.binSelections || {})
                        .filter(([, selected]) => selected)
                        .map(([path]) => path);
                    if (binPaths.length === 0) {
                        return { success: true, data: { entries: {}, all_bins: {} } };
                    }
                    const data_ = await invoke<ScannedData>('bumpath_scan_entries', {
                        folders: data.folders || [],
                        binPaths,
                        hashesPath: data.hashesPath || null,
                    });
                    return { success: true, data: data_ };
                }

                case 'apply-prefix':
                    // Prefix application happens at process time via bumpath_repath.
                    return { success: true, data: { entries: {}, all_bins: {} } };

                case 'process': {
                    const folders = data.folders || [];
                    if (folders.length === 0) {
                        return { success: false, error: 'No source folders selected' };
                    }
                    const result = await bumpathRepath(folders, {
                        prefix: data.prefix || '',
                        outputPath: data.outputPath || '',
                        selectedSkinIds: data.selectedSkinIds,
                        selectedBinPaths: data.selectedBinPaths,
                        entryPrefixes: data.entryPrefixes,
                        ignoreMissing: data.ignoreMissing ?? false,
                        combineLinked: data.combineLinked ?? false,
                        splitVfx: data.splitVfx ?? true,
                        consolidateAssets: data.consolidateAssets ?? true,
                        hashesPath: data.hashesPath || undefined,
                    });
                    addLog(`Done: ${result.binsProcessed} bins · ${result.assetsCopied} assets`);
                    return {
                        success: true,
                        total_files: result.binsProcessed + result.assetsCopied,
                        output_dir: result.outputDir,
                        warnings: [],
                    };
                }

                case 'reset':
                    return { success: true };

                default:
                    throw new Error(`Unknown endpoint: ${endpoint}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Bumpath operation ${endpoint} failed:`, error);
            return { success: false, error: message };
        }
    }, [addLog]);
}
