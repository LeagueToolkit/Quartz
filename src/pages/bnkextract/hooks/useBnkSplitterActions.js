import { useCallback } from 'react';

export function useBnkSplitterActions({
  contextMenu,
  handleCloseContextMenu,
  isWwiseInstalled,
  setStatusMessage,
  setShowConvertOverlay,
  setConvertStatus,
  setShowAudioSplitter,
  setSplitterInitialFile,
  pushToHistory,
  setTreeData,
  setRightTreeData,
  setViewMode,
  setRightExpandedNodes,
}) {
  const handleOpenInSplitter = useCallback(async () => {
    const node = contextMenu?.node;
    handleCloseContextMenu();
    if (!node?.audioData) {
      setShowAudioSplitter(true);
      setSplitterInitialFile(null);
      return;
    }

    if (!isWwiseInstalled) {
      setStatusMessage('vgmstream required - install audio tools first');
      return;
    }

    setShowConvertOverlay(true);
    setConvertStatus('Decoding audio for splitter...');
    try {
      const { ipcRenderer } = window.require('electron');
      const fs = window.require('fs');
      const path = window.require('path');
      const os = window.require('os');

      const tmpDir = path.join(os.tmpdir(), 'QuartzSplitter');
      fs.mkdirSync(tmpDir, { recursive: true });
      const uid = Date.now();
      const wemTmp = path.join(tmpDir, `spl_${uid}.wem`);
      fs.writeFileSync(wemTmp, Buffer.from(node.audioData.data));

      const res = await ipcRenderer.invoke('audio:decode-to-wav', { inputPath: wemTmp });
      try { fs.unlinkSync(wemTmp); } catch (_) { }

      setShowConvertOverlay(false);
      if (!res.success) {
        setStatusMessage(`Splitter decode error: ${res.error}`);
        return;
      }

      setSplitterInitialFile({
        path: res.wavPath,
        name: (node.name || 'audio') + '.wav',
        nodeId: node.id,
        pane: contextMenu.pane,
        isWem: node.name.toLowerCase().endsWith('.wem'),
      });
      setShowAudioSplitter(true);
    } catch (error) {
      setShowConvertOverlay(false);
      setStatusMessage(`Splitter error: ${error.message}`);
    }
  }, [contextMenu, handleCloseContextMenu, isWwiseInstalled, setStatusMessage, setShowConvertOverlay, setConvertStatus, setShowAudioSplitter, setSplitterInitialFile]);

  const handleSplitterReplace = useCallback((newData, nodeId, pane) => {
    pushToHistory();
    const setTreeFn = pane === 'left' ? setTreeData : setRightTreeData;
    setTreeFn((prev) => {
      const updateInTree = (nodes) => nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, audioData: { ...n.audioData, data: newData, length: newData.length } };
        }
        if (n.children) return { ...n, children: updateInTree(n.children) };
        return n;
      });
      return updateInTree(prev);
    });
    setStatusMessage('Updated audio in tree from splitter');
  }, [setTreeData, setRightTreeData, pushToHistory, setStatusMessage]);

  const handleSplitterExportSegments = useCallback(async (segments) => {
    if (!segments || segments.length === 0) return;
    if (!window.require) return;

    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    const path = window.require('path');
    const os = window.require('os');
    const tmpDir = path.join(os.tmpdir(), 'QuartzSplitter');
    fs.mkdirSync(tmpDir, { recursive: true });

    pushToHistory();
    setShowConvertOverlay(true);

    try {
      const timestamp = Date.now();
      const audioNodes = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        setConvertStatus(`Converting segment ${i + 1} / ${segments.length}: ${seg.name}`);

        const uid = `${timestamp}_${i}`;
        const tmpWav = path.join(tmpDir, `seg_${uid}.wav`);
        fs.writeFileSync(tmpWav, Buffer.from(seg.data));

        const res = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: tmpWav });
        try { fs.unlinkSync(tmpWav); } catch (_) { }

        if (!res.success) {
          console.warn(`[Splitter] Failed to convert ${seg.name}:`, res.error);
          continue;
        }

        const wemData = new Uint8Array(fs.readFileSync(res.wemPath));
        try { fs.unlinkSync(res.wemPath); } catch (_) { }

        const baseName = seg.name.replace(/\.\w+$/, '');
        audioNodes.push({
          id: `split-segment-${timestamp}-${i}`,
          name: `${baseName}.wem`,
          audioData: {
            id: timestamp + i,
            data: wemData,
            offset: 0,
            length: wemData.length,
          },
          children: [],
        });
      }

      if (audioNodes.length === 0) {
        setStatusMessage('No segments could be converted');
        return;
      }

      setViewMode('split');
      setRightTreeData((prev) => {
        const rootIdx = prev.findIndex((n) => n.id === '__split-segments-root__');
        if (rootIdx !== -1) {
          const newTree = [...prev];
          newTree[rootIdx] = {
            ...newTree[rootIdx],
            children: [...newTree[rootIdx].children, ...audioNodes],
          };
          return newTree;
        }
        const rootNode = {
          id: '__split-segments-root__',
          name: 'Split Segments',
          audioData: null,
          isRoot: true,
          children: audioNodes,
        };
        return [rootNode, ...prev];
      });

      setRightExpandedNodes((prev) => {
        const s = new Set(prev);
        s.add('__split-segments-root__');
        return s;
      });

      setStatusMessage(`Converted and exported ${audioNodes.length} segment(s) to Reference Pane`);
    } catch (error) {
      setStatusMessage(`Export error: ${error.message}`);
    } finally {
      setShowConvertOverlay(false);
      setConvertStatus('');
    }
  }, [pushToHistory, setShowConvertOverlay, setConvertStatus, setStatusMessage, setViewMode, setRightTreeData, setRightExpandedNodes]);

  return {
    handleOpenInSplitter,
    handleSplitterReplace,
    handleSplitterExportSegments,
  };
}
