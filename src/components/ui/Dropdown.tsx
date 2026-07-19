/*
 * Dropdown — the app's shared custom <select> replacement, in the Design Lab
 * style (portal'd menu, accent-themed rows, spring pop-in). Replaces native
 * <select> so dropdowns match the app instead of the OS chrome.
 *
 * The menu is portal'd to <body> so it escapes modal/overflow clipping. Closes
 * on outside click, Escape, or selection. Keyed by value; render label per item.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import './dropdown.css';

export interface DropdownOption {
    value: string;
    label: ReactNode;
    /** Optional plain-text label used for the trigger + search (when `label` is a node). */
    text?: string;
    disabled?: boolean;
}

export interface DropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    placeholder?: string;
    disabled?: boolean;
    /** Fixed trigger width (px). Omit to size to content / container. */
    width?: number | string;
    /** Menu alignment relative to the trigger. */
    align?: 'left' | 'right';
    className?: string;
    /** Show a filter box at the top of the menu (matches label text). */
    searchable?: boolean;
    /** Placeholder for the search box (when `searchable`). */
    searchPlaceholder?: string;
    'aria-label'?: string;
}

/** Plain-text a menu row exposes for filtering (prefers `text`, falls back to a
 *  string label). */
function optionText(o: DropdownOption): string {
    if (o.text) return o.text;
    return typeof o.label === 'string' ? o.label : '';
}

function usePopoverPos(open: boolean, anchor: HTMLElement | null, align: 'left' | 'right') {
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        if (!open || !anchor) { setPos(null); return; }
        const update = () => {
            const r = anchor.getBoundingClientRect();
            setPos({ top: r.bottom + 6, left: align === 'left' ? r.left : r.right, width: r.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update, { passive: true });
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, anchor, align]);
    return pos;
}

export function Dropdown({
    value, onChange, options, placeholder = 'Select…', disabled, width, align = 'left', className = '',
    searchable = false, searchPlaceholder = 'Search…', ...rest
}: DropdownProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pos = usePopoverPos(open, triggerRef.current, align);
    const selected = options.find((o) => o.value === value);

    // Reset + focus the filter each time the menu opens.
    useEffect(() => {
        if (!open) { setQuery(''); return; }
        if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }, [open, searchable]);

    const q = query.trim().toLowerCase();
    const shown = q
        ? options.filter((o) => o.value === '' || optionText(o).toLowerCase().includes(q))
        : options;

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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

    const triggerContent = selected ? (selected.text ?? selected.label) : placeholder;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={`qd-trigger ${open ? 'qd-trigger--open' : ''} ${className}`}
                style={{ width }}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={rest['aria-label']}
            >
                <span className={selected ? 'qd-trigger__value' : 'qd-trigger__placeholder'}>{triggerContent}</span>
                <ChevronDown size={15} className="qd-trigger__chev" />
            </button>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className={`qd-menu ${align === 'left' ? 'qd-menu--left' : ''}`}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 160) }}
                    role="listbox"
                >
                    {searchable && (
                        <div className="qd-search">
                            <input
                                ref={searchRef}
                                type="text"
                                className="qd-search__input"
                                value={query}
                                placeholder={searchPlaceholder}
                                onChange={(e) => setQuery(e.target.value)}
                                // Keep the menu open: the outside-mousedown handler
                                // ignores clicks inside menuRef, but stop keydown Escape
                                // from bubbling weirdly and let typing flow normally.
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    {shown.length === 0 && <div className="qd-empty">No matches</div>}
                    {shown.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            className={`qd-item ${o.value === value ? 'qd-item--selected' : ''}`}
                            disabled={o.disabled}
                            // Select on mousedown (with preventDefault + stopPropagation)
                            // so it always beats the outside-mousedown close handler,
                            // even when the menu is portal'd inside a modal that has its
                            // own mousedown listeners. A plain onClick can be lost to
                            // that race (menu closes before click fires).
                            onMouseDown={(e) => {
                                if (o.disabled) return;
                                e.preventDefault();
                                e.stopPropagation();
                                onChange(o.value);
                                setOpen(false);
                            }}
                            role="option"
                            aria-selected={o.value === value}
                        >
                            <span className="qd-item__label">{o.label}</span>
                            {o.value === value && <Check size={13} className="qd-item__check" />}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}
