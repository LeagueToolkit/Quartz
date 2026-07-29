import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { log } from '@/lib/util/logger';
import {
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
            } : null,
        };
    }
    throw new Error(`No GitHub release was found for Quartz ${normalized}`);
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

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                remember(currentVersion);
                setOpen(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [currentVersion, open]);

    if (!open) return null;
    const close = () => {
        remember(currentVersion);
        setOpen(false);
    };
    const releaseUrl = release?.url || `https://github.com/${REPOSITORY}/releases/latest`;

    return (
        <div className="update-showcase-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className="update-showcase" role="dialog" aria-modal="true" aria-labelledby="update-showcase-title">
                <header className="update-showcase__head">
                    <img className="update-showcase__logo" src="/your-logo.gif" alt="Quartz" />
                    <div className="update-showcase__heading">
                        <h2 id="update-showcase-title">Quartz {release?.version || currentVersion}</h2>
                        <div className="update-showcase__details">
                            {release?.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en-GB')}</time>}
                            {release?.author && (
                                <button type="button" onClick={() => void openUrl(release.author!.url)}>
                                    Posted by {release.author.login}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="update-showcase__head-actions">
                        <button type="button" className="dl-btn dl-btn--sm dl-btn--secondary" onClick={() => void openUrl(releaseUrl)}>
                            <ExternalLink size={14} /><span>View on GitHub</span>
                        </button>
                        <button type="button" className="dl-btn dl-btn--icon dl-btn--ghost" onClick={close} title="Close"><X size={17} /></button>
                    </div>
                </header>

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
