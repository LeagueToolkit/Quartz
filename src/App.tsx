import { useEffect } from 'react';
import { useNavigationStore, useConfigStore, useThemeStore, useUiPrefsStore, applyUiPrefs, type Page } from '@/lib/stores';
import { applyFont } from '@/lib/fonts/fontManager';
import { getLeaguePath } from '@/lib/api/league';
import { log } from '@/lib/util/logger';
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
        case 'soundbanks': return <BnkExtract />;
        case 'bumpath': return <Bumpath />;
        case 'tools': return <Tools />;
        case 'upscale': return <Upscale />;
        default: return <Placeholder title={TITLES[page]} />;
    }
}

export function App() {
    const page = useNavigationStore((s) => s.page);
    const sidebarCollapsed = useUiPrefsStore((s) => s.sidebarCollapsed);
    const loadConfig = useConfigStore((s) => s.load);
    const initThemes = useThemeStore((s) => s.init);

    useButtonGlow();

    useEffect(() => {
        // Load settings first so the theme store can read the saved selection.
        loadConfig().then(async () => {
            initThemes();
            // Auto-detect the League install path on boot if none is saved yet.
            const { settings, update } = useConfigStore.getState();
            if (!settings.leaguePath) {
                const detected = await getLeaguePath().catch((e) => { log.error('boot league auto-detect', e); return null; });
                if (detected) await update({ leaguePath: detected });
            }
        });
        applyUiPrefs();
        applyFont(useUiPrefsStore.getState().font);
    }, [loadConfig, initThemes]);

    return (
        <div className="relative flex h-full flex-col">
            <div className="q-atmosphere" />
            <EffectsLayer />
            <TitleBar collapsed={sidebarCollapsed} />
            <div className="relative z-[1] flex min-h-0 flex-1">
                {!sidebarCollapsed && <NavRail />}
                <main className="q-main min-w-0 flex-1 overflow-y-auto">
                    <div key={page} className={`q-page h-full ${FULL_BLEED_PAGES.has(page) ? '' : 'p-6'}`}>
                        <PageView page={page} />
                    </div>
                </main>
            </div>
            <FileExplorerHost />
        </div>
    );
}
