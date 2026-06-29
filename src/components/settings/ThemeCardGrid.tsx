import { Check, RotateCcw } from 'lucide-react';
import { useThemeStore } from '@/lib/stores';
import { BUILTIN_VARIANTS } from '@/lib/theme/builtinThemes';
import { openColorPicker, ColorPickerHost } from '@/pages/paint/components/ColorPicker';
import type { Theme } from '@/lib/theme/types';
import './ThemeCardGrid.css';

/* Celestial-style theme picker: each card previews the theme (bg + rail + accent
   tiles) and carries an accent dot. Clicking the dot opens the color picker to
   override that theme's accent (the rest re-derives); the reset chip clears it.
   Clicking the card body selects the theme. */
export function ThemeCardGrid() {
    const themes = useThemeStore((s) => s.themes);
    const activeId = useThemeStore((s) => s.activeId);
    const overrides = useThemeStore((s) => s.overrides);
    const base = useThemeStore((s) => s.base);
    const setActive = useThemeStore((s) => s.setActive);
    const setBase = useThemeStore((s) => s.setBase);
    const setOverride = useThemeStore((s) => s.setOverride);
    const tokensFor = useThemeStore((s) => s.tokensFor);

    const seedFor = (t: Theme) => BUILTIN_VARIANTS.find((v) => v.id === t.id)?.accent ?? t.tokens.accent;

    return (
        <div className="q-themegrid">
            <ColorPickerHost />

            {/* Light / Dark base */}
            <div className="q-themegrid__base">
                {(['dark', 'light'] as const).map((b) => (
                    <button
                        key={b}
                        className={`dl-btn ${base === b ? 'dl-btn--primary' : 'dl-btn--secondary'} dl-btn--sm`}
                        onClick={() => setBase(b)}
                        style={{ textTransform: 'capitalize', flex: 1 }}
                    >
                        {b}
                    </button>
                ))}
            </div>

            <div className="q-themegrid__cards">
                {themes.map((t) => {
                    const tk = tokensFor(t);
                    const isActive = activeId === t.id;
                    const overridden = !!overrides[t.id];
                    return (
                        <button
                            key={t.id}
                            className={`q-themecard${isActive ? ' is-active' : ''}`}
                            style={{ '--tc-accent': tk.accent } as React.CSSProperties}
                            onClick={() => setActive(t.id)}
                        >
                            {/* Mini mockup */}
                            <span className="q-themecard__mock" style={{ background: tk.bg }}>
                                <span className="q-themecard__rail" style={{ background: tk.surface2 }} />
                                <span className="q-themecard__rows">
                                    <span className="q-themecard__row">
                                        <span className="q-themecard__tile" style={{ background: tk.surface }} />
                                        <span className="q-themecard__tile" style={{ background: tk.accent }} />
                                    </span>
                                    <span className="q-themecard__row">
                                        <span className="q-themecard__tile" style={{ background: tk.accent2 }} />
                                        <span className="q-themecard__tile" style={{ background: tk.surface }} />
                                    </span>
                                </span>
                            </span>

                            {/* Foot: name + accent dot + active check */}
                            <span className="q-themecard__foot">
                                <span className="q-themecard__name">{t.name}</span>
                                <span className="q-themecard__controls">
                                    {overridden && (
                                        <span
                                            className="q-themecard__reset"
                                            role="button"
                                            title="Reset accent"
                                            onClick={(e) => { e.stopPropagation(); setOverride(t.id, null); }}
                                        >
                                            <RotateCcw size={11} />
                                        </span>
                                    )}
                                    <span
                                        className="q-themecard__dot"
                                        role="button"
                                        title="Customize accent"
                                        style={{ background: tk.accent }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openColorPicker(e, overrides[t.id] ?? seedFor(t), (hex) => setOverride(t.id, hex));
                                        }}
                                    />
                                    {isActive && (
                                        <span className="q-themecard__check" style={{ background: tk.accent }}>
                                            <Check size={11} strokeWidth={3} color="#fff" />
                                        </span>
                                    )}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
