// Comprehensive theme manager that applies CSS variables to :root and provides MUI theme generation

export const STYLES = {
  QUARTZ: 'quartz',
  WINFORMS: 'winforms',
  LIQUID: 'liquid'
};

const THEMES = {
  // Current main theme (purple + gold)
  amethyst: {
    accent: '#ecb96a', // gold
    accent2: '#c084fc', // purple
    accentMuted: '#ad7e34',
    bg: '#0b0a0f',
    bg2: '#2a2737',
    surface: '#0f0d14',
    surface2: '#2a2737',
    text: '#ecb96a',
    text2: '#c084fc',
    glassBg: 'rgba(16,14,22,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#8b5cf6',
    muiPrimaryLight: '#a78bfa',
    muiPrimaryDark: '#6d28d9',
    muiSecondary: '#c084fc',
    muiSecondaryLight: '#d8b4fe',
    muiSecondaryDark: '#7c3aed',
    muiBackground: 'transparent',
    muiPaper: '#1a1a1a',
    muiTextPrimary: '#ffffff',
    muiTextSecondary: '#ad7e34',
    muiDivider: '#333',
    // Green accent for success/ported states
    accentGreen: '#22c55e',
    accentGreenMuted: '#166534'
  },
  ocean: {
    accent: '#0EC1F6',
    accent2: '#FFFFFF',
    accentMuted: '#FAFAFA',
    bg: '#06537A',
    bg2: '#054666',
    surface: '#012A40',
    surface2: '#012336',
    text: '#FFFFFF',
    text2: '#FFFFFF',
    navIconColor: '#FFFFFF',
    glassBg: 'rgba(1, 42, 64, 0.36)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#0EC1F6',
    muiPrimaryLight: '#53D6FB',
    muiPrimaryDark: '#0895BF',
    muiSecondary: '#FFFFFF',
    muiSecondaryLight: '#FFFFFF',
    muiSecondaryDark: '#DDEAF0',
    muiBackground: '#06537A',
    muiPaper: '#012A40',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#FFFFFF',
    muiDivider: '#2B6E8D',
    accentGreen: '#22c55e',
    accentGreenMuted: '#166534'
  },
  empress: {
    accent: '#FFFFFF',
    accent2: '#FFFFFF',
    accentMuted: '#FAFAFA',
    bg: '#06537A',
    bg2: '#054666',
    surface: '#012A40',
    surface2: '#012336',
    text: '#FFFFFF',
    text2: '#FFFFFF',
    navIconColor: '#FFFFFF',
    glassBg: 'rgba(1, 42, 64, 0.36)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#FFFFFF',
    muiPrimaryLight: '#FFFFFF',
    muiPrimaryDark: '#E0E0E0',
    muiSecondary: '#FFFFFF',
    muiSecondaryLight: '#FFFFFF',
    muiSecondaryDark: '#DDEAF0',
    muiBackground: '#06537A',
    muiPaper: '#012A40',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#FFFFFF',
    muiDivider: '#2B6E8D',
    accentGreen: '#22c55e',
    accentGreenMuted: '#166534'
  },
  forest: {
    accent: '#9DD9C8',
    accent2: '#FFFFFF',
    accentMuted: '#FAFAFA',
    bg: '#2F4A40',
    bg2: '#4F7060',
    surface: '#29433A',
    surface2: '#32503A',
    text: '#FFFFFF',
    text2: '#FFFFFF',
    navIconColor: '#FFFFFF',
    glassBg: 'rgba(1, 42, 64, 0.36)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#9DD9C8',
    muiPrimaryLight: '#B7E6DA',
    muiPrimaryDark: '#6FB29D',
    muiSecondary: '#FFFFFF',
    muiSecondaryLight: '#FFFFFF',
    muiSecondaryDark: '#DDEAF0',
    muiBackground: '#2F4A40',
    muiPaper: '#29433A',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#FFFFFF',
    muiDivider: '#4A6A60',
    accentGreen: '#7AC7A8',
    accentGreenMuted: '#4A8F75'
  },
  amogus: {
    accent: '#83D0FF',
    accent2: '#FFFFFF',
    accentMuted: '#FFFFFF',
    bg: '#393939',
    bg2: '#4D4D4D',
    surface: '#363636',
    surface2: '#525252',
    text: '#FFFFFF',
    text2: '#83D0FF',
    navIconColor: '#FFFFFF',
    glassBg: 'rgba(16,14,22,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#83D0FF',
    muiPrimaryLight: '#B3E4FF',
    muiPrimaryDark: '#4AA7DD',
    muiSecondary: '#FFFFFF',
    muiSecondaryLight: '#FFFFFF',
    muiSecondaryDark: '#D9D9D9',
    muiBackground: '#393939',
    muiPaper: '#363636',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#FFFFFF',
    muiDivider: '#5A5A5A',
    accentGreen: '#83D0FF',
    accentGreenMuted: '#4AA7DD'
  },
  city: {
    accent: '#00FFEB',
    accent2: '#FF40E6',
    accentMuted: '#FAFAFA',
    bg: '#71067A',
    bg2: '#5C0566',
    surface: '#3D0140',
    surface2: '#2B0136',
    text: '#FFFFFF',
    text2: '#00FFFF',
    navIconColor: '#2FFFE4',
    glassBg: 'rgba(1, 42, 64, 0.36)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#00FFEB',
    muiPrimaryLight: '#66FFF4',
    muiPrimaryDark: '#00BFB0',
    muiSecondary: '#FF40E6',
    muiSecondaryLight: '#FF80EF',
    muiSecondaryDark: '#C020AE',
    muiBackground: '#71067A',
    muiPaper: '#3D0140',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#00FFFF',
    muiDivider: '#5C0566',
    accentGreen: '#00FFEB',
    accentGreenMuted: '#00BFB0'
  },
  cafe: {
    accent: '#FA7E8F',
    accent2: '#A4C6FF',
    accentMuted: '#FA7E8F',
    bg: '#0B0A0F',
    bg2: '#2A2737',
    surface: '#0F0D14',
    surface2: '#2A2737',
    text: '#FFFFFF',
    text2: '#A4C6FF',
    navIconColor: '#FA7E8F',
    glassBg: 'rgba(16,14,22,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#FA7E8F',
    muiPrimaryLight: '#FF9DAC',
    muiPrimaryDark: '#D85F73',
    muiSecondary: '#A4C6FF',
    muiSecondaryLight: '#C4DAFF',
    muiSecondaryDark: '#7FA7E6',
    muiBackground: '#0B0A0F',
    muiPaper: '#0F0D14',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#A4C6FF',
    muiDivider: '#2A2737',
    accentGreen: '#A4C6FF',
    accentGreenMuted: '#7FA7E6'
  },
  starSky: {
    accent: '#4681FF',
    accent2: '#1BDBFF',
    accentMuted: '#6FB5FC',
    bg: '#0B0A0F',
    bg2: '#0E1220',
    surface: '#0F0D14',
    surface2: '#141B2B',
    text: '#FFFFFF',
    text2: '#6FB5FC',
    navIconColor: '#6FB5FC',
    glassBg: 'rgba(1, 42, 64, 0.36)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    muiPrimary: '#4681FF',
    muiPrimaryLight: '#77A3FF',
    muiPrimaryDark: '#2E5FD1',
    muiSecondary: '#1BDBFF',
    muiSecondaryLight: '#67EBFF',
    muiSecondaryDark: '#10A7C2',
    muiBackground: '#0B0A0F',
    muiPaper: '#0F0D14',
    muiTextPrimary: '#FFFFFF',
    muiTextSecondary: '#6FB5FC',
    muiDivider: '#1E2740',
    accentGreen: '#1BDBFF',
    accentGreenMuted: '#10A7C2'
  },
  // Neutral theme
  onyx: {
    accent: '#c3cedaff',
    // Brighter secondary for clearer labels in Neutral theme
    accent2: '#cbd5e1',
    accentMuted: '#6b7280',
    bg: '#0f1115',
    bg2: '#151821',
    surface: '#131722',
    surface2: '#1b2130',
    text: '#e5e7eb',
    text2: '#cbd5e1',
    glassBg: 'rgba(15,17,23,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#9aa4ae',
    muiPrimaryLight: '#b6bec7',
    muiPrimaryDark: '#6b7280',
    muiSecondary: '#64748b',
    muiSecondaryLight: '#cbd5e1',
    muiSecondaryDark: '#475569',
    muiBackground: '#0f1115',
    muiPaper: '#151821',
    muiTextPrimary: '#e5e7eb',
    muiTextSecondary: '#cbd5e1',
    muiDivider: '#2b3340',
    accentGreen: '#22c55e',
    accentGreenMuted: '#14532d'
  },
  // Charcoal Olive theme (graphite → olive gradient)
  charcoalOlive: {
    accent: '#b7bdbd',
    // Brighter secondary for better label readability across UI
    accent2: '#b2ad85',
    // Use the second gradient stop as the muted accent to preserve the requested gradient
    accentMuted: '#605C3C',
    bg: '#0b0c0d',
    bg2: '#151617',
    surface: '#101112',
    surface2: '#181a1b',
    // Readable warm-gray text colors tuned for the dark background
    text: '#e6e3d9',
    text2: '#cfc9b0',
    glassBg: 'rgba(16,17,18,0.35)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassShadow: '0 12px 28px rgba(0,0,0,0.35)',
    // MUI specific colors
    muiPrimary: '#b7bdbd',
    muiPrimaryLight: '#d2d6d6',
    muiPrimaryDark: '#8e9494',
    muiSecondary: '#86836A',
    muiSecondaryLight: '#d0cba3',
    muiSecondaryDark: '#605C3C',
    muiBackground: '#0b0c0d',
    muiPaper: '#151617',
    muiTextPrimary: '#f0ede3',
    muiTextSecondary: '#e6e3d9',
    muiDivider: '#2b2c2d',
    accentGreen: '#22c55e',
    accentGreenMuted: '#14532d'
  },
  // Divine Lab theme (inspired by the flask + galaxy icon)
  quartz: {
    accent: '#f8fafc', // laboratory white (flask color)
    accent2: '#c0c5ce', // light grey (flask liquid)
    accentMuted: '#cbd5e1', // muted grey
    bg: '#020617', // much darker deep space black
    bg2: '#0f172a', // darker cosmic slate
    surface: '#0f172a', // darker laboratory surface
    surface2: '#1e293b', // darker slate grey
    text: '#f8fafc', // pure white (flask highlight)
    text2: '#e2e8f0', // light grey
    glassBg: 'rgba(15,23,42,0.35)',
    glassBorder: 'rgba(248,250,252,0.15)',
    glassShadow: '0 12px 28px rgba(248,250,252,0.10)',
    // MUI specific colors
    muiPrimary: '#f8fafc',
    muiPrimaryLight: '#ffffff',
    muiPrimaryDark: '#e2e8f0',
    muiSecondary: '#e2e8f0',
    muiSecondaryLight: '#f1f5f9',
    muiSecondaryDark: '#cbd5e1',
    muiBackground: '#020617',
    muiPaper: '#0f172a',
    muiTextPrimary: '#f8fafc',
    muiTextSecondary: '#e2e8f0',
    muiDivider: '#1e293b',
    // Green accent for success/ported states (lab success indicator)
    accentGreen: '#10b981',
    accentGreenMuted: '#047857'
  },
  // Crystal theme (inspired by clear/white crystals - pure white, no pink)
  crystal: {
    accent: '#ffffff', // pure white crystal
    accent2: '#e5e7eb', // light gray-white (crystal secondary)
    accentMuted: '#d1d5db', // soft gray (crystal depth)
    bg: '#0f0f0f', // neutral dark background
    bg2: '#1a1a1a', // neutral dark gray
    surface: '#141414', // neutral dark surface
    surface2: '#1f1f1f', // neutral lighter dark surface
    text: '#ffffff', // pure white (primary text)
    text2: '#e5e7eb', // light gray (secondary text)
    glassBg: 'rgba(20,20,20,0.45)',
    glassBorder: 'rgba(255,255,255,0.15)', // pure white border
    glassShadow: '0 12px 32px rgba(0,0,0,0.40)', // soft shadow
    // MUI specific colors
    muiPrimary: '#ffffff',
    muiPrimaryLight: '#ffffff',
    muiPrimaryDark: '#d1d5db',
    muiSecondary: '#e5e7eb', // light gray-white
    muiSecondaryLight: '#f3f4f6',
    muiSecondaryDark: '#d1d5db',
    muiBackground: '#0f0f0f',
    muiPaper: '#141414',
    muiTextPrimary: '#ffffff',
    muiTextSecondary: '#e5e7eb',
    muiDivider: '#2a2a2a',
    // Success accents
    accentGreen: '#22c55e',
    accentGreenMuted: '#166534'
  },
  // Classic Gray (Windows Dark Mode Style)
  classicGray: {
    accent: '#60cdff', // Windows 11 Blue
    accent2: '#a0a0a0', // Light Gray
    accentMuted: '#4cc2ff', // Muted Blue
    bg: '#202020', // Dark Gray Background
    bg2: '#2b2b2b', // Slightly lighter
    surface: '#2b2b2b', // Dark Surface (Card/Window)
    surface2: '#323232', // Lighter Surface
    text: '#ffffff', // White Text
    text2: '#d0d0d0', // Off-white Text
    glassBg: '#202020', // Opaque
    glassBorder: '#404040', // Dark Border
    glassShadow: 'none',
    // MUI
    muiPrimary: '#60cdff',
    muiPrimaryLight: '#8ad8ff',
    muiPrimaryDark: '#0094d8',
    muiSecondary: '#a0a0a0',
    muiSecondaryLight: '#bfbfbf',
    muiSecondaryDark: '#707070',
    muiBackground: '#202020',
    muiPaper: '#2b2b2b',
    muiTextPrimary: '#ffffff',
    muiTextSecondary: '#d0d0d0',
    muiDivider: '#454545',
    // Accents
    accentGreen: '#6cc200',
    accentGreenMuted: '#529400'
  }
};

