import { listFonts, getFontsDir, readFileBase64 } from '@/lib/api';
import { openPath } from '@tauri-apps/plugin-opener';

export interface FontOption {
    value: string;
    label: string;
    fontFamily?: string;
}

// Common Windows families always offered, plus the system default.
const COMMON_FONTS: FontOption[] = [
    { value: 'system', label: 'System Default' },
    { value: 'Segoe UI', label: 'Segoe UI' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Calibri', label: 'Calibri' },
    { value: 'Cambria', label: 'Cambria' },
    { value: 'Consolas', label: 'Consolas' },
    { value: 'Courier New', label: 'Courier New' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Tahoma', label: 'Tahoma' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Trebuchet MS', label: 'Trebuchet MS' },
    { value: 'Verdana', label: 'Verdana' },
];

const MIME: Record<string, string> = {
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

const registered = new Set<string>();

function stem(name: string): string {
    return name.replace(/\.[^.]+$/, '');
}

/* Registers any font files dropped into the fonts folder via @font-face and
   returns the merged dropdown list (common families + user fonts). */
export async function refreshFonts(): Promise<FontOption[]> {
    let userFonts: FontOption[] = [];
    try {
        const files = await listFonts();
        for (const f of files) {
            const family = stem(f.name);
            if (!registered.has(family)) {
                try {
                    const ext = (f.name.split('.').pop() || '').toLowerCase();
                    const b64 = await readFileBase64(f.path);
                    const face = new FontFace(family, `url(data:${MIME[ext] || 'font/ttf'};base64,${b64})`);
                    await face.load();
                    (document.fonts as FontFaceSet).add(face);
                    registered.add(family);
                } catch {
                    // Skip a font file that fails to load.
                }
            }
            userFonts.push({ value: family, label: family, fontFamily: `"${family}"` });
        }
    } catch {
        // Fonts dir unavailable — fall back to common families only.
    }
    const seen = new Set(COMMON_FONTS.map((f) => f.value));
    userFonts = userFonts.filter((f) => !seen.has(f.value));
    return [...COMMON_FONTS, ...userFonts];
}

export function applyFont(name: string) {
    const root = document.documentElement;
    if (!name || name === 'system') {
        root.style.removeProperty('--app-font');
        root.style.fontFamily = '';
        return;
    }
    const stack = `"${name}", system-ui, sans-serif`;
    root.style.setProperty('--app-font', stack);
    root.style.fontFamily = stack;
}

export async function openFontsFolder(): Promise<void> {
    const dir = await getFontsDir();
    await openPath(dir);
}
