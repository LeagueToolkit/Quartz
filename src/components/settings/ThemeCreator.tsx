import { useEffect, useMemo, useState } from 'react';
import { useThemeStore, useUiPrefsStore } from '@/lib/stores';
import { applyTheme, applyInterfaceStyle, darkenHex, withAlpha } from '@/lib/theme/applyTheme';
import { INTERFACE_STYLES, CLICK_EFFECT_TYPES, BACKGROUND_EFFECT_TYPES, getThemeBehavior } from '@/lib/theme/behaviors';
import { BASIC_TOKEN_LABELS, ADVANCED_TOKEN_LABELS, type Theme, type ThemeTokens, type ThemeBehavior } from '@/lib/theme/types';
import { listWallpapers, type WallpaperItem } from '@/lib/api';
import { FormGroup, CustomSelect, ToggleSwitch, Button, Input } from './primitives';
import { log } from '@/lib/util/logger';

function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
}

interface EditorBehavior {
    preferredStyle: string;
    click: { override: boolean; enabled: boolean; type: string };
    background: { override: boolean; enabled: boolean; type: string };
    wallpaper: { override: boolean; enabled: boolean; id: string };
}

const DEFAULT_BEHAVIOR: EditorBehavior = {
    preferredStyle: '',
    click: { override: false, enabled: false, type: 'water' },
    background: { override: false, enabled: false, type: 'fireflies' },
    wallpaper: { override: false, enabled: false, id: '' },
};

function behaviorToEditor(b?: ThemeBehavior | null): EditorBehavior {
    return {
        preferredStyle: b?.preferredStyle || '',
        click: { override: !!b?.effects?.click, enabled: b?.effects?.click?.enabled === true, type: b?.effects?.click?.type || 'water' },
        background: { override: !!b?.effects?.background, enabled: b?.effects?.background?.enabled === true, type: b?.effects?.background?.type || 'fireflies' },
        wallpaper: { override: typeof b?.wallpaper?.enabled === 'boolean', enabled: b?.wallpaper?.enabled === true, id: b?.wallpaper?.id || '' },
    };
}

function editorToBehavior(e: EditorBehavior): ThemeBehavior | undefined {
    const next: ThemeBehavior = {};
    if (e.preferredStyle) next.preferredStyle = e.preferredStyle as ThemeBehavior['preferredStyle'];
    const effects: NonNullable<ThemeBehavior['effects']> = {};
    if (e.click.override) effects.click = { enabled: e.click.enabled, type: e.click.type };
    if (e.background.override) effects.background = { enabled: e.background.enabled, type: e.background.type };
    if (Object.keys(effects).length) next.effects = effects;
    if (e.wallpaper.override) next.wallpaper = { enabled: e.wallpaper.enabled, ...(e.wallpaper.id ? { id: e.wallpaper.id } : {}) };
    return Object.keys(next).length ? next : undefined;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const safe = /^#([0-9a-fA-F]{6})$/.test(value || '') ? value : '#ffffff';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="color" value={safe} onChange={(e) => onChange(e.target.value)}
                style={{ width: '32px', height: '28px', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{label}</div>
                <Input value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '4px 8px', fontSize: '12px' }} />
            </div>
        </div>
    );
}

