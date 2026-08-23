import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, ChevronLeft, ChevronRight, Globe, FolderOpen } from 'lucide-react';
import { useNavigationStore, useUiPrefsStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';
import { visibleNavItems, SETTINGS_ITEM, type NavItem } from './NavRail';
import { CommunityPopover } from './CommunityPopover';
import { useFileExplorer } from '@/components/explorer';
import {
    requestOpenCurrentBinInJade, requestOpenCurrentBinInRuby,
    currentBinPath, CURRENT_BIN_CHANGED_EVENT,
} from '@/lib/jade/jadeInterop';
import { RubyMissingModal } from './RubyMissingModal';
import { RitoSharkPopover } from './RitoSharkPopover';
import { AppReadmeModal } from './AppReadmeModal';
import { type RitoSharkApp } from './ritosharkApps';
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
    const [rubyMissing, setRubyMissing] = useState(false);
    const suiteRef = useRef<HTMLButtonElement>(null);
    const [suiteOpen, setSuiteOpen] = useState(false);
    const [readmeApp, setReadmeApp] = useState<RitoSharkApp | null>(null);

    /* Whether any mounted tool has a bin open, so the menu can offer the
       hand-off only when there is a file to hand over. Re-asked whenever a tool
       mounts or unmounts, and again on open in case something changed while the
       menu was closed. */
    const [binPath, setBinPath] = useState<string | null>(null);
    useEffect(() => {
        const refresh = () => setBinPath(currentBinPath());
        refresh();
        window.addEventListener(CURRENT_BIN_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(CURRENT_BIN_CHANGED_EVENT, refresh);
    }, []);
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
    /* `launched === null` is the "not installed" answer, not a failure - it opens
       the download prompt instead of an alert. */
    const openRuby = () => {
        void requestOpenCurrentBinInRuby()
            .then((result) => { if (!result.launched) setRubyMissing(true); })
            .catch((error: unknown) => {
                window.alert(error instanceof Error ? error.message : String(error));
            });
    };

    /* Hand the open bin to a tool. Flint takes no bin, so it never reaches here
       — the menu shows no play button for it. */
    const launchApp = (app: RitoSharkApp) => {
        setSuiteOpen(false);
        if (app.id === 'jade') {
            if (!jadeInteropEnabled) {
                window.alert('Jade communication is disabled in Settings > External Tools.');
                return;
            }
            openJade();
            return;
        }
        if (app.id === 'ruby') openRuby();
    };

    return (
        <header className="q-titlebar shrink-0">
            <div data-tauri-drag-region className="q-titlebar-brand">
                {/* Bigger logo only while the nav rail is showing — in collapsed
                    mode the inline nav needs the horizontal room. */}
                <img
                    src="/your-logo.gif"
                    alt=""
                    onClick={() => setPage('home')}
                    className={`q-titlebar-logo ${collapsed ? '' : 'is-large'}`}
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
                    {/* One entry for the whole suite. The per-tool launch buttons
                        that used to sit here were only useful with a bin open and
                        named nothing about the tools themselves. */}
                    {/* The tooltip is dropped while the menu is open. The popover
                        covers the button, so the pointer never leaves it and the
                        tooltip would hang there over the menu it just opened —
                        unmounting the wrapper is what actually retracts it. The
                        menu's own heading names the thing anyway. */}
                    {suiteOpen ? (
                        <button
                            ref={suiteRef}
                            type="button"
                            className="q-topnavbtn q-jade-launch is-active"
                            aria-label="RitoShark tools"
                            aria-haspopup="menu"
                            aria-expanded
                            onClick={() => setSuiteOpen(false)}
                        >
                            <img src="/ritoshark.png" alt="" className="q-jade-logo" />
                        </button>
                    ) : (
                        <Tooltip content="RitoShark tools" side="bottom">
                            <button
                                ref={suiteRef}
                                type="button"
                                className="q-topnavbtn q-jade-launch"
                                aria-label="RitoShark tools"
                                aria-haspopup="menu"
                                aria-expanded={false}
                                onClick={() => setSuiteOpen(true)}
                            >
                                <img src="/ritoshark.png" alt="" className="q-jade-logo" />
                            </button>
                        </Tooltip>
                    )}
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
            {suiteOpen && suiteRef.current && createPortal(
                <RitoSharkPopover
                    anchorRect={suiteRef.current.getBoundingClientRect()}
                    binPath={binPath}
                    onClose={() => setSuiteOpen(false)}
                    onShowReadme={(app) => { setSuiteOpen(false); setReadmeApp(app); }}
                    onLaunch={launchApp}
                />,
                document.body,
            )}
            {readmeApp && createPortal(
                <AppReadmeModal app={readmeApp} onClose={() => setReadmeApp(null)} />,
                document.body,
            )}
            {/* Portaled: the title bar is a drag region and clips its children. */}
            {rubyMissing && createPortal(
                <RubyMissingModal open onClose={() => setRubyMissing(false)} />,
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
