import { useEffect, useState, type ReactNode } from 'react';
import { Type, FolderOpen, RefreshCw, Plus, Trash2, FlaskConical } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { openPath } from '@tauri-apps/plugin-opener';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FormGroup, CustomSelect, ThemeCard, Button } from '../primitives';
import { useThemeStore, useUiPrefsStore, applyUiPrefs } from '@/lib/stores';
import { INTERFACE_STYLES, THEME_DESCRIPTIONS, CLICK_EFFECT_TYPES, BACKGROUND_EFFECT_TYPES } from '@/lib/theme/behaviors';
import { applyInterfaceStyle } from '@/lib/theme/applyTheme';
import { refreshFonts, applyFont, openFontsFolder, type FontOption } from '@/lib/fonts/fontManager';
import {
    listWallpapers, importWallpaper, deleteWallpaper, getCursorsDir, listCursors, readFileBase64,
    type WallpaperItem, type AssetFile,
} from '@/lib/api';
import { log } from '@/lib/util/logger';

const card: React.CSSProperties = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '16px',
};

function Range({ value, min, max, step, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
    return (
        <input type="range" min={min} max={max} step={step ?? 1} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
    );
}

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
    return (
        <label className="dl-check">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="dl-check__box">
                <span className="dl-check__tick">
                    <span className="dl-icon">
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-6" /></svg>
                    </span>
                </span>
            </span>
            <span>{children}</span>
        </label>
    );
}

// hex + alpha (0..1) <-> "rgba(r,g,b,a)"
function parseRgba(value: string): { hex: string; alpha: number } {
    const m = String(value || '').match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (!m) return { hex: '#ffffff', alpha: 0.1 };
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return { hex: `#${to2(+m[1])}${to2(+m[2])}${to2(+m[3])}`, alpha: m[4] === undefined ? 1 : parseFloat(m[4]) };
}
function toRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}

function RgbaControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
    const { hex, alpha } = parseRgba(value || fallback);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '110px' }}>{label}</span>
            <input type="color" value={hex} onChange={(e) => onChange(toRgba(e.target.value, alpha))}
                style={{ width: '36px', height: '28px', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
            <Range value={alpha} min={0} max={1} step={0.01} onChange={(a) => onChange(toRgba(hex, a))} />
        </div>
    );
}

/* Open the Design Lab in a real separate window. Focuses the existing one if
   it's already open. */
async function openDesignLab() {
    const existing = await WebviewWindow.getByLabel('design-lab');
    if (existing) {
        await existing.setFocus();
        return;
    }
    const win = new WebviewWindow('design-lab', {
        url: 'index.html?lab',
        title: 'Quartz — Design Lab',
        width: 1180,
        height: 860,
        resizable: true,
    });
    win.once('tauri://error', (e) => log.error('Design Lab window failed', String(e)));
}

