import { useCallback } from 'react';

export function useBnkGainOps({
    gainDb,
    gainTargetNodeId,
    gainTargetNodeIds,
    gainTargetPane,
    isWwiseInstalled,
    treeData,
    rightTreeData,
    setTreeData,
    setRightTreeData,
    setShowGainDialog,
    pushToHistory,
    setShowConvertOverlay,
    setConvertStatus,
    setStatusMessage,
}) {
    const handleApplyGain = useCallback(async () => {
        const gainDbNum = parseFloat(gainDb);
        if (isNaN(gainDbNum) || gainDbNum === 0) { setShowGainDialog(false); return; }
        if (!isWwiseInstalled) { setShowGainDialog(false); setStatusMessage('Wwise tools required - install them first'); return; }
        if (!window.require) return;

        pushToHistory();
        setShowGainDialog(false);

        const { ipcRenderer } = window.require('electron');
        const fs = window.require('fs');
        const os = window.require('os');
        const pathMod = window.require('path');

        const sourceTree = gainTargetPane === 'left' ? treeData : rightTreeData;
        const targetIds = Array.isArray(gainTargetNodeIds) && gainTargetNodeIds.length > 0
            ? gainTargetNodeIds
            : (gainTargetNodeId ? [gainTargetNodeId] : []);

        const collectLeaves = (nodes, targetId, inside = false) => {
            const found = [];
            for (const n of nodes) {
                const hit = inside || n.id === targetId;
                if (hit && n.audioData) found.push({ id: n.id, data: n.audioData.data });
                if (n.children?.length) found.push(...collectLeaves(n.children, targetId, hit));
            }
            return found;
        };

        const dedup = new Map();
        for (const id of targetIds) {
            const found = collectLeaves(sourceTree, id);
            for (const node of found) {
                if (!dedup.has(node.id)) dedup.set(node.id, node);
            }
        }
        const audioNodes = Array.from(dedup.values());
        if (audioNodes.length === 0) { setStatusMessage('No audio nodes found under selection'); return; }

        setShowConvertOverlay(true);
        const tmpDir = os.tmpdir();
        const updates = new Map();
        try {
            for (let i = 0; i < audioNodes.length; i++) {
                const node = audioNodes[i];
                setConvertStatus(`Adjusting volume: ${i + 1} / ${audioNodes.length}`);
                const tmpWemPath = pathMod.join(tmpDir, `quartz_gain_${Date.now()}_${i}.wem`);
                fs.writeFileSync(tmpWemPath, Buffer.from(node.data));
                const result = await ipcRenderer.invoke('audio:amplify-wem', { inputWemPath: tmpWemPath, gainDb: gainDbNum });
                try { fs.unlinkSync(tmpWemPath); } catch (_) { }
                if (!result.success) { setStatusMessage(`Failed: ${result.error}`); return; }
                const newWem = new Uint8Array(fs.readFileSync(result.wemPath));
                try { fs.unlinkSync(result.wemPath); } catch (_) { }
                updates.set(node.id, newWem);
            }

            const setTreeDataFn = gainTargetPane === 'left' ? setTreeData : setRightTreeData;
            setTreeDataFn((prev) => {
                const update = (nodes) => nodes.map((n) => {
                    if (updates.has(n.id)) {
                        const d = updates.get(n.id);
                        return { ...n, audioData: { ...n.audioData, data: d, length: d.length } };
                    }
                    if (n.children) return { ...n, children: update(n.children) };
                    return n;
                });
                return update(prev);
            });

            const sign = gainDbNum > 0 ? '+' : '';
            setStatusMessage(`Applied ${sign}${gainDbNum} dB to ${audioNodes.length} audio file(s)`);
        } catch (err) {
            setStatusMessage(`Volume adjust error: ${err.message}`);
        } finally {
            setShowConvertOverlay(false);
            setConvertStatus('');
        }
    }, [
        gainDb,
        gainTargetNodeId,
        gainTargetNodeIds,
        gainTargetPane,
        isWwiseInstalled,
        treeData,
        rightTreeData,
        setTreeData,
        setRightTreeData,
        setShowGainDialog,
        pushToHistory,
        setShowConvertOverlay,
        setConvertStatus,
        setStatusMessage,
    ]);

    return { handleApplyGain };
}
