import { Type } from 'lucide-react';
import { FormGroup, CustomSelect, ThemeCard } from '../primitives';
import { useThemeStore, useUiPrefsStore, applyUiPrefs, type InterfaceStyle } from '@/lib/stores';

const FONTS = [
    { value: 'system', label: 'System Default' },
    { value: 'Segoe UI', label: 'Segoe UI' },
    { value: 'Consolas', label: 'Consolas' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
];

const STYLES: { id: InterfaceStyle; name: string; desc: string }[] = [
    { id: 'quartz', name: 'Quartz', desc: 'Modern Glassy UI' },
    { id: 'winforms', name: 'WinForms', desc: 'Classic Flat UI' },
    { id: 'liquid', name: 'Liquid Glass', desc: 'Refractive glass UI' },
    { id: 'minecraft', name: 'Minecraft', desc: 'Pixel bevel depth' },
];

const THEME_DESC: Record<string, string> = {
    amethyst: 'Purple + Gold', ocean: 'Liquid Blue', forest: 'Misty Green',
    amogus: 'Space Gray + Blue', city: 'Neon Rain', cafe: 'Rose Neon Night', sakura: 'Blossom Sky',
};

export function AppearanceSection() {
    const themes = useThemeStore((s) => s.themes);
    const activeTheme = useThemeStore((s) => s.activeId);
    const setActive = useThemeStore((s) => s.setActive);

    const font = useUiPrefsStore((s) => s.font);
    const interfaceStyle = useUiPrefsStore((s) => s.interfaceStyle);
    const performanceMode = useUiPrefsStore((s) => s.performanceMode);
    const glassBlur = useUiPrefsStore((s) => s.glassBlur);
    const set = useUiPrefsStore((s) => s.set);

    const setBlur = (v: number) => { set('glassBlur', v); applyUiPrefs(); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Font Family" description="Select the interface font">
                <CustomSelect
                    value={font}
                    onChange={(v) => set('font', v)}
                    icon={<Type size={16} />}
                    options={FONTS}
                />
            </FormGroup>

            <FormGroup label="Performance Mode" description="Reduce heavy visual effects on weaker hardware">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                        type="checkbox"
                        checked={performanceMode}
                        onChange={(e) => set('performanceMode', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text)' }}>Reduce blur, glow, and animations</span>
                </label>
            </FormGroup>

            <FormGroup label="Interface Style" description="Overall look and feel of controls">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {STYLES.map((s) => (
                        <ThemeCard key={s.id} name={s.name} desc={s.desc} selected={interfaceStyle === s.id} onClick={() => set('interfaceStyle', s.id)} />
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Color Theme" description="Choose your preferred color scheme">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {themes.map((t) => (
                        <ThemeCard
                            key={t.id}
                            name={t.name}
                            desc={t.builtin ? (THEME_DESC[t.id] ?? 'Built-in') : 'Custom Theme'}
                            selected={activeTheme === t.id}
                            onClick={() => setActive(t.id)}
                        />
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Glass Blur" description={`Backdrop blur strength — ${glassBlur}px`}>
                <input
                    type="range" min={0} max={30} value={glassBlur}
                    onChange={(e) => setBlur(parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
            </FormGroup>
        </div>
    );
}
