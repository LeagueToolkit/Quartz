/*
 * The RitoShark suite, as the title-bar dropdown presents it.
 *
 * One definition for the whole feature: the dropdown rows, the README viewer's
 * source, and the author credits all read from here, so adding a fourth tool
 * means adding one entry rather than touching three components.
 *
 * Quartz is deliberately absent — you are already in it.
 */

export interface RitoSharkAuthor {
    name: string;
    /** Discord user id. Opens their profile; see `discordProfileUrl`. */
    discordId: string;
    /** GitHub login, for the avatar and the profile link. */
    github?: string;
}

/** Avatar for a GitHub login, sized for the row it renders in.
 *
 * `github.com/<login>.png` redirects to the user's current avatar, so it needs
 * no API call and never goes stale — unlike a hard-coded avatars.githubusercontent
 * URL, which is pinned to one upload. */
export function githubAvatarUrl(login: string, size = 64): string {
    return `https://github.com/${login}.png?size=${size}`;
}

export function githubProfileUrl(login: string): string {
    return `https://github.com/${login}`;
}

/** Who ships a tool, from the repo it lives in.
 *
 * Read from the owner rather than stored per entry, so it can never disagree
 * with the repo the README and releases are pulled from — the panel used to
 * print "RitoShark" under every name, including the Divine Skins ones. */
export function appOrg(app: Pick<RitoSharkApp, 'repo'>): string {
    return app.repo.startsWith('DivineSkins/') ? 'Divine Skins' : 'RitoShark';
}

export interface RitoSharkApp {
    id:
        | 'quartz' | 'jade' | 'ruby' | 'flint' | 'aventurine' | 'hematite'
        | 'ritotex-photoshop' | 'paintnet-tex' | 'gimp-tex' | 'tex-thumbnails'
        | 'celestial' | 'divine-wiki';
    /** Which heading the row sits under in the dropdown. Plugins extend another
     *  program rather than being one, so they are listed apart from the apps,
     *  and Celestial ships under Divine Skins rather than RitoShark. */
    section: 'apps' | 'plugins' | 'launcher';
    name: string;
    /** A few words for the dropdown row, which has one truncating line to give.
     *  Keep it short enough to fit — a clipped half-sentence reads worse than a
     *  blunt one. */
    short: string;
    /** The full sentence, for the README panel where there is room to read it. */
    tagline: string;
    logo: string;
    /** The tool's own colour, so a row reads as that app rather than as Quartz.
     *  Used for the logo ring and the README panel's accents. */
    accent: string;
    /** `owner/repo`, for the README and the "open on GitHub" link. */
    repo: string;
    /** Who made the tool. */
    authors: RitoSharkAuthor[];
    /** People who contributed to it without being its author. Credited under
     *  their own heading, so "made by" stays true. */
    contributors?: RitoSharkAuthor[];
    /** Pull the credits from GitHub instead of listing them here.
     *  For a repo with too many contributors to maintain by hand, and one that
     *  keeps gaining them. The hardcoded `authors` still lead the list. */
    fetchContributors?: boolean;
    /** Credit everyone under one "Contributors" heading instead of splitting
     *  authors from contributors. For a tool that was genuinely a joint effort,
     *  where "made by X, contributed to by Y" draws a line that is not real. */
    mergeCredits?: boolean;
    /** Somewhere to go instead of an installer, for a thing you do not install.
     *  Replaces the download button when set. */
    website?: { url: string; label: string };
    /** Whether this tool can be handed the bin Quartz currently has open. */
    canOpenBin: boolean;
}

/* Order: the other tools first, Quartz last.
   The list is somewhere to GO, and Quartz is where you already are — so it sits
   at the bottom as a credits-and-README entry rather than heading a menu of
   places to leave for. */
