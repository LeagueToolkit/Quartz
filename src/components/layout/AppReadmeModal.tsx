/*
 * The README viewer behind each app's info button.
 *
 * Deliberately the SAME shell as the update showcase — identity rail on the
 * left, scrolling markdown on the right — so the suite's two "here is some
 * documentation" panels are one design rather than two. It reuses that
 * component's stylesheet outright; only the rail's contents differ (an app and
 * its authors instead of a release and its publisher).
 */

import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { openUrl } from '@tauri-apps/plugin-opener';
import { log } from '@/lib/util/logger';
import {
    absolutizeReadme, appOrg, discordProfileUrl, discordProfileWebUrl, fetchContributors,
    fetchLatestRelease, githubAvatarUrl, readmeUrls, releasesUrl, repoUrl,
    type LatestRelease, type RitoSharkApp, type RitoSharkAuthor,
} from './ritosharkApps';
import '@/components/update/update-showcase.css';

/* A README is fetched from a third-party repo, so the same sanitising the
   release notes use applies here: start from rehype-sanitize's safe default and
   re-allow only the media tags a README actually uses. */
const readmeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'img', 'video', 'source', 'picture', 'details', 'summary'],
    attributes: {
        ...defaultSchema.attributes,
        img: [...((defaultSchema.attributes?.img as unknown[]) ?? []), 'src', 'alt', 'title', 'width', 'height', 'loading', 'align'],
        video: ['src', 'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'poster'],
        source: ['src', 'srcset', 'type', 'media'],
    },
    protocols: { ...defaultSchema.protocols, src: ['http', 'https', 'data'] },
};

/** Discord profile, preferring the desktop client and falling back to the web. */
function openDiscord(userId: string): void {
    openUrl(discordProfileUrl(userId)).catch(() => {
        openUrl(discordProfileWebUrl(userId)).catch((e) => log.error('discord profile', e));
    });
}

