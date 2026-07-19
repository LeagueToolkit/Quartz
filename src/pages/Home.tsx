import { useMemo } from 'react';
import {
    ArrowLeftRight, Brush, Code, Dices, FileDigit, FolderInput, FolderSearch,
    Github, Image, Maximize, Music, Pipette, Settings, Sparkles,
    Waypoints, Wrench, type LucideIcon,
} from 'lucide-react';
import { useNavigationStore, type Page } from '@/lib/stores';

interface ToolCard {
    title: string;
    description: string;
    icon: LucideIcon;
    page: Page;
    isNew?: boolean;
}

const TOOL_CARDS: ToolCard[] = [
    { title: 'Paint', description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.', icon: Brush, page: 'paint' },
    { title: 'Port', description: 'Bring particles from different champions or skins into your own custom skin!', icon: ArrowLeftRight, page: 'port' },
    { title: 'VFX Hub', description: 'Community-powered VFX sharing exclusively for Divine members.', icon: Github, page: 'port' },
    { title: 'WAD Explorer', description: 'Advanced explorer for WAD files with live 3D model and texture preview.', icon: FolderSearch, page: 'wadexplorer', isNew: true },

    { title: 'Image Recolor', description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking "Batch Apply".', icon: Image, page: 'imgrecolor' },
    { title: 'Bin Editor', description: 'Primarily designed for editing parameters like birthscale directly within Quartz.', icon: Code, page: 'bineditor' },
    { title: 'Asset Extractor', description: 'Extract and decompose League of Legends game assets from WAD files.', icon: FolderInput, page: 'assetextractor' },
    { title: 'Sound Banks', description: 'Extract, edit, and repack audio bank files for custom sound mods.', icon: Music, page: 'soundbanks' },

    { title: 'Upscale', description: 'AI-powered image upscaling for DDS and PNG texture files.', icon: Maximize, page: 'upscale' },
    { title: 'FakeGear', description: 'Enables a Ctrl+5 in-game toggle to swap between VFX variants on your custom skin.', icon: Sparkles, page: 'fakegear' },
    { title: 'Randomizer', description: 'Randomize VFX particle parameters across your entire skin at once.', icon: Dices, page: 'particlerandomizer' },
    { title: 'RGBA', description: 'Adjust RGBA color channels on DDS and TEX texture files.', icon: Pipette, page: 'rgba' },

    { title: 'Bumpath', description: 'Repath League of Legends file references across your skin files.', icon: Waypoints, page: 'bumpath' },
    { title: 'File Handler', description: 'Universal file processing and randomization utility for bulk operations.', icon: FileDigit, page: 'filehandler' },
    { title: 'Tools', description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.', icon: Wrench, page: 'tools' },
    { title: 'Settings', description: 'Select your preferred font and configure the Ritobin CLI path.', icon: Settings, page: 'settings' },
];

function tourKey(title: string) {
    return `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function Home() {
    const setPage = useNavigationStore((state) => state.setPage);
    const cards = useMemo(() => TOOL_CARDS, []);

    return (
        <div className="main-page-container">
            <section className="main-hero">
                <div className="main-hero__glow main-hero__glow--primary" />
                <div className="main-hero__glow main-hero__glow--secondary" />
                <h1>Quartz</h1>
                <p>League of Legends Toolkit</p>
            </section>

            <div className="main-separator" />

            <section className="main-tool-grid">
                {cards.map((tool) => {
                    const Icon = tool.icon;
                    return (
                        <button
                            key={tool.title}
                            type="button"
                            className={`main-page-card${tool.isNew ? ' is-new' : ''}`}
                            data-tour={tourKey(tool.title)}
                            title={`${tool.title}\n${tool.description}`}
                            onClick={() => setPage(tool.page)}
                        >
                            {tool.isNew && <span className="main-page-card__badge">NEW</span>}
                            <span className="main-page-card__head">
                                <Icon size={18} />
                                <strong>{tool.title}</strong>
                            </span>
                            <span className="main-page-card__desc">{tool.description}</span>
                        </button>
                    );
                })}
            </section>
        </div>
    );
}

export { Home };
export default Home;
