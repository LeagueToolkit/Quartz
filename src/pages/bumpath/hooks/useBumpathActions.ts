import { useCallback } from 'react';
import { useFileExplorer } from '@/components/explorer';
import type { BumpathApiCall } from './useBumpathCoreApi';
import type { ScannedData, SourceBins } from '../utils/types';

interface UseBumpathActionsArgs {
    apiCall: BumpathApiCall;
    selectedEntries: Set<string>;
    prefixText: string;
    debouncedPrefixText: string;
    scannedData: ScannedData | null;
    appliedPrefixes: Map<string, string>;
    outputPath: string;
    ignoreMissing: boolean;
    combineLinked: boolean;
    splitVfx: boolean;
    consolidateAssets: boolean;
    sourceDirs: string[];
    sourceBins: SourceBins;
    hashesPath: string;
    addLog: (message: string) => void;
    fetchLogs: () => Promise<void>;
    confirmOutputMerge: (path: string) => Promise<boolean>;
    setError: (value: string | null) => void;
    setSuccess: (value: string | null) => void;
    setScannedData: (value: ScannedData | null) => void;
    setAppliedPrefixes: (value: Map<string, string>) => void;
    setSelectedEntries: (value: Set<string>) => void;
    setExpandedEntries: (value: Set<string>) => void;
    setIsProcessing: (value: boolean) => void;
    setOutputPath: (value: string) => void;
    setSourceDirs: (value: string[]) => void;
    setSourceFiles: (value: Record<string, unknown>) => void;
    setSourceBins: (value: SourceBins) => void;
}

