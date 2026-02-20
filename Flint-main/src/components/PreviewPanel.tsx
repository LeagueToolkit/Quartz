/**
 * Flint - Preview Panel Component
 * Main preview container with toolbar and content routing
 */

import React, { useState, useEffect } from 'react';
import { useAppState } from '../lib/state';
import * as api from '../lib/api';
import { getIcon } from '../lib/fileIcons';
import { ImagePreview } from './preview/ImagePreview';
import { HexViewer } from './preview/HexViewer';
import { TextPreview } from './preview/TextPreview';
import { BinEditor } from './preview/BinEditor';
import { ModelPreview } from './preview/ModelPreview';

interface FileInfo {
    path: string;
    size: number;
    file_type: string;
    extension: string;
    dimensions: [number, number] | null;
}

const EmptyState: React.FC = () => (
    <div className="preview-panel__empty">
        <div
            className="preview-panel__empty-icon"
            dangerouslySetInnerHTML={{ __html: getIcon('document') }}
        />
        <div className="preview-panel__empty-text">Select a file to preview</div>
    </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
    <div className="preview-panel__error">
        <span
            className="error-icon"
            dangerouslySetInnerHTML={{ __html: getIcon('warning') }}
        />
        <span>{message}</span>
    </div>
);

const getTypeLabel = (fileType: string): string => {
    const labels: Record<string, string> = {
        'image/dds': 'DDS Texture',
        'image/tex': 'TEX Texture',
        'image/png': 'PNG Image',
        'image/jpeg': 'JPEG Image',
        'application/x-bin': 'BIN Property File',
        'text/x-python': 'Python Script',
        'application/json': 'JSON',
        'text/plain': 'Plain Text',
        'audio': 'Audio',
        'model': '3D Model',
        'model/x-lol-skn': 'SKN Skinned Mesh',
        'model/x-lol-skl': 'SKL Skeleton',
        'model/x-lol-scb': 'SCB Static Mesh',
        'model/x-lol-sco': 'SCO Static Mesh',
        'application/octet-stream': 'Binary File',
    };
    return labels[fileType] || fileType;
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const PreviewPanel: React.FC = () => {
    const { state, openModal } = useAppState();
    const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [imageZoom, setImageZoom] = useState<'fit' | number>('fit');

    // Get selected file and project path from active tab
    const activeTab = state.activeTabId
        ? state.openTabs.find(t => t.id === state.activeTabId)
        : null;
    const selectedFile = activeTab?.selectedFile || null;
    const projectPath = activeTab?.projectPath || null;

    useEffect(() => {
        if (!selectedFile || !projectPath) {
            setFileInfo(null);
            return;
        }

        const loadFileInfo = async () => {
            setLoading(true);
            setError(null);

            const filePath = `${projectPath}/${selectedFile}`;

            try {
                const info = await api.readFileInfo(filePath);
                setFileInfo(info as unknown as FileInfo);
            } catch (err) {
                console.error('[PreviewPanel] Error:', err);
                setError((err as Error).message || 'Failed to load file');
            } finally {
                setLoading(false);
            }
        };

        loadFileInfo();
    }, [selectedFile, projectPath]);

    if (!selectedFile || !projectPath) {
        return (
            <div className="preview-panel">
                <EmptyState />
            </div>
        );
    }

    const filePath = `${projectPath}/${selectedFile}`;
    const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || filePath;
    const isImage = fileInfo?.file_type?.startsWith('image/');

    const renderPreview = () => {
        if (loading) {
            return (
                <div className="preview-panel__loading">
                    <div className="spinner" />
                    <span>Loading...</span>
                </div>
            );
        }

        if (error) {
            return <ErrorState message={error} />;
        }

        if (!fileInfo) {
            return <EmptyState />;
        }

        // Choose preview component based on file type
        if (fileInfo.file_type.startsWith('image/')) {
            return <ImagePreview filePath={filePath} zoom={imageZoom} onZoomChange={setImageZoom} />;
        }

        if (fileInfo.extension === 'bin' || fileInfo.file_type === 'application/x-bin') {
            return <BinEditor filePath={filePath} />;
        }

        if (
            fileInfo.file_type.startsWith('text/') ||
            fileInfo.extension === 'json' ||
            fileInfo.extension === 'py'
        ) {
            return <TextPreview filePath={filePath} />;
        }

        // 3D model preview for SKN files
        if (fileInfo.extension === 'skn' || fileInfo.file_type === 'model/x-lol-skn') {
            return <ModelPreview filePath={filePath} meshType="skinned" />;
        }

        // 3D model preview for SCB/SCO static mesh files
        if (
            fileInfo.extension === 'scb' || fileInfo.extension === 'sco' ||
            fileInfo.file_type === 'model/x-lol-scb' || fileInfo.file_type === 'model/x-lol-sco'
        ) {
            return <ModelPreview filePath={filePath} meshType="static" />;
        }

        // TODO: Add SKL skeleton preview once ltk_mesh supports it
        // if (fileInfo.extension === 'skl' || fileInfo.file_type === 'model/x-lol-skl') {
        //     return <SkeletonPreview filePath={filePath} />;
        // }

        return <HexViewer filePath={filePath} />;
    };

    return (
        <div className="preview-panel">
            {/* Toolbar */}
            <div className="preview-panel__toolbar">
                {isImage && (
                    <div className="preview-panel__zoom-controls">
                        <button
                            className={`btn btn--sm ${imageZoom === 'fit' ? 'btn--active' : ''}`}
                            onClick={() => setImageZoom('fit')}
                        >
                            Fit
                        </button>
                        <button
                            className={`btn btn--sm ${imageZoom === 1 ? 'btn--active' : ''}`}
                            onClick={() => setImageZoom(1)}
                        >
                            100%
                        </button>
                        <button
                            className={`btn btn--sm ${imageZoom === 2 ? 'btn--active' : ''}`}
                            onClick={() => setImageZoom(2)}
                        >
                            200%
                        </button>
                        <div className="preview-panel__divider" style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 8px' }} />
                        <button
                            className="btn btn--sm"
                            onClick={() => openModal('recolor', { filePath: selectedFile })}
                        >
                            <span dangerouslySetInnerHTML={{ __html: getIcon('texture') }} />
                            <span>Recolor</span>
                        </button>
                    </div>
                )}
                <span className="preview-panel__filename">{fileName}</span>
            </div>

            {/* Content */}
            <div className="preview-panel__content">{renderPreview()}</div>

            {/* Info bar */}
            {fileInfo && (
                <div className="preview-panel__info-bar">
                    <span className="preview-panel__info-item">
                        <span className="preview-panel__info-label">Type: </span>
                        {getTypeLabel(fileInfo.file_type)}
                    </span>
                    {fileInfo.dimensions && (
                        <span className="preview-panel__info-item">
                            <span className="preview-panel__info-label">Dimensions: </span>
                            {fileInfo.dimensions[0]}×{fileInfo.dimensions[1]}
                        </span>
                    )}
                    <span className="preview-panel__info-item">
                        <span className="preview-panel__info-label">Size: </span>
                        {formatFileSize(fileInfo.size)}
                    </span>
                </div>
            )}
        </div>
    );
};
