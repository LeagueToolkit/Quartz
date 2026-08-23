import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { log } from '@/lib/util/logger';
import {
    SHOW_UPDATE_NOTES_EVENT,
    UPDATE_SHOWCASE_PENDING_KEY,
    UPDATE_SHOWCASE_SEEN_KEY,
} from './updateShowcaseState';
import './update-showcase.css';

/* Update notes come from our own GitHub releases, but we still sanitize the
   rendered HTML so a compromised/edited release body can't inject scripts. This
   schema starts from rehype-sanitize's safe default (which already strips
   <script>, event handlers, javascript: URLs, etc.) and re-allows just the
   media bits release notes actually use: sized <img>, animated GIFs, and a
   couple of GitHub-style layout tags. External https/data image sources are
   permitted (the app CSP also allows them); other protocols are dropped. */
const releaseNotesSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'img', 'video', 'source', 'picture', 'details', 'summary'],
    attributes: {
        ...defaultSchema.attributes,
        img: [
            ...((defaultSchema.attributes?.img as unknown[]) ?? []),
            'src', 'alt', 'title', 'width', 'height', 'loading', 'align',
        ],
        video: ['src', 'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'poster'],
        source: ['src', 'srcset', 'type', 'media'],
    },
    // Allow http/https/data image sources (GitHub user-attachment GIFs, etc.).
    protocols: {
        ...defaultSchema.protocols,
        src: ['http', 'https', 'data'],
    },
};

interface GithubRelease {
    name: string | null;
    tag_name: string;
    body: string | null;
    html_url: string;
    published_at: string | null;
    author: {
        login: string;
        html_url: string;
        avatar_url: string | null;
    } | null;
}

interface ShowcaseRelease {
    title: string;
    version: string;
    markdown: string;
    url: string;
    publishedAt: string | null;
    author: {
        login: string;
        url: string;
        avatarUrl: string | null;
    } | null;
}

const REPOSITORY = 'RitoShark/Quartz';

