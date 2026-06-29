import { useState } from 'react';
import { useThemeStore } from '@/lib/stores';
import { applyTheme } from '@/lib/theme/applyTheme';
import { deriveTheme, type BaseMode } from '@/lib/theme/deriveTheme';
import type { Theme } from '@/lib/theme/types';
import { FormGroup, Input, Button } from './primitives';
import { log } from '@/lib/util/logger';

function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
}

/* Dead-simple theme creator: name it, pick a base (dark/light), pick ONE accent
   colour — everything else is derived. Live-previews as you tweak and saves a
   real custom theme that persists. */
export function ThemeCreator() {
    const themes = useThemeStore((s) => s.themes);
    const saveTheme = useThemeStore((s) => s.saveTheme);
    const removeTheme = useThemeStore((s) => s.removeTheme);
    const activeId = useThemeStore((s) => s.activeId);

    const [name, setName] = useState('My Theme');
    const [base, setBase] = useState<BaseMode>('dark');
    const [accent, setAccent] = useState('#3fa6f4');

    const safeAccent = /^#([0-9a-fA-F]{6})$/.test(accent) ? accent : '#3fa6f4';
    const tokens = deriveTheme(safeAccent, base);

    // Live preview without persisting (id omitted so the active selection sticks).
    const preview = () => applyTheme(tokens);
    const restoreActive = () => {
        const active = themes.find((t) => t.id === activeId);
        if (active) applyTheme(active.tokens, active.id);
    };

    const setAccentLive = (v: string) => { setAccent(v); applyTheme(deriveTheme(/^#([0-9a-fA-F]{6})$/.test(v) ? v : safeAccent, base)); };
    const setBaseLive = (b: BaseMode) => { setBase(b); applyTheme(deriveTheme(safeAccent, b)); };

    const save = async () => {
        try {
            const id = slugify(name);
            const theme: Theme = { id, name: name.trim() || id, builtin: false, tokens };
            await saveTheme(theme);
        } catch (e) {
            log.error('Failed to save theme', e);
            restoreActive();
        }
    };

    const existing = themes.find((t) => !t.builtin && t.id === slugify(name));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onMouseLeave={restoreActive}>
            <FormGroup label="Theme Name" description="Name your custom theme">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Theme" />
            </FormGroup>

            <FormGroup label="Base" description="Dark or light neutral surfaces">
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['dark', 'light'] as BaseMode[]).map((b) => (
                        <button
                            key={b}
                            onClick={() => setBaseLive(b)}
                            className={`dl-btn ${base === b ? 'dl-btn--primary' : 'dl-btn--secondary'}`}
                            style={{ flex: 1, textTransform: 'capitalize' }}
                        >
                            {b}
                        </button>
                    ))}
                </div>
            </FormGroup>

            <FormGroup label="Accent Color" description="Pick one color — the rest of the theme is derived from it">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                        type="color"
                        value={safeAccent}
                        onChange={(e) => setAccentLive(e.target.value)}
                        onMouseEnter={preview}
                        style={{ width: '52px', height: '40px', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <Input value={accent} onChange={(e) => setAccentLive(e.target.value)} placeholder="#3fa6f4" wrapperStyle={{ flex: 1 }} />
                </div>
            </FormGroup>

            {/* Live swatch preview of the derived palette */}
            <FormGroup label="Preview" description="The derived palette">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {([
                        ['Accent', tokens.accent],
                        ['Accent 2', tokens.accent2],
                        ['Muted', tokens.accentMuted],
                        ['BG', tokens.bg],
                        ['Surface', tokens.surface],
                        ['Text', tokens.text],
                    ] as [string, string][]).map(([label, color]) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: color, border: '1px solid var(--border)' }} />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</span>
                        </div>
                    ))}
                </div>
            </FormGroup>

            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="primary" onClick={save}>Save &amp; Apply</Button>
                {existing && <Button variant="secondary" onClick={() => removeTheme(existing.id)}>Delete</Button>}
            </div>
        </div>
    );
}
