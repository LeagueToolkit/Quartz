import { useNavigationStore, useUiPrefsStore, type Page } from '@/lib/stores';
import { useButtonGlow } from '@/lib/util/useButtonGlow';
import { TitleBar } from '@/components/layout/TitleBar';
import { NavRail } from '@/components/layout/NavRail';
import { Home } from '@/pages/Home';
import { Settings } from '@/pages/Settings';
import { Rgba } from '@/pages/Rgba';
import BinEditorV2 from '@/pages/BinEditorV2';
import AssetExtractor from '@/pages/AssetExtractor';
import FileRandomizer from '@/pages/FileRandomizer';
import Paint from '@/pages/Paint';
import Port from '@/pages/Port';
import ImgRecolor from '@/pages/ImgRecolor';
import ParticleRandomizer from '@/pages/ParticleRandomizer';
import FakeGear from '@/pages/FakeGear';
import AniPort from '@/pages/AniPort';
import BnkExtract from '@/pages/BnkExtract';
import Bumpath from '@/pages/Bumpath';
import Tools from '@/pages/Tools';
import Upscale from '@/pages/Upscale';
import { Placeholder } from '@/pages/Placeholder';
import { EffectsLayer } from '@/components/effects/EffectsLayer';
import { FileExplorerHost } from '@/components/explorer';
import { ModelInspectHost } from '@/components/model-inspect/ModelInspectHost';
import { openModelInspect } from '@/lib/model/modelInspectEvent';

const TITLES: Record<Page, string> = {
    home: 'Home',
    paint: 'Paint',
    port: 'Port',
    bineditor: 'Bin Editor',
    assetextractor: 'Asset Extractor',
    imgrecolor: 'Image Recolor',
    upscale: 'Upscale',
    rgba: 'RGBA',
    aniport: 'AniPort',
    tools: 'Tools',
    filehandler: 'File Randomizer',
    soundbanks: 'Sound Banks',
    bumpath: 'Bumpath',
    fakegear: 'FakeGear',
    particlerandomizer: 'Particle Randomizer',
    settings: 'Settings',
};

/* Pages that render their own edge-to-edge chrome (toolbar/list/footer) and
   should fill the work area with no outer frame. Content/card pages keep the
   default p-6 gutter. */
const FULL_BLEED_PAGES = new Set<Page>([
    'home', 'paint', 'bineditor', 'assetextractor', 'port', 'soundbanks', 'fakegear', 'aniport', 'particlerandomizer', 'upscale', 'rgba', 'imgrecolor', 'bumpath',
]);

function PageView({ page }: { page: Page }) {
    switch (page) {
        case 'home': return <Home />;
        case 'settings': return <Settings />;
        case 'rgba': return <Rgba />;
        case 'bineditor': return <BinEditorV2 />;
        case 'assetextractor': return <AssetExtractor />;
        case 'filehandler': return <FileRandomizer />;
        case 'paint': return <Paint />;
        case 'port': return <Port />;
        case 'imgrecolor': return <ImgRecolor />;
        case 'particlerandomizer': return <ParticleRandomizer />;
        case 'fakegear': return <FakeGear />;
        case 'aniport': return <AniPort />;
        // 'soundbanks' (BnkExtract) is rendered separately + always-mounted so its
        // editing state survives navigating away and back — see App().
        case 'bumpath': return <Bumpath />;
        case 'tools': return <Tools />;
        case 'upscale': return <Upscale />;
        default: return <Placeholder title={TITLES[page]} />;
    }
}

export function App() {
    const page = useNavigationStore((s) => s.page);
    const sidebarCollapsed = useUiPrefsStore((s) => s.sidebarCollapsed);

    useButtonGlow();

    return (
        <div className="relative flex h-full flex-col">
            <div className="q-atmosphere" />
            <EffectsLayer />
            <TitleBar collapsed={sidebarCollapsed} />
            <div className="relative z-[1] flex min-h-0 flex-1">
                {!sidebarCollapsed && <NavRail />}
                <main className="q-main min-w-0 flex-1 overflow-y-auto">
                    {/* BnkExtract stays mounted across navigation (hidden when
                        inactive) so in-progress edits are preserved when you leave
                        and come back. All other pages remount per navigation via
                        the keyed div below. */}
                    <div
                        className="q-page h-full"
                        style={{ display: page === 'soundbanks' ? 'block' : 'none' }}
                    >
                        <BnkExtract />
                    </div>
                    {page !== 'soundbanks' && (
                        <div key={page} className={`q-page h-full ${FULL_BLEED_PAGES.has(page) ? '' : 'p-6'}`}>
                            <PageView page={page} />
                        </div>
                    )}
                </main>
            </div>
            <FileExplorerHost onInspect={(entry) => openModelInspect(entry.path)} />
            <ModelInspectHost />
        </div>
    );
}
