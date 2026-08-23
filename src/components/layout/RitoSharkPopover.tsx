/*
 * The RitoShark menu behind the suite logo in the title bar.
 *
 * Replaces the row of one-logo-per-tool launch buttons. Those were only ever
 * useful with a bin open, took a slot each, and said nothing about what the
 * tools were — so they collapse into a single logo whose menu lists the suite,
 * credits each tool, and offers the hand-off only when there is something to
 * hand over.
 *
 * Each row carries an info button (the tool's README) and, for a tool that can
 * take a bin, a play button that launches it with the file Quartz has open.
 */

import { Fragment, useEffect, useRef } from 'react';
import { Info, Play } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { RITOSHARK_APPS, type RitoSharkApp } from './ritosharkApps';

/** Apps, then the launcher they ship mods to, then the plugins that extend
 *  other programs. Celestial gets its own heading because it is a Divine Skins
 *  product, not a RitoShark one. */
const SECTIONS: { key: RitoSharkApp['section']; label: string }[] = [
    { key: 'apps', label: 'RitoShark' },
    { key: 'launcher', label: 'Divine Skins' },
    { key: 'plugins', label: 'Plugins' },
];

interface RitoSharkPopoverProps {
    anchorRect: DOMRect;
    /** Path of the bin the active page has open, or null when none has. */
    binPath: string | null;
    onClose: () => void;
    onShowReadme: (app: RitoSharkApp) => void;
    onLaunch: (app: RitoSharkApp) => void;
}

export function RitoSharkPopover({
    anchorRect, binPath, onClose, onShowReadme, onLaunch,
}: RitoSharkPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const style: React.CSSProperties = {
        top: anchorRect.bottom + 8,
        right: window.innerWidth - anchorRect.right,
        /* Never taller than the room below the button. The list grows as tools
           are added, so it scrolls rather than running off the screen — a fixed
           height would need revisiting on every addition. */
        maxHeight: `calc(100vh - ${anchorRect.bottom + 20}px)`,
    };

    /* The name of the open bin, so the launch tooltip can say what it will
       actually send rather than a generic "open in". */
    const binName = binPath ? binPath.replace(/\\/g, '/').split('/').pop() ?? '' : '';

    const renderRow = (app: RitoSharkApp) => {
        const launchable = app.canOpenBin && !!binPath;
        return (
            <div
                key={app.id}
                className="q-ritoshark-pop__row"
                role="menuitem"
                /* Each row wears its own tool's colour rather than Quartz's, so
                   the list reads as separate products. */
                style={{ '--accent-primary': app.accent } as React.CSSProperties}
            >
                <img src={app.logo} alt="" className="q-ritoshark-pop__logo" />
                <div className="q-ritoshark-pop__text">
                    <strong>{app.name}</strong>
                    {/* The short form: the row has one line, and the full sentence
                        lives in the README panel. */}
                    <span>{app.short}</span>
                </div>
                <div className="q-ritoshark-pop__actions">
                    <Tooltip content={`About ${app.name}`} side="bottom">
                        <button
                            type="button"
                            className="q-ritoshark-pop__btn"
                            aria-label={`About ${app.name}`}
                            onClick={() => onShowReadme(app)}
                        >
                            <Info size={15} />
                        </button>
                    </Tooltip>
                    {/* Only a tool that takes a bin, and only while one is open —
                        a play button that cannot play is worse than no button. */}
                    {app.canOpenBin && (
                        <Tooltip
                            content={launchable ? `Open ${binName} in ${app.name}` : 'Open a bin first'}
                            side="bottom"
                        >
                            <button
                                type="button"
                                className="q-ritoshark-pop__btn is-play"
                                aria-label={launchable ? `Open the current bin in ${app.name}` : 'Open a bin first'}
                                disabled={!launchable}
                                onClick={() => onLaunch(app)}
                            >
                                <Play size={15} />
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>
        );
    };

    return (
        /* A real backdrop rather than a document-level mousedown listener.
           The title bar is a `data-tauri-drag-region`, and Tauri swallows
           mousedown on those to start a window drag — so a document listener
           never fired for a click on the title bar or the empty space beside it,
           and the menu stayed open. An element covering the screen always
           receives the click, whatever is underneath it.

           `onMouseDown`, not `onClick`: the menu should go the moment the press
           lands, and a press that started outside must not need to finish inside
           to count. The trigger button sits ABOVE this layer, so clicking the
           logo still reaches its own handler and toggles cleanly. */
        <>
            <div
                className="q-ritoshark-backdrop"
                onMouseDown={onClose}
                onContextMenu={(event) => { event.preventDefault(); onClose(); }}
                aria-hidden
            />
            <div ref={ref} className="q-ritoshark-pop" style={style} role="menu">
                {SECTIONS.map(({ key, label }) => {
                    const apps = RITOSHARK_APPS.filter((app) => app.section === key);
                    if (apps.length === 0) return null;
                    return (
                        <Fragment key={key}>
                            <div className="q-ritoshark-pop__head">{label}</div>
                            {apps.map(renderRow)}
                        </Fragment>
                    );
                })}
            </div>
        </>
    );
}
