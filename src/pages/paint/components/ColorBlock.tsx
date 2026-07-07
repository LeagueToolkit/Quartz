/*
 * ColorBlock Component
 * Displays a color or gradient, clickable to import to palette.
 * Uses a wrapper div with solid background to prevent bleed-through.
 * Ported 1:1 from the Electron Quartz paint2 ColorBlock.
 */

import React from 'react';
import { Box } from '@mui/material';

interface ColorKeyframe {
    rgba: number[];
    time: number;
}

interface ColorBlockProps {
    colors?: ColorKeyframe[];
    title: string;
    variant?: 'standard' | 'secondary' | 'wide';
    onClick?: (e: React.MouseEvent) => void;
    /** Right-click to open the alpha editor. */
    onContextMenu?: (e: React.MouseEvent) => void;
}

function ColorBlock({ colors, title, variant = 'standard', onClick, onContextMenu }: ColorBlockProps) {
    const dimensions = ({
        standard: { width: 40, height: 26 },
        secondary: { width: 34, height: 24 },
        wide: { width: 110, height: 26 },
    } as Record<string, { width: number; height: number }>)[variant] || { width: 24, height: 24 };

    if (!colors || colors.length === 0) {
        return (
            <Box
                sx={{
                    ...dimensions,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    opacity: 0.5,
                    flexShrink: 0,
                }}
            />
        );
    }

    // Render the color with its ACTUAL alpha so transparency shows directly in
    // the swatch (a checkerboard behind it makes low alpha read at a glance).
    const rgbaToCSS = (rgba: number[]): string => {
        if (!rgba || rgba.length < 3) return 'transparent';
        const toInt = (val: number) => Math.round(Math.max(0, Math.min(1, val)) * 255);
        const a = rgba[3] !== undefined ? Math.max(0, Math.min(1, rgba[3])) : 1;
        return `rgba(${toInt(rgba[0])}, ${toInt(rgba[1])}, ${toInt(rgba[2])}, ${a})`;
    };

    const alphaOf = (c: ColorKeyframe) => (c.rgba[3] !== undefined ? c.rgba[3] : 1);
    // Keep fully-transparent keyframes in the gradient now (they're the point).
    const renderList = colors;

    let background: string;
    if (renderList.length === 1) {
        background = rgbaToCSS(renderList[0].rgba);
    } else {
        const sorted = [...renderList].sort((a, b) => a.time - b.time);
        const stops: string[] = [];
        stops.push(`${rgbaToCSS(sorted[0].rgba)} 0%`);
        sorted.forEach(c => {
            stops.push(`${rgbaToCSS(c.rgba)} ${c.time * 100}%`);
        });
        stops.push(`${rgbaToCSS(sorted[sorted.length - 1].rgba)} 100%`);
        background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }

    const hasAlpha = renderList.some(c => alphaOf(c) < 0.999);
    const alphaText = colors.map(c => alphaOf(c).toFixed(2)).join(', ');
    const tooltipContent = colors.length === 1
        ? `${title}: ${colors[0].rgba.map(v => v.toFixed(2)).join(', ')}\nAlpha: ${alphaText}\n(right-click to edit alpha)`
        : `${title}: ${colors.length} keyframes\nAlpha: ${alphaText}\n(right-click to edit alpha)`;

    return (
        <Box
            onClick={onClick}
            onContextMenu={onContextMenu}
            title={tooltipContent}
            sx={{
                ...dimensions,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
                cursor: 'pointer',
                flexShrink: 0,
                overflow: 'hidden',
                position: 'relative',
                transition: 'transform 0.1s, border-color 0.1s',
                '&:hover': {
                    transform: 'translateY(-1px)',
                    borderColor: 'var(--accent-primary)',
                },
            }}
        >
            {/* Checkerboard, only when there's transparency to show through. */}
            {hasAlpha && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '3px',
                        backgroundColor: '#888',
                        backgroundImage:
                            'linear-gradient(45deg, rgba(255,255,255,.3) 25%, transparent 25%),' +
                            'linear-gradient(-45deg, rgba(255,255,255,.3) 25%, transparent 25%),' +
                            'linear-gradient(45deg, transparent 75%, rgba(255,255,255,.3) 75%),' +
                            'linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.3) 75%)',
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
                    }}
                />
            )}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background,
                    borderRadius: '3px',
                }}
            />
        </Box>
    );
}

export default React.memo(ColorBlock);
