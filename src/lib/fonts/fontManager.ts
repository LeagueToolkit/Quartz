import { listFonts, getFontsDir, readFileBase64 } from '@/lib/api';
import { openPath } from '@tauri-apps/plugin-opener';

export interface FontOption {
    value: string;
    label: string;
    fontFamily?: string;
}

/* Curated common families (ported 1:1 from Quartz's fontManager) plus the system
   default. User fonts dropped into the fonts folder are appended. */
const COMMON_FONTS: FontOption[] = [
    { value: 'system', label: 'System Default' },
    // Windows
    { value: 'Segoe UI', label: 'Segoe UI' },
    { value: 'Consolas', label: 'Consolas (Mono)' },
    { value: 'Cascadia Code', label: 'Cascadia Code (Mono)' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Verdana', label: 'Verdana' },
    { value: 'Tahoma', label: 'Tahoma' },
    { value: 'Trebuchet MS', label: 'Trebuchet MS' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Calibri', label: 'Calibri' },
    { value: 'Cambria', label: 'Cambria' },
    { value: 'Lucida Console', label: 'Lucida Console (Mono)' },
    { value: 'Courier New', label: 'Courier New (Mono)' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    // Mac
    { value: 'SF Pro', label: 'SF Pro (Mac)' },
    { value: 'SF Mono', label: 'SF Mono (Mac)' },
    { value: 'Menlo', label: 'Menlo (Mac Mono)' },
    { value: 'Monaco', label: 'Monaco (Mac Mono)' },
    { value: 'Helvetica Neue', label: 'Helvetica Neue' },
    // Linux
    { value: 'Ubuntu', label: 'Ubuntu' },
    { value: 'Ubuntu Mono', label: 'Ubuntu Mono' },
    { value: 'DejaVu Sans', label: 'DejaVu Sans' },
    { value: 'DejaVu Sans Mono', label: 'DejaVu Sans Mono' },
    // Web-safe
    { value: 'Comic Sans MS', label: 'Comic Sans MS' },
    { value: 'Impact', label: 'Impact' },
    { value: 'Palatino Linotype', label: 'Palatino' },
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
    // Preview each option in its own family in the dropdown.
    const common = COMMON_FONTS.map((f) => f.value === 'system' ? f : { ...f, fontFamily: `"${f.value}"` });
    return [...common, ...userFonts];
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
