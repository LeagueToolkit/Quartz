import type { Theme } from './types';

/* Active builtin themes. During the theme rework the set was trimmed to just
   Quartz; the other 13 live in `archivedThemes.ts` (code preserved) and can be
   spread back in to restore them. */
export const BUILTIN_THEMES: Theme[] = [
    {
        /* Blue-on-dark base. Values mirror the canonical tokens in styles/theme.css
           (the dl-token vocabulary) so applyTheme and the CSS defaults agree. */
        id: 'quartz', name: 'Quartz', builtin: true,
        tokens: {
            accent: '#3f75f4', accent2: '#1d58e1', accentMuted: '#1d3a7f',
            bg: '#0d0d0f', bg2: '#141417', surface: '#141417', surface2: '#1b1b1f',
            text: '#ededf0', text2: '#b4b4bb',
            glassBg: 'rgba(20,20,24,0.55)', glassBorder: 'rgba(255,255,255,0.10)', glassShadow: '0 12px 28px rgba(0,0,0,0.45)',
            muiPrimary: '#3f75f4', muiPrimaryLight: '#5e8dfb', muiPrimaryDark: '#1d58e1',
            muiSecondary: '#1d58e1', muiSecondaryLight: '#5e8dfb', muiSecondaryDark: '#1d3a7f',
            muiBackground: '#0d0d0f', muiPaper: '#141417', muiTextPrimary: '#ededf0', muiTextSecondary: '#b4b4bb', muiDivider: '#2a2a30',
            accentGreen: '#3FB950', accentGreenMuted: '#1f6f2c',
        },
    },
];

export const DEFAULT_THEME_ID = 'quartz';
