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
  const normalizeEventKey = (name) => {
    const raw = String(name || '').trim().toLowerCase();
    if (!raw) return '';
    return raw.replace(/\.(wem|wav|ogg|mp3)$/i, '');
  };

  const normalizePathKey = (names) => names
    .map((n) => normalizeEventKey(n))
    .filter(Boolean)
    .join('/');

  const isNumericToken = (name) => /^\d+$/.test(String(name || '').trim());

  const collectAudioLeavesWithContext = (nodes, ancestors = [], out = []) => {
    for (const n of nodes || []) {
      const nextAncestors = [...ancestors, n];
      if (n.audioData) out.push({ node: n, ancestors: nextAncestors });
      if (n.children?.length) collectAudioLeavesWithContext(n.children, nextAncestors, out);
    }
    return out;
  };

  const deriveLeafKeys = ({ node, ancestors }) => {
    const names = ancestors.map((a) => String(a.name || '').trim()).filter(Boolean);
    const withoutRoot = names.slice(1);

    const semanticNames = withoutRoot.filter((n) => {
      const lower = n.toLowerCase();
      if (isNumericToken(lower)) return false;
      if (/\.(wem|wav|ogg|mp3)$/i.test(lower)) return false;
      if (/\.(bnk|wpk)$/i.test(lower)) return false;
      if (/\.wad\b/i.test(lower)) return false;
      return true;
    });

    const eventName = semanticNames.length ? normalizeEventKey(semanticNames[semanticNames.length - 1]) : '';
    const pathKey = semanticNames.length ? normalizePathKey(semanticNames) : '';
    const parentNumeric = (() => {
      for (let i = withoutRoot.length - 1; i >= 0; i--) {
        const token = String(withoutRoot[i] || '').trim();
        if (isNumericToken(token)) return token;
      }
      return '';
    })();

    const wemId = (() => {
      const m = String(node?.name || '').trim().match(/^(\d+)\.(wem|wav|ogg|mp3)$/i);
      return m ? m[1] : '';
    })();

    const wemPrefix = wemId.length > 3 ? wemId.slice(0, -2) : '';

    return { eventName, pathKey, parentNumeric, wemId, wemPrefix };
  };

  const handleAutoMatchByEventName = useCallback(() => {
    if (!treeData?.length) {
      setStatusMessage('Load a main BNK/WPK first');
      return;
    }
    if (!rightTreeData?.length) {
      setStatusMessage('Load reference bank(s) on the right first');
      return;
    }

    const rightLeaves = collectAudioLeavesWithContext(rightTreeData);
    if (rightLeaves.length === 0) {
      setStatusMessage('No reference audio found on the right side');
      return;
    }

    const sourceByEvent = new Map();
    const sourceByPath = new Map();
    const sourceByParentNumeric = new Map();
    const sourceByWemId = new Map();
    const sourceByWemPrefix = new Map();

    for (const src of rightLeaves) {
      const data = src.node?.audioData?.data;
      if (!data) continue;
      const keys = deriveLeafKeys(src);

      if (keys.eventName) {
        if (!sourceByEvent.has(keys.eventName)) sourceByEvent.set(keys.eventName, []);
        sourceByEvent.get(keys.eventName).push(data);
      }

      if (keys.pathKey) {
        if (!sourceByPath.has(keys.pathKey)) sourceByPath.set(keys.pathKey, []);
        sourceByPath.get(keys.pathKey).push(data);
      }

      if (keys.parentNumeric) {
        if (!sourceByParentNumeric.has(keys.parentNumeric)) sourceByParentNumeric.set(keys.parentNumeric, []);
        sourceByParentNumeric.get(keys.parentNumeric).push(data);
      }

      if (keys.wemId) {
        if (!sourceByWemId.has(keys.wemId)) sourceByWemId.set(keys.wemId, []);
        sourceByWemId.get(keys.wemId).push(data);
      }

      if (keys.wemPrefix) {
        if (!sourceByWemPrefix.has(keys.wemPrefix)) sourceByWemPrefix.set(keys.wemPrefix, []);
        sourceByWemPrefix.get(keys.wemPrefix).push(data);
      }
    }

    if (sourceByEvent.size === 0 && sourceByPath.size === 0 && sourceByParentNumeric.size === 0 && sourceByWemId.size === 0 && sourceByWemPrefix.size === 0) {
      setStatusMessage('No valid reference names found for auto-match');
      return;
    }

    const leftLeaves = collectAudioLeavesWithContext(treeData);
    let matchable = 0;
    for (const leaf of leftLeaves) {
      const keys = deriveLeafKeys(leaf);
      if (
        (keys.pathKey && sourceByPath.has(keys.pathKey))
        || (keys.eventName && sourceByEvent.has(keys.eventName))
        || (keys.wemPrefix && sourceByWemPrefix.has(keys.wemPrefix))
        || (keys.parentNumeric && sourceByParentNumeric.has(keys.parentNumeric))
        || (keys.wemId && sourceByWemId.has(keys.wemId))
      ) {
        matchable++;
      }
    }

    if (matchable === 0) {
      // Debug aids for mismatched banks: print key-space overlap hints.
      const leftEventKeys = new Set();
      const leftPathKeys = new Set();
      const rightEventKeys = new Set(sourceByEvent.keys());
      const rightPathKeys = new Set(sourceByPath.keys());
      for (const leaf of leftLeaves) {
        const keys = deriveLeafKeys(leaf);
        if (keys.eventName) leftEventKeys.add(keys.eventName);
        if (keys.pathKey) leftPathKeys.add(keys.pathKey);
      }
      const eventOverlap = [...leftEventKeys].filter((k) => rightEventKeys.has(k)).length;
      const pathOverlap = [...leftPathKeys].filter((k) => rightPathKeys.has(k)).length;
      console.log('[BNK AutoMatch] No matches. Diagnostics:', {
        leftEventCount: leftEventKeys.size,
        rightEventCount: rightEventKeys.size,
        eventOverlap,
        leftPathCount: leftPathKeys.size,
        rightPathCount: rightPathKeys.size,
        pathOverlap,
        leftEventSample: [...leftEventKeys].slice(0, 12),
        rightEventSample: [...rightEventKeys].slice(0, 12),
        leftPathSample: [...leftPathKeys].slice(0, 12),
        rightPathSample: [...rightPathKeys].slice(0, 12),
      });
      setStatusMessage('No matching event names found (see console diagnostics)');
      return;
    }

    pushToHistory();

    const keyUseIndex = new Map();
    let replacedCount = 0;
    let changedAudioIds = 0;
    const changedIdSet = new Set();

    setTreeData((prev) => {
      const patchNodes = (nodes, ancestors = []) => nodes.map((n) => {
        const nextAncestors = [...ancestors, n];
        if (!n.audioData) {
          if (n.children?.length) return { ...n, children: patchNodes(n.children, nextAncestors) };
          return n;
        }

        const keys = deriveLeafKeys({ node: n, ancestors: nextAncestors });
        const matchKey =
          (keys.pathKey && sourceByPath.has(keys.pathKey) && `path:${keys.pathKey}`)
          || (keys.eventName && sourceByEvent.has(keys.eventName) && `event:${keys.eventName}`)
          || (keys.wemPrefix && sourceByWemPrefix.has(keys.wemPrefix) && `prefix:${keys.wemPrefix}`)
          || (keys.parentNumeric && sourceByParentNumeric.has(keys.parentNumeric) && `pid:${keys.parentNumeric}`)
          || (keys.wemId && sourceByWemId.has(keys.wemId) && `wem:${keys.wemId}`)
          || '';

        if (!matchKey) return n;

        const pool = matchKey.startsWith('path:') ? sourceByPath.get(keys.pathKey)
          : matchKey.startsWith('event:') ? sourceByEvent.get(keys.eventName)
            : matchKey.startsWith('prefix:') ? sourceByWemPrefix.get(keys.wemPrefix)
              : matchKey.startsWith('pid:') ? sourceByParentNumeric.get(keys.parentNumeric)
                : sourceByWemId.get(keys.wemId);
        if (!pool || pool.length === 0) return n;

        const useIdx = keyUseIndex.get(matchKey) || 0;
        const data = pool[useIdx % pool.length];
        keyUseIndex.set(matchKey, useIdx + 1);

        replacedCount++;
        if (!changedIdSet.has(n.audioData.id)) {
          changedIdSet.add(n.audioData.id);
          changedAudioIds++;
        }
        return {
          ...n,
          isModified: true,
          audioData: {
            ...n.audioData,
            data,
            length: data.length,
            isModified: true
          }
        };
      });
      return patchNodes(prev);
    });

    setStatusMessage(
      `Auto-matched ${replacedCount} node(s) across ${changedAudioIds} audio id(s) by event name`,
    );
  }, [treeData, rightTreeData, pushToHistory, setTreeData, setStatusMessage]);

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
    const updatesByName = new Map();
    for (let i = 0; i < targetAudioNodes.length; i++) {
      const targetNode = targetAudioNodes[i];
      const sourceNode = sourceNodes[i % sourceNodes.length];
      const targetAudioId = targetNode.audioData.id;
      if (!updates.has(targetAudioId)) updates.set(targetAudioId, sourceNode.audioData.data);
      const targetName = String(targetNode.name || '').toLowerCase().trim();
      if (targetName && !updatesByName.has(targetName)) updatesByName.set(targetName, sourceNode.audioData.data);
    }

    setTreeData((prev) => {
      const updateInTree = (nodes) => nodes.map((n) => {
        if (n.audioData) {
          const byId = updates.get(n.audioData.id);
          const byName = updatesByName.get(String(n.name || '').toLowerCase().trim());
          const newData = byId || byName || null;
          if (newData) {
            replacedCount++;
            return {
              ...n,
              isModified: true,
              audioData: {
                ...n.audioData,
                data: newData,
                length: newData.length,
                isModified: true
              }
            };
          }
        }
        if (n.children) return { ...n, children: updateInTree(n.children) };
        return n;
      });
      return updateInTree(prev);
    });

    const targetLeafCount = targetAudioNodes.length;
    if (targetLeafCount > 0 && replacedCount > targetLeafCount) {
      setStatusMessage(`Replaced audio in ${replacedCount} instance(s) across duplicate event names using ${sourceNodes.length} source file(s)`);
    } else {
      setStatusMessage(`Replaced audio in ${replacedCount} instance(s) using ${sourceNodes.length} source file(s)`);
    }
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
          setConvertStatus(`Converting ${convertibleFiles.length} file(s) with Wwise...`);
          const batchResult = await ipcRenderer.invoke('audio:convert-to-wem-batch', {
            inputs: convertibleFiles.map((f) => ({ inputPath: f.path })),
          });

          if (!batchResult.success) {
            setStatusMessage(`Conversion failed: ${batchResult.error}`);
            return;
          }

          const newAudioNodes = [];
          const timestamp = Date.now();
          for (let i = 0; i < convertibleFiles.length; i++) {
            const file = convertibleFiles[i];
            const result = batchResult.results[i];
            if (!result?.success) {
              setStatusMessage(`Failed to convert ${file.name}: ${result?.error}`);
              continue;
            }

            const wemData = new Uint8Array(fs.readFileSync(result.wemPath));
            const baseName = path.basename(file.name, path.extname(file.name));
            const audioId = timestamp + i;

            newAudioNodes.push({
              id: `converted-${audioId}`,
              name: `${baseName}.wem`,
              isModified: true,
              audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length, isModified: true },
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
            isModified: true,
            audioData: { id: audioId, data: wemData, offset: 0, length: wemData.length, isModified: true },
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
    handleAutoMatchByEventName,
    handleDropReplace,
    handleRightPaneFileDrop,
    handleRightPaneDragOver,
    handleRightPaneDragLeave,
  };
}