export const RITOSHARK_APPS: RitoSharkApp[] = [
    {
        id: 'jade',
        section: 'apps',
        name: 'Jade',
        short: 'League file studio',
        tagline: 'Studio for League files. Photo and animation studios, model viewer, and format editors.',
        logo: '/jade.webp',
        accent: '#2fd4c4',
        repo: 'RitoShark/Jade-League-Studio',
        authors: [{ name: 'Bud', discordId: '464506365402939402', github: 'budlibu500' }],
        canOpenBin: true,
    },
    {
        id: 'ruby',
        section: 'apps',
        name: 'RubyRe',
        short: 'VFX and material viewer',
        tagline: 'Plays League VFX the way the game does, so you can see particles and materials as you edit them.',
        logo: '/ruby.png',
        accent: '#e0413e',
        repo: 'RitoShark/RubyVFX',
        authors: [
            { name: 'Frog', discordId: '264954726972391424', github: 'FrogCsLoL' },
            // `sxrmss` is Daka — the GitHub account's display name says so, and it
            // is the same contributor across the other RitoShark repos.
            { name: 'Daka', discordId: '263367856660414465', github: 'sxrmss' },
            { name: 'Dazashu', discordId: '587738389638414337', github: 'dazashu' },
        ],
        canOpenBin: true,
    },
    {
        id: 'flint',
        section: 'apps',
        name: 'Flint',
        short: 'Skin modding IDE',
        tagline: 'An IDE for skin mods. Extract, preview, edit every League format, and ship a finished mod.',
        logo: '/flint.png',
        accent: '#8b93a1',
        repo: 'RitoShark/Flint',
        authors: [{ name: 'Dexal', discordId: '489077770589175821', github: 'DexalGT' }],
        canOpenBin: false,
    },
    {
        id: 'hematite',
        section: 'apps',
        name: 'Hematite',
        short: 'Skin fixer',
        tagline: 'Repairs broken skins. Drop a .fantome, .wad.client or .bin on it and it detects and fixes the problem.',
        logo: '/hematite.webp',
        // The blue of the mark itself, not the red the mineral's name suggests.
        accent: '#4a5ce0',
        repo: 'RitoShark/Hematite',
        authors: [{ name: 'Dexal', discordId: '489077770589175821', github: 'DexalGT' }],
        canOpenBin: false,
    },
    {
        /* Listed for its credits and README, not as somewhere to go — you are
           already in it, so it never gets a launch action. */
        id: 'quartz',
        section: 'apps',
        name: 'Quartz',
        short: 'This app',
        tagline: 'A modding suite built for VFX: recolor, port between champions, extract, and repath.',
        logo: '/quartz-logo.png',
        accent: '#4da3ff',
        repo: 'RitoShark/Quartz',
        authors: [{ name: 'Frog', discordId: '264954726972391424', github: 'FrogCsLoL' }],
        contributors: [
            { name: 'Dexal', discordId: '489077770589175821', github: 'DexalGT' },
            { name: 'Wiko', discordId: '395209649969823744', github: 'wiko3' },
        ],
        canOpenBin: false,
    },

    /* ── Launcher ─────────────────────────────────────────────────────────
       A Divine Skins product rather than a RitoShark one, so it gets its own
       heading instead of being filed under a label it does not ship under. */
    {
        id: 'celestial',
        section: 'launcher',
        name: 'Celestial',
        short: 'Mod launcher',
        tagline: 'Mod manager and launcher for League of Legends, with a Rust backend.',
        logo: '/celestial.webp',
        accent: '#783cb5',
        repo: 'DivineSkins/celestial-releases',
        authors: [
            { name: 'Frog', discordId: '264954726972391424', github: 'FrogCsLoL' },
            { name: 'Daka', discordId: '263367856660414465', github: 'sxrmss' },
            { name: 'Dexal', discordId: '489077770589175821', github: 'DexalGT' },
        ],
        contributors: [
            { name: 'Disco', discordId: '440418268470312961', github: 'DISCOCX' },
            { name: 'Oldey', discordId: '243447669081505792', github: 'oldeeey' },
            { name: 'Bud', discordId: '464506365402939402', github: 'budlibu500' },
        ],
        mergeCredits: true,
        canOpenBin: false,
    },

    {
        /* Credits come from GitHub: this one has a dozen contributors and gains
           more, so a hardcoded list would be wrong within a week. */
        id: 'divine-wiki',
        section: 'launcher',
        name: 'Divine Wiki',
        short: 'Modding wiki',
        tagline: 'The community wiki for League skin modding, written and maintained on GitHub.',
        logo: '/divine-wiki.webp',
        // Divine Skins purple, matching Celestial — they are the same product family.
        accent: '#783cb5',
        repo: 'DivineSkins/divine-wiki',
        authors: [{ name: 'Disco', discordId: '440418268470312961', github: 'DISCOCX' }],
        fetchContributors: true,
        mergeCredits: true,
        website: { url: 'https://wiki.divineskins.gg/en/docs/lol', label: 'Read the wiki' },
        canOpenBin: false,
    },

    /* ── Plugins ──────────────────────────────────────────────────────────
       These extend a program you already have rather than being one, so they
       are listed under their own heading. Each wears its HOST's colour — the
       thing you would recognise it by is Photoshop's blue or GIMP's brown, not
       a palette of our own. */
    {
        /* A Blender addon: it extends Blender rather than being an app of its
           own, so it wears Blender's mark and sits with the other plugins. */
        id: 'aventurine',
        section: 'plugins',
        name: 'Aventurine',
        short: 'Blender addon',
        tagline: 'Blender addon for League meshes, skeletons and animations, with no external converters.',
        logo: '/blender.webp',
        accent: '#e87d0d',
        repo: 'RitoShark/Aventurine-League-Tools',
        authors: [{ name: 'Bud', discordId: '464506365402939402', github: 'budlibu500' }],
        contributors: [
            { name: 'Frog', discordId: '264954726972391424', github: 'FrogCsLoL' },
            { name: '700', discordId: '', github: '701900181914174' },
        ],
        canOpenBin: false,
    },
    {
        id: 'ritotex-photoshop',
        section: 'plugins',
        name: 'RitoTex',
        short: 'Photoshop plugin',
        tagline: 'Teaches Photoshop to open and save League .tex textures like any other image.',
        logo: '/ps.webp',
        accent: '#001e36',
        repo: 'RitoShark/RitoTex-Photoshop',
        authors: [{ name: 'Dexal', discordId: '489077770589175821', github: 'DexalGT' }],
        canOpenBin: false,
    },
    {
        id: 'paintnet-tex',
        section: 'plugins',
        name: 'Paint.NET TEX',
        short: 'Paint.NET plugin',
        tagline: 'Loads and saves League .tex textures in Paint.NET, detecting compression and mipmaps automatically.',
        logo: '/paint-net.webp',
        accent: '#225cbc',
        repo: 'RitoShark/Paint.NET-Tex-Plugin',
        authors: [{ name: 'Bud', discordId: '464506365402939402', github: 'budlibu500' }],
        canOpenBin: false,
    },
    {
        id: 'gimp-tex',
        section: 'plugins',
        name: 'GIMP TEX',
        short: 'GIMP plugin',
        tagline: 'Loads and exports League .tex textures in GIMP 2 and 3.',
        logo: '/gimp.webp',
        accent: '#8a6642',
        repo: 'RitoShark/Gimp-Tex-Plugin',
        authors: [{ name: 'Bud', discordId: '464506365402939402', github: 'budlibu500' }],
        canOpenBin: false,
    },
    {
        id: 'tex-thumbnails',
        section: 'plugins',
        name: 'TEX Thumbnails',
        short: 'Explorer thumbnails',
        tagline: 'Renders real thumbnails for .tex files in Windows Explorer, with no app open.',
        logo: '/TEX.webp',
        accent: '#e8eaed',
        repo: 'RitoShark/TexThumbnailProvider',
        authors: [{ name: 'GuiSai', discordId: '', github: 'GuiSaiUwU' }],
        canOpenBin: false,
    },
];

