import { useEffect } from 'react';
import { useNavigationStore, useConfigStore, useThemeStore, type Page } from '@/lib/stores';
import { TitleBar } from '@/components/layout/TitleBar';
import { NavRail } from '@/components/layout/NavRail';
import { Home } from '@/pages/Home';
import { Settings } from '@/pages/Settings';
import { Rgba } from '@/pages/Rgba';
import { AssetExtractor } from '@/pages/AssetExtractor';
import { Placeholder } from '@/pages/Placeholder';

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
    filehandler: 'File Handler',
    bumpath: 'Bumpath',
    settings: 'Settings',
};

function PageView({ page }: { page: Page }) {
    switch (page) {
        case 'home': return <Home />;
        case 'settings': return <Settings />;
        case 'rgba': return <Rgba />;
        case 'extractor': return <AssetExtractor />;
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
    }, [loadConfig, initThemes]);

    return (
        <div className="relative flex h-full flex-col">
            <div className="q-atmosphere" />
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
