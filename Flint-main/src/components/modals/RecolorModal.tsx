/**
 * Flint - Recolor Modal Component
 * Supports multiple recoloring modes: Hue Shift, Colorize, and Grayscale+Tint
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../../lib/state';
import * as api from '../../lib/api';
import { getIcon } from '../../lib/fileIcons';

interface RecolorModalOptions {
    filePath: string;
    isFolder?: boolean;
}

type RecolorMode = 'hueShift' | 'colorize' | 'grayscale';

// Preset colors for quick selection
const COLOR_PRESETS = [
    { name: 'Red', hue: 0, color: '#ff4444' },
    { name: 'Orange', hue: 30, color: '#ff8844' },
    { name: 'Gold', hue: 45, color: '#ffcc44' },
    { name: 'Green', hue: 120, color: '#44ff44' },
    { name: 'Cyan', hue: 180, color: '#44ffff' },
    { name: 'Blue', hue: 220, color: '#4488ff' },
    { name: 'Purple', hue: 280, color: '#aa44ff' },
    { name: 'Pink', hue: 320, color: '#ff44aa' },
];

export const RecolorModal: React.FC = () => {
    const { state, closeModal, showToast, setWorking, setReady } = useAppState();

    // Get project data from active tab
    const activeTab = state.activeTabId
        ? state.openTabs.find(t => t.id === state.activeTabId)
        : null;
    const currentProjectPath = activeTab?.projectPath || null;
    const fileTree = activeTab?.fileTree || null;

    // Mode selection
    const [mode, setMode] = useState<RecolorMode>('colorize');

    // Hue Shift mode state
    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(1);
    const [brightness, setBrightness] = useState(1);

    // Colorize mode state
    const [targetHue, setTargetHue] = useState(0);
    const [preserveSaturation, setPreserveSaturation] = useState(true);

    // Image state for preview
    const [imageData, setImageData] = useState<string | null>(null);
    const [imageData2, setImageData2] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);

    // Checkpoint option
    const [createCheckpoint, setCreateCheckpoint] = useState(true);

    // Skip distortion textures option (for batch operations)
    const [skipDistortion, setSkipDistortion] = useState(true);

    const isVisible = state.activeModal === 'recolor';
    const options = state.modalOptions as RecolorModalOptions | null;
    const isFolder = options?.isFolder || false;

    useEffect(() => {
        if (isVisible && options?.filePath) {
            if (isFolder) {
                loadFolderPreviews();
            } else {
                loadImage();
            }
        } else {
            // Reset state when closed
            setHue(0);
            setSaturation(1);
            setBrightness(1);
            setTargetHue(0);
            setImageData(null);
            setImageData2(null);
            setFolderImagePaths([]);
            setShowOriginal(false);
        }
    }, [isVisible, options?.filePath, isFolder]);

    const [folderImagePaths, setFolderImagePaths] = useState<string[]>([]);

    const loadFolderPreviews = async () => {
        if (!options?.filePath || !fileTree) {
            return;
        }

        setLoading(true);
        try {
            const normalize = (p: string) => p.replace(/[\\/]+/g, '/').toLowerCase().replace(/\/$/, '');
            const targetPath = normalize(options.filePath);

            const findNode = (node: any): any => {
                const nodePath = normalize(node.path);
                if (nodePath === targetPath) return node;
                if (node.children) {
                    for (const child of node.children) {
                        const found = findNode(child);
                        if (found) return found;
                    }
                }
                return null;
            };

            const folderNode = findNode(fileTree);

            if (!folderNode || !folderNode.children) {
                setLoading(false);
                return;
            }

            const textures: string[] = [];
            const findTextures = (node: any) => {
                if (textures.length >= 2) return;
                if (!node.isDirectory) {
                    const name = node.name.toLowerCase();
                    if (name.endsWith('.dds') || name.endsWith('.tex')) {
                        textures.push(node.path);
                    }
                }
                if (node.children) {
                    for (const child of node.children) {
                        findTextures(child);
                    }
                }
            };

            findTextures(folderNode);
            setFolderImagePaths(textures);

            if (textures.length > 0) {
                const loadImageData = async (path: string) => {
                    const absPath = currentProjectPath ? `${currentProjectPath}/${path}` : path;
                    const result = await api.decodeDdsToPng(absPath);
                    return `data:image/png;base64,${result.data}`;
                };

                const data1 = await loadImageData(textures[0]);
                setImageData(data1);

                if (textures.length > 1) {
                    const data2 = await loadImageData(textures[1]);
                    setImageData2(data2);
                }
            }
        } catch (err) {
            console.error('[RecolorModal] Failed to load folder previews:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadImage = async () => {
        if (!options?.filePath) return;
        setLoading(true);
        try {
            const absPath = currentProjectPath ? `${currentProjectPath}/${options.filePath}` : options.filePath;
            const result = await api.decodeDdsToPng(absPath);
            setImageData(`data:image/png;base64,${result.data}`);
        } catch (err) {
            console.error('[RecolorModal] Failed to load image:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!options?.filePath) return;

        try {
            const absPath = currentProjectPath ? `${currentProjectPath}/${options.filePath}` : options.filePath;

            // Create checkpoint before destructive operation
            if (createCheckpoint && currentProjectPath) {
                setWorking('Creating checkpoint...');
                try {
                    await api.createCheckpoint(
                        currentProjectPath,
                        `Before recolor: ${options.filePath.split('/').pop()}`,
                        ['auto', 'recolor']
                    );
                } catch (err) {
                    console.warn('[RecolorModal] Failed to create checkpoint:', err);
                }
            }

            setWorking(isFolder ? 'Recoloring folder...' : 'Recoloring image...');

            if (mode === 'hueShift') {
                // Original hue shift mode
                if (isFolder) {
                    const result = await api.recolorFolder(absPath, hue, saturation, brightness, skipDistortion);
                    showToast('success', `Recolored ${result.processed} files. (${result.processed + result.failed} total)`);
                } else {
                    await api.recolorImage(absPath, hue, saturation, brightness);
                    showToast('success', 'Image recolored successfully');
                }
            } else if (mode === 'colorize') {
                // Colorize mode - set all pixels to target hue
                if (isFolder) {
                    const result = await api.colorizeFolder(absPath, targetHue, preserveSaturation, skipDistortion);
                    showToast('success', `Colorized ${result.processed} files to ${getHueName(targetHue)}`);
                } else {
                    await api.colorizeImage(absPath, targetHue, preserveSaturation);
                    showToast('success', `Image colorized to ${getHueName(targetHue)}`);
                }
            } else if (mode === 'grayscale') {
                // Grayscale with optional tint (use colorize with saturation = 0 or low)
                if (isFolder) {
                    const result = await api.colorizeFolder(absPath, targetHue, false);
                    showToast('success', `Applied grayscale + tint to ${result.processed} files`);
                } else {
                    await api.colorizeImage(absPath, targetHue, false);
                    showToast('success', 'Applied grayscale + tint');
                }
            }

            closeModal();
            setReady();
        } catch (err) {
            console.error('[RecolorModal] Error:', err);
            showToast('error', `Failed to recolor: ${(err as Error).message}`);
            setReady();
        }
    };

    const getHueName = (h: number): string => {
        const preset = COLOR_PRESETS.find(p => Math.abs(p.hue - h) < 15);
        return preset?.name || `Hue ${h}°`;
    };

    const getPreviewStyle = (): React.CSSProperties => {
        if (showOriginal) {
            return {
                maxWidth: '100%',
                maxHeight: '450px',
                objectFit: 'contain',
                borderRadius: '4px',
                backgroundColor: '#1a1a1a',
                display: imageData ? 'block' : 'none',
            };
        }

        if (mode === 'hueShift') {
            return {
                filter: `hue-rotate(${hue}deg) saturate(${saturation}) brightness(${brightness})`,
                maxWidth: '100%',
                maxHeight: '450px',
                objectFit: 'contain',
                borderRadius: '4px',
                backgroundColor: '#1a1a1a',
                display: imageData ? 'block' : 'none',
            };
        } else {
            // For colorize/grayscale, we apply a rough CSS approximation
            // Grayscale + sepia + hue-rotate trick to colorize
            const satValue = mode === 'grayscale' ? 0.7 : (preserveSaturation ? 1 : 0.8);
            return {
                filter: `grayscale(100%) sepia(100%) saturate(${satValue * 100}%) hue-rotate(${targetHue - 50}deg)`,
                maxWidth: '100%',
                maxHeight: '450px',
                objectFit: 'contain',
                borderRadius: '4px',
                backgroundColor: '#1a1a1a',
                display: imageData ? 'block' : 'none',
            };
        }
    };

    if (!isVisible) return null;

    return (
        <div className={`modal-overlay ${isVisible ? 'modal-overlay--visible' : ''}`}>
            <div className="modal modal--large recolor-modal">
                <div className="modal__header">
                    <h2 className="modal__title">
                        {isFolder ? 'Batch Recolor Folder' : 'Recolor Texture'}
                    </h2>
                    <button className="modal__close" onClick={closeModal}>×</button>
                </div>

                <div className="modal__body">
                    {/* Mode Selector Tabs */}
                    <div className="recolor-modal__tabs">
                        <button
                            className={`recolor-modal__tab ${mode === 'hueShift' ? 'recolor-modal__tab--active' : ''}`}
                            onClick={() => setMode('hueShift')}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('color-palette') }} />
                            Hue Shift
                        </button>
                        <button
                            className={`recolor-modal__tab ${mode === 'colorize' ? 'recolor-modal__tab--active' : ''}`}
                            onClick={() => setMode('colorize')}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('paint-bucket') }} />
                            Colorize
                        </button>
                        <button
                            className={`recolor-modal__tab ${mode === 'grayscale' ? 'recolor-modal__tab--active' : ''}`}
                            onClick={() => setMode('grayscale')}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('contrast') }} />
                            Grayscale + Tint
                        </button>
                    </div>

                    <div className="recolor-modal__top">
                        {/* Preview Area */}
                        <div
                            className="recolor-modal__preview"
                            onClick={() => setShowOriginal(!showOriginal)}
                            title="Click to toggle original/preview"
                        >
                            {loading && <div className="spinner" />}

                            {(imageData || imageData2) ? (
                                <div className="recolor-modal__image-container">
                                    <div className={`recolor-modal__previews ${imageData2 ? 'recolor-modal__previews--dual' : ''}`}>
                                        {imageData && <img src={imageData} style={getPreviewStyle()} alt="Preview 1" />}
                                        {imageData2 && <img src={imageData2} style={getPreviewStyle()} alt="Preview 2" />}
                                    </div>
                                    <div className="recolor-modal__preview-badge">
                                        {showOriginal ? 'Original' : 'Preview'}
                                        <span className="text-muted"> — Click to toggle</span>
                                    </div>
                                    {isFolder && folderImagePaths.length > 0 && (
                                        <p className="recolor-modal__preview-hint">
                                            Batch Preview: {folderImagePaths.length} textures found in folder
                                        </p>
                                    )}
                                </div>
                            ) : !isFolder ? (
                                <div className="recolor-modal__placeholder">Loading preview...</div>
                            ) : (
                                <div className="recolor-modal__placeholder">
                                    <span dangerouslySetInnerHTML={{ __html: getIcon('folder') }} />
                                    <p>No textures found in this folder</p>
                                </div>
                            )}
                        </div>

                        {/* Controls Panel */}
                        <div className="recolor-modal__controls">
                            {mode === 'hueShift' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Hue: {hue}°
                                            <button className="btn btn--ghost btn--xs" onClick={() => setHue(0)}>Reset</button>
                                        </label>
                                        <input
                                            type="range"
                                            min="-180"
                                            max="180"
                                            step="1"
                                            className="form-range form-range--hue"
                                            value={hue}
                                            onChange={(e) => setHue(parseInt(e.target.value))}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            Saturation: {saturation.toFixed(1)}x
                                            <button className="btn btn--ghost btn--xs" onClick={() => setSaturation(1)}>Reset</button>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.01"
                                            className="form-range form-range--saturation"
                                            style={{
                                                background: `linear-gradient(to right, #808080, var(--accent-primary))`
                                            }}
                                            value={saturation}
                                            onChange={(e) => setSaturation(parseFloat(e.target.value))}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            Brightness: {brightness.toFixed(1)}x
                                            <button className="btn btn--ghost btn--xs" onClick={() => setBrightness(1)}>Reset</button>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.01"
                                            className="form-range form-range--brightness"
                                            style={{
                                                background: `linear-gradient(to right, #000, #fff)`
                                            }}
                                            value={brightness}
                                            onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                        />
                                    </div>
                                </>
                            )}

                            {(mode === 'colorize' || mode === 'grayscale') && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Target Color</label>
                                        <div className="recolor-modal__color-presets">
                                            {COLOR_PRESETS.map(preset => (
                                                <button
                                                    key={preset.hue}
                                                    className={`recolor-modal__color-btn ${Math.abs(targetHue - preset.hue) < 10 ? 'recolor-modal__color-btn--active' : ''}`}
                                                    style={{ backgroundColor: preset.color }}
                                                    onClick={() => setTargetHue(preset.hue)}
                                                    title={preset.name}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            Hue: {targetHue}° ({getHueName(targetHue)})
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            step="1"
                                            className="form-range form-range--hue"
                                            value={targetHue}
                                            onChange={(e) => setTargetHue(parseInt(e.target.value))}
                                        />
                                    </div>

                                    {mode === 'colorize' && (
                                        <div className="form-group">
                                            <label className="form-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={preserveSaturation}
                                                    onChange={(e) => setPreserveSaturation(e.target.checked)}
                                                />
                                                <span>Preserve original color intensity</span>
                                            </label>
                                        </div>
                                    )}

                                    <div className="recolor-modal__mode-hint">
                                        {mode === 'colorize' ? (
                                            <p>Colorize replaces all hues with a single color while keeping the original shading and detail.</p>
                                        ) : (
                                            <p>Grayscale + Tint converts to monochrome and applies a subtle color overlay.</p>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Checkpoint Option */}
                            <div className="form-group recolor-modal__checkpoint">
                                <label className="form-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={createCheckpoint}
                                        onChange={(e) => setCreateCheckpoint(e.target.checked)}
                                    />
                                    <span>Create checkpoint before recoloring</span>
                                </label>
                            </div>

                            {/* Skip Distortion Option - only for folder operations */}
                            {isFolder && (
                                <div className="form-group">
                                    <label className="form-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={skipDistortion}
                                            onChange={(e) => setSkipDistortion(e.target.checked)}
                                        />
                                        <span>Skip distortion textures</span>
                                    </label>
                                    <small className="form-hint">Distortion textures use UV effects and should not be recolored</small>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="recolor-modal__info">
                        <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                        <span>Warning: This will overwrite the original file(s). Mipmaps will be regenerated.</span>
                    </div>
                </div>

                <div className="modal__footer">
                    <button className="btn btn--secondary" onClick={closeModal}>
                        Cancel
                    </button>
                    <button className="btn btn--primary" onClick={handleSave}>
                        {isFolder ? 'Recolor All Files' : 'Apply Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};
