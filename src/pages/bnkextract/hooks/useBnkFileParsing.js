import { useCallback } from 'react';
import { loadBanks } from '../utils/bnkLoader';

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
            const result = await loadBanks({ bnkPath, wpkPath, binPath });
            if (!result) {
                setStatusMessage('No audio data found in these files');
                return;
            }

            const { tree, audioFiles, fileCount, type: finalType } = result;
            const path = window.require('path');
            const label = wpkPath ? path.basename(wpkPath) : (bnkPath ? path.basename(bnkPath) : 'Unnamed Bank');

            if (activePane === 'left') {
                pushToHistory();
                setParsedData({ audioFiles, fileCount, type: finalType });
                setTreeData((prev) => [...prev, tree]);
            } else {
                pushToHistory();
                setRightTreeData((prev) => [...prev, tree]);
            }

            localStorage.setItem('bnk-extract-last-paths', JSON.stringify({ bin: binPath, wpk: wpkPath, bnk: bnkPath }));

            const pathSet = { bin: binPath, wpk: wpkPath, bnk: bnkPath };

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
