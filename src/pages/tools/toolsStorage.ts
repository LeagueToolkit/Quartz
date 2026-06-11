/* Persistence for the Tools page.

   The Electron version stored added executables physically (copied into a
   `tools/executables` folder, scanned on mount) and kept emoji assignments in
   `tools/emoji-data.json`. In the Tauri port we don't copy executables around —
   we remember the picked/dropped paths and their emoji directly via localStorage,
   matching the same observable behavior (tools persist across sessions). */

export interface StoredExe {
    name: string;
    path: string;
    type: 'exe' | 'bat';
    lastUsed: string | null;
    emoji: string | null;
}

const EXES_KEY = 'quartz.tools.exes';
const EMOJI_KEY = 'quartz.tools.emojiData';

export function loadExes(): StoredExe[] {
    try {
        const raw = localStorage.getItem(EXES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e) => e && typeof e.path === 'string' && typeof e.name === 'string');
    } catch {
        return [];
    }
}

export function saveExes(exes: StoredExe[]): void {
    try {
        localStorage.setItem(EXES_KEY, JSON.stringify(exes));
    } catch {
        /* ignore quota / serialization errors */
    }
}

/* Emoji map keyed by exe name, mirroring the old emoji-data.json shape. */
export function loadEmojiData(): Record<string, string> {
    try {
        const raw = localStorage.getItem(EMOJI_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function saveEmojiData(data: Record<string, string>): void {
    try {
        localStorage.setItem(EMOJI_KEY, JSON.stringify(data));
    } catch {
        /* ignore */
    }
}
