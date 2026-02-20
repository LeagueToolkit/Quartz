/**
 * Flint - Image Preview Component
 * Supports zoom (fit, 100%, 200%) and scroll wheel zooming
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../lib/api';
import { getCachedImage, cacheImage } from '../../lib/state';
import { getIcon } from '../../lib/fileIcons';

interface ImagePreviewProps {
    filePath: string;
    zoom: 'fit' | number;
    onZoomChange: (zoom: 'fit' | number) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ filePath, zoom, onZoomChange }) => {
    const [imageData, setImageData] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const loadImage = async () => {
            setLoading(true);
            setError(null);

            // Check cache
            const cached = getCachedImage(filePath);
            if (cached) {
                setImageData(cached as string);
                setLoading(false);
                return;
            }

            try {
                const ext = filePath.split('.').pop()?.toLowerCase();
                let result;

                if (ext === 'dds' || ext === 'tex') {
                    result = await api.decodeDdsToPng(filePath);
                    const dataUrl = `data:image/png;base64,${result.data}`;
                    cacheImage(filePath, dataUrl);
                    setImageData(dataUrl);
                } else {
                    // Regular image - read bytes and create data URL
                    const bytes = await api.readFileBytes(filePath);
                    const blob = new Blob([bytes as BlobPart]);
                    const dataUrl = URL.createObjectURL(blob);
                    cacheImage(filePath, dataUrl);
                    setImageData(dataUrl);
                }
            } catch (err) {
                console.error('[ImagePreview] Error:', err);
                setError((err as Error).message || 'Failed to load image');
            } finally {
                setLoading(false);
            }
        };

        loadImage();
    }, [filePath]);

    // Handle image load to get natural size
    const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }, []);

    // Handle scroll wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const currentZoom = zoom === 'fit' ? 1 : zoom;
        const newZoom = Math.max(0.1, Math.min(5, currentZoom + delta));

        onZoomChange(newZoom);
    }, [zoom, onZoomChange]);

    // Calculate display size based on zoom
    const getImageStyle = useCallback((): React.CSSProperties => {
        if (!naturalSize || !containerRef.current) {
            return {};
        }

        const container = containerRef.current;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        if (zoom === 'fit') {
            // Fit within container
            const scaleX = containerWidth / naturalSize.width;
            const scaleY = containerHeight / naturalSize.height;
            const scale = Math.min(scaleX, scaleY, 1); // Don't scale up for fit

            return {
                width: naturalSize.width * scale,
                height: naturalSize.height * scale,
            };
        } else {
            // Apply zoom percentage
            return {
                width: naturalSize.width * zoom,
                height: naturalSize.height * zoom,
            };
        }
    }, [zoom, naturalSize]);

    if (loading) {
        return (
            <div className="image-preview__loading">
                <div className="spinner" />
                <span>Decoding texture...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="image-preview__error">
                <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                <span>{error}</span>
            </div>
        );
    }

    const imageStyle = getImageStyle();

    return (
        <div
            className="image-preview"
            ref={containerRef}
            onWheel={handleWheel}
        >
            <div className="image-preview__container">
                {imageData && (
                    <img
                        ref={imageRef}
                        className="image-preview__image"
                        src={imageData}
                        alt="Preview"
                        draggable={false}
                        onLoad={handleImageLoad}
                        style={imageStyle}
                    />
                )}
            </div>
        </div>
    );
};