export default function useBumpathActions({
    apiCall,
    selectedEntries,
    prefixText,
    debouncedPrefixText,
    scannedData,
    appliedPrefixes,
    outputPath,
    ignoreMissing,
    combineLinked,
    splitVfx,
    consolidateAssets,
    sourceDirs,
    sourceBins,
    hashesPath,
    addLog,
    fetchLogs,
    confirmOutputMerge,
    setError,
    setSuccess,
    setScannedData,
    setAppliedPrefixes,
    setSelectedEntries,
    setExpandedEntries,
    setIsProcessing,
    setOutputPath,
    setSourceDirs,
    setSourceFiles,
    setSourceBins,
}: UseBumpathActionsArgs) {
    const pick = useFileExplorer();
    const handleApplyPrefix = useCallback(async () => {
        if (selectedEntries.size === 0) {
            setError('Please select at least one entry');
            return;
        }

        if (!prefixText.trim()) {
            setError('Please enter a prefix');
            return;
        }

        try {
            const prefix = prefixText.trim();
            const result = await apiCall('apply-prefix', {
                entryHashes: Array.from(selectedEntries),
                prefix,
            });

            if (!result.success) {
                setError(result.error || 'Failed to apply prefix');
                return;
            }

            if (scannedData) {
                const updatedData: ScannedData = {
                    ...scannedData,
                    entries: { ...scannedData.entries },
                };

                selectedEntries.forEach((entryHash) => {
                    if (updatedData.entries[entryHash]) {
                        updatedData.entries[entryHash] = {
                            ...updatedData.entries[entryHash],
                            prefix,
                        };
                    }
                });

                setScannedData(updatedData);
            }

            const newAppliedPrefixes = new Map(appliedPrefixes);
            selectedEntries.forEach((entryHash) => {
                newAppliedPrefixes.set(entryHash, prefix);
            });
            setAppliedPrefixes(newAppliedPrefixes);

            setSuccess(`Applied prefix "${prefix}" to ${selectedEntries.size} entries`);
        } catch (applyError) {
            const message = applyError instanceof Error ? applyError.message : String(applyError);
            setError('Failed to apply prefix: ' + message);
        }
    }, [
        apiCall,
        appliedPrefixes,
        debouncedPrefixText,
        prefixText,
        scannedData,
        selectedEntries,
        setAppliedPrefixes,
        setError,
        setScannedData,
        setSuccess,
    ]);

    const handleProcess = useCallback(async () => {
        if (!scannedData) {
            setError('Please scan first');
            addLog('Error: Please scan first');
            return;
        }

        if (!outputPath) {
            setError('Please select an output directory');
            addLog('Error: Please select an output directory');
            return;
        }

        if (!(await confirmOutputMerge(outputPath))) {
            addLog('Processing cancelled: output folder already contains files');
            return;
        }

        setIsProcessing(true);
        setError(null);
        addLog('Processing...');

        try {
            const result = await apiCall('process', {
                folders: sourceDirs,
                // The bottom field is the global fallback. Explicit prefixes
                // applied to individual entries override it in the backend.
                prefix: prefixText.trim() || debouncedPrefixText.trim() || 'bum',
                selectedBinPaths: Object.entries(sourceBins)
                    .filter(([, bin]) => bin?.selected)
                    .map(([path, bin]) => bin.path || path),
                entryPrefixes: Object.fromEntries(appliedPrefixes),
                outputPath,
                ignoreMissing,
                combineLinked,
                splitVfx,
                consolidateAssets,
                hashesPath,
            });

            if (result.success) {
                const message = `Processing completed: ${result.total_files || result.processedFiles || 0} files processed`;
                setSuccess(message);
                addLog(`Done: ${result.total_files || result.processedFiles || 0} files`);

                if (result.warnings && result.warnings.length > 0) {
                    result.warnings.forEach((warning) => addLog(`Warning: ${warning}`));
                }

                await fetchLogs();

                setScannedData(null);
                setSelectedEntries(new Set());
                setExpandedEntries(new Set());
                setAppliedPrefixes(new Map());
            } else {
                const errorMsg = result.error || 'Processing failed';
                setError(errorMsg);
                addLog(`Error: ${errorMsg}`);

            }
        } catch (processError) {
            const message = processError instanceof Error ? processError.message : String(processError);
            const errorMsg = 'Processing failed: ' + message;
            setError(errorMsg);
            addLog(`Error: ${errorMsg}`);

        } finally {
            setIsProcessing(false);
        }
    }, [
        addLog,
        apiCall,
        combineLinked,
        consolidateAssets,
        confirmOutputMerge,
        debouncedPrefixText,
        fetchLogs,
        hashesPath,
        ignoreMissing,
        outputPath,
        prefixText,
        scannedData,
        sourceDirs,
        sourceBins,
        splitVfx,
        setAppliedPrefixes,
        setError,
        setExpandedEntries,
        setIsProcessing,
        setScannedData,
        setSelectedEntries,
        setSuccess,
    ]);

    const handleSelectOutputDir = useCallback(async () => {
        try {
            const result = await pick({ mode: 'directory' });
            if (typeof result === 'string') {
                setOutputPath(result);
            }
        } catch (selectError) {
            const message = selectError instanceof Error ? selectError.message : String(selectError);
            setError('Failed to select output directory: ' + message);
        }
    }, [setError, setOutputPath, pick]);

    const handleReset = useCallback(async () => {
        try {
            await apiCall('reset');
            setSourceDirs([]);
            setSourceFiles({});
            setSourceBins({});
            setScannedData(null);
            setSelectedEntries(new Set());
            setExpandedEntries(new Set());
            setError(null);
            setSuccess(null);
        } catch (resetError) {
            const message = resetError instanceof Error ? resetError.message : String(resetError);
            setError('Failed to reset: ' + message);
        }
    }, [
        apiCall,
        setError,
        setExpandedEntries,
        setScannedData,
        setSelectedEntries,
        setSourceBins,
        setSourceDirs,
        setSourceFiles,
        setSuccess,
    ]);

    return {
        handleApplyPrefix,
        handleProcess,
        handleSelectOutputDir,
        handleReset,
    };
}
