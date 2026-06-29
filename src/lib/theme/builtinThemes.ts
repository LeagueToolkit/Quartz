import type { Theme } from './types';
import { deriveTheme } from './deriveTheme';

/* Built-in themes. Every one is a single accent colour fed through deriveTheme
   on the shared dark base, so they stay visually consistent. Quartz (cyan-blue)
   is the default; the rest are accent variants. */
const VARIANTS: { id: string; name: string; accent: string }[] = [
    { id: 'quartz',    name: 'Quartz',    accent: '#3fa6f4' }, // cyan-blue
    { id: 'celestial', name: 'Celestial', accent: '#8a3ff4' }, // violet
    { id: 'flint',     name: 'Flint',     accent: '#f43f5d' }, // red
    { id: 'jade',      name: 'Jade',      accent: '#2fd6a6' }, // emerald
    { id: 'amber',     name: 'Amber',     accent: '#f4b23f' }, // gold
];

export const BUILTIN_THEMES: Theme[] = VARIANTS.map(({ id, name, accent }) => ({
    id,
    name,
    builtin: true,
    tokens: deriveTheme(accent, 'dark'),
}));

export const DEFAULT_THEME_ID = 'quartz';
