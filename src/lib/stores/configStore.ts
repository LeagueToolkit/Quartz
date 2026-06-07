import { create } from 'zustand';
import { getSettings, saveSettings } from '@/lib/api';
import type { QuartzSettings } from '@/lib/types';
import { log } from '@/lib/util/logger';

const DEFAULT_SETTINGS: QuartzSettings = {
    schemaVersion: 1,
    leaguePath: null,
    championsPath: null,
    wadOutputPath: null,
    creatorName: null,
    autoUpdateEnabled: true,
    skippedUpdateVersion: null,
    selectedTheme: null,
};

interface ConfigState {
    settings: QuartzSettings;
    loaded: boolean;
    load: () => Promise<void>;
    // Patch one or more fields and persist the whole settings object.
    update: (patch: Partial<QuartzSettings>) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    loaded: false,
    load: async () => {
        try {
            const settings = await getSettings();
            set({ settings, loaded: true });
        } catch (e) {
            log.error('Failed to load settings, using defaults', e);
            set({ loaded: true });
        }
    },
    update: async (patch) => {
        const next = { ...get().settings, ...patch };
        set({ settings: next });
        try {
            await saveSettings(next);
        } catch (e) {
            log.error('Failed to save settings', e);
        }
    },
}));