// Theme-level behavior metadata consumed by Settings.
// Keeps theme side-effects (preferred style, effects, wallpaper preset) centralized.
const THEME_BEHAVIORS = {
  amethyst: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  onyx: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  charcoalOlive: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  quartz: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  crystal: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  classicGray: {
    preferredStyle: STYLES.WINFORMS,
    effects: {
      click: { enabled: false },
      background: { enabled: false },
    },
    wallpaper: {
      enabled: false,
    },
  },
  ocean: {
    preferredStyle: STYLES.LIQUID,
    effects: {
      click: { enabled: true, type: 'water' },
      background: { enabled: true, type: 'bubbles' },
    },
    wallpaper: {
      displayName: 'wavethemewallpaper',
      fileNamePrefix: 'wavethemewallpaper.',
    },
  },
  empress: {
    preferredStyle: STYLES.LIQUID,
    effects: {
      click: { enabled: false },
      background: { enabled: true, type: 'sparkleSymbol' },
    },
    wallpaper: {
      fileNamePrefix: 'slime.',
      fileNames: ['slime.webp'],
    },
  },
  forest: {
    preferredStyle: STYLES.LIQUID,
    effects: {
      click: { enabled: false, type: 'water' },
      background: { enabled: true, type: 'leaves' },
    },
    wallpaper: {
      enabled: true,
      displayName: 'Forest',
      fileNamePrefix: 'forest.',
    },
  },
  amogus: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false, type: 'water' },
      background: { enabled: true, type: 'starfield' },
    },
    wallpaper: {
      enabled: true,
      displayName: 'amogus',
      fileNamePrefix: 'amogus.',
      fileNames: ['amogus.webp', 'amogus.png', 'amogus.jpg', 'amogus.jpeg']
    },
  },
  city: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false, type: 'water' },
      background: { enabled: true, type: 'rain' },
    },
    wallpaper: {
      enabled: true,
      displayName: 'cyberpunkcityrain',
      fileNamePrefix: 'cyberpunkcityrain.',
      fileNames: ['cyberpunkcityrain.webp', 'cyberpunkcityrain.png', 'cyberpunkcityrain.jpg', 'cyberpunkcityrain.jpeg']
    },
  },
  cafe: {
    preferredStyle: STYLES.QUARTZ,
    effects: {
      click: { enabled: false, type: 'water' },
      background: { enabled: true, type: 'fireflies' },
    },
    wallpaper: {
      enabled: true,
      displayName: 'cafe',
      fileNamePrefix: 'cafe.',
      fileNames: ['cafe.webp', 'cafe.png', 'cafe.jpg', 'cafe.jpeg']
    },
  },
  starSky: {
    effects: {
      click: { enabled: false, type: 'water' },
      background: { enabled: true, type: 'fireflies' },
    },
    wallpaper: {
      enabled: true,
      displayName: 'starsky',
      fileNamePrefix: 'starsky.',
      fileNames: ['starsky.webp', 'starsky.png', 'starsky.jpg', 'starsky.jpeg']
    },
  },
};

