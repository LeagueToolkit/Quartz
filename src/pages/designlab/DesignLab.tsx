/**
 * Flint — Design Lab
 *
 * Standalone, theme-aware showcase of *new* polished UI primitives.
 * Mounted via `?lab` / `#design-lab` URL bypass in main.tsx, so it
 * renders without booting the full app — instant feedback loop while
 * tuning button feel, slider behavior, modal motion, etc.
 *
 * Nothing here imports project state. Every selector is `.dl-*` so
 * styles can't bleed into production UI.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './design-lab.css';

// ─── Inline icons (lab-local — keeps file fully standalone) ────────────────
const I = {
    download: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v9M4 7l4 4 4-4M3 14h10" />
        </svg>
    ),
    refresh: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 8a6 6 0 1 1-1.7-4.2M14 2v3.5h-3.5" />
        </svg>
    ),
    chevronDown: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
        </svg>
    ),
    chevronRight: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4l4 4-4 4" />
        </svg>
    ),
    settings: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2" />
            <path d="M13 9.5V6.5l-1.4-.4-.5-1.2.7-1.3-2.1-2.1-1.3.7-1.2-.5L7 .3H6L5.5 1.7l-1.2.5-1.3-.7-2.1 2.1.7 1.3-.5 1.2L0 6.5V9.5l1.4.4.5 1.2-.7 1.3 2.1 2.1 1.3-.7 1.2.5.4 1.4h2.6l.4-1.4 1.2-.5 1.3.7 2.1-2.1-.7-1.3.5-1.2 1.4-.4z" />
        </svg>
    ),
    folder: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h4l2 2h6v6a1 1 0 0 1-1 1H2z" />
        </svg>
    ),
    trash: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9" />
        </svg>
    ),
    check: (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6l3 3 5-6" />
        </svg>
    ),
    search: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M11 11l3 3" />
        </svg>
    ),
    close: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
    ),
    sparkle: (
        <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1zM13 11l.7 1.8L15.5 13.5l-1.8.7L13 16l-.7-1.8L10.5 13.5l1.8-.7L13 11z" />
        </svg>
    ),
};

const Icon: React.FC<{ glyph: keyof typeof I }> = ({ glyph }) => (
    <span className="dl-icon">{I[glyph]}</span>
);

// ─── Layout helpers ─────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
    <section className="dl-section">
        <header className="dl-section__head">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
        </header>
        <div className="dl-section__body">{children}</div>
    </section>
);

const Row: React.FC<{ label: string; align?: 'start' | 'center'; children: React.ReactNode }> = ({ label, align, children }) => (
    <div className={`dl-row ${align === 'start' ? 'dl-row--start' : ''}`}>
        <span className="dl-row__label">{label}</span>
        <div className="dl-row__items">{children}</div>
    </div>
);

// ─── Theme switcher (lab-local) ─────────────────────────────────────────────
const PALETTES = [
    { id: 'flint',   color: '#0e639c', name: 'Flint blue' },
    { id: 'violet',  color: '#7c3aed', name: 'Violet' },
    { id: 'emerald', color: '#10b981', name: 'Emerald' },
    { id: 'amber',   color: '#f59e0b', name: 'Amber' },
    { id: 'crimson', color: '#ef4444', name: 'Crimson' },
    { id: 'cyan',    color: '#06b6d4', name: 'Cyan' },
];

function applyPalette(color: string) {
    const root = document.documentElement;
    if (color === '#0e639c') {
        root.style.removeProperty('--accent-primary');
        root.style.removeProperty('--accent-hover');
        root.style.removeProperty('--accent-secondary');
        return;
    }
    root.style.setProperty('--accent-primary', color);
    root.style.setProperty('--accent-hover', shade(color, 12));
    root.style.setProperty('--accent-secondary', shade(color, -10));
}

function shade(hex: string, pct: number): string {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const t = pct < 0 ? 0 : 255;
    const p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ─── Slider with live value bubble ──────────────────────────────────────────
const Slider: React.FC<{
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    suffix?: string;
    hue?: boolean;
}> = ({ value, onChange, min = 0, max = 100, suffix = '', hue }) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div
            className={`dl-slider ${hue ? 'dl-slider--hue' : ''}`}
            style={{ ['--_value' as never]: `${pct}%` }}
        >
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
            />
            <span className="dl-slider__bubble">{value}{suffix}</span>
        </div>
    );
};

// ─── Toggle ─────────────────────────────────────────────────────────────────
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <label className="dl-toggle">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="dl-toggle__track" />
        <span className="dl-toggle__thumb" />
    </label>
);

// ─── Checkbox ───────────────────────────────────────────────────────────────
const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
    <label className={`dl-check ${disabled ? 'dl-check--disabled' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="dl-check__box">
            <span className="dl-check__tick"><Icon glyph="check" /></span>
            <span className="dl-check__cross"><Icon glyph="close" /></span>
        </span>
        <span>{label}</span>
    </label>
);

// ─── Portal-rendered popover (escapes modal overflow:auto clipping) ─────────
function usePopover(open: boolean, anchor: HTMLElement | null, align: 'left' | 'right') {
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        if (!open || !anchor) { setPos(null); return; }
        const update = () => {
            const r = anchor.getBoundingClientRect();
            setPos({ top: r.bottom + 8, left: align === 'left' ? r.left : r.right, width: r.width });
        };
        update();
        const opts: AddEventListenerOptions = { passive: true };
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update, opts);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, anchor, align]);
    return pos;
}

// ─── Dropdown (portal) ──────────────────────────────────────────────────────
const Dropdown: React.FC<{ label: string; align?: 'left' | 'right' }> = ({ label, align = 'right' }) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const pos = usePopover(open, triggerRef.current, align);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (triggerRef.current?.contains(t)) return;
            if (menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                className={`dl-btn dl-btn--secondary ${open ? 'dl-btn--active' : ''}`}
                onClick={() => setOpen((v) => !v)}
            >
                <span>{label}</span>
                <Icon glyph="chevronDown" />
            </button>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className={`dl-dd-portal ${align === 'left' ? 'dl-dd--left' : ''}`}
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: align === 'left' ? pos.left : undefined,
                        right: align === 'right' ? window.innerWidth - pos.left : undefined,
                    }}
                    role="menu"
                >
                    <button className="dl-dd__item"><Icon glyph="folder" /><span>Open project</span><span className="dl-dd__shortcut">⌘O</span></button>
                    <button className="dl-dd__item"><Icon glyph="refresh" /><span>Refresh</span><span className="dl-dd__shortcut">⌘R</span></button>
                    <button className="dl-dd__item"><Icon glyph="settings" /><span>Settings</span><span className="dl-dd__shortcut">⌘,</span></button>
                    <div className="dl-dd__divider" />
                    <button className="dl-dd__item dl-dd__item--danger"><Icon glyph="trash" /><span>Delete</span></button>
                </div>,
                document.body,
            )}
        </>
    );
};

// ─── Custom Select (replaces native <select>; menu is portal'd) ─────────────
type SelectOption = { value: string; label: string };
const Select: React.FC<{
    value: string;
    onChange: (v: string) => void;
    options: SelectOption[];
    placeholder?: string;
    width?: number;
}> = ({ value, onChange, options, placeholder, width = 220 }) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const pos = usePopover(open, triggerRef.current, 'left');
    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (triggerRef.current?.contains(t)) return;
            if (menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                className={`dl-select-trigger ${open ? 'dl-select-trigger--open' : ''}`}
                onClick={() => setOpen((v) => !v)}
                style={{ width }}
            >
                <span className={selected ? 'dl-select-trigger__value' : 'dl-select-trigger__placeholder'}>
                    {selected?.label ?? placeholder ?? 'Select…'}
                </span>
                <Icon glyph="chevronDown" />
            </button>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className="dl-dd-portal"
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        minWidth: width,
                    }}
                    role="listbox"
                >
                    {options.map((o) => (
                        <button
                            key={o.value}
                            className={`dl-dd__item ${o.value === value ? 'dl-dd__item--selected' : ''}`}
                            onClick={() => { onChange(o.value); setOpen(false); }}
                            role="option"
                            aria-selected={o.value === value}
                        >
                            <span>{o.label}</span>
                            {o.value === value && (
                                <span className="dl-dd__shortcut" style={{ color: 'var(--accent-primary)' }}><Icon glyph="check" /></span>
                            )}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
};

// ─── Modal ──────────────────────────────────────────────────────────────────
const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    title: string;
    size?: 'default' | 'wide' | 'large';
    children: React.ReactNode;
    footer?: React.ReactNode;
}> = ({ open, onClose, title, size = 'default', children, footer }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div className="dl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`dl-modal ${size === 'wide' ? 'dl-modal--wide' : ''} ${size === 'large' ? 'dl-modal--large' : ''}`}>
                <div className="dl-modal__head">
                    <h3 className="dl-modal__title">{title}</h3>
                    <button className="dl-modal__close" onClick={onClose} aria-label="Close"><Icon glyph="close" /></button>
                </div>
                <div className="dl-modal__body">{children}</div>
                {footer && <div className="dl-modal__foot">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
};

// ─── Showcase ───────────────────────────────────────────────────────────────
export const DesignLab: React.FC = () => {
    const [paletteId, setPaletteId] = useState('flint');
    const [loading, setLoading] = useState(false);
    const [vol, setVol] = useState(64);
    const [hue, setHue] = useState(220);
    const [scale, setScale] = useState(1.0 * 100);
    const [progress, setProgress] = useState(40);
    const [text, setText] = useState('');
    const [textFloat, setTextFloat] = useState('');
    const [search, setSearch] = useState('');
    const [check1, setCheck1] = useState(true);
    const [check2, setCheck2] = useState(false);
    const [tog1, setTog1] = useState(true);
    const [tog2, setTog2] = useState(false);
    const [tab, setTab] = useState<'designs' | 'motion' | 'tokens'>('designs');
    const [openModal, setOpenModal] = useState<null | 'default' | 'wide' | 'confirm'>(null);
    const [selValue, setSelValue] = useState('modpkg');
    const [selChannel, setSelChannel] = useState('b');

    useEffect(() => {
        const t = setInterval(() => setProgress((p) => (p >= 100 ? 0 : p + 1)), 80);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.dl-btn');
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
            btn.style.setProperty('--my', `${e.clientY - r.top}px`);
        };
        document.addEventListener('mousemove', onMove);
        return () => document.removeEventListener('mousemove', onMove);
    }, []);

    function pickPalette(id: string) {
        setPaletteId(id);
        const p = PALETTES.find((x) => x.id === id);
        if (p) applyPalette(p.color);
    }

    function fakeLoad() {
        setLoading(true);
        setTimeout(() => setLoading(false), 1400);
    }

    return (
        <div className="dl-root">
            <div className="dl-shell">
                {/* ─── Header ──────────────────────────────────────────── */}
                <header className="dl-page-head">
                    <div>
                        <h1>Flint Design Lab</h1>
                        <p>New polished primitives — buttons, sliders, dropdowns, modals. Theme-aware, motion-tuned.</p>
                    </div>
                    <div className="dl-page-head__meta">
                        <span>v0 · #design-lab</span>
                        <div className="dl-theme-switch" title="Try a palette">
                            {PALETTES.map((p) => (
                                <button
                                    key={p.id}
                                    className={`dl-theme-swatch ${paletteId === p.id ? 'dl-theme-swatch--active' : ''}`}
                                    style={{ background: p.color }}
                                    aria-label={p.name}
                                    onClick={() => pickPalette(p.id)}
                                    title={p.name}
                                />
                            ))}
                        </div>
                    </div>
                </header>

                {/* ─── Tabs (purely visual, switches between sub-views) ── */}
                <div style={{ marginBottom: 24 }}>
                    <div className="dl-tabs" role="tablist">
                        <button className={`dl-tab ${tab === 'designs' ? 'dl-tab--active' : ''}`} onClick={() => setTab('designs')}>Designs</button>
                        <button className={`dl-tab ${tab === 'motion' ? 'dl-tab--active' : ''}`} onClick={() => setTab('motion')}>Motion</button>
                        <button className={`dl-tab ${tab === 'tokens' ? 'dl-tab--active' : ''}`} onClick={() => setTab('tokens')}>Tokens</button>
                    </div>
                </div>

                {tab === 'designs' && (
                    <>
                        {/* ─── Dropdown / Select (top so menus are visible) ─ */}
                        <Section title="Dropdown & Select" subtitle="Rounded menu, red selection highlight, portal-rendered (never clipped).">
                            <Row label="Dropdown">
                                <Dropdown label="Actions" align="left" />
                                <Dropdown label="Right aligned" align="right" />
                            </Row>
                            <Row label="Select" align="start">
                                <Select
                                    value={selChannel}
                                    onChange={setSelChannel}
                                    options={[
                                        { value: 'a', label: 'Alpha channel' },
                                        { value: 'b', label: 'Bravo channel' },
                                        { value: 'c', label: 'Charlie channel' },
                                    ]}
                                    width={220}
                                />
                                <Select
                                    value={selValue}
                                    onChange={setSelValue}
                                    options={[
                                        { value: 'modpkg',  label: '.modpkg (recommended)' },
                                        { value: 'fantome', label: '.fantome' },
                                        { value: 'wad',     label: '.wad.client' },
                                    ]}
                                    width={260}
                                />
                            </Row>
                        </Section>

                        {/* ─── Inputs ──────────────────────────────────── */}
                        <Section title="Inputs" subtitle="Hover-borders, focus rings, animated floating labels.">
                            <Row label="Text" align="start">
                                <div style={{ width: 280 }}>
                                    <input className="dl-input" placeholder="Plain input" value={text} onChange={(e) => setText(e.target.value)} />
                                </div>
                            </Row>
                            <Row label="Floating" align="start">
                                <div style={{ width: 280 }}>
                                    <label className="dl-float">
                                        <input className="dl-input" placeholder=" " value={textFloat} onChange={(e) => setTextFloat(e.target.value)} />
                                        <span className="dl-float__label">Display name</span>
                                    </label>
                                </div>
                            </Row>
                            <Row label="Search" align="start">
                                <div style={{ width: 280 }} className="dl-search">
                                    <Icon glyph="search" />
                                    <input className="dl-input" placeholder="Find anything…" value={search} onChange={(e) => setSearch(e.target.value)} />
                                </div>
                            </Row>
                            <Row label="Textarea" align="start">
                                <textarea className="dl-textarea" placeholder="Multi-line text…" rows={3} style={{ width: 320 }} />
                            </Row>
                            <Row label="Error" align="start">
                                <div style={{ width: 280 }}>
                                    <input className="dl-input dl-input--error" placeholder="Has an error" />
                                </div>
                            </Row>
                        </Section>

                        {/* ─── Sliders ─────────────────────────────────── */}
                        <Section title="Sliders" subtitle="Gradient fill, value bubble on hover, spring thumb.">
                            <Row label="Volume" align="start">
                                <div style={{ width: 320 }}><Slider value={vol} onChange={setVol} suffix="%" /></div>
                            </Row>
                            <Row label="Scale" align="start">
                                <div style={{ width: 320 }}><Slider value={scale} onChange={setScale} min={50} max={200} suffix="%" /></div>
                            </Row>
                            <Row label="Hue" align="start">
                                <div style={{ width: 320 }}><Slider value={hue} onChange={setHue} min={0} max={360} suffix="°" hue /></div>
                            </Row>
                        </Section>

                        {/* ─── Toggles & Checks ────────────────────────── */}
                        <Section title="Toggles & Checks" subtitle="Spring-eased thumb, animated tick mark.">
                            <Row label="Checkbox">
                                <Check checked={check1} onChange={setCheck1} label="Auto-extract on open" />
                                <Check checked={check2} onChange={setCheck2} label="Verbose logging" />
                                <Check checked={false} onChange={() => {}} label="Disabled option" disabled />
                            </Row>
                            <Row label="Toggle row" align="start">
                                <div style={{ display: 'grid', gap: 8, width: 380 }}>
                                    <div className="dl-toggle-row">
                                        <div className="dl-toggle-row__text">
                                            <span className="dl-toggle-row__label">Sync to launcher</span>
                                            <span className="dl-toggle-row__desc">Push project changes to LTK Manager automatically.</span>
                                        </div>
                                        <Toggle checked={tog1} onChange={setTog1} />
                                    </div>
                                    <div className="dl-toggle-row">
                                        <div className="dl-toggle-row__text">
                                            <span className="dl-toggle-row__label">Show file badges</span>
                                            <span className="dl-toggle-row__desc">N / M markers next to modified files.</span>
                                        </div>
                                        <Toggle checked={tog2} onChange={setTog2} />
                                    </div>
                                </div>
                            </Row>
                        </Section>

                        {/* ─── Modal (placed before below-the-fold sections so the open buttons are easy to find) ─── */}
                        <Section title="Modal" subtitle="Portal-rendered. Click an option below to open.">
                            <Row label="Open">
                                <button className="dl-btn dl-btn--primary" onClick={() => setOpenModal('default')}><Icon glyph="sparkle" /><span>Default modal</span></button>
                                <button className="dl-btn" onClick={() => setOpenModal('wide')}>Wide modal</button>
                                <button className="dl-btn dl-btn--danger" onClick={() => setOpenModal('confirm')}><Icon glyph="trash" /><span>Confirm dialog</span></button>
                            </Row>
                        </Section>

                        {/* ─── Buttons ─────────────────────────────────── */}
                        <Section title="Buttons" subtitle="Cursor-following glow, overlay primary, serious red danger.">
                            <Row label="Variants">
                                <button className="dl-btn dl-btn--primary"><Icon glyph="sparkle" /><span>Primary</span></button>
                                <button className="dl-btn dl-btn--secondary"><span>Secondary</span></button>
                                <button className="dl-btn dl-btn--ghost"><span>Ghost</span></button>
                                <button className="dl-btn dl-btn--danger"><Icon glyph="trash" /><span>Danger</span></button>
                            </Row>
                            <Row label="Sizes">
                                <button className="dl-btn dl-btn--sm">Small</button>
                                <button className="dl-btn">Medium</button>
                                <button className="dl-btn dl-btn--lg dl-btn--primary">Large</button>
                            </Row>
                            <Row label="With icon">
                                <button className="dl-btn dl-btn--primary"><Icon glyph="download" /><span>Download</span></button>
                                <button className="dl-btn"><span>Next</span><Icon glyph="chevronRight" /></button>
                                <button className="dl-btn dl-btn--ghost"><Icon glyph="refresh" /><span>Refresh</span></button>
                            </Row>
                            <Row label="Icon only">
                                <button className="dl-btn dl-btn--icon" title="Settings"><Icon glyph="settings" /></button>
                                <button className="dl-btn dl-btn--icon dl-btn--danger" title="Delete"><Icon glyph="trash" /></button>
                                <button className="dl-btn dl-btn--icon dl-btn--primary" title="Confirm"><Icon glyph="check" /></button>
                            </Row>
                            <Row label="States">
                                <button className="dl-btn">Idle</button>
                                <button className="dl-btn dl-btn--active">Active</button>
                                <button className="dl-btn" disabled>Disabled</button>
                                <button className={`dl-btn dl-btn--primary ${loading ? 'dl-btn--loading' : ''}`} onClick={fakeLoad}>
                                    {loading ? 'Loading' : 'Click me'}
                                </button>
                            </Row>
                        </Section>

                        {/* ─── Progress ────────────────────────────────── */}
                        <Section title="Progress" subtitle="Shimmer overlay, indeterminate slide, gradient fill.">
                            <Row label="Determinate" align="start">
                                <div style={{ width: 360 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Extracting…</span>
                                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{progress}%</span>
                                    </div>
                                    <div className="dl-progress"><div className="dl-progress__fill" style={{ width: `${progress}%` }} /></div>
                                </div>
                            </Row>
                            <Row label="Indeterminate" align="start">
                                <div style={{ width: 360 }}>
                                    <div className="dl-progress dl-progress--indet"><div className="dl-progress__fill" /></div>
                                </div>
                            </Row>
                        </Section>

                        {/* ─── Badges ──────────────────────────────────── */}
                        <Section title="Badges" subtitle="Status pills with glowing dot.">
                            <Row label="Variants">
                                <span className="dl-badge"><span className="dl-badge__dot" />Online</span>
                                <span className="dl-badge dl-badge--success"><span className="dl-badge__dot" />Synced</span>
                                <span className="dl-badge dl-badge--warn"><span className="dl-badge__dot" />Out of date</span>
                                <span className="dl-badge dl-badge--danger"><span className="dl-badge__dot" />Failed</span>
                            </Row>
                        </Section>

                        {/* ─── Cards ───────────────────────────────────── */}
                        <Section title="Cards" subtitle="Hover-lift, accent border on hover.">
                            <Row label="Interactive" align="start">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, width: '100%', maxWidth: 600 }}>
                                    <div className="dl-card dl-card--interactive">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <strong style={{ fontSize: 13 }}>Aatrox · Skin 27</strong>
                                            <span className="dl-badge dl-badge--success">Ready</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Last edit 2h ago · 312 assets</p>
                                    </div>
                                    <div className="dl-card dl-card--interactive">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <strong style={{ fontSize: 13 }}>Ahri · Skin 14</strong>
                                            <span className="dl-badge dl-badge--warn">Modified</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Last edit 5m ago · 198 assets</p>
                                    </div>
                                </div>
                            </Row>
                        </Section>

                    </>
                )}

                {tab === 'motion' && (
                    <Section title="Motion" subtitle="Tokenized timing — change once, applies everywhere.">
                        <Row label="--dl-fast">
                            <code style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 4 }}>140ms cubic-bezier(.22,1,.36,1)</code>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>hover, focus, color shifts</span>
                        </Row>
                        <Row label="--dl-base">
                            <code style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 4 }}>220ms cubic-bezier(.22,1,.36,1)</code>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>opacity, transform, modal fade</span>
                        </Row>
                        <Row label="--dl-spring">
                            <code style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 4 }}>320ms cubic-bezier(.34,1.56,.64,1)</code>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>toggle thumb, modal scale-in, dropdown</span>
                        </Row>
                    </Section>
                )}

                {tab === 'tokens' && (
                    <Section title="Tokens" subtitle="Reads from the global theme — try the swatches at the top right.">
                        <Row label="Surface">
                            <Swatch name="--bg-primary" />
                            <Swatch name="--bg-secondary" />
                            <Swatch name="--bg-tertiary" />
                            <Swatch name="--bg-hover" />
                        </Row>
                        <Row label="Accent">
                            <Swatch name="--accent-primary" />
                            <Swatch name="--accent-hover" />
                            <Swatch name="--accent-secondary" />
                        </Row>
                        <Row label="Status">
                            <Swatch name="--color-success" />
                            <Swatch name="--color-warning" />
                            <Swatch name="--color-danger" />
                            <Swatch name="--color-info" />
                        </Row>
                    </Section>
                )}
            </div>

            {/* ─── Modal renderers ─────────────────────────────────────── */}
            <Modal
                open={openModal === 'default'}
                onClose={() => setOpenModal(null)}
                title="Create new project"
                footer={
                    <>
                        <button className="dl-btn" onClick={() => setOpenModal(null)}>Cancel</button>
                        <button className="dl-btn dl-btn--primary" onClick={() => setOpenModal(null)}>Create</button>
                    </>
                }
            >
                <label className="dl-float">
                    <input className="dl-input" placeholder=" " />
                    <span className="dl-float__label">Project name</span>
                </label>
                <textarea className="dl-textarea" placeholder="Description…" rows={3} />
                <Check checked onChange={() => {}} label="Initialize from base skin" />
            </Modal>

            <Modal
                open={openModal === 'wide'}
                onClose={() => setOpenModal(null)}
                title="Export project"
                size="wide"
                footer={
                    <>
                        <button className="dl-btn dl-btn--ghost">Help</button>
                        <button className="dl-btn" onClick={() => setOpenModal(null)}>Cancel</button>
                        <button className="dl-btn dl-btn--primary" onClick={() => setOpenModal(null)}>Export</button>
                    </>
                }
            >
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Choose a destination and format.</p>
                <Select
                    value={selValue}
                    onChange={setSelValue}
                    options={[
                        { value: 'modpkg',  label: '.modpkg (recommended)' },
                        { value: 'fantome', label: '.fantome' },
                        { value: 'wad',     label: '.wad.client' },
                    ]}
                    width={280}
                />
                <div className="dl-progress"><div className="dl-progress__fill" style={{ width: `${progress}%` }} /></div>
            </Modal>

            <Modal
                open={openModal === 'confirm'}
                onClose={() => setOpenModal(null)}
                title="Delete project?"
                footer={
                    <>
                        <button className="dl-btn" onClick={() => setOpenModal(null)}>Cancel</button>
                        <button className="dl-btn dl-btn--danger" onClick={() => setOpenModal(null)}>Delete forever</button>
                    </>
                }
            >
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    This permanently removes <strong style={{ color: 'var(--text-primary)' }}>Aatrox · Skin 27</strong> and all its assets. This cannot be undone.
                </p>
            </Modal>
        </div>
    );
};

// ─── Helper component ───────────────────────────────────────────────────────
const Swatch: React.FC<{ name: string }> = ({ name }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
        }}
    >
        <span
            style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: `var(${name})`,
                border: '1px solid var(--border)',
            }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
    </div>
);

export default DesignLab;
