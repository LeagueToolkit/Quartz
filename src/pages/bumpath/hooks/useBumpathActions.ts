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
    sourceDirs: string[];
    hashesPath: string;
    addLog: (message: string) => void;
    fetchLogs: () => Promise<void>;
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
    sourceDirs,
    hashesPath,
    addLog,
    fetchLogs,
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
            const result = await apiCall('apply-prefix', {
                entryHashes: Array.from(selectedEntries),
                prefix: debouncedPrefixText.trim(),
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
                            prefix: debouncedPrefixText.trim(),
                        };
                    }
                });

                setScannedData(updatedData);
            }

            const newAppliedPrefixes = new Map(appliedPrefixes);
            selectedEntries.forEach((entryHash) => {
                newAppliedPrefixes.set(entryHash, debouncedPrefixText.trim());
            });
            setAppliedPrefixes(newAppliedPrefixes);

            setSuccess(`Applied prefix "${debouncedPrefixText}" to ${selectedEntries.size} entries`);
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

        setIsProcessing(true);
        setError(null);
        addLog('Starting bumpath process...');
        addLog(`Output directory: ${outputPath}`);
        addLog(`Combine linked: ${combineLinked}`);
        addLog(`Ignore missing: ${ignoreMissing}`);

        try {
            const result = await apiCall('process', {
                folders: sourceDirs,
                prefix: debouncedPrefixText.trim() || prefixText.trim(),
                outputPath,
                ignoreMissing,
                combineLinked,
                hashesPath,
            });

            if (result.success) {
                const message = `Processing completed: ${result.total_files || result.processedFiles || 0} files processed`;
                setSuccess(message);
                addLog(message);
                addLog(`Output: ${result.output_dir || outputPath}`);

                if (result.warnings && result.warnings.length > 0) {
                    result.warnings.forEach((warning) => addLog(`Warning: ${warning}`));
                }

                await fetchLogs();

                addLog('Clearing state after successful processing...');
                setScannedData(null);
                setSelectedEntries(new Set());
                setExpandedEntries(new Set());
                setAppliedPrefixes(new Map());
            } else {
                const errorMsg = result.error || 'Processing failed';
                setError(errorMsg);
                addLog(`Error: ${errorMsg}`);

                if (errorMsg.includes('Malformed') || errorMsg.includes('path') || errorMsg.includes('skins_skin')) {
                    addLog('Tip: This may be caused by Windows path length limits. Try shorter folder names or move files closer to the drive root.');
                }
            }
        } catch (processError) {
            const message = processError instanceof Error ? processError.message : String(processError);
            const errorMsg = 'Processing failed: ' + message;
            setError(errorMsg);
            addLog(`Error: ${errorMsg}`);

            if (message.includes('path') || message.includes('ENAMETOOLONG')) {
                addLog('Tip: Windows path length limit may be causing this. Try shorter folder names or move files closer to root.');
            }
        } finally {
            setIsProcessing(false);
        }
    }, [
        addLog,
        apiCall,
        combineLinked,
        debouncedPrefixText,
        fetchLogs,
        hashesPath,
        ignoreMissing,
        outputPath,
        prefixText,
        scannedData,
        sourceDirs,
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
