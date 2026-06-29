import { useEffect, useState, type ReactNode } from 'react';
import { Type, FolderOpen, RefreshCw, Plus, Trash2, FlaskConical } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FormGroup, CustomSelect, ThemeCard, Button } from '../primitives';
import { useThemeStore, useUiPrefsStore, applyUiPrefs } from '@/lib/stores';
import { CLICK_EFFECT_TYPES, BACKGROUND_EFFECT_TYPES } from '@/lib/theme/behaviors';
import { refreshFonts, applyFont, openFontsFolder, type FontOption } from '@/lib/fonts/fontManager';
import {
    listWallpapers, importWallpaper, deleteWallpaper,
    type WallpaperItem,
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
    const [wallThumbs, setWallThumbs] = useState<Record<string, string>>({});

    const loadFonts = () => refreshFonts().then(setFonts).catch((e) => log.error('refreshFonts failed', String(e)));
    const loadWallpapers = () => listWallpapers().then(setWallpapers).catch((e) => log.error('listWallpapers failed', String(e)));

    useEffect(() => { loadFonts(); loadWallpapers(); }, []);

    // Wallpaper thumbnails stream off disk through the asset protocol — the
    // webview decodes + GPU-caches them, so a large gallery doesn't pile up
    // base64 strings in JS memory.
    useEffect(() => {
        setWallThumbs(Object.fromEntries(wallpapers.map((w) => [w.id, convertFileSrc(w.filePath)])));
    }, [wallpapers]);

    const onFontChange = (v: string) => { set('font', v); applyFont(v); };
    const onBlur = (v: number) => { set('glassBlur', v); applyUiPrefs(); };

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

            <FormGroup label="Color Theme" description="Choose your preferred color scheme">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {themes.map((t) => (
                        <ThemeCard key={t.id} name={t.name}
                            desc={t.builtin ? 'Built-in' : 'Custom Theme'}
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

        </div>
    );
}
