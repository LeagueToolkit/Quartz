import type { ThemeTokens } from './types';

/* Writes the theme tokens to :root as CSS variables. Components reference these
   via Tailwind arbitrary values, e.g. bg-[var(--surface)]. */
export function applyTheme(tokens: ThemeTokens) {
    const root = document.documentElement;
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-2', tokens.accent2);
    root.style.setProperty('--accent-muted', tokens.accentMuted);
    root.style.setProperty('--bg', tokens.bg);
    root.style.setProperty('--bg-2', tokens.bg2);
    root.style.setProperty('--surface', tokens.surface);
    root.style.setProperty('--surface-2', tokens.surface2);
    root.style.setProperty('--text', tokens.text);
    root.style.setProperty('--text-2', tokens.text2);
    root.style.setProperty('--accent-green', tokens.accentGreen);
}
