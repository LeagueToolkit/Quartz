import { useEffect } from 'react';
import { useNavigationStore, useConfigStore, useThemeStore, useUiPrefsStore, applyUiPrefs, type Page } from '@/lib/stores';
import { applyFont } from '@/lib/fonts/fontManager';
import { TitleBar } from '@/components/layout/TitleBar';
import { NavRail } from '@/components/layout/NavRail';
import { Home } from '@/pages/Home';
import { Settings } from '@/pages/Settings';
import { Rgba } from '@/pages/Rgba';
import { AssetExtractor } from '@/pages/AssetExtractor';
import BinEditor from '@/pages/BinEditor';
import FileRandomizer from '@/pages/FileRandomizer';
import Paint from '@/pages/Paint';
import Port from '@/pages/Port';
import VfxHub from '@/pages/VfxHub';
import ImgRecolor from '@/pages/ImgRecolor';
import ParticleRandomizer from '@/pages/ParticleRandomizer';
import FakeGear from '@/pages/FakeGear';
import AniPort from '@/pages/AniPort';
import WadExplorer from '@/pages/WadExplorer';
import BnkExtract from '@/pages/BnkExtract';
import Bumpath from '@/pages/Bumpath';
import Tools from '@/pages/Tools';
import Upscale from '@/pages/Upscale';
import { Placeholder } from '@/pages/Placeholder';
import { EffectsLayer } from '@/components/effects/EffectsLayer';

const TITLES: Record<Page, string> = {
    home: 'Home',
    paint: 'Paint',
    port: 'Port',
    vfxhub: 'VFX Hub',
    extractor: 'Asset Extractor',
    wadexplorer: 'WAD Explorer',
    bineditor: 'Bin Editor',
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

function PageView({ page }: { page: Page }) {
    switch (page) {
        case 'home': return <Home />;
        case 'settings': return <Settings />;
        case 'rgba': return <Rgba />;
        case 'extractor': return <AssetExtractor />;
        case 'bineditor': return <BinEditor />;
        case 'filehandler': return <FileRandomizer />;
        case 'paint': return <Paint />;
        case 'port': return <Port />;
        case 'vfxhub': return <VfxHub />;
        case 'imgrecolor': return <ImgRecolor />;
        case 'particlerandomizer': return <ParticleRandomizer />;
        case 'fakegear': return <FakeGear />;
        case 'aniport': return <AniPort />;
        case 'wadexplorer': return <WadExplorer />;
        case 'soundbanks': return <BnkExtract />;
        case 'bumpath': return <Bumpath />;
        case 'tools': return <Tools />;
        case 'upscale': return <Upscale />;
        default: return <Placeholder title={TITLES[page]} />;
    }
}

export function App() {
    const page = useNavigationStore((s) => s.page);
    const loadConfig = useConfigStore((s) => s.load);
    const initThemes = useThemeStore((s) => s.init);

    useEffect(() => {
        // Load settings first so the theme store can read the saved selection.
        loadConfig().then(initThemes);
        applyUiPrefs();
        applyFont(useUiPrefsStore.getState().font);
    }, [loadConfig, initThemes]);

    return (
        <div className="relative flex h-full flex-col">
            <div className="q-atmosphere" />
            <EffectsLayer />
            <TitleBar />
            <div className="relative z-[1] flex min-h-0 flex-1">
                <NavRail />
                <main className="min-w-0 flex-1 overflow-y-auto">
                    <div key={page} className="q-page h-full p-6">
                        <PageView page={page} />
                    </div>
                </main>
            </div>
        </div>
    );
}