/** Deep link to a Discord profile.
 *
 * `discord://` hands off to the desktop client and lands on the user's profile,
 * which is as close to "message them" as anything outside Discord can get —
 * there is no URL that opens a DM compose box, and no way to embed one. Callers
 * fall back to the https form when the client is not installed. */
export function discordProfileUrl(userId: string): string {
    return `discord://-/users/${userId}`;
}

export function discordProfileWebUrl(userId: string): string {
    return `https://discord.com/users/${userId}`;
}

/** Raw README for the app's default branch, trying `main` then `master`. */
export function readmeUrls(repo: string): string[] {
    return [
        `https://raw.githubusercontent.com/${repo}/main/README.md`,
        `https://raw.githubusercontent.com/${repo}/master/README.md`,
    ];
}

/** Point a README's RELATIVE links at the repo they came from.
 *
 * A README is written to be read on GitHub, so its images are repo-relative
 * (`docs/media/flint-logo.gif`). Rendered anywhere else those resolve against
 * the app's own origin and 404 — which is the broken-image box at the top of
 * Flint's notes. Images are rewritten to `raw.githubusercontent` so the bytes
 * load; links are rewritten to `github.com/<repo>/blob/...` so clicking one
 * lands on the page a reader expects.
 *
 * Anchors (`#section`), absolute URLs, and data URIs are left alone. */
