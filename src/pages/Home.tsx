import { useMemo, useState } from 'react';
import { ArrowRight, Play, type LucideIcon } from 'lucide-react';
import { useNavigationStore, type Page } from '@/lib/stores';
import { ITEMS, SETTINGS_ITEM, type NavItem } from '@/components/layout/NavRail';

/* Home — workflow rail. Tools grouped by workflow on the left; the right panel
   features the hovered/selected tool with a media slot reserved for a per-tool
   tutorial video (placeholder until those land). Rail selects (previews); the
   Open button navigates. Honors the same pageVisibility as the nav rail. */

interface ToolMeta {
    description: string;
    category: CategoryKey;
}

type CategoryKey = 'create' | 'textures' | 'audio' | 'utility';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
    create: 'Create',
    textures: 'Textures & Color',
    audio: 'Audio',
    utility: 'Utility',
};

const CATEGORY_ORDER: CategoryKey[] = ['create', 'textures', 'audio', 'utility'];

// Per-page description + workflow bucket. Icons/labels come from NavRail.ITEMS
// so the home page and the nav stay in sync automatically.
const META: Partial<Record<Page, ToolMeta>> = {
    paint: { category: 'create', description: 'Customize your particles with ease. Random colors, hue shift, or shade ranges.' },
    port: { category: 'create', description: 'Bring particles from different champions or skins into your own custom skin.' },
    bineditor: { category: 'create', description: 'Edit parameters like birthscale directly within Quartz.' },
    aniport: { category: 'create', description: 'Port animations between skins and champions.' },
    imgrecolor: { category: 'textures', description: 'Batch recolor DDS or TEX files from a folder in one click.' },
    upscale: { category: 'textures', description: 'AI-powered image upscaling for DDS and PNG textures.' },
    rgba: { category: 'textures', description: 'Adjust RGBA color channels on DDS and TEX textures.' },
    bumpath: { category: 'textures', description: 'Repath League of Legends file references across your skin files.' },
    soundbanks: { category: 'audio', description: 'Extract, edit, and repack audio banks for custom sound mods.' },
    fakegear: { category: 'utility', description: 'A Ctrl+5 in-game toggle to swap between VFX variants on your custom skin.' },
    particlerandomizer: { category: 'utility', description: 'Randomize VFX particle parameters across your entire skin at once.' },
    filehandler: { category: 'utility', description: 'Universal file processing and randomization for bulk operations.' },
    tools: { category: 'utility', description: 'Add your own executables and drag-drop folders to apply fixes.' },
    settings: { category: 'utility', description: 'Preferences, theme font, page visibility, and Ritobin CLI configuration.' },
};

interface HomeTool extends NavItem {
    description: string;
    category: CategoryKey;
}

function Home() {
    const setPage = useNavigationStore((s) => s.setPage);

    // Home lists the full catalog regardless of nav-rail page visibility — it's
    // the launcher, so every tool is reachable here. Bucketed into categories.
    const grouped = useMemo(() => {
        const all: HomeTool[] = [...ITEMS, SETTINGS_ITEM]
            .map((i) => {
                const m = META[i.id];
                return m ? { ...i, description: m.description, category: m.category } : null;
            })
            .filter((t): t is HomeTool => t !== null);

        return CATEGORY_ORDER.map((cat) => ({
            key: cat,
            label: CATEGORY_LABELS[cat],
            tools: all.filter((t) => t.category === cat),
        })).filter((g) => g.tools.length > 0);
    }, []);

    const firstTool = grouped[0]?.tools[0] ?? null;
    const [activeId, setActiveId] = useState<Page | null>(firstTool?.id ?? null);

    const active =
        grouped.flatMap((g) => g.tools).find((t) => t.id === activeId) ?? firstTool;

    return (
        <div className="q-home">
            <aside className="q-home__rail">
                {grouped.map((group) => (
                    <div key={group.key} className="q-home__group">
                        <div className="q-home__eyebrow">{group.label}</div>
                        {group.tools.map((tool) => {
                            const Icon = tool.icon;
                            return (
                                <button
                                    key={tool.id}
                                    className={`q-home__item ${active?.id === tool.id ? 'is-active' : ''}`}
                                    onClick={() => setActiveId(tool.id)}
                                    onDoubleClick={() => setPage(tool.id)}
                                >
                                    <Icon size={18} className="q-home__item-ic" />
                                    <span>{tool.label}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </aside>

            <section className="q-home__stage">
                {active && <Featured tool={active} onOpen={() => setPage(active.id)} />}
            </section>
        </div>
    );
}

function Featured({ tool, onOpen }: { tool: HomeTool; onOpen: () => void }) {
    const Icon: LucideIcon = tool.icon;
    return (
        <div className="q-home__feat">
            {/* Media slot — reserved for a per-tool tutorial video (16:9). */}
            <div className="q-home__media" aria-hidden>
                <Play size={26} className="q-home__media-play" />
                <span className="q-home__media-hint">Tutorial coming soon</span>
            </div>

            <div className="q-home__feat-head">
                <span className="q-home__feat-ic"><Icon size={22} /></span>
                <h2 className="q-home__feat-title">{tool.label}</h2>
            </div>
            <p className="q-home__feat-desc">{tool.description}</p>

            <button className="q-home__open" onClick={onOpen}>
                <span>Open</span>
                <ArrowRight size={16} />
            </button>
        </div>
    );
}

export { Home };
export default Home;
