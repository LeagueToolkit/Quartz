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
}

function ColorBlock({ colors, title, variant = 'standard', onClick }: ColorBlockProps) {
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

    const rgbaToCSS = (rgba: number[]): string => {
        if (!rgba || rgba.length < 3) return 'transparent';
        const [r, g, b] = rgba;
        const toInt = (val: number) => Math.round(Math.max(0, Math.min(1, val)) * 255);
        return `rgba(${toInt(r)}, ${toInt(g)}, ${toInt(b)}, 1.0)`;
    };

    const visibleColors = colors.filter(c => (c.rgba[3] !== undefined ? c.rgba[3] : 1) > 0.05);
    const renderList = visibleColors.length > 0 ? visibleColors : colors;

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

    const tooltipContent = colors.length === 1
        ? `${title}: ${colors[0].rgba.map(v => v.toFixed(2)).join(', ')}`
        : `${title}: ${colors.length} keyframes`;

    return (
        <Box
            onClick={onClick}
            title={tooltipContent}
            sx={{
                ...dimensions,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                // Solid backing behind the data-color swatch so alpha doesn't bleed.
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