export function absolutizeReadme(markdown: string, repo: string, branch = 'main'): string {
    const raw = `https://raw.githubusercontent.com/${repo}/${branch}/`;
    const blob = `https://github.com/${repo}/blob/${branch}/`;
    const isAbsolute = (url: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url.trim());
    const join = (base: string, url: string) => base + url.trim().replace(/^\.\//, '').replace(/^\//, '');

    return markdown
        // Markdown images and links: ![alt](url) / [text](url)
        .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g, (match, bang: string, text: string, url: string, rest: string) =>
            isAbsolute(url) ? match : `${bang}[${text}](${join(bang ? raw : blob, url)}${rest})`)
        // Inline HTML (READMEs lean on <img> for sizing and centering).
        .replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (match, head: string, quote: string, url: string) =>
            isAbsolute(url) ? match : `${head}${quote}${join(raw, url)}${quote}`)
        .replace(/(<a\b[^>]*?\bhref=)(["'])([^"']+)\2/gi, (match, head: string, quote: string, url: string) =>
            isAbsolute(url) ? match : `${head}${quote}${join(blob, url)}${quote}`);
}

export function repoUrl(repo: string): string {
    return `https://github.com/${repo}`;
}

export function releasesUrl(repo: string): string {
    return `https://github.com/${repo}/releases/latest`;
}

/** Everyone who has committed to a repo, most commits first.
 *
 * For a project with too many contributors to list by hand, and one that keeps
 * gaining them — a hardcoded list would be stale the week after it was written.
 * Bots are dropped: `dependabot` is not a person to credit.
 *
 * Returns `[]` on any failure (offline, rate-limited), and the caller falls
 * back to whatever it has hardcoded. */
export async function fetchContributors(repo: string, signal?: AbortSignal): Promise<RitoSharkAuthor[]> {
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/contributors?per_page=100`, {
            signal,
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) return [];
        const data = await response.json() as { login: string; type?: string }[];
        if (!Array.isArray(data)) return [];
        return data
            .filter((c) => c.type !== 'Bot' && !c.login.endsWith('[bot]'))
            .map((c) => ({ name: c.login, discordId: '', github: c.login }));
    } catch {
        return [];
    }
}

export interface LatestRelease {
    tag: string;
    /** Direct link to the Windows installer, when the release publishes one. */
    installerUrl: string | null;
    /** The release page, always available as a fallback. */
    pageUrl: string;
}

/** The newest release, and its installer if it has one.
 *
 * Prefers the `.exe` installer so the download button hands over the actual
 * file rather than dropping the user on a release page to find it themselves.
 * Signatures, update manifests and the `.nsis.zip` (an updater artifact, not
 * something to run) are all skipped. Returns `null` on any failure, and the
 * caller falls back to opening the release page. */
export async function fetchLatestRelease(repo: string, signal?: AbortSignal): Promise<LatestRelease | null> {
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
            signal,
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) return null;
        const data = await response.json() as {
            tag_name?: string;
            html_url?: string;
            assets?: { name: string; browser_download_url: string }[];
        };
        const installer = (data.assets ?? []).find((a) => /\.exe$/i.test(a.name));
        return {
            tag: (data.tag_name ?? '').replace(/^v/i, ''),
            installerUrl: installer?.browser_download_url ?? null,
            pageUrl: data.html_url ?? releasesUrl(repo),
        };
    } catch {
        return null;
    }
}
