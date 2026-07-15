import { useEffect, useState, type ReactNode } from 'react';
import { Type, FolderOpen, RefreshCw, Plus, Trash2, Palette, Image, MousePointerClick, Sparkles, PanelsTopLeft } from 'lucide-react';
import { useFileExplorer } from '@/components/explorer';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FormGroup, CustomSelect, Button, cardSurface } from '../primitives';
import { ThemeCardGrid } from '../ThemeCardGrid';
import { useUiPrefsStore, applyUiPrefs, useThemeStore } from '@/lib/stores';
import { CLICK_EFFECT_TYPES, BACKGROUND_EFFECT_TYPES } from '@/lib/theme/behaviors';
import { refreshFonts, applyFont, openFontsFolder, type FontOption } from '@/lib/fonts/fontManager';
import {
    listWallpapers, importWallpaper, deleteWallpaper,
    type WallpaperItem,
} from '@/lib/api';
import { log } from '@/lib/util/logger';

const card = cardSurface;

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

export function AppearanceSection() {
    const pick = useFileExplorer();
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
    const setGlobalAppearance = (key: 'sharpButtonCorners' | 'globalGlassSurfaces', value: boolean) => {
        set(key, value);
        applyUiPrefs();
    };

    // Whether a wallpaper is showing drives the translucent surface tokens, so
    // toggling/selecting a wallpaper must re-derive the active theme.
    const reapplyWallpaper = () => useThemeStore.getState().reapply();
    const setWallpaperEnabled = (c: boolean) => { set('wallpaperEnabled', c); reapplyWallpaper(); };

    const addWallpaper = async () => {
        const picked = await pick({ mode: 'file', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
        if (typeof picked !== 'string') return;
        const item = await importWallpaper(picked);
        await loadWallpapers();
        selectWallpaper(item);
    };
    const selectWallpaper = (w: WallpaperItem) => {
        set('wallpaperId', w.id); set('wallpaperPath', w.filePath); set('wallpaperEnabled', true);
        reapplyWallpaper();
    };
    const removeWallpaper = async (id: string) => {
        await deleteWallpaper(id);
        if (prefs.wallpaperId === id) { set('wallpaperId', ''); set('wallpaperPath', ''); reapplyWallpaper(); }
        await loadWallpapers();
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Font Family" icon={<Type size={15} />}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                        <CustomSelect value={prefs.font} onChange={onFontChange} icon={<Type size={16} />} options={fonts} />
                    </div>
                    <Button icon={<FolderOpen size={16} />} variant="secondary" onClick={() => openFontsFolder().catch((e) => log.error('openFontsFolder failed', String(e)))}>Folder</Button>
                    <Button icon={<RefreshCw size={16} />} variant="secondary" onClick={loadFonts}>Refresh</Button>
                </div>
            </FormGroup>

            <FormGroup label="Color Theme" icon={<Palette size={15} />}>
                <ThemeCardGrid />
            </FormGroup>

            <FormGroup label="Interface Style" icon={<PanelsTopLeft size={15} />}>
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox
                        checked={prefs.sharpButtonCorners}
                        onChange={(checked) => setGlobalAppearance('sharpButtonCorners', checked)}
                    >
                        Sharp button corners
                    </Checkbox>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45, marginTop: '-6px' }}>
                        Removes rounding from every button and clickable button control across Quartz.
                    </div>
                    <Checkbox
                        checked={prefs.globalGlassSurfaces}
                        onChange={(checked) => setGlobalAppearance('globalGlassSurfaces', checked)}
                    >
                        Glass buttons and containers
                    </Checkbox>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45, marginTop: '-6px' }}>
                        Applies translucent blur, glass borders, and soft depth to buttons, cards, panels, panes, sidebars, and dialogs globally.
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="Wallpaper" icon={<Image size={15} />}>
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.wallpaperEnabled} onChange={setWallpaperEnabled}>Enable wallpaper</Checkbox>
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

            <FormGroup label="Click Effect" icon={<MousePointerClick size={15} />}>
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Checkbox checked={prefs.clickEffectEnabled} onChange={(c) => set('clickEffectEnabled', c)}>Enable click effect</Checkbox>
                    <CustomSelect value={prefs.clickEffectType} onChange={(v) => set('clickEffectType', v)}
                        disabled={!prefs.clickEffectEnabled || prefs.performanceMode}
                        options={CLICK_EFFECT_TYPES.map((t) => ({ value: t.id, label: t.name }))} />
                </div>
            </FormGroup>

            <FormGroup label="Background Effect" icon={<Sparkles size={15} />}>
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
