import type { ThemeTokens, InterfaceStyle } from './types';

/* ── color helpers (ported from Quartz themeManager) ─────────────────────── */

function isHexColor(value: string): boolean {
    return typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim());
}
function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
export function darkenHex(hex: string, amount = 0.2): string {
    if (!isHexColor(hex)) return hex;
    const { r, g, b } = hexToRgb(hex);
    const f = clamp01(amount);
    return rgbToHex(Math.round(r * (1 - f)), Math.round(g * (1 - f)), Math.round(b * (1 - f)));
}
export function withAlpha(hex: string, alpha = 0.35): string {
    if (!isHexColor(hex)) return hex;
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function normalizeBlurValue(value?: string): string {
    if (value === undefined || value === null) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^-?\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
    return raw;
}

function setOptionalCssVar(root: HTMLElement, name: string, value?: string) {
    const raw = String(value ?? '').trim();
    if (!raw) root.style.removeProperty(name);
    else root.style.setProperty(name, raw);
}

/* Fills in fields a custom/partial theme leaves blank, exactly like Quartz's
   normalizeThemeObject. */
export function normalizeTokens(input: Partial<ThemeTokens>): ThemeTokens {
    const t = { ...input } as ThemeTokens;
    if (!t.accentMuted && t.accent) t.accentMuted = darkenHex(t.accent, 0.35);
    if (!t.bg2 && t.bg) t.bg2 = darkenHex(t.bg, 0.15);
    if (!t.surface && t.bg) t.surface = darkenHex(t.bg, 0.1);
    if (!t.surface2 && t.surface) t.surface2 = darkenHex(t.surface, 0.15);
    if (!t.text && t.accent) t.text = t.accent;
    if (!t.text2 && t.accent2) t.text2 = t.accent2;
    if (!t.navIconColor) t.navIconColor = t.text2 || t.accentMuted || t.accent2 || t.accent;
    if (!t.glassBg) t.glassBg = withAlpha(t.surface || t.bg || '#0b0a0f', 0.35);
    if (!t.glassBorder) t.glassBorder = 'rgba(255,255,255,0.10)';
    if (!t.glassShadow) t.glassShadow = '0 12px 28px rgba(0,0,0,0.35)';
    if (!t.accentGreen) t.accentGreen = '#22c55e';
    return t;
}

/* ── application ─────────────────────────────────────────────────────────── */

/* Writes the full Quartz theme variable set to :root. `id` sets data-theme so
   CSS overrides keyed on a theme can apply. */
export function applyTheme(rawTokens: Partial<ThemeTokens>, id?: string) {
    const t = normalizeTokens(rawTokens);
    const root = document.documentElement;
    if (id) {
        root.setAttribute('data-theme', id);
        // Mirror the active theme id so the Design Lab window can match it.
        try { localStorage.setItem('quartz-active-theme', id); } catch { /* ignore */ }
    }

    // Core. Quartz exposes both --accent2 and --accent-2 for compatibility.
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent2', t.accent2);
    root.style.setProperty('--accent-2', t.accent2);
    root.style.setProperty('--accent-muted', t.accentMuted);
    root.style.setProperty('--accent-green', t.accentGreen || t.accent);
    root.style.setProperty('--accent-green-muted', t.accentGreenMuted || t.accentMuted);
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--bg-2', t.bg2);
    root.style.setProperty('--surface', t.surface);
    root.style.setProperty('--surface-2', t.surface2);
    root.style.setProperty('--text', t.text);
    root.style.setProperty('--text-2', t.text2);
    root.style.setProperty('--nav-icon-color', t.navIconColor || t.text2 || t.accentMuted || t.accent2 || t.accent);
    root.style.setProperty('--glass-bg', t.glassBg!);
    root.style.setProperty('--glass-border', t.glassBorder!);
    root.style.setProperty('--glass-shadow', t.glassShadow!);

    // Liquid-glass button tuning (optional).
    setOptionalCssVar(root, '--liquid-button-bg', t.liquidButtonTint);
    setOptionalCssVar(root, '--liquid-button-hover-bg', t.liquidButtonHoverTint);
    setOptionalCssVar(root, '--liquid-button-blur', normalizeBlurValue(t.liquidButtonBlur));

    // MUI palette (optional — only builtins carry these).
    setOptionalCssVar(root, '--mui-primary', t.muiPrimary);
    setOptionalCssVar(root, '--mui-primary-light', t.muiPrimaryLight);
    setOptionalCssVar(root, '--mui-primary-dark', t.muiPrimaryDark);
    setOptionalCssVar(root, '--mui-secondary', t.muiSecondary);
    setOptionalCssVar(root, '--mui-secondary-light', t.muiSecondaryLight);
    setOptionalCssVar(root, '--mui-secondary-dark', t.muiSecondaryDark);
    setOptionalCssVar(root, '--mui-background', t.muiBackground);
    setOptionalCssVar(root, '--mui-paper', t.muiPaper);
    setOptionalCssVar(root, '--mui-text-primary', t.muiTextPrimary);
    setOptionalCssVar(root, '--mui-text-secondary', t.muiTextSecondary);
    setOptionalCssVar(root, '--mui-divider', t.muiDivider);

    // Gradients.
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${t.accent}, ${t.accentMuted})`);
    root.style.setProperty('--accent-gradient-subtle', `linear-gradient(135deg, ${t.accent}33, ${t.accentMuted}33)`);
    root.style.setProperty('--surface-gradient', `linear-gradient(135deg, ${t.surface2} 0%, ${t.bg} 100%)`);

    /* Canonical "Design Lab" tokens — the source-of-truth vocabulary the ported
       UI uses. Driven by the same theme object so a theme edits everything.
       (styles/theme.css provides the static defaults + the legacy aliases.) */
    root.style.setProperty('--accent-primary', t.accent);
    root.style.setProperty('--accent-hover', t.muiPrimaryLight || t.accent2 || t.accent);
    root.style.setProperty('--accent-secondary', t.accent2);
    // --accent-muted already set above (legacy name == canonical name).
    root.style.setProperty('--bg-primary', t.bg);
    root.style.setProperty('--bg-secondary', t.surface);
    root.style.setProperty('--bg-tertiary', t.surface2);
    root.style.setProperty('--bg-hover', t.muiDivider || t.surface2);
    root.style.setProperty('--text-primary', t.text);
    root.style.setProperty('--text-secondary', t.text2);
    root.style.setProperty('--text-muted', t.muiTextSecondary ? withAlpha(t.text2, 0.6) : t.text2);
    root.style.setProperty('--border', t.muiDivider || t.glassBorder!);
    root.style.setProperty('--color-success', t.accentGreen || '#3FB950');
    // Status warning/danger/info stay theme-independent (defined in theme.css).
}

/* Interface styles (winforms/liquid/minecraft) were removed; the app is always
   the Quartz style now. Kept as a no-op-ish setter so existing callers compile
   and any stale CSS keyed on data-style="quartz" still matches. */
export function applyInterfaceStyle(_style?: InterfaceStyle | string) {
    document.documentElement.setAttribute('data-style', 'quartz');
}
