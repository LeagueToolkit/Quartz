import type { Theme, ThemeTokens } from './types';
import { deriveTheme } from './deriveTheme';

/* Built-in themes. Most are a single accent colour fed through deriveTheme on
   the shared dark base, so they stay visually consistent. Sakura is an
   exception — the Electron version pairs a pink primary with a light-blue
   secondary, which deriveTheme can't produce from one accent, so it's
   hand-specified below. */
/* Seed accents for the derived built-in themes. The store re-derives a full
   token set from these (via deriveTheme) whenever the base mode or a
   per-theme accent override changes, so this list is the source of truth —
   not the derived tokens below. */
export interface ThemeVariant { id: string; name: string; accent: string; }

export const BUILTIN_VARIANTS: ThemeVariant[] = [
    { id: 'quartz',    name: 'Quartz',    accent: '#3fa6f4' }, // cyan-blue
    { id: 'celestial', name: 'Celestial', accent: '#8a3ff4' }, // violet
    { id: 'flint',     name: 'Flint',     accent: '#f43f5d' }, // red
    { id: 'jade',      name: 'Jade',      accent: '#2fd6a6' }, // emerald
    { id: 'amber',     name: 'Amber',     accent: '#f4b23f' }, // gold
];

const DERIVED_BUILTINS: Theme[] = BUILTIN_VARIANTS.map(({ id, name, accent }) => ({
    id,
    name,
    builtin: true,
    tokens: deriveTheme(accent, 'dark'),
}));

/* Themes that carry a full hand-specified palette instead of a single seed.
   Sakura's identity is the pink primary + light-blue secondary combo, which
   deriveTheme can't produce from one accent. Surfaces / dividers use the
   standard dark base (see BASES in deriveTheme.ts) — Electron's original
   used magenta for bg2/surface2 but Tauri's UI maps buttons and panel
   backgrounds to those tokens, which made everything look loud. Keeping the
   pink+blue in the accent tokens only. */
const SAKURA_TOKENS: ThemeTokens = {
    accent: '#FFC6D5', accent2: '#BCDDFF', accentMuted: '#FF8CAB',
    bg: '#0d0d0f', bg2: '#141417',
    surface: '#141417', surface2: '#1b1b1f',
    text: '#FFFFFF', text2: '#BCDDFF',
    // Electron kept the light-blue for the "success green" slot too, to hold
    // the pink+blue vibe end-to-end. Preserved here.
    accentGreen: '#BCDDFF', accentGreenMuted: '#98BFE7',
    navIconColor: '#FFC6D5',
    glassBg: 'rgba(20,20,24,0.55)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.45)',
    muiPrimary: '#FFC6D5', muiPrimaryLight: '#FFD9E2', muiPrimaryDark: '#EFA3B8',
    muiSecondary: '#BCDDFF', muiSecondaryLight: '#D7E9FF', muiSecondaryDark: '#98BFE7',
    muiBackground: '#0d0d0f', muiPaper: '#141417',
    muiTextPrimary: '#FFFFFF', muiTextSecondary: '#BCDDFF',
    muiDivider: '#2a2a30',
};

const HANDCRAFTED_BUILTINS: Theme[] = [
    { id: 'sakura', name: 'Sakura', builtin: true, tokens: SAKURA_TOKENS },
];

/* Default dark-base themes. The store overrides their tokens at runtime when a
   non-default base/override is active (for the derived ones — handcrafted
   themes ignore base overrides since their palette is explicit). */
export const BUILTIN_THEMES: Theme[] = [...DERIVED_BUILTINS, ...HANDCRAFTED_BUILTINS];

export const DEFAULT_THEME_ID = 'quartz';
