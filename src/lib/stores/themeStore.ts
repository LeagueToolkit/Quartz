import { create } from 'zustand';
import { BUILTIN_THEMES, BUILTIN_VARIANTS, DEFAULT_THEME_ID } from '@/lib/theme/builtinThemes';
import { applyTheme } from '@/lib/theme/applyTheme';
import { deriveTheme, type BaseMode } from '@/lib/theme/deriveTheme';
import type { Theme, ThemeTokens } from '@/lib/theme/types';
import { listCustomThemes, saveCustomTheme, deleteCustomTheme } from '@/lib/api';
import { useConfigStore } from './configStore';
import { log } from '@/lib/util/logger';

interface ThemeState {
    themes: Theme[];
    activeId: string;
    base: BaseMode;
    overrides: Record<string, string>;
    init: () => Promise<void>;
    /* Re-derive a theme's tokens from its seed accent (or a per-theme override)
       on the active base mode. The seed accent — not the derived tokens — is the
       source of truth, so base/override changes compound correctly. */
    tokensFor: (theme: Theme) => ThemeTokens;
    setActive: (id: string) => void;
    setBase: (base: BaseMode) => void;
    /* Re-apply the active theme without changing selection — used when a
       non-theme input (wallpaper on/off) changes how surfaces are derived. */
    reapply: () => void;
    setOverride: (id: string, accent: string | null) => void;
    saveTheme: (theme: Theme) => Promise<void>;
    removeTheme: (id: string) => Promise<void>;
}

function seedAccent(theme: Theme): string {
    const variant = BUILTIN_VARIANTS.find((v) => v.id === theme.id);
    return variant?.accent ?? theme.tokens.accent;
}

function resolve(themes: Theme[], id: string): Theme {
    return themes.find((t) => t.id === id)
        ?? themes.find((t) => t.id === DEFAULT_THEME_ID)
        ?? themes[0];
}

export const useThemeStore = create<ThemeState>((set, get) => ({
    themes: BUILTIN_THEMES,
    activeId: DEFAULT_THEME_ID,
    base: 'dark',
    overrides: {},

    tokensFor: (theme) => {
        const { overrides, base } = get();
        return deriveTheme(overrides[theme.id] ?? seedAccent(theme), base);
    },

    init: async () => {
        let custom: Theme[] = [];
        try {
            custom = await listCustomThemes();
        } catch (e) {
            log.error('Failed to load custom themes', e);
        }
        const themes = [...BUILTIN_THEMES, ...custom];
        const cfg = useConfigStore.getState().settings;
        const base: BaseMode = cfg.themeBase === 'light' ? 'light' : 'dark';
        const overrides = cfg.themeOverrides ?? {};
        const active = resolve(themes, cfg.selectedTheme ?? DEFAULT_THEME_ID);
        set({ themes, activeId: active.id, base, overrides });
        applyTheme(get().tokensFor(active), active.id);
    },

    setActive: (id) => {
        const active = resolve(get().themes, id);
        set({ activeId: active.id });
        applyTheme(get().tokensFor(active), active.id);
        void useConfigStore.getState().update({ selectedTheme: active.id });
    },

    setBase: (base) => {
        set({ base });
        const active = resolve(get().themes, get().activeId);
        applyTheme(get().tokensFor(active), active.id);
        void useConfigStore.getState().update({ themeBase: base });
    },

    reapply: () => {
        const active = resolve(get().themes, get().activeId);
        applyTheme(get().tokensFor(active), active.id);
    },

    setOverride: (id, accent) => {
        const overrides = { ...get().overrides };
        if (accent) overrides[id] = accent;
        else delete overrides[id];
        set({ overrides });
        if (get().activeId === id) {
            const active = resolve(get().themes, id);
            applyTheme(get().tokensFor(active), active.id);
        }
        void useConfigStore.getState().update({ themeOverrides: overrides });
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
