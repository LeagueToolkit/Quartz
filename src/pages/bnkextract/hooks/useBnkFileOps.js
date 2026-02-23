import { useCallback } from 'react';
import { writeBnkFile, writeWpkFile } from '../utils/bnkParser';
import { wemToOgg, wemToWav, wemToMp3 } from '../utils/wemConverter';

export function useBnkFileOps({
  activePane,
  treeData,
  rightTreeData,
  selectedNodes,
  rightSelectedNodes,
  setTreeData,
  setRightTreeData,
  setStatusMessage,
  setIsLoading,
  pushToHistory,
  extractFormats,
  mp3Bitrate,
  codebookDataRef,
}) {
  const handleExtract = useCallback(async () => {
    const targetTree = activePane === 'left' ? treeData : rightTreeData;
    const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;
    if (targetSelection.size === 0) {
      setStatusMessage('No selection in target pane');
      return;
    }
    if (!window.require) return;

    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    const path = window.require('path');

    const result = await ipcRenderer.invoke('dialog:openDirectory');
    if (!result || result.canceled || !result.filePaths?.length) return;

    const outputDir = result.filePaths[0];
    let extractedCount = 0;
    const needsWav = extractFormats.has('wav');
    const needsMp3 = extractFormats.has('mp3');
    const needsOgg = extractFormats.has('ogg');
    const needsWem = extractFormats.has('wem');

    const extractNode = async (node, currentPath, isRoot = false) => {
      const sanitizedName = node.name.replace(/[<>:"/\\|?*]/g, '_');
      const targetPath = isRoot ? currentPath : path.join(currentPath, sanitizedName);

      if (node.audioData) {
        const baseFilename = node.name.replace(/\.(wem|wav|ogg|mp3)$/i, '');
        const baseLower = node.name.toLowerCase();
        const isAlreadyPlayable = baseLower.endsWith('.wav') || baseLower.endsWith('.ogg');
        const rawData = node.audioData.data;

        if (needsWem) {
          const wemExt = isAlreadyPlayable ? '' : '.wem';
          try { fs.writeFileSync(path.join(currentPath, baseFilename + wemExt), Buffer.from(rawData)); extractedCount++; } catch (_) { }
        }

        if (needsOgg) {
          try {
            let finalData = null;
            let finalExt = 'ogg';
            if (isAlreadyPlayable) {
              const magic = String.fromCharCode(rawData[0], rawData[1], rawData[2], rawData[3]);
              if (magic === 'RIFF' || magic === 'OggS') {
                finalData = rawData;
                finalExt = magic === 'RIFF' ? 'wav' : 'ogg';
              }
            }
            if (!finalData) {
              const oggData = wemToOgg(rawData, codebookDataRef.current);
              finalExt = oggData[0] === 0x52 && oggData[1] === 0x49 ? 'wav' : 'ogg';
              finalData = oggData;
            }
            fs.writeFileSync(path.join(currentPath, `${baseFilename}.${finalExt}`), Buffer.from(finalData));
            extractedCount++;
          } catch (_) { }
        }

        if (needsWav) {
          try {
            const wavData = await wemToWav(rawData, codebookDataRef.current);
            fs.writeFileSync(path.join(currentPath, `${baseFilename}.wav`), Buffer.from(wavData));
            extractedCount++;
          } catch (e) {
            console.warn('[BnkExtract] WAV conversion failed for', baseFilename, e.message);
          }
        }

        if (needsMp3) {
          try {
            const mp3Data = await wemToMp3(rawData, codebookDataRef.current, mp3Bitrate);
            fs.writeFileSync(path.join(currentPath, `${baseFilename}.mp3`), Buffer.from(mp3Data));
            extractedCount++;
          } catch (e) {
            console.warn('[BnkExtract] MP3 conversion failed for', baseFilename, e.message);
          }
        }
      } else if (node.children && node.children.length > 0) {
        if (!isRoot && !fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
        for (const child of node.children) {
          await extractNode(child, isRoot ? currentPath : targetPath, false);
        }
      }
    };

    const allNodesMap = new Map();
    const collectAll = (nodes) => {
      for (const n of nodes) {
        allNodesMap.set(n.id, n);
        if (n.children) collectAll(n.children);
      }
    };
    collectAll(targetTree);

    const selectedIds = Array.from(targetSelection);
    const topSelectedNodes = selectedIds
      .filter((id) => {
        const findAncestorSelected = (nodes, targetId) => {
          for (const n of nodes) {
            if (n.id === targetId) return false;
            if (targetSelection.has(n.id)) {
              const isDescendant = (parent, tid) => {
                if (!parent.children) return false;
                for (const c of parent.children) {
                  if (c.id === tid) return true;
                  if (isDescendant(c, tid)) return true;
                }
                return false;
              };
              if (isDescendant(n, targetId)) return true;
            }
            if (n.children && findAncestorSelected(n.children, targetId)) return true;
          }
          return false;
        };
        return !findAncestorSelected(targetTree, id);
      })
      .map((id) => allNodesMap.get(id));

    setIsLoading(true);
    setStatusMessage('Extracting...');
    try {
      for (const node of topSelectedNodes) await extractNode(node, outputDir, false);
      setStatusMessage(`Extracted ${extractedCount} file(s)`);
    } catch (err) {
      setStatusMessage(`Extract error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, extractFormats, mp3Bitrate, codebookDataRef, setIsLoading, setStatusMessage]);

  const handleReplace = useCallback(async () => {
    const targetTree = activePane === 'left' ? treeData : rightTreeData;
    const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;
    const setTreeDataFn = activePane === 'left' ? setTreeData : setRightTreeData;

    if (targetSelection.size === 0) {
      setStatusMessage('No selection in active pane');
      return;
    }
    if (!window.require) return;

    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');

    const result = await ipcRenderer.invoke('dialog:openFile', {
      title: 'Select Replacement WEM Files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'WEM Files', extensions: ['wem'] }, { name: 'All Files', extensions: ['*'] }],
    });

    if (!result || result.canceled || !result.filePaths?.length) return;

    pushToHistory();
    const selectedAudioNodes = [];
    const processedIds = new Set();

    const collectSelectedAudio = (nodes, selSet, isParentSelected = false) => {
      for (const node of nodes) {
        const nodeSelected = selSet.has(node.id) || isParentSelected;
        if (nodeSelected && node.audioData && !processedIds.has(node.id)) {
          selectedAudioNodes.push(node);
          processedIds.add(node.id);
        }
        if (node.children) collectSelectedAudio(node.children, selSet, nodeSelected);
      }
    };
    collectSelectedAudio(targetTree, targetSelection);

    if (selectedAudioNodes.length === 0) {
      setStatusMessage('No audio files found in selection');
      return;
    }

    const replacementPaths = result.filePaths;
    setTreeDataFn((prev) => {
      const updateInTree = (nodes) => nodes.map((n) => {
        const match = selectedAudioNodes.find((an) => an.id === n.id);
        if (match) {
          try {
            const fileIndex = selectedAudioNodes.indexOf(match) % replacementPaths.length;
            const srcPath = replacementPaths[fileIndex];
            const newData = fs.readFileSync(srcPath);
            return { ...n, audioData: { ...n.audioData, data: new Uint8Array(newData), length: newData.length } };
          } catch (e) {
            console.error(`[BnkExtract] Failed to replace ${n.name}:`, e);
            return n;
          }
        }
        if (n.children) return { ...n, children: updateInTree(n.children) };
        return n;
      });
      return updateInTree(prev);
    });

    setStatusMessage(`Replaced ${selectedAudioNodes.length} file(s) successfully`);
  }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, setTreeData, setRightTreeData, pushToHistory, setStatusMessage]);

  const handleMakeSilent = useCallback(async (options = {}) => {
    const pane = options.pane || activePane;
    const explicitIds = Array.isArray(options.nodeIds) && options.nodeIds.length > 0 ? options.nodeIds : null;
    const targetTree = pane === 'left' ? treeData : rightTreeData;
    const targetSelection = explicitIds ? new Set(explicitIds) : (pane === 'left' ? selectedNodes : rightSelectedNodes);
    const setTreeDataFn = pane === 'left' ? setTreeData : setRightTreeData;

    if (targetSelection.size === 0) {
      setStatusMessage('No selection in active pane');
      return;
    }
    if (!window.require) return;

    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');
    const path = window.require('path');

    try {
      pushToHistory();
      let resourcesPath = null;
      const resourcesPathResult = await ipcRenderer.invoke('getResourcesPath');
      if (resourcesPathResult) resourcesPath = resourcesPathResult;
      else {
        const appPathResult = await ipcRenderer.invoke('getAppPath');
        if (appPathResult) resourcesPath = path.join(appPathResult, '..', 'resources');
      }

      if (!resourcesPath) {
        setStatusMessage('Failed to locate app resources');
        return;
      }

      const silencePath = path.join(resourcesPath, 'silence.wem');
      if (!fs.existsSync(silencePath)) {
        const prodSilencePath = path.join(resourcesPath, 'app', 'public', 'silence.wem');
        if (fs.existsSync(prodSilencePath)) {
          const silenceData = new Uint8Array(fs.readFileSync(prodSilencePath));
          applySilence(silenceData);
          return;
        }
        setStatusMessage(`silence.wem not found at: ${silencePath}`);
        return;
      }

      const silenceData = new Uint8Array(fs.readFileSync(silencePath));
      applySilence(silenceData);

      function applySilence(data) {
        const selectedAudioNodes = [];
        const processedIds = new Set();
        const collectSelectedAudio = (nodes, selSet, isParentSelected = false) => {
          for (const node of nodes) {
            const nodeSelected = selSet.has(node.id) || isParentSelected;
            if (nodeSelected && node.audioData && !processedIds.has(node.id)) {
              selectedAudioNodes.push(node);
              processedIds.add(node.id);
            }
            if (node.children) collectSelectedAudio(node.children, selSet, nodeSelected);
          }
        };
        collectSelectedAudio(targetTree, targetSelection);

        if (selectedAudioNodes.length === 0) {
          setStatusMessage('No audio files found in selection');
          return;
        }

        setTreeDataFn((prev) => {
          const updateInTree = (nodes) => nodes.map((n) => {
            const match = selectedAudioNodes.find((an) => an.id === n.id);
            if (match) return { ...n, audioData: { ...n.audioData, data, length: data.length } };
            if (n.children) return { ...n, children: updateInTree(n.children) };
            return n;
          });
          return updateInTree(prev);
        });

        setStatusMessage(`Silenced ${selectedAudioNodes.length} file(s)`);
      }
    } catch (error) {
      console.error('[BnkExtract] Silence error:', error);
      setStatusMessage(`Error making silent: ${error.message}`);
    }
  }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, setTreeData, setRightTreeData, pushToHistory, setStatusMessage]);

  const handleSave = useCallback(async () => {
    const targetTree = activePane === 'left' ? treeData : rightTreeData;
    const targetSelection = activePane === 'left' ? selectedNodes : rightSelectedNodes;

    const allNodes = [];
    const collectNodes = (nodes) => {
      for (const node of nodes) {
        allNodes.push(node);
        if (node.children) collectNodes(node.children);
      }
    };
    collectNodes(targetTree);

    const rootNode = allNodes.find((n) => targetSelection.has(n.id) && n.isRoot);
    if (!rootNode) {
      setStatusMessage('Select a root node in active pane to save');
      return;
    }

    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const fs = window.require('fs');

    const result = await ipcRenderer.invoke('dialog:saveFile', {
      defaultPath: rootNode.originalPath || rootNode.name,
      filters: [{ name: 'Audio Files', extensions: ['bnk', 'wpk'] }],
    });

    if (!result || result.canceled || !result.filePath) return;

    try {
      const audioFiles = [];
      const seenIds = new Set();
      const collectAudio = (n) => {
        if (n.audioData && !seenIds.has(n.audioData.id)) {
          seenIds.add(n.audioData.id);
          audioFiles.push(n.audioData);
        }
        if (n.children) n.children.forEach(collectAudio);
      };
      collectAudio(rootNode);

      if (audioFiles.length === 0) {
        setStatusMessage('No audio data found in this root');
        return;
      }

      const outputData = result.filePath.toLowerCase().endsWith('.wpk')
        ? writeWpkFile(audioFiles)
        : writeBnkFile(audioFiles);

      fs.writeFileSync(result.filePath, Buffer.from(outputData));
      setStatusMessage(`Saved ${audioFiles.length} files to ${result.filePath}`);
    } catch (error) {
      console.error('[BnkExtract] Save error:', error);
      setStatusMessage(`Save error: ${error.message}`);
    }
  }, [activePane, treeData, rightTreeData, selectedNodes, rightSelectedNodes, setStatusMessage]);

  return {
    handleExtract,
    handleReplace,
    handleMakeSilent,
    handleSave,
  };
}
