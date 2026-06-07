import { create } from 'zustand';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@/lib/theme/builtinThemes';
import { applyTheme } from '@/lib/theme/applyTheme';
import type { Theme } from '@/lib/theme/types';
import { listCustomThemes, saveCustomTheme, deleteCustomTheme } from '@/lib/api';
import { useConfigStore } from './configStore';
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
        applyTheme(active.tokens);
    },

    setActive: (id) => {
        const active = resolve(get().themes, id);
        set({ activeId: active.id });
        applyTheme(active.tokens);
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
