import type { Theme } from './types';

// Ported from the original Quartz themeManager.
export const BUILTIN_THEMES: Theme[] = [
    {
        id: 'amethyst', name: 'Amethyst', builtin: true,
        tokens: {
            accent: '#ecb96a', accent2: '#c084fc', accentMuted: '#ad7e34',
            bg: '#0b0a0f', bg2: '#2a2737', surface: '#0f0d14', surface2: '#2a2737',
            text: '#ecb96a', text2: '#c084fc', accentGreen: '#22c55e',
        },
    },
    {
        id: 'ocean', name: 'Ocean', builtin: true,
        tokens: {
            accent: '#0EC1F6', accent2: '#FFFFFF', accentMuted: '#FAFAFA',
            bg: '#06537A', bg2: '#054666', surface: '#012A40', surface2: '#012336',
            text: '#FFFFFF', text2: '#FFFFFF', accentGreen: '#22c55e',
        },
    },
    {
        id: 'forest', name: 'Forest', builtin: true,
        tokens: {
            accent: '#9DD9C8', accent2: '#FFFFFF', accentMuted: '#FAFAFA',
            bg: '#2F4A40', bg2: '#4F7060', surface: '#29433A', surface2: '#32503A',
            text: '#FFFFFF', text2: '#FFFFFF', accentGreen: '#7AC7A8',
        },
    },
    {
        id: 'amogus', name: 'Amogus', builtin: true,
        tokens: {
            accent: '#83D0FF', accent2: '#FFFFFF', accentMuted: '#FFFFFF',
            bg: '#393939', bg2: '#4D4D4D', surface: '#363636', surface2: '#525252',
            text: '#FFFFFF', text2: '#83D0FF', accentGreen: '#83D0FF',
        },
    },
    {
        id: 'city', name: 'City', builtin: true,
        tokens: {
            accent: '#00FFEB', accent2: '#FF40E6', accentMuted: '#FAFAFA',
            bg: '#71067A', bg2: '#5C0566', surface: '#3D0140', surface2: '#2B0136',
            text: '#FFFFFF', text2: '#00FFFF', accentGreen: '#00FFEB',
        },
    },
    {
        id: 'cafe', name: 'Cafe', builtin: true,
        tokens: {
            accent: '#FA7E8F', accent2: '#A4C6FF', accentMuted: '#FA7E8F',
            bg: '#0B0A0F', bg2: '#2A2737', surface: '#0F0D14', surface2: '#2A2737',
            text: '#FFFFFF', text2: '#A4C6FF', accentGreen: '#A4C6FF',
        },
    },
    {
        id: 'sakura', name: 'Sakura', builtin: true,
        tokens: {
            accent: '#FFC6D5', accent2: '#BCDDFF', accentMuted: '#FF8CAB',
            bg: '#0B0A0F', bg2: '#85338C', surface: '#0F0D14', surface2: '#8A227F',
            text: '#FFFFFF', text2: '#BCDDFF', accentGreen: '#BCDDFF',
        },
    },
];

export const DEFAULT_THEME_ID = 'amethyst';
