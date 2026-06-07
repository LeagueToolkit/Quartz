import { useEffect } from 'react';
import { useNavigationStore, useConfigStore, type Page } from '@/lib/stores';
import { TitleBar } from '@/components/layout/TitleBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { Home } from '@/pages/Home';
import { Settings } from '@/pages/Settings';
import { Placeholder } from '@/pages/Placeholder';

const TITLES: Record<Page, string> = {
    home: 'Home',
    paint: 'Paint',
    port: 'Port',
    vfxhub: 'VfxHub',
    extractor: 'Asset Extractor',
    wadexplorer: 'WAD Explorer',
    bineditor: 'Bineditor',
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
        case 'home':
            return <Home />;
        case 'settings':
            return <Settings />;
        default:
            return <Placeholder title={TITLES[page]} />;
    }
}

export function App() {
    const page = useNavigationStore((s) => s.page);
    const loadConfig = useConfigStore((s) => s.load);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    return (
        <div className="flex h-full flex-col">
            <TitleBar />
            <div className="flex min-h-0 flex-1">
                <Sidebar />
                <main className="min-w-0 flex-1 overflow-y-auto p-6">
                    <PageView page={page} />
                </main>
            </div>
        </div>
    );
}
