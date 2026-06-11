import { useCallback } from 'react';
import { bumpathRepath } from '@/lib/api/bumpath';
import type { ScannedData, SourceBins } from '../utils/types';

/* The original Electron build ran a client-side `BumpathCore` (jsritofile + fs)
   that enumerated source folders, parsed BINs, scanned referenced assets and
   wrote the repathed output entirely in the renderer. None of that is available
   under Tauri: the only real backend is `bumpath_repath(folder, options)`, which
   scans + repaths a whole folder server-side in one shot.

   This hook keeps the original endpoint surface so the panels/hooks stay 1:1.
   The enumeration/scan endpoints are stubbed and flagged // TODO(backend) until a
   scan wrapper lands; `process` calls the real backend so Run works end to end. */

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
    // The selected source folder(s) the real backend should repath.
    folders?: string[];
    // Skin ids to repath, parity with backend `selectedSkinIds`.
    selectedSkinIds?: number[];
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
                    /* TODO(backend): enumerate .bin files in the source folders. No scan
                       wrapper exists yet, so register each added folder as a single bin. */
                    const bins: SourceBins = {};
                    (data.sourceDirs || []).forEach((dir) => {
                        bins[dir] = { path: dir, rel_path: dir, selected: false };
                    });
                    return { success: true, source_files: {}, source_bins: bins };
                }

                case 'update-bin-selection':
                    // Selection is tracked in component state; nothing to persist backend-side.
                    return { success: true };

                case 'scan': {
                    /* TODO(backend): per-entry BIN scan is not exposed by the Rust backend.
                       Return an empty scan so the entries panel renders its empty state. */
                    return { success: true, data: { entries: {}, all_bins: {} } };
                }

                case 'apply-prefix':
                    // Prefix application happens at process time via bumpath_repath.
                    return { success: true, data: { entries: {}, all_bins: {} } };

                case 'process': {
                    const folders = data.folders || [];
                    if (folders.length === 0) {
                        return { success: false, error: 'No source folders selected' };
                    }
                    let total = 0;
                    let lastOutput = data.outputPath || '';
                    const warnings: string[] = [];
                    for (const folder of folders) {
                        const result = await bumpathRepath(folder, {
                            prefix: data.prefix || '',
                            outputPath: data.outputPath || '',
                            selectedSkinIds: data.selectedSkinIds,
                            ignoreMissing: data.ignoreMissing ?? false,
                            combineLinked: data.combineLinked ?? false,
                            hashesPath: data.hashesPath || undefined,
                        });
                        total += result.binsProcessed;
                        lastOutput = result.outputDir;
                        addLog(`Repathed "${folder}": ${result.binsProcessed} bins, ${result.assetsCopied} assets, ${result.combined} combined, ${result.missing} missing`);
                    }
                    return { success: true, total_files: total, output_dir: lastOutput, warnings };
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