// Optional Electron preferences import (guarded)
let electronPrefs;
try {
  // eslint-disable-next-line no-undef
  if (typeof window !== 'undefined' && window.require) {
    electronPrefs = require('../core/electronPrefs.js').default;
  } else {
    // Fallback to ESM import in bundlers
    // This may fail in some environments; we guard all usages
    electronPrefs = undefined;
  }
} catch {
  electronPrefs = undefined;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim());
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darkenHex(hex, amount = 0.2) {
  if (!isHexColor(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - clamp01(amount)));
  const dg = Math.round(g * (1 - clamp01(amount)));
  const db = Math.round(b * (1 - clamp01(amount)));
  return rgbToHex(dr, dg, db);
}

function withAlpha(hex, alpha = 0.35) {
  if (!isHexColor(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function normalizeThemeObject(input) {
  const theme = { ...input };
  // Derive missing fields from provided basics
  if (!theme.accentMuted && theme.accent) theme.accentMuted = darkenHex(theme.accent, 0.35);
  if (!theme.bg2 && theme.bg) theme.bg2 = darkenHex(theme.bg, 0.15);
  if (!theme.surface && theme.bg) theme.surface = darkenHex(theme.bg, 0.1);
  if (!theme.surface2 && theme.surface) theme.surface2 = darkenHex(theme.surface, 0.15);
  if (!theme.text && theme.accent) theme.text = theme.accent;
  if (!theme.text2 && theme.accent2) theme.text2 = theme.accent2;
  if (!theme.navIconColor) theme.navIconColor = theme.text2 || theme.accentMuted || theme.accent2 || theme.accent;
  if (!theme.glassBg) theme.glassBg = withAlpha(theme.surface || theme.bg || '#0b0a0f', 0.35);
  if (!theme.glassBorder) theme.glassBorder = 'rgba(255,255,255,0.10)';
  if (!theme.glassShadow) theme.glassShadow = '0 12px 28px rgba(0,0,0,0.35)';
  return theme;
}

export function applyThemeFromObject(themeObject = {}) {
  const t = normalizeThemeObject(themeObject);
  const root = document.documentElement;
  // Preserve any current data-theme attribute for CSS overrides; set to 'custom'
  root.setAttribute('data-theme', 'custom');

  // Core theme variables
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent2', t.accent2);
  root.style.setProperty('--accent-muted', t.accentMuted);
  if (t.accentGreen) root.style.setProperty('--accent-green', t.accentGreen);
  if (t.accentGreenMuted) root.style.setProperty('--accent-green-muted', t.accentGreenMuted);
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--bg-2', t.bg2);
  root.style.setProperty('--surface', t.surface);
  root.style.setProperty('--surface-2', t.surface2);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--text-2', t.text2);
  root.style.setProperty('--nav-icon-color', t.navIconColor || t.text2 || t.accentMuted || t.accent2 || t.accent);
  root.style.setProperty('--glass-bg', t.glassBg);
  root.style.setProperty('--glass-border', t.glassBorder);
  root.style.setProperty('--glass-shadow', t.glassShadow);

  // Gradients
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${t.accent}, ${t.accentMuted})`);
  root.style.setProperty('--accent-gradient-subtle', `linear-gradient(135deg, ${t.accent}33, ${t.accentMuted}33)`);
  root.style.setProperty('--surface-gradient', `linear-gradient(135deg, ${t.surface2} 0%, ${t.bg} 100%)`);
}

/**
 * Applies both Interface Style and Color Theme
 * @param {string} themeName - Name of the color theme (onyx, amethyst, etc.)
 * @param {string} styleName - Name of the style (quartz, winforms, liquid)
 */
export function applyThemeVariables(themeName = 'amethyst', styleName = STYLES.QUARTZ) {
  const root = document.documentElement;

  // Set Interface Style
  root.setAttribute('data-style', styleName);

  let theme;

  // 1. Handle Custom Theme
  if (typeof themeName === 'string' && themeName.startsWith('custom:') && electronPrefs && electronPrefs.obj) {
    const name = themeName.slice('custom:'.length);
    const all = electronPrefs.obj.CustomThemes || {};
    const t = all[name];
    if (t) {
      applyThemeFromObject(t);
      return;
    }
  }

  // 2. Fallback to built-in theme
  theme = THEMES[themeName] || THEMES.amethyst;
  const appliedTheme = THEMES[themeName] ? themeName : 'amethyst';
  root.setAttribute('data-theme', appliedTheme);

  // Core theme variables
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent2', theme.accent2);
  root.style.setProperty('--accent-muted', theme.accentMuted);
  root.style.setProperty('--accent-green', theme.accentGreen || theme.accent);
  root.style.setProperty('--accent-green-muted', theme.accentGreenMuted || theme.accentMuted);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--bg-2', theme.bg2);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--surface-2', theme.surface2);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--text-2', theme.text2);
  root.style.setProperty('--nav-icon-color', theme.navIconColor || theme.text2 || theme.accentMuted || theme.accent2 || theme.accent);
  root.style.setProperty('--glass-bg', theme.glassBg);
  root.style.setProperty('--glass-border', theme.glassBorder);
  root.style.setProperty('--glass-shadow', theme.glassShadow);

  // MUI specific variables
  root.style.setProperty('--mui-primary', theme.muiPrimary);
  root.style.setProperty('--mui-primary-light', theme.muiPrimaryLight);
  root.style.setProperty('--mui-primary-dark', theme.muiPrimaryDark);
  root.style.setProperty('--mui-secondary', theme.muiSecondary);
  root.style.setProperty('--mui-secondary-light', theme.muiSecondaryLight);
  root.style.setProperty('--mui-secondary-dark', theme.muiSecondaryDark);
  root.style.setProperty('--mui-background', theme.muiBackground);
  root.style.setProperty('--mui-paper', theme.muiPaper);
  root.style.setProperty('--mui-text-primary', theme.muiTextPrimary);
  root.style.setProperty('--mui-text-secondary', theme.muiTextSecondary);
  root.style.setProperty('--mui-divider', theme.muiDivider);

  // Gradients
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${theme.accent}, ${theme.accentMuted})`);
  root.style.setProperty('--accent-gradient-subtle', `linear-gradient(135deg, ${theme.accent}33, ${theme.accentMuted}33)`);
  root.style.setProperty('--surface-gradient', `linear-gradient(135deg, ${theme.surface2} 0%, ${theme.bg} 100%)`);
}

// Get current theme object
export function getCurrentTheme(themeName = 'amethyst') {
  return THEMES[themeName] || THEMES.amethyst;
}

// Get optional theme behavior/preset metadata.
export function getThemeBehavior(themeName = 'amethyst') {
  if (typeof themeName === 'string' && themeName.startsWith('custom:') && electronPrefs && electronPrefs.obj) {
    const name = themeName.slice('custom:'.length);
    const all = electronPrefs.obj.CustomThemes || {};
    const t = all[name];
    if (t && typeof t.__behavior === 'object' && t.__behavior) {
      return t.__behavior;
    }
  }
  return THEME_BEHAVIORS[themeName] || null;
}

// Get all available theme names
export function getAvailableThemes() {
  return Object.keys(THEMES);
}

export function getCustomThemes() {
  try {
    if (electronPrefs && electronPrefs.obj) {
      return electronPrefs.obj.CustomThemes || {};
    }
  } catch { }
  return {};
}

export async function setCustomTheme(name, themeObject) {
  if (!name) return;
  try {
    if (!electronPrefs) return;
    await electronPrefs.initPromise;
    const current = electronPrefs.obj.CustomThemes || {};
    current[name] = normalizeThemeObject(themeObject || {});
    electronPrefs.obj.CustomThemes = current;
    await electronPrefs.save();
  } catch (e) {
    // noop
  }
}

export async function deleteCustomTheme(name) {
  try {
    if (!electronPrefs) return;
    await electronPrefs.initPromise;
    const current = electronPrefs.obj.CustomThemes || {};
    if (current[name]) {
      delete current[name];
      electronPrefs.obj.CustomThemes = current;
      await electronPrefs.save();
    }
  } catch (e) {
    // noop
  }
}

export default { applyThemeVariables, applyThemeFromObject, getCustomThemes, setCustomTheme, deleteCustomTheme, getThemeBehavior, STYLES };
