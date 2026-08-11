import { useEffect, useRef, useState, memo } from 'react';
import { Box, Typography, Checkbox } from '@mui/material';
import { isProtectedTextureName, type ImageEntry } from '../utils/imgRecolorLogic';
import { imgRecolorThumbnail } from '@/lib/api';
import { thumbnailQueue } from './thumbnailQueue';

interface ImageThumbnailProps {
    image: ImageEntry;
    isSelected: boolean;
    onImageClick: (path: string) => void;
    /* Bumped when the files on disk change (after a save). The thumbnail is cached by
       path, which does not change on rewrite, so this is what forces a re-read. */
    version?: number;
}

/* Lazily-loaded, memoized selection thumbnail. Decodes only when scrolled into
   view (IntersectionObserver) and downscales via the shared thumbnail queue. */
export const ImageThumbnail = memo(({ image, isSelected, onImageClick, version = 0 }: ImageThumbnailProps) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    // Distortion maps and cubemaps break when recolored, so they render dimmed and inert.
    const isProtected = isProtectedTextureName(image.name);

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
            /* Rust decodes, downscales and PNG-encodes in one pass, so only a small PNG
               crosses the bridge. The old path pulled the full-resolution RGBA over as
               base64 and resized it through two canvases on the main thread. */
            const png = await imgRecolorThumbnail(image.path, 128);
            if (cancelled) return null;
            return URL.createObjectURL(new Blob([png], { type: 'image/png' }));
        }).then((dataUrl) => {
            if (dataUrl && !cancelled) setThumbnail(dataUrl);
        }).catch(() => { /* ignore cancelled loads */ });

        return () => { cancelled = true; };
    }, [isVisible, image.path, version]);

    return (
        <Box
            ref={ref}
            onClick={() => { if (!isProtected) onImageClick(image.path); }}
            data-image-path={image.path}
            title={isProtected
                ? `${image.name} — protected: recoloring a distortion map or cubemap corrupts it`
                : undefined}
            sx={{
                position: 'relative',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border)',
                cursor: isProtected ? 'not-allowed' : 'pointer',
                opacity: isProtected ? 0.4 : 1,
                filter: isProtected ? 'grayscale(1)' : 'none',
                transition: 'border-color 140ms var(--ease-out), box-shadow 140ms var(--ease-out)',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    border: isProtected
                        ? '1px solid var(--border)'
                        : isSelected
                            ? '2px solid var(--accent-primary)'
                            : '1px solid color-mix(in oklab, var(--accent-primary) 45%, var(--border))',
                },
            }}
        >
            {/* Selection checkmark */}
            <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                <Checkbox
                    checked={isSelected && !isProtected}
                    disabled={isProtected}
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
    prev.onImageClick === next.onImageClick &&
    prev.version === next.version
));
