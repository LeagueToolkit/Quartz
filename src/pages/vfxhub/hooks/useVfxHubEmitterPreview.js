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

export default function useVfxHubEmitterPreview({
  targetPath,
  donorPath,
  conversionTimers,
  textureCloseTimerRef,
}) {
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
        const projectRoot = binPath && binPath.includes(':') ? path.dirname(binPath) : '';

        for (const tex of textures) {
          try {
            let resolvedDiskPath = tex.path;
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
                const smartPath = findActualTexturePath(tex.path, binPath);
                if (smartPath) resolvedDiskPath = smartPath;
              }
            }

            const result = await convertTextureToPNG(tex.path, targetPath, donorPath, projectRoot);
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
            let resolvedDiskPath = mesh.path;
            let resolvedSkeletonPath = mesh.skeletonPath || '';
            let resolvedAnimationPath = mesh.animationPath || '';
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
                const smartPath = findActualTexturePath(mesh.path, binPath);
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
                  const smartPath = findActualTexturePath(mesh.skeletonPath, binPath);
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
                  const smartPath = findActualTexturePath(mesh.animationPath, binPath);
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
  }, [conversionTimers, donorPath, showTexturePreview, targetPath, textureCloseTimerRef]);

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
    let resolvedPath = texturePath;

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
        const smartPath = findActualTexturePath(texturePath, binPath);
        if (smartPath) resolvedPath = smartPath;
      }
    }
    openAssetPreview(resolvedPath);
  }, [conversionTimers, donorPath, targetPath, textureCloseTimerRef]);

  const handleEmitterContextMenu = useCallback(async (e, emitter, system, isTarget) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const fullEmitterData = loadEmitterData(system, emitter.name);
      if (!fullEmitterData || !fullEmitterData.texturePath) return;
      const texturePath = fullEmitterData.texturePath;
      const binPath = isTarget ? targetPath : donorPath;
      let resolvedPath = texturePath;

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
          const smartPath = findActualTexturePath(texturePath, binPath);
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
  }, [donorPath, targetPath]);

  return {
    showTexturePreview,
    handleEmitterMouseEnter,
    handleEmitterMouseLeave,
    handleEmitterClick,
    handleEmitterContextMenu,
  };
}