async function githubRelease(version: string, signal: AbortSignal): Promise<ShowcaseRelease> {
    const normalized = version.replace(/^v/i, '');
    const endpoints = [
        `https://api.github.com/repos/${REPOSITORY}/releases/tags/v${normalized}`,
        `https://api.github.com/repos/${REPOSITORY}/releases/tags/${normalized}`,
        `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    ];

    for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
            signal,
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (response.status === 404) continue;
        if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
        const release = await response.json() as GithubRelease;
        return {
            title: release.name?.trim() || `Quartz ${release.tag_name}`,
            version: release.tag_name.replace(/^v/i, '') || normalized,
            markdown: release.body?.trim() || 'This update does not include detailed release notes.',
            url: release.html_url,
            publishedAt: release.published_at,
            author: release.author ? {
                login: release.author.login,
                url: release.author.html_url,
                /* Request a small avatar: GitHub serves the full-size image by
                   default, and this is rendered at 20px. */
                avatarUrl: release.author.avatar_url
                    ? `${release.author.avatar_url}${release.author.avatar_url.includes('?') ? '&' : '?'}s=40`
                    : null,
            } : null,
        };
    }
    throw new Error(`No GitHub release was found for Quartz ${normalized}`);
}

/** "23 Aug 2026 · 2 days ago", or just the date once it is a month old. */
function formatReleased(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const absolute = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    const relative = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : null;
    return relative ? `${absolute} · ${relative}` : absolute;
}

/** True when a release title only restates the version the pill already shows
 *  ("Quartz 4.2.4", "v4.2.4", "Release 4.2.4"). Printing it beside the pill
 *  would show the same number twice. */
function isRedundantTitle(title: string): boolean {
    return title
        .replace(/quartz/gi, '')
        .replace(/release/gi, '')
        .replace(/v?\d+(\.\d+)*/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .trim().length === 0;
}

function shouldShow(version: string): boolean {
    try {
        const normalized = version.replace(/^v/i, '');
        const seen = localStorage.getItem(UPDATE_SHOWCASE_SEEN_KEY)?.replace(/^v/i, '');
        const pending = localStorage.getItem(UPDATE_SHOWCASE_PENDING_KEY)?.replace(/^v/i, '');
        if (pending === normalized) return true;
        if (seen) return seen !== normalized;
        // The first Quartz build containing this feature has no old version
        // marker. Existing persisted preferences distinguish an upgrade from a
        // genuinely clean install, allowing those users to see its notes once.
        return localStorage.getItem('quartz-ui-prefs') !== null;
    } catch {
        return false;
    }
}

function remember(version: string): void {
    try {
        localStorage.setItem(UPDATE_SHOWCASE_SEEN_KEY, version.replace(/^v/i, ''));
        localStorage.removeItem(UPDATE_SHOWCASE_PENDING_KEY);
    } catch { /* non-persistent WebView */ }
}

export function UpdateShowcase() {
    const [currentVersion, setCurrentVersion] = useState('');
    const [release, setRelease] = useState<ShowcaseRelease | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    /** Opened from Settings rather than shown automatically — see `close`. */
    const [openedManually, setOpenedManually] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        void getVersion().then(async (version) => {
            if (cancelled) return;
            setCurrentVersion(version);
            if (!shouldShow(version)) {
                remember(version);
                return;
            }
            setOpen(true);
            setLoading(true);
            try {
                setRelease(await githubRelease(version, controller.signal));
            } catch (reason) {
                if (controller.signal.aborted) return;
                log.error('update showcase release notes', reason);
                setError('Release notes could not be loaded. You can still view this release on GitHub.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }).catch((reason) => log.error('update showcase version', reason));
        return () => { cancelled = true; controller.abort(); };
    }, []);

    /* Load the notes on demand, for the reopen shortcut below. The mount effect
       above only fetches when the showcase is due to appear on its own, so
       reopening it later would otherwise show an empty panel. */
    const loadRelease = useCallback(async (version: string) => {
        if (!version) return;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        try {
            setRelease(await githubRelease(version, controller.signal));
        } catch (reason) {
            log.error('update showcase release notes', reason);
            setError('Release notes could not be loaded. You can still view this release on GitHub.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // Same rule as the X: a manual open does not consume the notice.
                if (!openedManually) remember(currentVersion);
                setOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [currentVersion, open, openedManually]);

    /* Reopening from Settings.
       The showcase appears once per version and is then remembered, so without
       a way back in the notes for the running build are unreachable. Settings
       asks for them by firing this event rather than importing the component's
       state, which keeps the showcase the only owner of when it is visible. */
    useEffect(() => {
        const onRequest = () => {
            setOpenedManually(true);
            setOpen(true);
            if (!release) void loadRelease(currentVersion);
        };
        window.addEventListener(SHOW_UPDATE_NOTES_EVENT, onRequest);
        return () => window.removeEventListener(SHOW_UPDATE_NOTES_EVENT, onRequest);
    }, [currentVersion, release, loadRelease]);

    if (!open) return null;
    /* Only the AUTOMATIC notice marks the version seen. Opening the notes
       yourself from Settings must not consume the one-time showing: a user who
       browses the notes for an older build would otherwise never be shown the
       notice for the build they are actually on. */
    const close = () => {
        if (!openedManually) remember(currentVersion);
        setOpen(false);
    };
    const releaseUrl = release?.url || `https://github.com/${REPOSITORY}/releases/latest`;

    return (
        <div className="update-showcase-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className="update-showcase" role="dialog" aria-modal="true" aria-labelledby="update-showcase-title">
                <div className="update-showcase__glow" aria-hidden />

                {/* Corner X only: no footer close button on a modal that has one. */}
                <button type="button" className="update-showcase__close" onClick={close} aria-label="Close">
                    <X size={16} />
                </button>

                {/* Left rail: who shipped it, which version, when, and the ways out. */}
                <aside className="update-showcase__rail">
                    {/* Wordmark beside the logo: the mark alone left the top of the
                        rail reading as empty space. */}
                    <div className="update-showcase__brand">
                        <img className="update-showcase__logo" src="/your-logo.gif" alt="" />
                        <div className="update-showcase__brand-text">
                            {/* Labels the dialog: the release title below is optional
                                (and suppressed when it just repeats the version), so
                                pointing at it left the dialog unnamed most of the time. */}
                            <strong id="update-showcase-title">Quartz</strong>
                            <span>What&rsquo;s new</span>
                        </div>
                    </div>

                    <div>
                        <p className="update-showcase__rail-label">Released by</p>
                        <button
                            type="button"
                            className="update-showcase__author"
                            onClick={() => release?.author && void openUrl(release.author.url)}
                            disabled={!release?.author}
                        >
                            {release?.author?.avatarUrl && (
                                <img
                                    className="update-showcase__avatar"
                                    src={release.author.avatarUrl}
                                    alt=""
                                    loading="lazy"
                                    /* A failed avatar load should not leave a broken-image
                                       icon next to the name. */
                                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                />
                            )}
                            <span className="update-showcase__author-name">
                                <strong>{release?.author?.login || 'Quartz'}</strong>
                                {release?.author && <span>@{release.author.login}</span>}
                            </span>
                        </button>
                    </div>

                    {/* Only when the release was given a real name — a title that just
                        repeats the version says nothing the pill below does not. */}
                    {release?.title && !isRedundantTitle(release.title) && (
                        <div>
                            <p className="update-showcase__rail-label">Title</p>
                            <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, color: 'var(--text-primary)' }}>
                                {release.title}
                            </h2>
                        </div>
                    )}

                    <div>
                        <p className="update-showcase__rail-label">Version</p>
                        <span className="update-showcase__version">v{release?.version || currentVersion}</span>
                    </div>

                    <div className="update-showcase__rail-foot">
                        {release?.publishedAt && (
                            <div>
                                <p className="update-showcase__rail-label">Released</p>
                                <p className="update-showcase__released">
                                    <time dateTime={release.publishedAt}>{formatReleased(release.publishedAt)}</time>
                                </p>
                            </div>
                        )}
                        <div className="update-showcase__seam" aria-hidden />
                        <div className="update-showcase__actions">
                            <button type="button" className="dl-btn dl-btn--primary" onClick={() => void openUrl(releaseUrl)}>
                                <ExternalLink size={14} /><span>Open on GitHub</span>
                            </button>
                        </div>
                    </div>
                </aside>

                <div className="update-showcase__body">
                    {loading && (
                        <div className="update-showcase__loading">
                            <span className="model-viewport__spinner" />
                            Loading the latest release notes…
                        </div>
                    )}
                    {error && <div className="update-showcase__error">{error}</div>}
                    {release && (
                        <article className="update-showcase__markdown">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                /* rehypeRaw parses inline HTML (e.g. a sized
                                   <img> GIF) into the tree; rehypeSanitize then
                                   strips anything unsafe. Order matters: raw
                                   must run before sanitize. */
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, releaseNotesSchema]]}
                                components={{
                                    a: ({ href, children }) => (
                                        <a href={href} onClick={(event) => { event.preventDefault(); if (href) void openUrl(href); }}>{children}</a>
                                    ),
                                }}
                            >
                                {release.markdown}
                            </ReactMarkdown>
                        </article>
                    )}
                </div>
            </section>
        </div>
    );
}
