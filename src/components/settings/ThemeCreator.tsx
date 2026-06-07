import { useState } from 'react';
import { useThemeStore } from '@/lib/stores';
import { applyTheme } from '@/lib/theme/applyTheme';
import { TOKEN_LABELS, type Theme, type ThemeTokens } from '@/lib/theme/types';
import { log } from '@/lib/util/logger';

function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
}

function Editor({ base, onClose }: { base: Theme; onClose: () => void }) {
    const activeId = useThemeStore((s) => s.activeId);
    const themes = useThemeStore((s) => s.themes);
    const saveTheme = useThemeStore((s) => s.saveTheme);

    const [name, setName] = useState(base.builtin ? `${base.name} Copy` : base.name);
    const [tokens, setTokens] = useState<ThemeTokens>({ ...base.tokens });
    const [saving, setSaving] = useState(false);

    // Live preview, restoring the active theme's tokens when cancelled.
    const preview = (next: ThemeTokens) => {
        setTokens(next);
        applyTheme(next);
    };

    const restore = () => {
        const active = themes.find((t) => t.id === activeId);
        if (active) applyTheme(active.tokens);
    };

    const save = async () => {
        setSaving(true);
        try {
            // Editing a custom theme keeps its id; copying a builtin makes a new one.
            const id = base.builtin ? slugify(name) : base.id;
            await saveTheme({ id, name: name.trim() || id, builtin: false, tokens });
            onClose();
        } catch (e) {
            log.error('Failed to save theme', e);
            restore();
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        restore();
        onClose();
    };

    return (
        <div className="space-y-4 rounded border border-white/10 bg-[var(--surface-2)] p-4">
            <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/40">Theme name</label>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {(Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                        <input
                            type="color"
                            value={tokens[key]}
                            onChange={(e) => preview({ ...tokens, [key]: e.target.value })}
                            className="h-7 w-9 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
                        />
                        <div className="min-w-0">
                            <div className="truncate text-xs text-white/70">{TOKEN_LABELS[key]}</div>
                            <input
                                value={tokens[key]}
                                onChange={(e) => preview({ ...tokens, [key]: e.target.value })}
                                className="w-24 rounded bg-black/30 px-1.5 py-0.5 text-xs text-white/60"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={save}
                    disabled={saving}
                    className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                >
                    Save theme
                </button>
                <button onClick={cancel} className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
                    Cancel
                </button>
            </div>
        </div>
    );
}

export function ThemeCreator() {
    const themes = useThemeStore((s) => s.themes);
    const activeId = useThemeStore((s) => s.activeId);
    const setActive = useThemeStore((s) => s.setActive);
    const removeTheme = useThemeStore((s) => s.removeTheme);

    const [editing, setEditing] = useState<Theme | null>(null);

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-white/70">Themes</h2>
                {!editing && (
                    <button
                        onClick={() => setEditing(themes.find((t) => t.id === activeId) ?? themes[0])}
                        className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    >
                        New theme
                    </button>
                )}
            </div>

            {editing ? (
                <Editor base={editing} onClose={() => setEditing(null)} />
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {themes.map((t) => (
                        <div
                            key={t.id}
                            onClick={() => setActive(t.id)}
                            className={`cursor-pointer rounded border p-2 ${
                                t.id === activeId ? 'border-[var(--accent)]' : 'border-white/10 hover:border-white/30'
                            }`}
                            style={{ background: t.tokens.surface }}
                        >
                            <div className="mb-1 flex gap-1">
                                {[t.tokens.accent, t.tokens.accent2, t.tokens.accentGreen].map((c, i) => (
                                    <span key={i} className="h-3 w-3 rounded-full" style={{ background: c }} />
                                ))}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="truncate text-xs" style={{ color: t.tokens.text }}>{t.name}</span>
                                {!t.builtin && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeTheme(t.id); }}
                                        className="text-xs text-white/40 hover:text-red-400"
                                        title="Delete"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
