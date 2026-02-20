import { useCallback } from 'react';

export function useBnkDropOps({
  treeData,
  rightTreeData,
  pushToHistory,
  setTreeData,
  setRightTreeData,
  setRightExpandedNodes,
  setRightPaneDragOver,
  setStatusMessage,
  isWwiseInstalled,
  pendingConversion,
  setShowInstallModal,
  setShowConvertOverlay,
  setConvertStatus,
}) {
  const handleDropReplace = useCallback((sourceIds, targetId) => {
    pushToHistory();
    const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds];

    const collectSourceAudio = (idList) => {
      const leaves = [];
      const collect = (nodes) => {
        for (const n of nodes) {
          if (idList.includes(n.id)) {
            const getLeaves = (node) => {
              const res = [];
              if (node.audioData) res.push(node);
              if (node.children) node.children.forEach((c) => res.push(...getLeaves(c)));
              return res;
            };
            leaves.push(...getLeaves(n));
          } else if (n.children) {
            collect(n.children);
          }
        }
      };
      collect(rightTreeData);
      return leaves;
    };

    const sourceNodes = collectSourceAudio(ids);
    if (sourceNodes.length === 0) return;

    const collectTargetLeaves = (nodes, tid, inside = false) => {
      const leaves = [];
      for (const n of nodes) {
        const hit = inside || n.id === tid;
        if (hit && n.audioData) leaves.push(n);
        if (n.children?.length) leaves.push(...collectTargetLeaves(n.children, tid, hit));
      }
      return leaves;
    };

    const targetAudioNodes = collectTargetLeaves(treeData, targetId);
    if (targetAudioNodes.length === 0) {
      setStatusMessage('No audio entries found under target node');
      return;
    }

    let replacedCount = 0;
    const updates = new Map();
    for (let i = 0; i < targetAudioNodes.length; i++) {
      const targetNode = targetAudioNodes[i];
      const sourceNode = sourceNodes[i % sourceNodes.length];
      const targetAudioId = targetNode.audioData.id;
      if (!updates.has(targetAudioId)) updates.set(targetAudioId, sourceNode.audioData.data);
    }

    setTreeData((prev) => {
      const updateInTree = (nodes, inside = false) => nodes.map((n) => {
        const isTargetOrDescendant = inside || n.id === targetId;
        if (isTargetOrDescendant && n.audioData && updates.has(n.audioData.id)) {
          replacedCount++;
          const newData = updates.get(n.audioData.id);
          return { ...n, audioData: { ...n.audioData, data: newData, length: newData.length } };
        }
        if (n.children) return { ...n, children: updateInTree(n.children, isTargetOrDescendant) };
        return n;
      });
      return updateInTree(prev);
    });

    setStatusMessage(`Replaced audio in ${replacedCount} instance(s) using ${sourceNodes.length} source file(s)`);
  }, [rightTreeData, treeData, pushToHistory, setTreeData, setStatusMessage]);

  const handleRightPaneFileDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRightPaneDragOver(false);

    if (!window.require) {
      setStatusMessage('Electron not available for file reading');
      return;
    }

    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    const path = window.require('path');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const AUDIO_EXTS = ['.wav', '.mp3', '.ogg'];
    const wemFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.wem'));
    const convertibleFiles = Array.from(files).filter((f) => AUDIO_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)));

    if (wemFiles.length === 0 && convertibleFiles.length > 0) {
      if (!isWwiseInstalled) {
        pendingConversion.current = { files: convertibleFiles, mode: 'inject' };
        setShowInstallModal(true);
      } else {
        setShowConvertOverlay(true);
        try {
          const newAudioNodes = [];
          for (let i = 0; i < convertibleFiles.length; i++) {
            const file = convertibleFiles[i];
            setConvertStatus(`Converting ${i + 1} / ${convertibleFiles.length}: ${file.name}`);
            const result = await ipcRenderer.invoke('audio:convert-to-wem', { inputPath: file.path });
            if (!result.success) {
              setStatusMessage(`Failed to convert ${file.name}: ${result.error}`);
              continue;
            }

            const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
            const baseName = path.basename(file.name, path.extname(file.name));
            const audioId = Date.now() + i;

            newAudioNodes.push({
              id: `converted-${audioId}`,
              name: `${baseName}.wem`,
              audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
              children: [],
            });

            try { fs.unlinkSync(result.wemPath); } catch (_) { }
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
          setStatusMessage(`Converted and loaded ${convertibleFiles.length} audio file(s)`);
        } catch (err) {
          setStatusMessage(`Conversion error: ${err.message}`);
        } finally {
          setShowConvertOverlay(false);
          setConvertStatus('');
        }
      }
      return;
    }

    if (wemFiles.length === 0) {
      setStatusMessage('Drop .wem, .wav, .mp3, or .ogg files here');
      return;
    }

    setStatusMessage(`Loading ${wemFiles.length} WEM file(s)...`);

    try {
      let idCounter = Date.now();
      const newNodes = [];
      for (const file of wemFiles) {
        try {
          const fileData = fs.readFileSync(file.path);
          const wemData = new Uint8Array(fileData);
          const audioId = idCounter++;
          newNodes.push({
            id: `dropped-${audioId}`,
            name: file.name,
            audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length },
            children: [],
          });
        } catch (err) {
          console.error(`[BnkExtract] Failed to read ${file.name}:`, err);
        }
      }

      if (newNodes.length > 0) {
        setRightTreeData((prev) => {
          const rootIdx = prev.findIndex((n) => n.id === '__converted-root__');
          if (rootIdx !== -1) {
            const newTree = [...prev];
            newTree[rootIdx] = { ...newTree[rootIdx], children: [...newTree[rootIdx].children, ...newNodes] };
            return newTree;
          }
          const rootNode = { id: '__converted-root__', name: 'Converted', audioData: null, isRoot: true, children: newNodes };
          return [rootNode, ...prev];
        });
        setRightExpandedNodes((prev) => { const s = new Set(prev); s.add('__converted-root__'); return s; });
        setStatusMessage(`Added ${newNodes.length} WEM file(s) to right pane`);
      }
    } catch (error) {
      console.error('[BnkExtract] File drop error:', error);
      setStatusMessage(`Error loading files: ${error.message}`);
    }
  }, [isWwiseInstalled, pendingConversion, setShowInstallModal, setShowConvertOverlay, setConvertStatus, setStatusMessage, setRightTreeData, setRightExpandedNodes, setRightPaneDragOver]);

  const handleRightPaneDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) setRightPaneDragOver(true);
  }, [setRightPaneDragOver]);

  const handleRightPaneDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setRightPaneDragOver(false);
  }, [setRightPaneDragOver]);

  return {
    handleDropReplace,
    handleRightPaneFileDrop,
    handleRightPaneDragOver,
    handleRightPaneDragLeave,
  };
}
