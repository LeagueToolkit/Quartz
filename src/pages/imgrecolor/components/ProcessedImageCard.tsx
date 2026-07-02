import { useEffect, useState, memo } from 'react';
import { Box, Typography } from '@mui/material';

interface ProcessedImageCardProps {
    imagePath: string;
    displayImage: ImageData | null;
}

/* Renders a recolored preview: paints the adjusted ImageData to a canvas, then
   shows it as an object-URL <img>. Memoized on path + image reference. */
export const ProcessedImageCard = memo(({ imagePath, displayImage }: ProcessedImageCardProps) => {
    const [src, setSrc] = useState('');

    useEffect(() => {
        if (!displayImage) {
            setSrc('');
            return;
        }

        let cancelled = false;
        let objectUrl = '';

        const canvas = document.createElement('canvas');
        canvas.width = displayImage.width;
        canvas.height = displayImage.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(displayImage, 0, 0);

        canvas.toBlob((blob) => {
            if (cancelled || !blob) return;
            objectUrl = URL.createObjectURL(blob);
            setSrc(objectUrl);
        }, 'image/png');

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [displayImage]);

    return (
        <Box sx={{ borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
            {src && (
                <img
                    src={src}
                    alt={imagePath}
                    style={{ width: '100%', height: 'auto', display: 'block', imageRendering: 'pixelated' }}
                />
            )}
            <Typography sx={{
                p: 1, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {imagePath.split(/[\\/]/).pop()}
            </Typography>
        </Box>
    );
}, (prev, next) => prev.imagePath === next.imagePath && prev.displayImage === next.displayImage);
