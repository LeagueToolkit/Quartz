import { useCallback, useEffect } from 'react';

export function useBnkWwiseBridge({
    pushToHistory,
    setStatusMessage,
    treeData,
    rightTreeData,
    setTreeData,
    setRightTreeData,
    setRightExpandedNodes,
    isWwiseInstalled,
    setIsWwiseInstalled,
    setShowInstallModal,
    setShowConvertOverlay,
    setConvertStatus,
    setInstallProgress,
    setIsInstalling,
    pendingConversion,
}) {
    useEffect(() => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('wwise:check')
            .then(({ installed }) => {
                setIsWwiseInstalled(installed);
                if (!installed) setShowInstallModal(true);
            })
            .catch(() => { });
    }, [setIsWwiseInstalled, setShowInstallModal]);

    useEffect(() => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const handler = (_, msg) => setInstallProgress(msg);
        ipcRenderer.on('wwise:install-progress', handler);
        return () => ipcRenderer.removeListener('wwise:install-progress', handler);
    }, [setInstallProgress]);

    const convertAndInjectToRightPane = useCallback(async (filePath, fileName) => {
        if (!window.require) return;
        pushToHistory();
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        setShowConvertOverlay(true);
        setConvertStatus('Synthesizing WEM from Audio Source...');

        try {
            const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: filePath });
            if (!result.success) {
                setShowConvertOverlay(false);
                setStatusMessage(`Conversion failed: ${result.error}`);
                return;
            }

            const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
            const baseName = path.basename(fileName, path.extname(fileName));
            const audioId = Date.now();

            const audioNode = {
                id: `converted-${audioId}`,
                name: `${baseName}.wem`,
                audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
                children: [],
            };

            setRightTreeData((prev) => {
                const rootIdx = prev.findIndex((n) => n.id === '__converted-root__');
                if (rootIdx !== -1) {
                    const newTree = [...prev];
                    newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, audioNode] };
                    return newTree;
                }
                const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: [audioNode] };
                return [rootNode, ...prev];
            });
            setRightExpandedNodes((prev) => { const s = new Set(prev); s.add('__converted-root__'); return s; });

            try { fs.unlinkSync(result.wemPath); } catch (_) { }
            setStatusMessage(`Converted and loaded: ${baseName}.wem`);
        } catch (err) {
            setStatusMessage(`Conversion error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [pushToHistory, setShowConvertOverlay, setConvertStatus, setStatusMessage, setRightTreeData, setRightExpandedNodes]);

    const handleExternalFileDrop = useCallback(async (files, targetNodeId, pane) => {
        pushToHistory();
        if (!window.require || !files?.length) return;
        const fs = window.require('fs');
        const CONVERT_EXTS = ['wav', 'mp3', 'ogg'];

        const needsConversion = files.some((f) => CONVERT_EXTS.includes(f.name.toLowerCase().split('.').pop()));
        if (needsConversion && !isWwiseInstalled) {
            pendingConversion.current = { files, targetNodeId, pane, mode: 'replace' };
            setShowInstallModal(true);
            return;
        }

        const collectAudioLeaves = (nodes, targetId, inside = false) => {
            const ids = [];
            for (const n of nodes) {
                const hit = inside || n.id === targetId;
                if (hit && n.audioData) ids.push(n.id);
                if (n.children?.length) ids.push(...collectAudioLeaves(n.children, targetId, hit));
            }
            return ids;
        };
        const sourceTree = pane === 'left' ? treeData : rightTreeData;
        const audioNodeIds = collectAudioLeaves(sourceTree, targetNodeId);
        if (audioNodeIds.length === 0) {
            setStatusMessage('No audio entries found under target node');
            return;
        }

        const { ipcRenderer } = window.require('electron');
        setShowConvertOverlay(true);
        const wemDataArray = [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.toLowerCase().split('.').pop();
                setConvertStatus(`Processing ${i + 1} / ${files.length}: ${file.name}`);
                if (ext === 'wem') {
                    wemDataArray.push(new Uint8Array(fs.readFileSync(file.path)));
                } else {
                    const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                    if (!result.success) { setStatusMessage(`Failed to convert ${file.name}: ${result.error}`); return; }
                    wemDataArray.push(new Uint8Array(fs.readFileSync(result.wemPath)));
                    try { fs.unlinkSync(result.wemPath); } catch (_) { }
                }
            }

            const shuffled = [...wemDataArray];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            const assignments = new Map(audioNodeIds.map((id, i) => [id, shuffled[i % shuffled.length]]));
            const setTreeDataFn = pane === 'left' ? setTreeData : setRightTreeData;
            setTreeDataFn((prev) => {
                const update = (nodes) => nodes.map((n) => {
                    if (assignments.has(n.id)) {
                        const wemData = assignments.get(n.id);
                        return { ...n, audioData: { ...n.audioData, data: wemData, length: wemData.length } };
                    }
                    if (n.children) return { ...n, children: update(n.children) };
                    return n;
                });
                return update(prev);
            });

            setStatusMessage(`Assigned ${files.length} file(s) randomly across ${audioNodeIds.length} audio slot(s)`);
        } catch (err) {
            setStatusMessage(`Drop error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [
        pushToHistory,
        isWwiseInstalled,
        pendingConversion,
        setShowInstallModal,
        treeData,
        rightTreeData,
        setStatusMessage,
        setShowConvertOverlay,
        setConvertStatus,
        setTreeData,
        setRightTreeData,
    ]);

    const handleInstallWwise = useCallback(async () => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const path = window.require('path');

        setIsInstalling(true);
        setInstallProgress('Starting download...');

        const result = await ipcRenderer.invoke('wwise:install');
        setIsInstalling(false);
        if (!result.success) {
            setInstallProgress(`Failed: ${result.error}`);
            return;
        }

        setIsWwiseInstalled(true);
        setShowInstallModal(false);
        setInstallProgress('');

        if (!pendingConversion.current) return;
        const pending = pendingConversion.current;
        pendingConversion.current = null;

        if (pending.mode === 'replace') {
            const CONVERT_EXTS = ['wav', 'mp3', 'ogg'];
            const files = pending.files;
            setShowConvertOverlay(true);
            const wemDataArray = [];
            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const ext = file.name.toLowerCase().split('.').pop();
                    setConvertStatus(`Processing ${i + 1} / ${files.length}: ${file.name}`);
                    if (ext === 'wem') {
                        wemDataArray.push(new Uint8Array(fs.readFileSync(file.path)));
                    } else if (CONVERT_EXTS.includes(ext)) {
                        const convResult = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                        if (!convResult.success) { setStatusMessage(`Failed: ${convResult.error}`); return; }
                        wemDataArray.push(new Uint8Array(fs.readFileSync(convResult.wemPath)));
                        try { fs.unlinkSync(convResult.wemPath); } catch (_) { }
                    }
                }
                if (wemDataArray.length === 0) return;

                const collectLeaves = (nodes, targetId, inside = false) => {
                    const ids = [];
                    for (const n of nodes) {
                        const hit = inside || n.id === targetId;
                        if (hit && n.audioData) ids.push(n.id);
                        if (n.children?.length) ids.push(...collectLeaves(n.children, targetId, hit));
                    }
                    return ids;
                };

                const shuffled = [...wemDataArray];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                const setTreeDataFn = pending.pane === 'left' ? setTreeData : setRightTreeData;
                setTreeDataFn((prev) => {
                    const audioIds = collectLeaves(prev, pending.targetNodeId);
                    const assignments = new Map(audioIds.map((id, i) => [id, shuffled[i % shuffled.length]]));
                    const update = (nodes) => nodes.map((n) => {
                        if (assignments.has(n.id)) {
                            const wemData = assignments.get(n.id);
                            return { ...n, audioData: { ...n.audioData, data: wemData, length: wemData.length } };
                        }
                        if (n.children) return { ...n, children: update(n.children) };
                        return n;
                    });
                    return update(prev);
                });
                setStatusMessage(`Assigned ${files.length} file(s) randomly across audio slots`);
            } catch (err) {
                setStatusMessage(`Conversion error: ${err.message}`);
            } finally {
                setShowConvertOverlay(false);
                setConvertStatus('');
            }
        } else if (pending.mode === 'inject') {
            const files = pending.files;
            setShowConvertOverlay(true);
            try {
                const newAudioNodes = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setConvertStatus(`Converting ${i + 1} / ${files.length}: ${file.name}`);
                    const result2 = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
                    if (!result2.success) continue;

                    const wemData = new Uint8Array(fs.readFileSync(result2.wemPath));
                    const baseName = path.basename(file.name, path.extname(file.name));
                    const audioId = Date.now() + i;
                    newAudioNodes.push({
                        id: `converted-${audioId}`,
                        name: `${baseName}.wem`,
                        audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
                        children: [],
                    });
                    try { fs.unlinkSync(result2.wemPath); } catch (_) { }
                }

                if (newAudioNodes.length > 0) {
                    setRightTreeData((prev) => {
                        const rootIdx = prev.findIndex((n) => n.id === '__converted-root__');
                        if (rootIdx !== -1) {
                            const newTree = [...prev];
                            newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, ...newAudioNodes] };
                            return newTree;
                        }
                        const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: newAudioNodes };
                        return [rootNode, ...prev];
                    });
                    setRightExpandedNodes((prev) => { const s = new Set(prev); s.add('__converted-root__'); return s; });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setShowConvertOverlay(false);
                setConvertStatus('');
            }
        } else {
            await convertAndInjectToRightPane(pending.filePath, pending.fileName);
        }
    }, [
        setIsInstalling,
        setInstallProgress,
        setIsWwiseInstalled,
        setShowInstallModal,
        pendingConversion,
        setShowConvertOverlay,
        setConvertStatus,
        setStatusMessage,
        setTreeData,
        setRightTreeData,
        setRightExpandedNodes,
        convertAndInjectToRightPane,
    ]);

    return {
        handleExternalFileDrop,
        handleInstallWwise,
    };
}

