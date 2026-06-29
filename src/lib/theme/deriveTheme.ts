import type { ThemeTokens } from './types';

/* A whole theme from a single accent colour + a base mode. The accent drives
   accent2/muted/hover (shade variations); the base mode supplies the neutral
   surfaces and text. This is what both the builtin variants and the (simple)
   theme creator use — pick one colour, get a complete, consistent theme. */

export type BaseMode = 'dark' | 'light';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function hexToRgb(hex: string) {
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
    const c = (v: number) => clamp01(v / 255) * 255;
    const h = (v: number) => Math.round(c(v)).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0; const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    return { h, s, l };
}
function hslToHex(h: number, s: number, l: number) {
    s = clamp01(s); l = clamp01(l);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function shade(hex: string, dl: number, ds = 0) {
    const { h, s, l } = rgbToHsl(hexToRgb(hex));
    return hslToHex(h, clamp01(s + ds), clamp01(l + dl));
}

/* Neutral surfaces/text for each base. Dark = near-black with light text;
   light = near-white with dark text. Surfaces step up in lightness. */
const BASES: Record<BaseMode, Pick<ThemeTokens,
    'bg' | 'bg2' | 'surface' | 'surface2' | 'text' | 'text2' | 'muiDivider'>> = {
    dark: {
        bg: '#0d0d0f', bg2: '#141417', surface: '#141417', surface2: '#1b1b1f',
        text: '#ededf0', text2: '#b4b4bb', muiDivider: '#2a2a30',
    },
    light: {
        bg: '#f5f6f8', bg2: '#eceef2', surface: '#ffffff', surface2: '#f0f2f5',
        text: '#1a1c20', text2: '#5b6069', muiDivider: '#d8dce2',
    },
};

export function deriveTheme(accent: string, base: BaseMode = 'dark'): ThemeTokens {
    const b = BASES[base];

    const accent2 = shade(accent, -0.10);
    const accentMuted = shade(accent, -0.29, -0.20);
    const hover = shade(accent, +0.08);
    // Success stays a green keyed slightly to the base so it reads on either.
    const accentGreen = base === 'light' ? '#1a9e44' : '#3FB950';

    return {
        accent, accent2, accentMuted,
        bg: b.bg, bg2: b.bg2, surface: b.surface, surface2: b.surface2,
        text: b.text, text2: b.text2,
        accentGreen, accentGreenMuted: shade(accentGreen, -0.18),
        glassBg: base === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,24,0.55)',
        glassBorder: base === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
        glassShadow: '0 12px 28px rgba(0,0,0,0.45)',
        muiPrimary: accent, muiPrimaryLight: hover, muiPrimaryDark: accent2,
        muiSecondary: accent2, muiSecondaryLight: hover, muiSecondaryDark: accentMuted,
        muiBackground: b.bg, muiPaper: b.surface,
        muiTextPrimary: b.text, muiTextSecondary: b.text2, muiDivider: b.muiDivider,
    };
}
