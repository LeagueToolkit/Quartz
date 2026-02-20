import { useCallback } from 'react';

export default function useBumpathCoreApi({ bumpathCoreRef, addLog }) {
  return useCallback(async (endpoint, data = {}) => {
    const core = bumpathCoreRef.current;

    try {
      switch (endpoint) {
        case 'add-source-dirs': {
          const result = await core.addSourceDirs(data.sourceDirs || []);
          return {
            success: true,
            source_files: result.source_files,
            source_bins: result.source_bins
          };
        }

        case 'update-bin-selection':
          core.updateBinSelection(data.binSelections || {});
          return { success: true };

        case 'scan': {
          const scanned = await core.scan(data.hashtablesPath);
          return {
            success: true,
            data: scanned
          };
        }

        case 'apply-prefix':
          core.applyPrefix(data.entryHashes || [], data.prefix || 'bum');
          return {
            success: true,
            data: core._convertScannedData()
          };

        case 'process': {
          const processResult = await core.process(
            data.outputPath,
            data.ignoreMissing || false,
            data.combineLinked || false,
            (_count, message) => {
              addLog(message);
            }
          );
          return {
            success: true,
            ...processResult
          };
        }

        case 'reset':
          core.reset();
          return { success: true };

        default:
          throw new Error(`Unknown endpoint: ${endpoint}`);
      }
    } catch (error) {
      console.error(`Bumpath operation ${endpoint} failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }, [addLog, bumpathCoreRef]);
}
