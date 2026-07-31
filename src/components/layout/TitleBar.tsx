import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, ChevronLeft, ChevronRight, Globe, FolderOpen } from 'lucide-react';
import { useNavigationStore, useUiPrefsStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';
import { visibleNavItems, SETTINGS_ITEM, type NavItem } from './NavRail';
import { CommunityPopover } from './CommunityPopover';
import { useFileExplorer } from '@/components/explorer';
import { requestOpenCurrentBinInJade } from '@/lib/jade/jadeInterop';
import { Tooltip } from '@/components/ui/Tooltip';
import { HashSyncIndicator } from './HashSyncIndicator';

const win = getCurrentWindow();

interface TitleBarProps {
    // When true the left nav rail is hidden and its items render inline here.
    collapsed?: boolean;
}

export function TitleBar({ collapsed = false }: TitleBarProps) {
    const setPage = useNavigationStore((s) => s.setPage);
    const jadeInteropEnabled = useUiPrefsStore((s) => s.communicateWithJade);
    const pick = useFileExplorer();
    const communityRef = useRef<HTMLButtonElement>(null);
    const [communityOpen, setCommunityOpen] = useState(false);
    // Standalone browse: reopens at the last-visited folder (no defaultPath).
    const openExplorer = () => { void pick({ mode: 'browse', title: 'Asset Explorer' }); };
    const minimize = () => win.minimize().catch((e) => log.error('minimize', e));
    const maximize = () => win.toggleMaximize().catch((e) => log.error('maximize', e));
    const close = () => win.close().catch((e) => log.error('close', e));
    const openJade = () => {
        void requestOpenCurrentBinInJade().catch((error) => {
            window.alert(error instanceof Error ? error.message : String(error));
        });
    };

    return (
        <header className="q-titlebar shrink-0">
            <div data-tauri-drag-region className="q-titlebar-brand">
                <img
                    src="/your-logo.gif"
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
                    {/* Left of the action buttons, so a transient pill grows
                        away from the window controls instead of shifting them. */}
                    <HashSyncIndicator />
                    <Tooltip content={jadeInteropEnabled ? 'Open in Jade' : 'Jade communication is disabled'} side="bottom">
                        <button
                            type="button"
                            className="q-topnavbtn q-jade-launch"
                            aria-label={jadeInteropEnabled ? 'Open in Jade' : 'Jade communication is disabled'}
                            disabled={!jadeInteropEnabled}
                            onClick={openJade}
                        >
                            <img src="/jade.webp" alt="" className="q-jade-logo" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Asset Explorer" side="bottom">
                        <button
                            type="button"
                            className="q-topnavbtn"
                            aria-label="Asset Explorer"
                            onClick={openExplorer}
                        >
                            <FolderOpen size={17} />
                        </button>
                    </Tooltip>
                    <Tooltip content="Community" side="bottom">
                        <button
                            ref={communityRef}
                            type="button"
                            className={`q-topnavbtn ${communityOpen ? 'is-active' : ''}`}
                            aria-label="Community"
                            onClick={() => setCommunityOpen((v) => !v)}
                        >
                            <Globe size={17} />
                        </button>
                    </Tooltip>
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
        <Tooltip content={item.label} side="bottom">
            <button
                type="button"
                className={`q-topnavbtn ${page === item.id ? 'is-active' : ''}`}
                aria-label={item.label}
                onClick={() => setPage(item.id)}
            >
                <Icon size={17} />
            </button>
        </Tooltip>
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
