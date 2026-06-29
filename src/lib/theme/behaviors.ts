import type { ThemeBehavior } from './types';

/* The per-theme interface-style / wallpaper / effect presets and the multi-style
   picker were removed in the theme rework. Themes are now pure colour schemes.
   getThemeBehavior is kept as a stable no-op so existing callers compile. */

export function getThemeBehavior(_themeId: string): ThemeBehavior | null {
    return null;
}

// Click/background effect option lists (still used by the effect pickers).
export const CLICK_EFFECT_TYPES: { id: string; name: string }[] = [
    { id: 'water', name: 'Water Ripple' },
    { id: 'particles', name: 'Particle Burst' },
    { id: 'pulse', name: 'Digital Pulse' },
    { id: 'sparkle', name: 'Magic Sparkles' },
    { id: 'glitch', name: 'Cyber Glitch' },
    { id: 'galaxy', name: 'Cosmic Spiral' },
    { id: 'firework', name: 'Neon Firework' },
];

export const BACKGROUND_EFFECT_TYPES: { id: string; name: string }[] = [
    { id: 'fireflies', name: 'Swirling Fireflies' },
    { id: 'starfield', name: 'Starfield' },
    { id: 'constellation', name: 'Constellation' },
    { id: 'divine', name: 'Divine Stars' },
    { id: 'bubbles', name: 'Water Bubbles' },
    { id: 'leaves', name: 'Falling Leaves' },
    { id: 'sakuraLeaves', name: 'Sakura Leaves' },
    { id: 'rain', name: 'Rain' },
    { id: 'sparkleSymbol', name: 'Sparkle Symbol' },
];
