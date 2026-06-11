import { useCallback, useMemo } from 'react';
import type { ScannedData, ScannedEntry } from '../utils/types';

type SetState<T> = (updater: (prev: T) => T) => void;

interface UseBumpathEntriesArgs {
    scannedData: ScannedData | null;
    showMissingOnly: boolean;
    setSelectedEntries: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setExpandedEntries: SetState<Set<string>>;
    setExpandedFilePaths: SetState<Set<string>>;
}

export default function useBumpathEntries({
    scannedData,
    showMissingOnly,
    setSelectedEntries,
    setExpandedEntries,
    setExpandedFilePaths,
}: UseBumpathEntriesArgs) {
    const handleEntrySelect = useCallback((entryHash: string) => {
        setSelectedEntries((prev) => {
            const next = new Set(prev);
            if (next.has(entryHash)) {
                next.delete(entryHash);
            } else {
                next.add(entryHash);
            }
            return next;
        });
    }, [setSelectedEntries]);

    const handleEntryExpand = useCallback((entryHash: string) => {
        setExpandedEntries((prev) => {
            const next = new Set(prev);
            if (next.has(entryHash)) {
                next.delete(entryHash);
            } else {
                next.add(entryHash);
            }
            return next;
        });
    }, [setExpandedEntries]);

    const handleFilePathExpand = useCallback((filePath: string) => {
        setExpandedFilePaths((prev) => {
            const next = new Set(prev);
            if (next.has(filePath)) {
                next.delete(filePath);
            } else {
                next.add(filePath);
            }
            return next;
        });
    }, [setExpandedFilePaths]);

    const handleSelectAll = useCallback(() => {
        if (!scannedData) return;
        const allEntries = Object.keys(scannedData.entries).filter(
            (hash) => scannedData.entries[hash].prefix !== 'Uneditable',
        );
        setSelectedEntries(new Set(allEntries));
    }, [scannedData, setSelectedEntries]);

    const handleDeselectAll = useCallback(() => {
        setSelectedEntries(new Set());
    }, [setSelectedEntries]);

    const getEntryDisplayName = useCallback((entryHash: string, entryData: ScannedEntry) => {
        const truncateName = (str: string, maxLength = 60) => {
            if (!str) return '';
            if (str.length <= maxLength) return str;
            return str.substring(0, maxLength - 3) + '...';
        };

        const name = entryData.name || '';
        if (name && !name.startsWith('Entry_')) {
            return truncateName(name);
        }

        if (entryData.referenced_files && entryData.referenced_files.length > 0) {
            const unhashedName = entryData.referenced_files.find((file) =>
                !file.exists &&
                file.path &&
                !file.path.toLowerCase().endsWith('.tex'),
            );
            if (unhashedName && unhashedName.path) {
                return truncateName(unhashedName.path);
            }

            const missingFile = entryData.referenced_files.find((file) => !file.exists && file.path);
            if (missingFile && missingFile.path) {
                return truncateName(missingFile.path);
            }
        }

        return truncateName(name || `Entry_${entryHash}` || 'Unknown Entry');
    }, []);

    const filteredEntries = useMemo<Array<[string, ScannedEntry]>>(() => {
        if (!scannedData) return [];
        return Object.entries(scannedData.entries).filter(([, fileData]) => {
            if (!showMissingOnly) return true;
            return fileData.referenced_files.some((file) => !file.exists);
        });
    }, [scannedData, showMissingOnly]);

    return {
        handleEntrySelect,
        handleEntryExpand,
        handleFilePathExpand,
        handleSelectAll,
        handleDeselectAll,
        getEntryDisplayName,
        filteredEntries,
    };
}
