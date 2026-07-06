import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, ChevronLeft, ChevronRight, Globe, FolderOpen } from 'lucide-react';
import { useNavigationStore, useUiPrefsStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';
import { visibleNavItems, SETTINGS_ITEM, type NavItem } from './NavRail';
import { CommunityPopover } from './CommunityPopover';
import { useFileExplorer } from '@/components/explorer';

const win = getCurrentWindow();

interface TitleBarProps {
    // When true the left nav rail is hidden and its items render inline here.
    collapsed?: boolean;
}

export function TitleBar({ collapsed = false }: TitleBarProps) {
    const setPage = useNavigationStore((s) => s.setPage);
    const pick = useFileExplorer();
    const communityRef = useRef<HTMLButtonElement>(null);
    const [communityOpen, setCommunityOpen] = useState(false);
    // Standalone browse: reopens at the last-visited folder (no defaultPath).
    const openExplorer = () => { void pick({ mode: 'file' }); };
    const minimize = () => win.minimize().catch((e) => log.error('minimize', e));
    const maximize = () => win.toggleMaximize().catch((e) => log.error('maximize', e));
    const close = () => win.close().catch((e) => log.error('close', e));

    return (
        <header className="q-titlebar shrink-0">
            <div data-tauri-drag-region className="q-titlebar-brand">
                <img
                    src="/quartz-logo.png"
                    alt=""
                    onClick={() => setPage('home')}
                    className="q-titlebar-logo"
                    title="Home"
                />
                <span data-tauri-drag-region className="q-titlebar-title">Quartz</span>
                {collapsed && <CollapsedNav />}
            </div>
            <div className="q-titlebar-right">
                <div className="q-topnav-settings" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button
                        type="button"
                        className="q-topnavbtn"
                        data-tip="File explorer"
                        onClick={openExplorer}
                    >
                        <FolderOpen size={17} />
                    </button>
                    <button
                        ref={communityRef}
                        type="button"
                        className={`q-topnavbtn ${communityOpen ? 'is-active' : ''}`}
                        data-tip="Community"
                        onClick={() => setCommunityOpen((v) => !v)}
                    >
                        <Globe size={17} />
                    </button>
                    {collapsed && <TopNavBtn item={SETTINGS_ITEM} />}
                    <span className="q-topnav-sep" />
                </div>
                <div className="q-winbtns">
                    <button onClick={minimize} title="Minimize" className="q-winbtn"><Minus size={17} strokeWidth={2} /></button>
                    <button onClick={maximize} title="Maximize" className="q-winbtn"><Square size={13} strokeWidth={2} /></button>
                    <button onClick={close} title="Close" className="q-winbtn q-winbtn--close"><X size={17} strokeWidth={2} /></button>
                </div>
            </div>
            {communityOpen && communityRef.current && createPortal(
                <CommunityPopover
                    anchorRect={communityRef.current.getBoundingClientRect()}
                    onClose={() => setCommunityOpen(false)}
                />,
                document.body,
            )}
        </header>
    );
}

function TopNavBtn({ item }: { item: NavItem }) {
    const page = useNavigationStore((s) => s.page);
    const setPage = useNavigationStore((s) => s.setPage);
    const Icon = item.icon;
    return (
        <button
            className={`q-topnavbtn ${page === item.id ? 'is-active' : ''}`}
            data-tip={item.label}
            onClick={() => setPage(item.id)}
        >
            <Icon size={17} />
        </button>
    );
}

// The rail's nav, laid out inline in the titlebar. Overflows horizontally into
// a scrollable strip; scroll arrows appear only when there's more to reveal.
function CollapsedNav() {
    const pageVisibility = useUiPrefsStore((s) => s.pageVisibility);
    const items = visibleNavItems(pageVisibility);

    const stripRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState({ left: false, right: false });

    const updateArrows = () => {
        const el = stripRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        setOverflow({
            left: el.scrollLeft > 1,
            right: el.scrollLeft < maxScroll - 1,
        });
    };

    useEffect(() => {
        updateArrows();
        const el = stripRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateArrows, { passive: true });
        const ro = new ResizeObserver(updateArrows);
        ro.observe(el);
        window.addEventListener('resize', updateArrows);
        return () => {
            el.removeEventListener('scroll', updateArrows);
            ro.disconnect();
            window.removeEventListener('resize', updateArrows);
        };
    }, [items.length]);

    const scrollBy = (dir: -1 | 1) => {
        stripRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
    };

    return (
        <div className="q-topnav" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <span className="q-topnav-sep" />
            {overflow.left && (
                <button className="q-topnav-arrow" onClick={() => scrollBy(-1)} title="Scroll left" tabIndex={-1}>
                    <ChevronLeft size={15} />
                </button>
            )}
            <div ref={stripRef} className="q-topnav-strip">
                {items.map((item) => <TopNavBtn key={item.id} item={item} />)}
            </div>
            {overflow.right && (
                <button className="q-topnav-arrow" onClick={() => scrollBy(1)} title="Scroll right" tabIndex={-1}>
                    <ChevronRight size={15} />
                </button>
            )}
        </div>
    );
}
