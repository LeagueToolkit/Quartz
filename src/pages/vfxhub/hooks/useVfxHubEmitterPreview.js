import { useCallback } from 'react';
import { loadEmitterData } from '../../../utils/vfx/vfxEmitterParser.js';
import { convertTextureToPNG, findActualTexturePath } from '../../../utils/assets/textureConverter.js';
import { openAssetPreview } from '../../../utils/assets/assetPreviewEvent';
import { extractColorsFromEmitterContent, extractMeshesFromEmitterContent, extractTexturesFromEmitterContent } from '../../port2/utils/vfxUtils.js';
import {
  cancelTextureHoverClose,
  removeTextureHoverPreview,
  scheduleTextureHoverClose,
  showTextureHoverPreview,
} from '../../../components/modals/textureHoverPreview.js';

const path = window.require ? window.require('path') : null;
const os = window.require ? window.require('os') : null;

export default function useVfxHubEmitterPreview({
  targetPath,
  donorPath,
  conversionTimers,
  textureCloseTimerRef,
}) {
  const resolveProjectRootFromBin = useCallback((binFilePath) => {
    if (!binFilePath) return '';
    const normalized = String(binFilePath).replace(/\\/g, '/');
    const dataMatch = normalized.match(/\/data\//i);
    if (!dataMatch) return '';
    return normalized.substring(0, dataMatch.index);
  }, []);

  const resolveHubAssetPath = useCallback((rawAssetPath, binPathHint = '') => {
    if (!rawAssetPath || !window.require || !path) return rawAssetPath;
    const fsNode = window.require('fs');
    const pathNode = window.require('path');
    if (!fsNode || !pathNode) return rawAssetPath;

    if (pathNode.isAbsolute(rawAssetPath) && fsNode.existsSync(rawAssetPath)) {
      return rawAssetPath;
    }

    const normalizedRel = String(rawAssetPath).replace(/\\/g, '/').replace(/^\/+/, '');
    const relNoAssets = normalizedRel.replace(/^assets\//i, '');
    const fileName = pathNode.basename(normalizedRel);
    const targetRoot = resolveProjectRootFromBin(targetPath);
    const hintRoot = resolveProjectRootFromBin(binPathHint);
    const localHubRoot = os && pathNode
      ? pathNode.join(os.homedir(), 'Documents', 'Quartz', 'VFXHub')
      : '';
    const localHubAssetsRoot = localHubRoot
      ? pathNode.join(localHubRoot, 'collection', 'assets')
      : '';
    const localHubVfxhubAssets = localHubAssetsRoot
      ? pathNode.join(localHubAssetsRoot, 'vfxhub')
      : '';
    const candidates = [];

    const pushRootCandidates = (root) => {
      if (!root) return;
      candidates.push(pathNode.join(root, normalizedRel));
      candidates.push(pathNode.join(root, relNoAssets));
      candidates.push(pathNode.join(root, 'assets', relNoAssets));
      candidates.push(pathNode.join(root, 'ASSETS', relNoAssets));
      candidates.push(pathNode.join(root, 'assets', 'vfxhub', fileName));
      candidates.push(pathNode.join(root, 'ASSETS', 'vfxhub', fileName));
    };

    pushRootCandidates(targetRoot);
    if (hintRoot && hintRoot !== targetRoot) {
      pushRootCandidates(hintRoot);
    }

    if (localHubRoot) {
      candidates.push(pathNode.join(localHubRoot, normalizedRel));
      if (localHubAssetsRoot) {
        candidates.push(pathNode.join(localHubAssetsRoot, relNoAssets));
      }
      if (localHubVfxhubAssets) {
        candidates.push(pathNode.join(localHubVfxhubAssets, fileName));
      }
    }

    for (const candidate of candidates) {
      try {
        if (candidate && fsNode.existsSync(candidate)) return candidate;
      } catch {
        // ignore
      }
    }

    const smartPath =
      findActualTexturePath(rawAssetPath, targetPath, binPathHint, targetRoot || undefined) ||
      findActualTexturePath(rawAssetPath, targetPath, donorPath, targetRoot || undefined);
    return smartPath || rawAssetPath;
  }, [donorPath, resolveProjectRootFromBin, targetPath]);

  const showTexturePreview = useCallback(async (firstTexturePath, firstDataUrl, buttonElement, emitterData = null, allTextures = [], allMeshes = []) => {
    const textureData = (allTextures && allTextures.length > 0)
      ? allTextures
      : (firstTexturePath ? [{ path: firstTexturePath, label: 'Main', dataUrl: firstDataUrl }] : []);

    const colorData = emitterData?.originalContent
      ? extractColorsFromEmitterContent(emitterData.originalContent)
      : [];

    showTextureHoverPreview({
      previewId: 'shared-texture-hover-preview',
      textureData,
      meshData: allMeshes,
      buttonElement,
      colorData,
    });
  }, []);

  const handleEmitterMouseEnter = useCallback(async (e, emitter, system, isTarget) => {
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
        const fullEmitterData = loadEmitterData(system, emitter.name);
        if (!fullEmitterData) return;
        const emitterContent = fullEmitterData.originalContent || '';

        const textures = extractTexturesFromEmitterContent(emitterContent);
        const meshes = extractMeshesFromEmitterContent(emitterContent);
        if (textures.length === 0 && fullEmitterData.texturePath) {
          textures.push({ path: fullEmitterData.texturePath, label: 'Main' });
        }
        if (textures.length === 0 && meshes.length === 0) return;

        const textureData = [];
        const meshData = [];
        const binPath = isTarget ? targetPath : donorPath;
        const projectRoot = resolveProjectRootFromBin(binPath) || (targetPath && path ? path.dirname(targetPath) : '');

        for (const tex of textures) {
          try {
            let resolvedDiskPath = resolveHubAssetPath(tex.path, binPath);
            if (window.require && binPath && binPath.includes(':')) {
              const fsNode = window.require('fs');
              const pathNode = window.require('path');
              const normalizedBin = binPath.replace(/\\/g, '/');
              const dataMatch = normalizedBin.match(/\/data\//i);
              if (dataMatch) {
                const projRoot = normalizedBin.substring(0, dataMatch.index);
                const cleanTexture = tex.path.replace(/\\/g, '/');
                const candidate = pathNode.join(projRoot, cleanTexture);
                if (fsNode.existsSync(candidate)) resolvedDiskPath = candidate;
              }
              if (resolvedDiskPath === tex.path) {
                const smartPath = findActualTexturePath(tex.path, targetPath, donorPath, projectRoot);
                if (smartPath) resolvedDiskPath = smartPath;
              }
            }

            const result = await convertTextureToPNG(
              resolvedDiskPath || tex.path,
              targetPath,
              donorPath,
              projectRoot
            );
            let dataUrl = null;
            if (result) {
              if (result.startsWith('data:')) {
                dataUrl = result;
              } else if (window.require) {
                const fsNode = window.require('fs');
                if (fsNode.existsSync(result)) {
                  const imageBuffer = fsNode.readFileSync(result);
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

        for (const mesh of meshes) {
          try {
            let resolvedDiskPath = resolveHubAssetPath(mesh.path, binPath);
            let resolvedSkeletonPath = mesh.skeletonPath ? resolveHubAssetPath(mesh.skeletonPath, binPath) : '';
            let resolvedAnimationPath = mesh.animationPath ? resolveHubAssetPath(mesh.animationPath, binPath) : '';
            if (window.require && binPath && binPath.includes(':')) {
              const fsNode = window.require('fs');
              const pathNode = window.require('path');
              const normalizedBin = binPath.replace(/\\/g, '/');
              const dataMatch = normalizedBin.match(/\/data\//i);
              if (dataMatch) {
                const projRoot = normalizedBin.substring(0, dataMatch.index);
                const cleanMesh = mesh.path.replace(/\\/g, '/');
                const candidate = pathNode.join(projRoot, cleanMesh);
                if (fsNode.existsSync(candidate)) resolvedDiskPath = candidate;
              }
              if (resolvedDiskPath === mesh.path) {
                const smartPath = findActualTexturePath(mesh.path, targetPath, donorPath, projectRoot);
                if (smartPath) resolvedDiskPath = smartPath;
              }

              if (resolvedSkeletonPath) {
                const cleanSkeleton = resolvedSkeletonPath.replace(/\\/g, '/');
                if (dataMatch) {
                  const projRoot = normalizedBin.substring(0, dataMatch.index);
                  const candidate = pathNode.join(projRoot, cleanSkeleton);
                  if (fsNode.existsSync(candidate)) resolvedSkeletonPath = candidate;
                }
                if (resolvedSkeletonPath === mesh.skeletonPath) {
                  const smartPath = findActualTexturePath(mesh.skeletonPath, targetPath, donorPath, projectRoot);
                  if (smartPath) resolvedSkeletonPath = smartPath;
                }
              }

              if (resolvedAnimationPath) {
                const cleanAnimation = resolvedAnimationPath.replace(/\\/g, '/');
                if (dataMatch) {
                  const projRoot = normalizedBin.substring(0, dataMatch.index);
                  const candidate = pathNode.join(projRoot, cleanAnimation);
                  if (fsNode.existsSync(candidate)) resolvedAnimationPath = candidate;
                }
                if (resolvedAnimationPath === mesh.animationPath) {
                  const smartPath = findActualTexturePath(mesh.animationPath, targetPath, donorPath, projectRoot);
                  if (smartPath) resolvedAnimationPath = smartPath;
                }
              }
            }
            meshData.push({
              ...mesh,
              resolvedDiskPath,
              resolvedSkeletonPath,
              resolvedAnimationPath,
              texturePath: textureData?.[0]?.resolvedDiskPath || textureData?.[0]?.path || '',
              texturePreviewDataUrl: textureData?.[0]?.dataUrl || '',
            });
          } catch (err) {
            console.error('Error processing mesh:', mesh.path, err);
            meshData.push({
              ...mesh,
              resolvedDiskPath: mesh.path,
              resolvedSkeletonPath: mesh.skeletonPath || '',
              resolvedAnimationPath: mesh.animationPath || '',
              texturePath: textureData?.[0]?.resolvedDiskPath || textureData?.[0]?.path || '',
              texturePreviewDataUrl: textureData?.[0]?.dataUrl || '',
            });
          }
        }

        if (textureData.length > 0 || meshData.length > 0) {
          showTexturePreview(
            textureData[0]?.path || null,
            textureData[0]?.dataUrl || null,
            previewBtn,
            fullEmitterData,
            textureData,
            meshData
          );
        }
      } catch (error) {
        console.error('Error loading texture preview:', error);
      }
    }, 200);

    conversionTimers.current.set('hover', timer);
  }, [conversionTimers, donorPath, resolveHubAssetPath, resolveProjectRootFromBin, showTexturePreview, targetPath, textureCloseTimerRef]);

  const handleEmitterMouseLeave = useCallback((e) => {
    e.stopPropagation();
    if (conversionTimers.current.has('hover')) {
      clearTimeout(conversionTimers.current.get('hover'));
      conversionTimers.current.delete('hover');
    }
    scheduleTextureHoverClose('shared-texture-hover-preview', 500);
  }, [conversionTimers]);

  const handleEmitterClick = useCallback((e, emitter, system, isTarget) => {
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
    if (!fullEmitterData || !fullEmitterData.texturePath) return;

    const texturePath = fullEmitterData.texturePath;
    const binPath = isTarget ? targetPath : donorPath;
    let resolvedPath = resolveHubAssetPath(texturePath, binPath);

    if (binPath && binPath !== 'This will show target bin' && binPath !== 'This will show donor bin') {
      const fsNode = window.require?.('fs');
      const pathNode = window.require?.('path');
      if (fsNode && pathNode) {
        const normalizedBin = binPath.replace(/\\/g, '/');
        const dataMatch = normalizedBin.match(/\/data\//i);
        if (dataMatch) {
          const projectRoot = normalizedBin.substring(0, dataMatch.index);
          const cleanTexture = texturePath.replace(/\\/g, '/');
          const candidate1 = pathNode.join(projectRoot, cleanTexture);
          if (fsNode.existsSync(candidate1)) resolvedPath = candidate1;
        }
      }
      if (resolvedPath === texturePath) {
        const smartPath = findActualTexturePath(texturePath, targetPath, donorPath);
        if (smartPath) resolvedPath = smartPath;
      }
    }
    openAssetPreview(resolvedPath);
  }, [conversionTimers, donorPath, resolveHubAssetPath, targetPath, textureCloseTimerRef]);

  const handleEmitterContextMenu = useCallback(async (e, emitter, system, isTarget) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const fullEmitterData = loadEmitterData(system, emitter.name);
      if (!fullEmitterData || !fullEmitterData.texturePath) return;
      const texturePath = fullEmitterData.texturePath;
      const binPath = isTarget ? targetPath : donorPath;
      let resolvedPath = resolveHubAssetPath(texturePath, binPath);

      if (binPath && binPath !== 'This will show target bin' && binPath !== 'This will show donor bin') {
        const fsNode = window.require?.('fs');
        const pathNode = window.require?.('path');
        if (fsNode && pathNode) {
          const normalizedBin = binPath.replace(/\\/g, '/');
          const dataMatch = normalizedBin.match(/\/data\//i);
          if (dataMatch) {
            const projectRoot = normalizedBin.substring(0, dataMatch.index);
            const cleanTexture = texturePath.replace(/\\/g, '/');
            const candidate1 = pathNode.join(projectRoot, cleanTexture);
            if (fsNode.existsSync(candidate1)) resolvedPath = candidate1;
          }
        }
        if (resolvedPath === texturePath) {
          const smartPath = findActualTexturePath(texturePath, targetPath, donorPath);
          if (smartPath) resolvedPath = smartPath;
        }
      }

      if (window.require) {
        const { shell } = window.require('electron');
        if (shell) await shell.openPath(resolvedPath);
      }
    } catch (err) {
      console.error('Error opening external app:', err);
    }
  }, [donorPath, resolveHubAssetPath, targetPath]);

  return {
    showTexturePreview,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
  };
}
