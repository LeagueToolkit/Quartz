import { create } from 'zustand';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@/lib/theme/builtinThemes';
import { applyTheme, applyInterfaceStyle } from '@/lib/theme/applyTheme';
import { getThemeBehavior } from '@/lib/theme/behaviors';
import type { Theme, ThemeBehavior } from '@/lib/theme/types';
import { listCustomThemes, saveCustomTheme, deleteCustomTheme } from '@/lib/api';
import { useConfigStore } from './configStore';
import { useUiPrefsStore } from './uiPrefsStore';
import { log } from '@/lib/util/logger';

interface ThemeState {
    themes: Theme[];
    activeId: string;
    init: () => Promise<void>;
    setActive: (id: string) => void;
    saveTheme: (theme: Theme) => Promise<void>;
    removeTheme: (id: string) => Promise<void>;
}

function resolve(themes: Theme[], id: string): Theme {
    return themes.find((t) => t.id === id)
        ?? themes.find((t) => t.id === DEFAULT_THEME_ID)
        ?? themes[0];
}

/* Applies a theme's side effects (preferred interface style + click/background
   effect presets + wallpaper preset), mirroring Quartz's handleThemeChange.
   Only runs on explicit user selection — not on startup. */
function applyThemeBehavior(behavior: ThemeBehavior | null) {
    if (!behavior) return;
    const prefs = useUiPrefsStore.getState();

    if (behavior.preferredStyle) {
        prefs.set('interfaceStyle', behavior.preferredStyle);
        applyInterfaceStyle(behavior.preferredStyle);
    }

    const click = behavior.effects?.click;
    if (click) {
        prefs.set('clickEffectEnabled', click.enabled === true);
        if (click.type) prefs.set('clickEffectType', click.type);
        window.dispatchEvent(new CustomEvent('clickEffectChanged', {
            detail: { enabled: click.enabled === true, ...(click.type ? { type: click.type } : {}) },
        }));
    }

    const bg = behavior.effects?.background;
    if (bg) {
        prefs.set('backgroundEffectEnabled', bg.enabled === true);
        if (bg.type) prefs.set('backgroundEffectType', bg.type);
        window.dispatchEvent(new CustomEvent('backgroundEffectChanged', {
            detail: { enabled: bg.enabled === true, ...(bg.type ? { type: bg.type } : {}) },
        }));
    }

    if (behavior.wallpaper) {
        if (behavior.wallpaper.enabled === false) {
            // Themes that opt out of a wallpaper just disable it; the layer is store-driven.
            prefs.set('wallpaperEnabled', false);
        } else {
            // The wallpaper subsystem resolves a preset by display name / filename.
            window.dispatchEvent(new CustomEvent('themeWallpaperPreset', { detail: behavior.wallpaper }));
        }
    }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
    themes: BUILTIN_THEMES,
    activeId: DEFAULT_THEME_ID,

    init: async () => {
        let custom: Theme[] = [];
        try {
            custom = await listCustomThemes();
        } catch (e) {
            log.error('Failed to load custom themes', e);
        }
        const themes = [...BUILTIN_THEMES, ...custom];
        const wanted = useConfigStore.getState().settings.selectedTheme ?? DEFAULT_THEME_ID;
        const active = resolve(themes, wanted);
        set({ themes, activeId: active.id });
        applyTheme(active.tokens, active.id);
        applyInterfaceStyle(useUiPrefsStore.getState().interfaceStyle);
    },

    setActive: (id) => {
        const active = resolve(get().themes, id);
        set({ activeId: active.id });
        applyTheme(active.tokens, active.id);
        applyThemeBehavior(active.behavior ?? getThemeBehavior(active.id));
        void useConfigStore.getState().update({ selectedTheme: active.id });
    },

    saveTheme: async (theme) => {
        await saveCustomTheme(theme);
        const others = get().themes.filter((t) => t.id !== theme.id);
        set({ themes: [...others, { ...theme, builtin: false }] });
        get().setActive(theme.id);
    },

    removeTheme: async (id) => {
        await deleteCustomTheme(id);
        const themes = get().themes.filter((t) => t.id !== id);
        set({ themes });
        if (get().activeId === id) get().setActive(DEFAULT_THEME_ID);
    },
}));
