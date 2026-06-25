import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import {
    Brush as PaintIcon,
    ArrowLeftRight as PortIcon,
    Github as VFXHubIcon,
    Pipette as RGBAIcon,
    Image as ImgIcon,
    Code as BinEditorIcon,
    Wrench as ToolsIcon,
    Settings as SettingsIcon,
    Maximize as UpscaleIcon,
    FileDigit as FileHandlerIcon,
    Waypoints as BumpathIcon,
    Music as BnkExtractIcon,
    Sparkles as FakeGearIcon,
    Dices as ParticleRandIcon,
    type LucideIcon,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useNavigationStore, type Page } from '@/lib/stores';

interface ToolCard {
    title: string;
    description: string;
    icon: LucideIcon;
    page: Page;
    isNew?: boolean;
}

const TOOL_CARDS: ToolCard[] = [
    { title: 'Paint', description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.', icon: PaintIcon, page: 'paint' },
    { title: 'Port', description: 'Bring particles from different champions or skins into your own custom skin!', icon: PortIcon, page: 'port' },
    { title: 'VFX Hub', description: 'Community-powered VFX sharing exclusively for Divine members.', icon: VFXHubIcon, page: 'vfxhub' },
    { title: 'Image Recolor', description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking "Batch Apply".', icon: ImgIcon, page: 'imgrecolor' },
    { title: 'Bin Editor', description: 'Primarily designed for editing parameters like birthscale directly within Quartz.', icon: BinEditorIcon, page: 'bineditor' },
    { title: 'Sound Banks', description: 'Extract, edit, and repack audio bank files for custom sound mods.', icon: BnkExtractIcon, page: 'soundbanks' },
    { title: 'Upscale', description: 'AI-powered image upscaling for DDS and PNG texture files.', icon: UpscaleIcon, page: 'upscale' },
    { title: 'FakeGear', description: 'Enables a Ctrl+5 in-game toggle to swap between VFX variants on your custom skin.', icon: FakeGearIcon, page: 'fakegear' },
    { title: 'Randomizer', description: 'Randomize VFX particle parameters across your entire skin at once.', icon: ParticleRandIcon, page: 'particlerandomizer' },
    { title: 'RGBA', description: 'Adjust RGBA color channels on DDS and TEX texture files.', icon: RGBAIcon, page: 'rgba' },
    { title: 'Bumpath', description: 'Repath League of Legends file references across your skin files.', icon: BumpathIcon, page: 'bumpath' },
    { title: 'File Handler', description: 'Universal file processing and randomization utility for bulk operations.', icon: FileHandlerIcon, page: 'filehandler' },
    { title: 'Tools', description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.', icon: ToolsIcon, page: 'tools' },
    { title: 'Settings', description: 'Select your preferred font and configure the Ritobin CLI path.', icon: SettingsIcon, page: 'settings' },
];

function openExternal(url: string) {
    openUrl(url).catch(() => { window.open(url, '_blank'); });
}

function Home() {
    const setPage = useNavigationStore((s) => s.setPage);
    const [isMinecraftTheme, setIsMinecraftTheme] = useState(false);

    useEffect(() => {
        const getStyle = () => (
            document.documentElement?.getAttribute('data-style') ||
            document.body?.getAttribute('data-style') ||
            ''
        ).toLowerCase();
        const update = () => setIsMinecraftTheme(getStyle() === 'minecraft');
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['data-style'] });
        return () => observer.disconnect();
    }, []);

    return (
        <div className="q-home">
            {/* ----------------------------------------------------------- HERO
                Brand on the left, call-to-action buttons on the right. */}
            <header className="q-home__hero">
                {isMinecraftTheme ? (
                    <div className="q-home__mc" />
                ) : (
                    <div className="q-home__brand">
                        <img src="/quartz-logo.png" alt="" className="q-home__logo" />
                        <div className="q-home__titles">
                            <h1 className="q-home__title">Quartz</h1>
                            <p className="q-home__subtitle">League of Legends Toolkit</p>
                        </div>
                    </div>
                )}

                <div className="q-home__cta">
                    <button className="dl-btn dl-btn--primary dl-btn--lg" onClick={() => openExternal('https://divineskins.gg')}>
                        <span className="dl-icon"><ExternalLink size={16} /></span>
                        <span>Website</span>
                    </button>
                    <button className="dl-btn dl-btn--secondary dl-btn--lg" onClick={() => openExternal('https://wiki.divineskins.gg')}>
                        <span>Wiki</span>
                        <span className="dl-icon"><ArrowRight size={16} /></span>
                    </button>
                </div>
            </header>

            {/* ------------------------------------------------------- TOOL GRID */}
            <div className="q-home__grid">
                {TOOL_CARDS.map((tool) => {
                    const Icon = tool.icon;
                    return (
                        <button
                            key={tool.title}
                            className={`q-tool-card${tool.isNew ? ' q-tool-card--new' : ''}`}
                            onClick={() => setPage(tool.page)}
                            title={tool.description}
                        >
                            <div className="q-tool-card__head">
                                <span className="q-tool-card__icon"><Icon size={18} /></span>
                                <span className="q-tool-card__title">{tool.title}</span>
                                {tool.isNew && <span className="q-tool-card__badge">NEW</span>}
                            </div>
                            <p className="q-tool-card__desc">{tool.description}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export { Home };
export default Home;
