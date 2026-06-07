import type { ThemeBehavior, InterfaceStyle } from './types';

export const STYLES = {
    QUARTZ: 'quartz',
    WINFORMS: 'winforms',
    LIQUID: 'liquid',
    MINECRAFT: 'minecraft',
} as const;

export const INTERFACE_STYLES: { id: InterfaceStyle; name: string; desc: string }[] = [
    { id: 'quartz', name: 'Quartz', desc: 'Modern Glassy UI' },
    { id: 'winforms', name: 'WinForms', desc: 'Classic Flat UI' },
    { id: 'liquid', name: 'Liquid Glass', desc: 'High-fidelity refractive glass UI' },
    { id: 'minecraft', name: 'Minecraft', desc: 'Pixel bevel buttons and retro depth' },
];

// Short descriptions shown under each color theme card (matches Quartz).
export const THEME_DESCRIPTIONS: Record<string, string> = {
    onyx: 'Neutral',
    amethyst: 'Purple + Gold',
    ocean: 'Liquid Blue',
    empress: 'Liquid White',
    forest: 'Misty Green',
    amogus: 'Space Gray + Blue',
    city: 'Neon Rain',
    cafe: 'Rose Neon Night',
    sakura: 'Blossom Sky',
    starSky: 'Night Blue',
    charcoalOlive: 'Graphite + Olive',
    quartz: 'Flask + Galaxy',
    crystal: 'White + Blue Iridescent',
    classicGray: 'Windows Dark Mode',
};

/* Per-theme side effects (ported 1:1 from Quartz THEME_BEHAVIORS). Applied when a
   theme is selected: preferred interface style, click/background effect presets,
   and a wallpaper preset matched by display name / filename. */
export const THEME_BEHAVIORS: Record<string, ThemeBehavior> = {
    amethyst: { preferredStyle: 'quartz', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    onyx: { preferredStyle: 'quartz', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    charcoalOlive: { preferredStyle: 'quartz', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    quartz: { preferredStyle: 'quartz', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    crystal: { preferredStyle: 'quartz', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    classicGray: { preferredStyle: 'winforms', effects: { click: { enabled: false }, background: { enabled: false } }, wallpaper: { enabled: false } },
    ocean: {
        preferredStyle: 'liquid',
        effects: { click: { enabled: true, type: 'water' }, background: { enabled: true, type: 'bubbles' } },
        wallpaper: { displayName: 'wavethemewallpaper', fileNamePrefix: 'wavethemewallpaper.' },
    },
    empress: {
        preferredStyle: 'liquid',
        effects: { click: { enabled: false }, background: { enabled: true, type: 'sparkleSymbol' } },
        wallpaper: { fileNamePrefix: 'slime.', fileNames: ['slime.webp'] },
    },
    forest: {
        preferredStyle: 'liquid',
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'leaves' } },
        wallpaper: { enabled: true, displayName: 'Forest', fileNamePrefix: 'forest.' },
    },
    amogus: {
        preferredStyle: 'quartz',
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'starfield' } },
        wallpaper: { enabled: true, displayName: 'amogus', fileNamePrefix: 'amogus.', fileNames: ['amogus.webp', 'amogus.png', 'amogus.jpg', 'amogus.jpeg'] },
    },
    city: {
        preferredStyle: 'quartz',
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'rain' } },
        wallpaper: { enabled: true, displayName: 'cyberpunkcityrain', fileNamePrefix: 'cyberpunkcityrain.', fileNames: ['cyberpunkcityrain.webp', 'cyberpunkcityrain.png', 'cyberpunkcityrain.jpg', 'cyberpunkcityrain.jpeg'] },
    },
    cafe: {
        preferredStyle: 'quartz',
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'fireflies' } },
        wallpaper: { enabled: true, displayName: 'cafe', fileNamePrefix: 'cafe.', fileNames: ['cafe.webp', 'cafe.png', 'cafe.jpg', 'cafe.jpeg'] },
    },
    sakura: {
        preferredStyle: 'liquid',
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'sakuraLeaves' } },
        wallpaper: { enabled: true, displayName: 'sakura', fileNamePrefix: 'sakura.', fileNames: ['sakura.webp', 'sakura.png', 'sakura.jpg', 'sakura.jpeg'] },
    },
    starSky: {
        effects: { click: { enabled: false, type: 'water' }, background: { enabled: true, type: 'fireflies' } },
        wallpaper: { enabled: true, displayName: 'starsky', fileNamePrefix: 'starsky.', fileNames: ['starsky.webp', 'starsky.png', 'starsky.jpg', 'starsky.jpeg'] },
    },
};

export function getThemeBehavior(themeId: string): ThemeBehavior | null {
    return THEME_BEHAVIORS[themeId] ?? null;
}

// Click/background effect option lists (shared by Appearance + Theme Creator).
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
