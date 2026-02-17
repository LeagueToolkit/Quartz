/**
 * ColorBlock Component
 * Displays a color or gradient, clickable to import to palette
 * Uses wrapper div with solid background to prevent bleed-through
 */

import React from 'react';
import { Box, Tooltip } from '@mui/material';

function ColorBlock({ colors, title, variant = 'standard', onClick }) {
    // variant: 'standard' (24px), 'secondary' (18px), 'wide' (80px+)

    const dimensions = {
        standard: { width: 40, height: 26 },
        secondary: { width: 34, height: 24 },
        wide: { width: 110, height: 26 }
    }[variant] || { width: 24, height: 24 };

    // No colors - show blank
    if (!colors || colors.length === 0) {
        return (
            <Box
                sx={{
                    ...dimensions,
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(255,255,255,0.02)',
                    opacity: 0.5,
                    flexShrink: 0
                }}
            />
        );
    }

    // Convert RGBA to CSS color
    const rgbaToCSS = (rgba) => {
        if (!rgba || rgba.length < 3) return 'transparent';
        const [r, g, b] = rgba;
        const toInt = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        return `rgba(${toInt(r)}, ${toInt(g)}, ${toInt(b)}, 1.0)`;
    };

    // Filter out transparent keys
    const visibleColors = colors.filter(c => (c.rgba[3] !== undefined ? c.rgba[3] : 1) > 0.05);
    const renderList = visibleColors.length > 0 ? visibleColors : colors;

    // Build background
    let background;

    if (renderList.length === 1) {
        background = rgbaToCSS(renderList[0].rgba);
    } else {
        const sorted = [...renderList].sort((a, b) => a.time - b.time);
        
        // Ensure gradient covers full width (0% to 100%) to prevent background bleed-through
        const stops = [];
        
        // Always start at 0% with first color
        stops.push(`${rgbaToCSS(sorted[0].rgba)} 0%`);
        
        // Add all color stops
        sorted.forEach(c => {
            stops.push(`${rgbaToCSS(c.rgba)} ${c.time * 100}%`);
        });
        
        // Always end at 100% with last color
        stops.push(`${rgbaToCSS(sorted[sorted.length - 1].rgba)} 100%`);
        
        background = `linear-gradient(90deg, ${stops.join(', ')})`;
    }

    const tooltipContent = colors.length === 1
        ? `${title}: ${colors[0].rgba.map(v => v.toFixed(2)).join(', ')}`
        : `${title}: ${colors.length} keyframes`;

    return (
        <Tooltip title={tooltipContent} placement="top">
            <Box
                onClick={onClick}
                sx={{
                    ...dimensions,
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: '#000', // Solid black base layer
                    cursor: 'pointer',
                    flexShrink: 0,
                    overflow: 'hidden', // Clip inner content
                    position: 'relative',
                    transition: 'transform 0.1s, border-color 0.1s',
                    '&:hover': {
                        transform: 'translateY(-1px)',
                        borderColor: 'var(--accent)'
                    }
                }}
            >
                {/* Inner div with the actual color/gradient */}
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        background: background,
                        borderRadius: '3px' // Slightly smaller to account for border
                    }}
                />
            </Box>
        </Tooltip>
    );
}

export default React.memo(ColorBlock);
