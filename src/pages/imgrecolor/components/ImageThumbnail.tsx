import { useEffect, useRef, useState, memo } from 'react';
import { Box, Typography, Checkbox } from '@mui/material';
import { loadSingleImage, type ImageEntry } from '../utils/imgRecolorLogic';
import { thumbnailQueue } from './thumbnailQueue';

interface ImageThumbnailProps {
    image: ImageEntry;
    isSelected: boolean;
    onImageClick: (path: string) => void;
}

/* Lazily-loaded, memoized selection thumbnail. Decodes only when scrolled into
   view (IntersectionObserver) and downscales via the shared thumbnail queue. */
export const ImageThumbnail = memo(({ image, isSelected, onImageClick }: ImageThumbnailProps) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            },
            { rootMargin: '180px 0px', threshold: 0.01 },
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible) return;
        let cancelled = false;

        const cached = thumbnailQueue.getCached(image.path);
        if (cached) {
            setThumbnail(cached);
            return;
        }

        thumbnailQueue.add(image.path, async () => {
            if (cancelled) return null;

            const imageData = await loadSingleImage(image.path);
            if (!imageData || cancelled) return null;

            const { width, height } = imageData;
            const maxSize = 128;
            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);

            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = width;
            fullCanvas.height = height;
            const fullCtx = fullCanvas.getContext('2d');
            if (!fullCtx) return null;
            fullCtx.putImageData(imageData, 0, 0);

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = newWidth;
            thumbCanvas.height = newHeight;
            const thumbCtx = thumbCanvas.getContext('2d');
            if (!thumbCtx) return null;
            thumbCtx.drawImage(fullCanvas, 0, 0, newWidth, newHeight);

            const blob = await new Promise<Blob | null>((resolve) => thumbCanvas.toBlob(resolve, 'image/png'));
            if (!blob) return null;
            return URL.createObjectURL(blob);
        }).then((dataUrl) => {
            if (dataUrl && !cancelled) setThumbnail(dataUrl);
        }).catch(() => { /* ignore cancelled loads */ });

        return () => { cancelled = true; };
    }, [isVisible, image.path]);

    return (
        <Box
            ref={ref}
            onClick={() => onImageClick(image.path)}
            data-image-path={image.path}
            sx={{
                position: 'relative',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    border: isSelected
                        ? '2px solid var(--accent-primary)'
                        : '1px solid color-mix(in oklab, var(--accent-primary) 45%, var(--border))',
                },
            }}
        >
            {/* Selection checkmark */}
            <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                <Checkbox
                    checked={isSelected}
                    disableRipple
                    sx={{
                        color: 'var(--text-muted)',
                        padding: '2px',
                        '& .MuiSvgIcon-root': { fontSize: '1.4rem', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' },
                        '&.Mui-checked': { color: 'var(--accent-primary)' },
                        '&:hover': { background: 'transparent' },
                    }}
                />
            </Box>

            {thumbnail ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', p: 1 }}>
                    <img
                        src={thumbnail}
                        alt={image.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                    />
                </Box>
            ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                        Loading...
                    </Typography>
                </Box>
            )}

            <Box sx={{ p: 0.5 }}>
                <Typography sx={{
                    color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                    textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {image.name}
                </Typography>
            </Box>
        </Box>
    );
}, (prev, next) => (
    prev.isSelected === next.isSelected &&
    prev.image.path === next.image.path &&
    prev.image.name === next.image.name &&
    prev.onImageClick === next.onImageClick
));