export function ThemeCreator() {
    const themes = useThemeStore((s) => s.themes);
    const activeId = useThemeStore((s) => s.activeId);
    const setActive = useThemeStore((s) => s.setActive);
    const saveTheme = useThemeStore((s) => s.saveTheme);
    const removeTheme = useThemeStore((s) => s.removeTheme);
    const interfaceStyle = useUiPrefsStore((s) => s.interfaceStyle);

    const seed = useMemo(() => themes.find((t) => t.id === activeId) ?? themes[0], [themes, activeId]);

    const [name, setName] = useState('My Theme');
    const [tokens, setTokens] = useState<ThemeTokens>({ ...seed.tokens });
    const [behavior, setBehavior] = useState<EditorBehavior>(DEFAULT_BEHAVIOR);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [livePreview, setLivePreview] = useState(false);
    const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
    const [strength, setStrength] = useState({ accentMuted: 35, bg2: 15, surface2: 15, glassBgAlpha: 35 });

    useEffect(() => { listWallpapers().then(setWallpapers).catch(() => {}); }, []);

    // Reseed when the selected theme changes and the form is "clean".
    const reseed = (base: Theme) => {
        setName(base.builtin ? base.name : base.name);
        setTokens({ ...base.tokens });
        setBehavior(behaviorToEditor(base.behavior ?? getThemeBehavior(base.id)));
    };
    useEffect(() => { reseed(seed); /* eslint-disable-next-line */ }, [seed.id]);

    const previewIfLive = (nextTokens: ThemeTokens, nextBehavior: EditorBehavior) => {
        if (!livePreview) return;
        applyTheme(nextTokens);
        const style = nextBehavior.preferredStyle || interfaceStyle;
        applyInterfaceStyle(style);
        if (nextBehavior.click.override) window.dispatchEvent(new CustomEvent('clickEffectChanged', { detail: { enabled: nextBehavior.click.enabled, type: nextBehavior.click.type } }));
        if (nextBehavior.background.override) window.dispatchEvent(new CustomEvent('backgroundEffectChanged', { detail: { enabled: nextBehavior.background.enabled, type: nextBehavior.background.type } }));
    };

    const setToken = (key: keyof ThemeTokens, value: string) => {
        const next = { ...tokens, [key]: value };
        setTokens(next);
        previewIfLive(next, behavior);
    };
    const setBeh = (next: EditorBehavior) => { setBehavior(next); previewIfLive(tokens, next); };

    const restore = () => { const active = themes.find((t) => t.id === activeId); if (active) { applyTheme(active.tokens, active.id); applyInterfaceStyle(interfaceStyle); } };

    const toggleLive = (on: boolean) => { setLivePreview(on); if (on) previewIfLive(tokens, behavior); else restore(); };

    const applyStrength = (key: keyof typeof strength, pct: number) => {
        const next = { ...strength, [key]: pct };
        setStrength(next);
        const t = { ...tokens };
        if (key === 'accentMuted') t.accentMuted = darkenHex(tokens.accent, pct / 100);
        if (key === 'bg2') t.bg2 = darkenHex(tokens.bg, pct / 100);
        if (key === 'surface2') t.surface2 = darkenHex(tokens.surface, pct / 100);
        if (key === 'glassBgAlpha') t.glassBg = withAlpha(tokens.surface || tokens.bg, pct / 100);
        setTokens(t);
        previewIfLive(t, behavior);
    };

    const save = async () => {
        try {
            const id = slugify(name);
            const theme: Theme = { id, name: name.trim() || id, builtin: false, tokens, behavior: editorToBehavior(behavior) };
            await saveTheme(theme);
        } catch (e) { log.error('Failed to save theme', e); restore(); }
    };

    const existingCustom = themes.find((t) => !t.builtin && t.id === slugify(name));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Theme Name" description="Name your custom theme">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Theme" />
            </FormGroup>

            {/* Theme strip to seed from / delete customs */}
            <FormGroup label="Start From" description="Pick a base theme to edit">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {themes.map((t) => (
                        <button key={t.id} onClick={() => { setActive(t.id); reseed(t); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px', color: 'var(--text-primary)', border: `1px solid ${activeId === t.id ? 'var(--accent-primary)' : 'var(--border)'}`, background: 'var(--bg-tertiary)' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.tokens.accent }} />
                            {t.name}
                            {!t.builtin && <span onClick={(e) => { e.stopPropagation(); removeTheme(t.id); }} title="Delete" style={{ color: 'var(--text-muted)', marginLeft: '2px' }}>✕</span>}
                        </button>
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Basic Colors" description="Set the main theme colors">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {(Object.keys(BASIC_TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
                        <ColorField key={key} label={BASIC_TOKEN_LABELS[key]!} value={(tokens[key] as string) || '#ffffff'} onChange={(v) => setToken(key, v)} />
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Theme Behavior" description="What happens when this theme is selected">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <CustomSelect value={behavior.preferredStyle} onChange={(v) => setBeh({ ...behavior, preferredStyle: v })}
                        options={[{ value: '', label: 'No Style Override' }, ...INTERFACE_STYLES.map((s) => ({ value: s.id, label: s.name }))]} />

                    <ToggleSwitch label="Override Click Effect" checked={behavior.click.override} onChange={(c) => setBeh({ ...behavior, click: { ...behavior.click, override: c } })} compact />
                    {behavior.click.override && (
                        <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <ToggleSwitch label="Enabled" checked={behavior.click.enabled} onChange={(c) => setBeh({ ...behavior, click: { ...behavior.click, enabled: c } })} compact />
                            <CustomSelect value={behavior.click.type} onChange={(v) => setBeh({ ...behavior, click: { ...behavior.click, type: v } })} options={CLICK_EFFECT_TYPES.map((t) => ({ value: t.id, label: t.name }))} />
                        </div>
                    )}

                    <ToggleSwitch label="Override Background Effect" checked={behavior.background.override} onChange={(c) => setBeh({ ...behavior, background: { ...behavior.background, override: c } })} compact />
                    {behavior.background.override && (
                        <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <ToggleSwitch label="Enabled" checked={behavior.background.enabled} onChange={(c) => setBeh({ ...behavior, background: { ...behavior.background, enabled: c } })} compact />
                            <CustomSelect value={behavior.background.type} onChange={(v) => setBeh({ ...behavior, background: { ...behavior.background, type: v } })} options={BACKGROUND_EFFECT_TYPES.map((t) => ({ value: t.id, label: t.name }))} />
                        </div>
                    )}

                    <ToggleSwitch label="Override Wallpaper" checked={behavior.wallpaper.override} onChange={(c) => setBeh({ ...behavior, wallpaper: { ...behavior.wallpaper, override: c } })} compact />
                    {behavior.wallpaper.override && (
                        <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <ToggleSwitch label="Enabled" checked={behavior.wallpaper.enabled} onChange={(c) => setBeh({ ...behavior, wallpaper: { ...behavior.wallpaper, enabled: c } })} compact />
                            <CustomSelect value={behavior.wallpaper.id} onChange={(v) => setBeh({ ...behavior, wallpaper: { ...behavior.wallpaper, id: v } })}
                                options={[{ value: '', label: 'Use Current Wallpaper' }, ...wallpapers.map((w) => ({ value: w.id, label: w.displayName }))]} />
                        </div>
                    )}
                </div>
            </FormGroup>

            <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
            </button>

            {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '2px solid var(--border)', paddingLeft: '12px' }}>
                    <FormGroup label="Secondary Colors">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                            {(Object.keys(ADVANCED_TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
                                <ColorField key={key} label={ADVANCED_TOKEN_LABELS[key]!} value={(tokens[key] as string) || '#000000'} onChange={(v) => setToken(key, v)} />
                            ))}
                        </div>
                    </FormGroup>

                    <FormGroup label="Glass Effect (raw CSS)">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Input value={tokens.glassBg || ''} onChange={(e) => setToken('glassBg', e.target.value)} placeholder="Glass BG e.g. rgba(16,14,22,0.35)" />
                            <Input value={tokens.glassBorder || ''} onChange={(e) => setToken('glassBorder', e.target.value)} placeholder="Glass Border" />
                            <Input value={tokens.glassShadow || ''} onChange={(e) => setToken('glassShadow', e.target.value)} placeholder="Glass Shadow" />
                        </div>
                    </FormGroup>

                    <FormGroup label="Glass Button Tuning">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Input value={tokens.liquidButtonTint || ''} onChange={(e) => setToken('liquidButtonTint', e.target.value)} placeholder="Liquid Tint (rgba)" />
                            <Input value={tokens.liquidButtonHoverTint || ''} onChange={(e) => setToken('liquidButtonHoverTint', e.target.value)} placeholder="Liquid Hover Tint (rgba)" />
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Liquid Blur ({tokens.liquidButtonBlur || '0'}px)</div>
                                <input type="range" min={0} max={36} value={parseFloat(tokens.liquidButtonBlur || '0')} onChange={(e) => setToken('liquidButtonBlur', e.target.value)} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                            </div>
                        </div>
                    </FormGroup>

                    <FormGroup label="Derived Colors">
                        {([
                            ['accentMuted', 'Accent Muted (darken %)', 60],
                            ['bg2', 'BG 2 (darken %)', 40],
                            ['surface2', 'Surface 2 (darken %)', 40],
                            ['glassBgAlpha', 'Glass BG alpha (%)', 80],
                        ] as [keyof typeof strength, string, number][]).map(([key, label, max]) => (
                            <div key={key} style={{ marginBottom: '6px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{label} ({strength[key]}%)</div>
                                <input type="range" min={0} max={max} value={strength[key]} onChange={(e) => applyStrength(key, parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                            </div>
                        ))}
                    </FormGroup>
                </div>
            )}

            <ToggleSwitch label="Live Preview" checked={livePreview} onChange={toggleLive} compact />

            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => reseed(themes.find((t) => t.id === 'amethyst') ?? seed)}>Reset</Button>
                <Button variant="primary" onClick={save}>Save &amp; Apply</Button>
                {existingCustom && <Button variant="secondary" onClick={() => removeTheme(existingCustom.id)}>Delete</Button>}
            </div>
        </div>
    );
}
