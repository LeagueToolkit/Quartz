import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import electronPrefs from '../../../utils/core/electronPrefs.js';
import { parseVfxEmitters } from '../../../utils/vfx/vfxEmitterParser.js';
import { extractExistingPersistentConditions, insertMultiplePersistentEffects } from '../../../utils/vfx/mutations/persistentEffectsManager.js';
import { generateModifiedPythonFromSystems, loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';
import { removeEmitterBlockFromSystem } from '../utils/pyContentUtils.js';
import { convertTextureToPNG, findActualTexturePath } from '../../../utils/assets/textureConverter.js';
import { openAssetPreview } from '../../../utils/assets/assetPreviewEvent.js';
import debounce from 'lodash/debounce';
import useUnsavedNavigationGuard from '../../../hooks/navigation/useUnsavedNavigationGuard.js';
import {
  cancelTextureHoverClose,
  removeTextureHoverPreview,
  scheduleTextureHoverClose,
  showTextureHoverError,
  showTextureHoverPreview
} from '../../../components/modals/textureHoverPreview.js';

// Sub-hooks
import useVfxHistory from './useVfxHistory';
import useIdleParticles from './useIdleParticles';
import useChildParticles from './useChildParticles';
import usePersistentEffects from './usePersistentEffects';
import useVfxMutations from './useVfxMutations';
import useVfxFile from './useVfxFile';

// Utils
import {
  extractColorsFromEmitterContent,
  extractTextureNamesFromEmitter,
  extractTexturesFromEmitterContent
} from '../utils/vfxUtils.js';

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

/**
 * usePort — Orchestrator hook for Port2 VFX tool.
 */
export default function usePort() {
  const navigate = useNavigate();

  // Shared state
  const [statusMessage, setStatusMessage] = useState('Ready - Select files to begin porting');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [fileSaved, setFileSaved] = useState(true);
  const [deletedEmitters, setDeletedEmitters] = useState(new Map());
  const [selectedTargetSystem, setSelectedTargetSystem] = useState(null);
  const [collapsedTargetSystems, setCollapsedTargetSystems] = useState(new Set());
  const [collapsedDonorSystems, setCollapsedDonorSystems] = useState(new Set());

  const handleToggleTargetCollapse = useCallback((key) => {
    setCollapsedTargetSystems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleToggleDonorCollapse = useCallback((key) => {
    setCollapsedDonorSystems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const [recentCreatedSystemKeys, setRecentCreatedSystemKeys] = useState([]);
  const [isPortAllLoading, setIsPortAllLoading] = useState(false);
  const [showRitobinWarning, setShowRitobinWarning] = useState(false);
  const [ritobinWarningContent, setRitobinWarningContent] = useState(null);

  // Filters
  const [targetFilter, setTargetFilter] = useState('');
  const [donorFilter, setDonorFilter] = useState('');
  const [targetFilterInput, setTargetFilterInput] = useState('');
  const [donorFilterInput, setDonorFilterInput] = useState('');
  const [enableTargetEmitterSearch, setEnableTargetEmitterSearch] = useState(false);
  const [enableDonorEmitterSearch, setEnableDonorEmitterSearch] = useState(false);

  // UI / Modal states
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const [showNamePromptModal, setShowNamePromptModal] = useState(false);
  const [showNewSystemModal, setShowNewSystemModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const [newSystemName, setNewSystemName] = useState('');
  const [matrixModalState, setMatrixModalState] = useState({ open: false, systemKey: null, systemName: '' });
  const [dragStartedKey, setDragStartedKey] = useState(null);
  const [pressedSystemKey, setPressedSystemKey] = useState(null);
  const [draggedEmitter, setDraggedEmitter] = useState(null);
  const [isDragOverVfx, setIsDragOverVfx] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);

  // Rename states
  const [renamingEmitter, setRenamingEmitter] = useState(null);
  const [renamingSystem, setRenamingSystem] = useState(null);

  // Refs
  const activeConversions = useRef(new Set());
  const conversionTimers = useRef(new Map());
  const donorPyContentRef = useRef('');
  const targetPyContentRef = useRef('');
  const backgroundSaveTimerRef = useRef(null);
  const targetListRef = useRef(null);
  const donorListRef = useRef(null);
  const dragEnterCounter = useRef(0);
  const textureCloseTimerRef = useRef(null);

  // Sub-hooks initialization
  const history = useVfxHistory();

  const file = useVfxFile(
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    setFileSaved,
    setRitobinWarningContent,
    setShowRitobinWarning,
    history.setUndoHistory,
    setDeletedEmitters,
    setSelectedTargetSystem,
    setCollapsedTargetSystems,
    setCollapsedDonorSystems,
    electronPrefs
  );

  const hasResourceResolver = file.hasResourceResolver;
  const hasSkinCharacterData = file.hasSkinCharacterData;

  // Wrap saveStateToHistory so sub-hooks always capture a full state snapshot.
  // The raw history.saveStateToHistory(desc, stateObj) requires the caller to
  // pass a state object, but every sub-hook was calling it with only a
  // description — leaving targetSystems/targetPyContent undefined in the undo
  // entry, which caused undo to restore an empty target list.
  const wrappedSaveStateToHistory = useCallback((desc) => {
    history.saveStateToHistory(desc, {
      targetSystems: JSON.parse(JSON.stringify(file.targetSystems || {})),
      targetPyContent: file.targetPyContent,
      selectedTargetSystem,
      deletedEmitters: new Map(deletedEmitters)
    });
  }, [history.saveStateToHistory, file.targetSystems, file.targetPyContent, selectedTargetSystem, deletedEmitters]);

  const idle = useIdleParticles(
    file.targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    wrappedSaveStateToHistory,
    file.setTargetPyContent,
    setFileSaved,
    setStatusMessage
  );

  const child = useChildParticles(
    file.targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    deletedEmitters,
    wrappedSaveStateToHistory,
    file.setTargetPyContent,
    file.setTargetSystems,
    setFileSaved,
    setStatusMessage
  );

  const persistent = usePersistentEffects(
    file.targetPyContent,
    hasResourceResolver,
    hasSkinCharacterData,
    wrappedSaveStateToHistory,
    file.setTargetPyContent,
    setFileSaved,
    setStatusMessage
  );

  const mutations = useVfxMutations(
    file.targetPyContent,
    file.donorPyContent,
    file.targetSystems,
    file.donorSystems,
    file.targetPath,
    file.donorPath,
    deletedEmitters,
    wrappedSaveStateToHistory,
    file.setTargetPyContent,
    file.setTargetSystems,
    file.setDonorSystems,
    setDeletedEmitters,
    setRenamingEmitter,
    setRenamingSystem,
    setSelectedTargetSystem,
    setRecentCreatedSystemKeys,
    setFileSaved,
    setIsPortAllLoading,
    setIsProcessing,
    setProcessingText,
    setStatusMessage,
    electronPrefs,
    backgroundSaveTimerRef,
    targetPyContentRef,
    recentCreatedSystemKeys,
    selectedTargetSystem
  );

  // Sync refs
  useEffect(() => { targetPyContentRef.current = file.targetPyContent; }, [file.targetPyContent]);
  useEffect(() => { donorPyContentRef.current = file.donorPyContent; }, [file.donorPyContent]);

  // Handle file selection from Custom Explorer
  useEffect(() => {
    const handleSelected = (event) => {
      const { path, mode } = event.detail;
      console.log(`[usePort] asset-preview-selected event: mode=${mode}, path=${path}`);
      if (mode === 'port-target') {
        file.processTargetBin(path);
      } else if (mode === 'port-donor') {
        file.processDonorBin(path);
      }
    };
    window.addEventListener('asset-preview-selected', handleSelected);
    return () => window.removeEventListener('asset-preview-selected', handleSelected);
  }, [file.processTargetBin, file.processDonorBin]);

  // Filter Logic (Debounced)
  const filterTargetParticles = useCallback(debounce(setTargetFilter, 200), []);
  const filterDonorParticles = useCallback(debounce(setDonorFilter, 200), []);

  useEffect(() => { setTargetFilterInput(targetFilter); }, [targetFilter]);
  useEffect(() => { setDonorFilterInput(donorFilter); }, [donorFilter]);

  // Derived filtered systems
  const filteredTargetSystems = useMemo(() => {
    const safeTargetSystems = file.targetSystems || {};
    if (!targetFilter) return Object.values(safeTargetSystems);
    const term = targetFilter.toLowerCase();
    return Object.values(safeTargetSystems).map(sys => {
      const sysName = (sys.particleName || sys.name || sys.key || '').toLowerCase();
      if (sysName.includes(term)) return sys;
      if (enableTargetEmitterSearch && sys.emitters) {
        const matching = sys.emitters.filter(e => (e.name || '').toLowerCase().includes(term));
        if (matching.length > 0) return { ...sys, emitters: matching };
      }
      return null;
    }).filter(s => s !== null);
  }, [file.targetSystems, targetFilter, enableTargetEmitterSearch]);

  const filteredDonorSystems = useMemo(() => {
    const safeDonorSystems = file.donorSystems || {};
    if (!donorFilter) return Object.values(safeDonorSystems);
    const term = donorFilter.toLowerCase();
    return Object.values(safeDonorSystems).map(sys => {
      const sysName = (sys.particleName || sys.name || sys.key || '').toLowerCase();
      if (sysName.includes(term)) return sys;
      if (enableDonorEmitterSearch && sys.emitters) {
        const matching = sys.emitters.filter(e => (e.name || '').toLowerCase().includes(term));
        if (matching.length > 0) return { ...sys, emitters: matching };
      }
      return null;
    }).filter(s => s !== null);
  }, [file.donorSystems, donorFilter, enableDonorEmitterSearch]);

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      setStatusMessage('Saving modified target file...');
      setFileSaved(false);

      await new Promise(r => setTimeout(r, 10));

      if (!file.targetPyContent || Object.keys(file.targetSystems || {}).length === 0) {
        setStatusMessage('No target file loaded');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      const existingPersistent = extractExistingPersistentConditions(file.targetPyContent);
      let modifiedContent = file.targetPyContent;
      const preSaveSystems = file.targetSystems || {};

      const hasDeleted = deletedEmitters.size > 0;
      let hasEmittersWithoutFullData = false;
      for (const sName in file.targetSystems) {
        if (file.targetSystems[sName].emitters?.some(e => !e.originalContent)) {
          hasEmittersWithoutFullData = true; break;
        }
      }

      if (hasDeleted || hasEmittersWithoutFullData) {
        const systemsForSave = {};
        for (const [key, sys] of Object.entries(file.targetSystems)) {
          const emitters = sys.emitters?.map(e => e.originalContent ? e : (loadEmitterData(sys, e.name) || e)) || [];
          systemsForSave[key] = { ...sys, emitters };
        }
        modifiedContent = generateModifiedPythonFromSystems(file.targetPyContent, systemsForSave);
      }

      let finalContent = modifiedContent;
      try {
        const nowPersistent = extractExistingPersistentConditions(modifiedContent) || [];
        const needsReinsert = (existingPersistent || []).length > 0 &&
          (nowPersistent.length === 0 || existingPersistent.map(c => c.originalText).join('') !== nowPersistent.map(c => c.originalText).join(''));
        if (needsReinsert) finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistent);
      } catch (e) { }

      const outputPyPath = file.targetPath.replace('.bin', '.py');
      const fsPromise = window.require('fs').promises;
      await fsPromise.writeFile(outputPyPath, finalContent, 'utf8');

      const ritoBinPath = await electronPrefs.get('RitoBinPath');
      if (!ritoBinPath) {
        setStatusMessage('RitoBin path not configured');
        setIsProcessing(false);
        return;
      }

      const { spawn } = window.require('child_process');
      const proc = spawn(ritoBinPath, [outputPyPath, file.targetPath], {
        windowsHide: true,
        stdio: 'ignore'
      });

      proc.on('close', (code) => {
        if (code === 0) {
          setStatusMessage('✅ Successfully saved');
          file.setTargetPyContent(finalContent);
          const reparsedSystems = parseVfxEmitters(finalContent) || {};
          const mergedSystems = Object.fromEntries(
            Object.entries(reparsedSystems).map(([key, sys]) => {
              const priorByKey = preSaveSystems[key];
              const priorByName = Object.values(preSaveSystems).find((prev) =>
                (prev?.particleName || prev?.name || prev?.key) ===
                (sys?.particleName || sys?.name || sys?.key)
              );
              const prior = priorByKey || priorByName;
              if (!prior) return [key, sys];
              return [key, {
                ...sys,
                ported: prior.ported === true ? true : sys.ported,
                portedAt: prior.portedAt || sys.portedAt,
                createdAt: prior.createdAt || sys.createdAt,
              }];
            })
          );
          file.setTargetSystems(mergedSystems);
          setDeletedEmitters(new Map());
          setFileSaved(true);

          // Non-blocking: regenerate .py from saved .bin to normalize indentation/format.
          try {
            const binToPyProc = spawn(ritoBinPath, [file.targetPath, outputPyPath], {
              windowsHide: true,
              stdio: 'ignore'
            });
            binToPyProc.on('error', (err) => {
              console.warn('[Port2] Non-critical indentation fix failed to start:', err);
            });
          } catch (err) {
            console.warn('[Port2] Non-critical indentation fix failed:', err);
          }
        } else {
          setStatusMessage('❌ Error saving file');
          setFileSaved(false);
          file.setShowRitoBinErrorDialog(true);
        }
        setIsProcessing(false);
        setProcessingText('');
      });
    } catch (e) {
      console.error(e);
      setStatusMessage(`Error: ${e.message}`);
      setFileSaved(false);
      setIsProcessing(false);
    }
  };

  const unsavedGuard = useUnsavedNavigationGuard({
    fileSaved,
    setFileSaved,
    onSave: handleSave,
    navigate,
  });

  const handleOpenBackupViewer = () => file.setShowBackupViewer(true);
  const handleOpenNewSystemModal = () => {
    setNewSystemName('');
    setShowNewSystemModal(true);
  };
  const handleClearSelection = () => setSelectedTargetSystem(null);

  const showTexturePreview = async (firstTexturePath, firstDataUrl, buttonElement, emitterData = null, allTextures = []) => {
    const textureData = (allTextures && allTextures.length > 0)
      ? allTextures
      : [{ path: firstTexturePath, label: 'Main', dataUrl: firstDataUrl }];

    const colorData = emitterData?.originalContent
      ? extractColorsFromEmitterContent(emitterData.originalContent)
      : [];

    showTextureHoverPreview({
      previewId: 'shared-texture-hover-preview',
      textureData,
      buttonElement,
      colorData,
    });
  };

  const showTextureError = (texturePath, buttonElement) => {
    showTextureHoverError({
      previewId: 'shared-texture-hover-preview',
      texturePath,
      buttonElement,
    });
  };

  const [trimTargetNames, setTrimTargetNames] = useState(() => JSON.parse(localStorage.getItem('port_trimTargetNames') || 'true'));
  const [trimDonorNames, setTrimDonorNames] = useState(() => JSON.parse(localStorage.getItem('port_trimDonorNames') || 'true'));
  useEffect(() => { localStorage.setItem('port_trimTargetNames', JSON.stringify(trimTargetNames)); }, [trimTargetNames]);
  useEffect(() => { localStorage.setItem('port_trimDonorNames', JSON.stringify(trimDonorNames)); }, [trimDonorNames]);

  // Exported properties matching Port2.js requirements
  return {
    // Hooks spreads
    ...file,
    ...idle,
    ...child,
    ...persistent,
    ...mutations,
    ...history,

    // Orchestrator state and setters
    statusMessage, setStatusMessage,
    isProcessing, setIsProcessing,
    processingText, setProcessingText,
    fileSaved, setFileSaved,
    deletedEmitters, setDeletedEmitters,
    selectedTargetSystem, setSelectedTargetSystem,
    collapsedTargetSystems, setCollapsedTargetSystems,
    collapsedDonorSystems, setCollapsedDonorSystems,
    handleToggleTargetCollapse,
    handleToggleDonorCollapse,
    recentCreatedSystemKeys, setRecentCreatedSystemKeys,
    isPortAllLoading, setIsPortAllLoading,
    showUnsavedDialog: unsavedGuard.showUnsavedDialog,
    setShowUnsavedDialog: unsavedGuard.setShowUnsavedDialog,
    showRitobinWarning, setShowRitobinWarning,
    ritobinWarningContent, setRitobinWarningContent,
    hasResourceResolver,
    hasSkinCharacterData,
    targetFilter, setTargetFilter,
    donorFilter, setDonorFilter,
    targetFilterInput, setTargetFilterInput,
    donorFilterInput, setDonorFilterInput,
    enableTargetEmitterSearch, setEnableTargetEmitterSearch,
    enableDonorEmitterSearch, setEnableDonorEmitterSearch,
    renamingEmitter, setRenamingEmitter,
    renamingSystem, setRenamingSystem,
    actionsMenuAnchor, setActionsMenuAnchor,
    showNamePromptModal, setShowNamePromptModal,
    showNewSystemModal, setShowNewSystemModal,
    showMatrixModal, setShowMatrixModal,
    namePromptValue, setNamePromptValue,
    newSystemName, setNewSystemName,
    matrixModalState, setMatrixModalState,
    dragStartedKey, setDragStartedKey,
    pressedSystemKey, setPressedSystemKey,
    draggedEmitter, setDraggedEmitter,
    isDragOverVfx, setIsDragOverVfx,
    pendingDrop, setPendingDrop,

    // Derived
    filteredTargetSystems,
    filteredDonorSystems,

    // Refs
    activeConversions,
    conversionTimers,
    donorPyContentRef,
    targetPyContentRef,
    backgroundSaveTimerRef,
    targetListRef,
    donorListRef,
    dragEnterCounter,
    textureCloseTimerRef,
    handleEmitterMouseEnter: useCallback(async (e, emitter, system, isTarget) => {
      e.stopPropagation();
      cancelTextureHoverClose('shared-texture-hover-preview');
      if (textureCloseTimerRef.current) {
        clearTimeout(textureCloseTimerRef.current);
        textureCloseTimerRef.current = null;
      }

      if (conversionTimers.current.has('hover')) {
        clearTimeout(conversionTimers.current.get('hover'));
        conversionTimers.current.delete('hover');
      }

      const previewBtn = e.currentTarget;
      const timer = setTimeout(async () => {
        try {
          let fullEmitterData = null;
          let emitterContent = null;

          if (emitter.startLine !== undefined && system.rawContent) {
            const lines = system.rawContent.split('\n');
            if (emitter.startLine < lines.length) {
              const safeEnd = Math.min(lines.length, (emitter.endLine || emitter.startLine + 200) + 5);
              emitterContent = lines.slice(emitter.startLine, safeEnd).join('\n');
              fullEmitterData = {
                name: emitter.name,
                originalContent: emitterContent,
                texturePath: emitter.texturePath || null
              };
            }
          }

          if (!fullEmitterData) {
            fullEmitterData = loadEmitterData(system, emitter.name);
            if (!fullEmitterData) return;
            emitterContent = fullEmitterData.originalContent;
          }

          const textures = extractTexturesFromEmitterContent(emitterContent || fullEmitterData.originalContent);
          if (textures.length === 0 && fullEmitterData.texturePath) {
            textures.push({ path: fullEmitterData.texturePath, label: 'Main' });
          }

          if (textures.length === 0) return;

          const textureData = [];
          const binPath = isTarget ? file.targetPath : file.donorPath;
          const projectRoot = binPath && binPath.includes(':') ? path.dirname(binPath) : '';

          for (const tex of textures) {
            try {
              let resolvedDiskPath = tex.path;
              if (window.require && binPath && binPath.includes(':')) {
                const fs = window.require('fs');
                const path = window.require('path');
                const normalizedBin = binPath.replace(/\\/g, '/');
                const dataMatch = normalizedBin.match(/\/data\//i);

                if (dataMatch) {
                  const projRoot = normalizedBin.substring(0, dataMatch.index);
                  const cleanTexture = tex.path.replace(/\\/g, '/');
                  const candidate = path.join(projRoot, cleanTexture);
                  if (fs.existsSync(candidate)) resolvedDiskPath = candidate;
                }

                if (resolvedDiskPath === tex.path) {
                  const smartPath = findActualTexturePath(tex.path, binPath);
                  if (smartPath) resolvedDiskPath = smartPath;
                }
              }

              const result = await convertTextureToPNG(tex.path, file.targetPath, file.donorPath, projectRoot);
              let dataUrl = null;
              if (result) {
                if (result.startsWith('data:')) {
                  dataUrl = result;
                } else {
                  const fs = window.require('fs');
                  if (fs.existsSync(result)) {
                    const imageBuffer = fs.readFileSync(result);
                    dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                  }
                }
              }
              textureData.push({ ...tex, dataUrl, resolvedDiskPath });
            } catch (err) {
              console.error('Error processing texture:', tex.path, err);
              textureData.push({ ...tex, dataUrl: null, resolvedDiskPath: tex.path });
            }
          }

          if (textureData.length > 0) {
            showTexturePreview(textureData[0].path, textureData[0].dataUrl, previewBtn, fullEmitterData, textureData);
          }
        } catch (error) {
          console.error('Error loading texture objects:', error);
        }
      }, 200);

      conversionTimers.current.set('hover', timer);
    }, [file.targetPath, file.donorPath, showTexturePreview]),

    handleEmitterMouseLeave: useCallback((e) => {
      e.stopPropagation();
      if (conversionTimers.current.has('hover')) {
        clearTimeout(conversionTimers.current.get('hover'));
        conversionTimers.current.delete('hover');
      }

      scheduleTextureHoverClose('shared-texture-hover-preview', 500);
    }, []),

    handleEmitterClick: useCallback((e, emitter, system, isTarget) => {
      e.stopPropagation();
      removeTextureHoverPreview('shared-texture-hover-preview');
      if (textureCloseTimerRef.current) {
        clearTimeout(textureCloseTimerRef.current);
        textureCloseTimerRef.current = null;
      }

      if (conversionTimers.current.has('hover')) {
        clearTimeout(conversionTimers.current.get('hover'));
        conversionTimers.current.delete('hover');
      }

      const fullEmitterData = loadEmitterData(system, emitter.name);
      if (fullEmitterData && fullEmitterData.texturePath) {
        const texturePath = fullEmitterData.texturePath;
        const binPath = isTarget ? file.targetPath : file.donorPath;
        let resolvedPath = texturePath;

        if (binPath && binPath !== 'This will show target bin' && binPath !== 'This will show donor bin') {
          const fs = window.require('fs');
          const path = window.require('path');
          const normalizedBin = binPath.replace(/\\/g, '/');
          const dataMatch = normalizedBin.match(/\/data\//i);

          if (dataMatch) {
            const dataIndex = dataMatch.index;
            const projectRoot = normalizedBin.substring(0, dataIndex);
            const cleanTexture = texturePath.replace(/\\/g, '/');
            const candidate1 = path.join(projectRoot, cleanTexture);
            if (fs.existsSync(candidate1)) {
              resolvedPath = candidate1;
            }
          }

          if (resolvedPath === texturePath) {
            const smartPath = findActualTexturePath(texturePath, binPath);
            if (smartPath) resolvedPath = smartPath;
          }
        }

        openAssetPreview(resolvedPath);
      }
    }, [file.targetPath, file.donorPath]),

    handleEmitterContextMenu: useCallback(async (e, emitter, system, isTarget) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const fullEmitterData = loadEmitterData(system, emitter.name);
        if (fullEmitterData && fullEmitterData.texturePath) {
          const texturePath = fullEmitterData.texturePath;
          const binPath = isTarget ? file.targetPath : file.donorPath;
          let resolvedPath = texturePath;

          if (binPath && binPath !== 'This will show target bin' && binPath !== 'This will show donor bin') {
            const fs = window.require('fs');
            const path = window.require('path');
            const normalizedBin = binPath.replace(/\\/g, '/');
            const dataMatch = normalizedBin.match(/\/data\//i);

            if (dataMatch) {
              const dataIndex = dataMatch.index;
              const projectRoot = normalizedBin.substring(0, dataIndex);
              const cleanTexture = texturePath.replace(/\\/g, '/');
              const candidate1 = path.join(projectRoot, cleanTexture);
              if (fs.existsSync(candidate1)) {
                resolvedPath = candidate1;
              }
            }

            if (resolvedPath === texturePath) {
              const smartPath = findActualTexturePath(texturePath, binPath);
              if (smartPath) resolvedPath = smartPath;
            }
          }

          if (window.require) {
            const { shell } = window.require('electron');
            if (shell) {
              await shell.openPath(resolvedPath);
            }
          }
        }
      } catch (err) {
        console.error("Error opening external app:", err);
      }
    }, [file.targetPath, file.donorPath]),

    // Handlers
    handleSave,
    hasChangesToSave: () => !fileSaved,
    handleOpenTargetBin: file.handleOpenTargetBin,
    handleOpenDonorBin: file.handleOpenDonorBin,
    handleOpenBackupViewer,
    handleOpenNewSystemModal,
    handleClearSelection,
    handleUndo: (manualState = null) => {
      // Guard: onClick passes a SyntheticEvent — ignore it.
      const isRealState = manualState && typeof manualState === 'object' && !manualState.nativeEvent && manualState.targetSystems;
      if (isRealState) {
        file.setTargetSystems(manualState.targetSystems || {});
        file.setTargetPyContent(manualState.targetPyContent);
        setSelectedTargetSystem(manualState.selectedTargetSystem);
        setDeletedEmitters(manualState.deletedEmitters || new Map());
        setFileSaved(false);
        return;
      }
      history.handleUndo(state => {
        if (state) {
          file.setTargetSystems(state.targetSystems || {});
          file.setTargetPyContent(state.targetPyContent);
          setSelectedTargetSystem(state.selectedTargetSystem);
          setDeletedEmitters(state.deletedEmitters || new Map());
          setFileSaved(false);
        }
      });
    },
    saveStateToHistory: wrappedSaveStateToHistory,
    handleUnsavedSave: unsavedGuard.handleUnsavedSave,
    handleUnsavedDiscard: unsavedGuard.handleUnsavedDiscard,
    handleUnsavedCancel: unsavedGuard.handleUnsavedCancel,
    handleVersions: () => { },
    showTexturePreview,
    extractTexturesFromEmitterContent,

    // Utils
    navigate,
    extractColorsFromEmitterContent,
    extractTextureNamesFromEmitter,
    showTextureError,
    removeEmitterBlockFromSystem,
    trimTargetNames, setTrimTargetNames,
    trimDonorNames, setTrimDonorNames,
    filterTargetParticles,
    filterDonorParticles
  };
}