export function AppearanceSection() {
    const themes = useThemeStore((s) => s.themes);
    const activeTheme = useThemeStore((s) => s.activeId);
    const setActive = useThemeStore((s) => s.setActive);
    const prefs = useUiPrefsStore();
    const set = prefs.set;

    const [fonts, setFonts] = useState<FontOption[]>([]);
    const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
    const [cursors, setCursors] = useState<AssetFile[]>([]);
    const [cursorThumbs, setCursorThumbs] = useState<Record<string, string>>({});
    const [wallThumbs, setWallThumbs] = useState<Record<string, string>>({});

    const loadFonts = () => refreshFonts().then(setFonts).catch((e) => log.error('refreshFonts failed', String(e)));
    const loadWallpapers = () => listWallpapers().then(setWallpapers).catch((e) => log.error('listWallpapers failed', String(e)));
    const loadCursors = () => listCursors().then(setCursors).catch((e) => log.error('listCursors failed', String(e)));

    useEffect(() => { loadFonts(); loadWallpapers(); loadCursors(); }, []);

    // Wallpaper thumbnails stream off disk through the asset protocol — the
    // webview decodes + GPU-caches them, so a large gallery doesn't pile up
    // base64 strings in JS memory.
    useEffect(() => {
        setWallThumbs(Object.fromEntries(wallpapers.map((w) => [w.id, convertFileSrc(w.filePath)])));
    }, [wallpapers]);
    useEffect(() => {
        cursors.forEach((c) => {
            if (cursorThumbs[c.path]) return;
            readFileBase64(c.path).then((b64) => {
                const ext = (c.name.split('.').pop() || 'png').toLowerCase();
                const mime = ext === 'cur' ? 'image/vnd.microsoft.icon' : ext === 'gif' ? 'image/gif' : 'image/png';
                setCursorThumbs((p) => ({ ...p, [c.path]: `data:${mime};base64,${b64}` }));
            }).catch((e) => log.error('cursor thumb failed', c.path, String(e)));
        });
    }, [cursors]);

    const onFontChange = (v: string) => { set('font', v); applyFont(v); };
    const onStyleChange = (id: typeof INTERFACE_STYLES[number]['id']) => { set('interfaceStyle', id); applyInterfaceStyle(id); };
    const onBlur = (v: number) => { set('glassBlur', v); applyUiPrefs(); };
    const onLiquid = (key: 'liquidButtonTint' | 'liquidButtonHoverTint' | 'liquidButtonBlur', v: string) => { set(key, v); applyUiPrefs(); };

    const addWallpaper = async () => {
        const picked = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
        if (typeof picked !== 'string') return;
        const item = await importWallpaper(picked);
        await loadWallpapers();
        selectWallpaper(item);
    };
    const selectWallpaper = (w: WallpaperItem) => {
        set('wallpaperId', w.id); set('wallpaperPath', w.filePath); set('wallpaperEnabled', true);
    };
    const removeWallpaper = async (id: string) => {
        await deleteWallpaper(id);
        if (prefs.wallpaperId === id) { set('wallpaperId', ''); set('wallpaperPath', ''); }
        await loadWallpapers();
    };
    const openCursorsFolder = async () => { try { await openPath(await getCursorsDir()); } catch (e) { log.error('openCursorsFolder failed', String(e)); } };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Font Family" description="Select the interface font">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                        <CustomSelect value={prefs.font} onChange={onFontChange} icon={<Type size={16} />} options={fonts} />
                    </div>
                    <Button icon={<FolderOpen size={16} />} variant="secondary" onClick={() => openFontsFolder().catch((e) => log.error('openFontsFolder failed', String(e)))}>Folder</Button>
                    <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={loadFonts}>Refresh</Button>
                </div>
            </FormGroup>

            <FormGroup label="Performance Mode" description="Reduce heavy visual effects on weaker hardware">
                <Checkbox checked={prefs.performanceMode} onChange={(c) => { set('performanceMode', c); applyUiPrefs(); }}>
                    Reduce blur, glow, and animations
                </Checkbox>
            </FormGroup>

            <FormGroup label="Interface Style" description="Select the application's visual layout">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {INTERFACE_STYLES.map((s) => (
                        <ThemeCard key={s.id} name={s.name} desc={s.desc} selected={prefs.interfaceStyle === s.id} onClick={() => onStyleChange(s.id)} />
                    ))}
                </div>
            </FormGroup>

            {prefs.interfaceStyle === 'liquid' && (
                <FormGroup label="Glass Button Tuning" description="Adjust tint and blur for Liquid button style">
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <RgbaControl label="Tint" value={prefs.liquidButtonTint} fallback="rgba(255,255,255,0.1)" onChange={(v) => onLiquid('liquidButtonTint', v)} />
                        <RgbaControl label="Hover Tint" value={prefs.liquidButtonHoverTint} fallback="rgba(255,255,255,0.16)" onChange={(v) => onLiquid('liquidButtonHoverTint', v)} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '110px' }}>Blur ({prefs.liquidButtonBlur || '14'}px)</span>
                            <Range value={parseFloat(prefs.liquidButtonBlur || '14')} min={0} max={36} onChange={(v) => onLiquid('liquidButtonBlur', String(v))} />
                        </div>
                    </div>
                </FormGroup>
            )}

            <FormGroup label="Color Theme" description="Choose your preferred color scheme">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {themes.map((t) => (
                        <ThemeCard key={t.id} name={t.name}
                            desc={t.builtin ? (THEME_DESCRIPTIONS[t.id] ?? 'Built-in') : 'Custom Theme'}
                            selected={activeTheme === t.id} onClick={() => setActive(t.id)} />
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Design Lab" description="Open a window showcasing every standardized UI element (buttons, inputs, sliders, toggles, modals)">
                <Button icon={<FlaskConical size={16} />} variant="secondary" onClick={() => openDesignLab().catch((e) => log.error('openDesignLab failed', String(e)))}>
                    Open Design Lab
                </Button>
            </FormGroup>

            <FormGroup label="Wallpaper" description="Set a background image that covers the entire app">
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.wallpaperEnabled} onChange={(c) => set('wallpaperEnabled', c)}>Enable wallpaper</Checkbox>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button icon={<Plus size={16} />} variant="secondary" onClick={addWallpaper}>Add Wallpaper</Button>
                        {prefs.wallpaperId && (
                            <Button icon={<Trash2 size={16} />} variant="secondary" onClick={() => removeWallpaper(prefs.wallpaperId)}>Delete Active</Button>
                        )}
                    </div>
                    {wallpapers.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                            {wallpapers.map((w) => (
                                <button key={w.id} onClick={() => selectWallpaper(w)} title={w.displayName}
                                    style={{ position: 'relative', padding: 0, height: '76px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${prefs.wallpaperId === w.id ? 'var(--accent-primary)' : 'var(--border)'}` }}>
                                    {wallThumbs[w.id]
                                        ? <img src={wallThumbs[w.id]} alt={w.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <div style={{ width: '100%', height: '100%', background: 'var(--bg-hover)' }} />}
                                </button>
                            ))}
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Opacity ({Math.round(prefs.wallpaperOpacity * 100)}%)</div>
                        <Range value={prefs.wallpaperOpacity} min={0} max={1} step={0.01} onChange={(v) => set('wallpaperOpacity', v)} />
                    </div>
                    <Checkbox checked={prefs.wallpaperVignetteEnabled} onChange={(c) => set('wallpaperVignetteEnabled', c)}>Enable vignette</Checkbox>
                    {prefs.wallpaperVignetteEnabled && (
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Vignette ({Math.round(prefs.wallpaperVignetteStrength * 100)}%)</div>
                            <Range value={prefs.wallpaperVignetteStrength} min={0} max={1} step={0.01} onChange={(v) => set('wallpaperVignetteStrength', v)} />
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>UI Blur ({prefs.glassBlur}px)</div>
                        <Range value={prefs.glassBlur} min={0} max={24} onChange={onBlur} />
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="Click Effect" description="Show interactive visual effects on click">
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.clickEffectEnabled} onChange={(c) => set('clickEffectEnabled', c)}>Enable click effect</Checkbox>
                    <CustomSelect value={prefs.clickEffectType} onChange={(v) => set('clickEffectType', v)}
                        disabled={!prefs.clickEffectEnabled || prefs.performanceMode}
                        options={CLICK_EFFECT_TYPES.map((t) => ({ value: t.id, label: t.name }))} />
                </div>
            </FormGroup>

            <FormGroup label="Background Effect" description="Show animated background effects">
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.backgroundEffectEnabled} onChange={(c) => set('backgroundEffectEnabled', c)}>Enable background effect</Checkbox>
                    <CustomSelect value={prefs.backgroundEffectType} onChange={(v) => set('backgroundEffectType', v)}
                        disabled={!prefs.backgroundEffectEnabled || prefs.performanceMode}
                        options={BACKGROUND_EFFECT_TYPES.map((t) => ({ value: t.id, label: t.name }))} />
                </div>
            </FormGroup>

            <FormGroup label="Cursor Effect" description="Replace the system cursor with a custom style">
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.cursorEffectEnabled} onChange={(c) => set('cursorEffectEnabled', c)}>Enable cursor effect</Checkbox>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button icon={<FolderOpen size={16} />} variant="secondary" onClick={openCursorsFolder}>Open Folder</Button>
                        <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={loadCursors}>Refresh</Button>
                    </div>
                    {cursors.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                            {cursors.map((c) => (
                                <button key={c.path} onClick={() => set('cursorEffectPath', c.path)} title={c.name}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: `2px solid ${prefs.cursorEffectPath === c.path ? 'var(--accent-primary)' : 'var(--border)'}`, background: 'var(--bg-tertiary)' }}>
                                    {cursorThumbs[c.path] && <img src={cursorThumbs[c.path]} alt={c.name} style={{ maxWidth: '36px', maxHeight: '36px', objectFit: 'contain' }} />}
                                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No cursors found — drop .cur, .png, or .gif files into the folder.</div>
                    )}
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Cursor Size ({prefs.cursorEffectSize}px)</div>
                        <Range value={prefs.cursorEffectSize} min={16} max={128} step={4} onChange={(v) => set('cursorEffectSize', v)} />
                    </div>
                </div>
            </FormGroup>
        </div>
    );
}