export function AppReadmeModal({ app, onClose }: { app: RitoSharkApp; onClose: () => void }) {
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [latest, setLatest] = useState<LatestRelease | null>(null);

    /* The newest release, resolved so the download button can hand over the
       installer itself instead of dropping the user on a releases page. Skipped
       for anything with a website instead of an installer. */
    useEffect(() => {
        if (app.website) return;
        const controller = new AbortController();
        setLatest(null);
        void fetchLatestRelease(app.repo, controller.signal).then((release) => {
            if (!controller.signal.aborted) setLatest(release);
        });
        return () => controller.abort();
    }, [app.repo, app.website]);

    /* Credits pulled from GitHub, for a repo with more contributors than are
       worth hardcoding. Falls back to the listed ones when the request fails. */
    const [fetched, setFetched] = useState<RitoSharkAuthor[]>([]);
    useEffect(() => {
        if (!app.fetchContributors) { setFetched([]); return; }
        const controller = new AbortController();
        void fetchContributors(app.repo, controller.signal).then((people) => {
            if (!controller.signal.aborted) setFetched(people);
        });
        return () => controller.abort();
    }, [app.repo, app.fetchContributors]);

    /* Everyone who is not an author: the listed contributors, plus whoever
       GitHub knows about who is not already named. Listed people come first,
       since they carry real names and Discord links rather than a login. */
    const extraCredits = (() => {
        const named = new Set(app.authors.map((p) => p.github?.toLowerCase()).filter(Boolean));
        const listed = (app.contributors ?? []).filter((p) => !named.has(p.github?.toLowerCase()));
        const seen = new Set([...named, ...listed.map((p) => p.github?.toLowerCase())].filter(Boolean));
        return [...listed, ...fetched.filter((p) => !seen.has(p.github?.toLowerCase()))];
    })();
    /** The same people as one list, for `mergeCredits`. */
    const credits = [...app.authors, ...extraCredits];

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setMarkdown(null);

        (async () => {
            // `main` then `master`: which one a repo uses is not worth a second
            // API call to find out.
            for (const url of readmeUrls(app.repo)) {
                try {
                    const response = await fetch(url, { signal: controller.signal });
                    if (response.status === 404) continue;
                    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
                    // Rewrite repo-relative links against the branch this copy came
                    // from, or every relative image renders as a broken box.
                    const branch = url.includes('/main/') ? 'main' : 'master';
                    setMarkdown(absolutizeReadme((await response.text()).trim(), app.repo, branch));
                    return;
                } catch (reason) {
                    if (controller.signal.aborted) return;
                    log.error('app readme', reason);
                }
            }
            if (!controller.signal.aborted) {
                setError('The README could not be loaded. You can still open the repository on GitHub.');
            }
        })().finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });

        return () => controller.abort();
    }, [app.repo]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="update-showcase-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            {/* The tool's own colour drives the panel: the accent lines, the glow,
                the version-pill borders and the primary button all read from
                `--accent-primary`, so overriding it here makes the whole modal
                Ruby-red or Jade-cyan without restyling any of them. */}
            <section
                className="update-showcase is-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-readme-title"
                style={{ '--accent-primary': app.accent } as React.CSSProperties}
            >
                <div className="update-showcase__glow" aria-hidden />

                <button type="button" className="update-showcase__close" onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>

                <aside className="update-showcase__rail">
                    <div className="update-showcase__brand">
                        <img className="update-showcase__logo" src={app.logo} alt="" />
                        <div className="update-showcase__brand-text">
                            <strong id="app-readme-title">{app.name}</strong>
                            <span>{appOrg(app)}</span>
                        </div>
                    </div>

                    {/* Two headings by default: who made it, and who helped. A tool
                        that was a genuine joint effort sets `mergeCredits` and gets
                        one list instead, because there the split draws a line that
                        is not real. */}
                    {app.mergeCredits ? (
                        <Credits label="Contributors" people={credits} />
                    ) : (
                        <>
                            <Credits label="Made by" people={app.authors} />
                            {extraCredits.length > 0 && (
                                <Credits label="Contributors" people={extraCredits} />
                            )}
                        </>
                    )}

                    {/* Under the faces, where there is room to read it. */}
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.5 }}>
                        {app.tagline}
                    </p>

                    <div className="update-showcase__rail-foot">
                        <div className="update-showcase__seam" aria-hidden />
                        <div className="update-showcase__actions">
                            {/* Something you read rather than install gets a link to
                                itself; everything else gets the installer, directly
                                when the release publishes one and the release page
                                while the lookup runs or if it failed. */}
                            {app.website ? (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--primary"
                                    onClick={() => void openUrl(app.website!.url)}
                                >
                                    <ExternalLink size={14} /><span>{app.website.label}</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="dl-btn dl-btn--primary"
                                    onClick={() => void openUrl(latest?.installerUrl ?? latest?.pageUrl ?? releasesUrl(app.repo))}
                                    title={latest?.installerUrl ? 'Download the installer' : 'Open the latest release'}
                                >
                                    <Download size={14} />
                                    <span>{latest?.tag ? `Download v${latest.tag}` : 'Download latest'}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="dl-btn dl-btn--secondary"
                                onClick={() => void openUrl(repoUrl(app.repo))}
                            >
                                <ExternalLink size={14} /><span>Open on GitHub</span>
                            </button>
                        </div>
                    </div>
                </aside>

                <div className="update-showcase__body">
                    {loading && (
                        <div className="update-showcase__loading">
                            <span className="model-viewport__spinner" />
                            Loading {app.name}&rsquo;s README&hellip;
                        </div>
                    )}
                    {error && <div className="update-showcase__error">{error}</div>}
                    {markdown && (
                        <article className="update-showcase__markdown">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, readmeSchema]]}
                                components={{
                                    a: ({ href, children }) => (
                                        <a
                                            href={href}
                                            onClick={(event) => { event.preventDefault(); if (href) void openUrl(href); }}
                                        >
                                            {children}
                                        </a>
                                    ),
                                }}
                            >
                                {markdown}
                            </ReactMarkdown>
                        </article>
                    )}
                </div>
            </section>
        </div>
    );
}

/** One credited group — the authors, or the contributors. */
function Credits({ label, people }: { label: string; people: RitoSharkAuthor[] }) {
    return (
        /* `min-height: 0` so this block is what shrinks when the rail runs out
           of room — a flex item defaults to its content size and would otherwise
           refuse to give, pushing the buttons off the bottom instead. */
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <p className="update-showcase__rail-label">{label}</p>
            {/* The LIST scrolls, not the rail. A repo with a dozen contributors
                would otherwise push the description and buttons out of view and
                make the whole sidebar scroll to reach them. */}
            <div className="update-showcase__credits">
                {people.map((person) => (
                    <button
                        key={person.name}
                        type="button"
                        className="update-showcase__author"
                        /* Only someone with a Discord id is a link — the rest are
                           still credited, just not clickable. */
                        onClick={() => person.discordId && openDiscord(person.discordId)}
                        disabled={!person.discordId}
                        title={person.discordId ? `Open ${person.name} on Discord` : undefined}
                    >
                        {person.github ? (
                            <img
                                className="update-showcase__avatar"
                                src={githubAvatarUrl(person.github)}
                                alt=""
                                loading="lazy"
                                /* A failed avatar must not leave a broken-image icon
                                   where a face should be. */
                                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            /* Credited without a GitHub account: a monogram keeps the
                               row aligned with the ones that have an avatar. */
                            <span className="update-showcase__avatar update-showcase__avatar--initial">
                                {person.name.charAt(0)}
                            </span>
                        )}
                        <span className="update-showcase__author-name">
                            <strong>{person.name}</strong>
                            {person.discordId && <span>Discord</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
