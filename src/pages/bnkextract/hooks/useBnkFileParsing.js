import { useCallback } from 'react';
import { parseAudioFile, parseBinFile, groupAudioFiles, getEventMappings } from '../utils/bnkParser';

export function useBnkFileParsing({
    bnkPath,
    wpkPath,
    binPath,
    activePane,
    setBnkPath,
    setWpkPath,
    setBinPath,
    setIsLoading,
    setStatusMessage,
    pushToHistory,
    setParsedData,
    setTreeData,
    setRightTreeData,
    setHistory,
}) {
    const handleSelectFile = useCallback(async (type) => {
        if (!window.require) return;

        const { ipcRenderer } = window.require('electron');

        let extensions = ['*'];
        let name = 'All Files';

        if (type === 'bnk') {
            extensions = ['bnk'];
            name = 'BNK Files';
        } else if (type === 'wpk') {
            extensions = ['wpk', 'bnk'];
            name = 'Audio Files';
        } else if (type === 'bin') {
            extensions = ['bin'];
            name = 'Bin Files';
        }

        const filters = [{ name, extensions }, { name: 'All Files', extensions: ['*'] }];

        try {
            const result = await ipcRenderer.invoke('dialog:openFile', {
                properties: ['openFile'],
                filters,
            });

            if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                if (type === 'bnk') setBnkPath(filePath);
                else if (type === 'wpk') setWpkPath(filePath);
                else if (type === 'bin') setBinPath(filePath);
            }
        } catch (error) {
            console.error('[BnkExtract] File selection error:', error);
            setStatusMessage(`Error selecting file: ${error.message}`);
        }
    }, [setBnkPath, setWpkPath, setBinPath, setStatusMessage]);

    const handleParseFiles = useCallback(async () => {
        if (!bnkPath && !wpkPath) {
            setStatusMessage('Please select at least a BNK or WPK file');
            return;
        }

        setIsLoading(true);
        setStatusMessage('Parsing files...');
        pushToHistory();

        try {
            if (!window.require) {
                throw new Error('File system access not available');
            }

            const fs = window.require('fs');

            let stringHashes = [];
            if (binPath && bnkPath && fs.existsSync(binPath) && fs.existsSync(bnkPath)) {
                try {
                    const binData = fs.readFileSync(binPath);
                    const bnkData = fs.readFileSync(bnkPath);
                    const binStrings = parseBinFile(binData);
                    stringHashes = getEventMappings(binStrings, bnkData);
                    console.log(`[BnkExtract] Mapped ${stringHashes.length} events using BIN and Events BNK`);
                } catch (error) {
                    console.warn('[BnkExtract] Failed to map events via BNK:', error);
                    setStatusMessage('Warning: Enhanced mapping failed, falling back to direct mapping');
                }
            }

            if (stringHashes.length === 0 && binPath && fs.existsSync(binPath)) {
                try {
                    const binData = fs.readFileSync(binPath);
                    stringHashes = parseBinFile(binData);
                    console.log('[BnkExtract] Using direct mapping from BIN file');
                } catch (error) {
                    console.warn('[BnkExtract] Failed to parse BIN:', error);
                }
            }

            let wpkResult = null;
            if (wpkPath && fs.existsSync(wpkPath)) {
                const wpkData = fs.readFileSync(wpkPath);
                wpkResult = parseAudioFile(wpkData, wpkPath);
            }

            let bnkResult = null;
            if (!wpkResult && bnkPath && fs.existsSync(bnkPath)) {
                const bnkData = fs.readFileSync(bnkPath);
                bnkResult = parseAudioFile(bnkData, bnkPath);
            }

            let finalAudioFiles = [];
            let fileCount = 0;
            let finalType = '';

            if (wpkResult) {
                finalAudioFiles = wpkResult.audioFiles;
                fileCount = wpkResult.fileCount;
                finalType = 'wpk';
            } else if (bnkResult) {
                finalAudioFiles = bnkResult.audioFiles;
                fileCount = bnkResult.fileCount;
                finalType = 'bnk';
            }

            if (wpkResult && bnkPath) {
                finalType = 'bnk+wpk';
            }

            const path = window.require('path');
            const sourceName = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'root');
            const originalPath = wpkPath || bnkPath;

            const tree = groupAudioFiles(finalAudioFiles, stringHashes, sourceName);
            tree.isRoot = true;
            tree.originalPath = originalPath;
            tree.originalAudioFiles = finalAudioFiles;

            if (activePane === 'left') {
                pushToHistory();
                setParsedData({ audioFiles: finalAudioFiles, fileCount, type: finalType });
                setTreeData((prev) => [...prev, tree]);
            } else {
                pushToHistory();
                setRightTreeData((prev) => [...prev, tree]);
            }

            localStorage.setItem('bnk-extract-last-paths', JSON.stringify({ bin: binPath, wpk: wpkPath, bnk: bnkPath }));

            const pathSet = { bin: binPath, wpk: wpkPath, bnk: bnkPath };
            const label = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'Unnamed Bank');

            setHistory((prev) => {
                const filtered = prev.filter((entry) => (
                    entry.paths.bin !== pathSet.bin ||
                    entry.paths.wpk !== pathSet.wpk ||
                    entry.paths.bnk !== pathSet.bnk
                ));
                const newEntry = {
                    id: Date.now().toString(),
                    label,
                    paths: pathSet,
                    timestamp: Date.now(),
                };
                return [newEntry, ...filtered].slice(0, 10);
            });

            setStatusMessage(`Parsed ${fileCount} audio files (${finalType.toUpperCase()})`);
        } catch (error) {
            console.error('[BnkExtract] Parse error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [
        bnkPath,
        wpkPath,
        binPath,
        activePane,
        setIsLoading,
        setStatusMessage,
        pushToHistory,
        setParsedData,
        setTreeData,
        setRightTreeData,
        setHistory,
    ]);

    return {
        handleSelectFile,
        handleParseFiles,
    };
}
