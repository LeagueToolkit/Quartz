import {
    Brush, ArrowLeftRight, Github, Code, Image,
    Waypoints, Shuffle, Maximize, Pipette, FileDigit, Wrench, Music, Sparkles, Dices,
    Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import { useNavigationStore, useUiPrefsStore, type Page } from '@/lib/stores';

// Paint and Port always appear, like the original Quartz nav.
const ALWAYS_VISIBLE: Page[] = ['paint', 'port'];

interface NavItem {
    id: Page;
    label: string;
    icon: LucideIcon;
}

// Order + icons mirror the original Quartz nav rail.
const ITEMS: NavItem[] = [
    { id: 'paint', label: 'Paint', icon: Brush },
    { id: 'port', label: 'Port', icon: ArrowLeftRight },
    { id: 'vfxhub', label: 'VFX Hub', icon: Github },
    { id: 'bineditor', label: 'Bin Editor', icon: Code },
    { id: 'imgrecolor', label: 'Image Recolor', icon: Image },
    { id: 'soundbanks', label: 'Sound Banks', icon: Music },
    { id: 'bumpath', label: 'Bumpath', icon: Waypoints },
    { id: 'aniport', label: 'AniPort', icon: Shuffle },
    { id: 'upscale', label: 'Upscale', icon: Maximize },
    { id: 'rgba', label: 'RGBA', icon: Pipette },
    { id: 'filehandler', label: 'File Handler', icon: FileDigit },
    { id: 'fakegear', label: 'FakeGear', icon: Sparkles },
    { id: 'particlerandomizer', label: 'Randomizer', icon: Dices },
    { id: 'tools', label: 'Tools', icon: Wrench },
];

function NavBtn({ item }: { item: NavItem }) {
    const page = useNavigationStore((s) => s.page);
    const setPage = useNavigationStore((s) => s.setPage);
    const Icon = item.icon;
    return (
        <button
            className={`q-navbtn ${page === item.id ? 'is-active' : ''}`}
            data-tip={item.label}
            onClick={() => setPage(item.id)}
        >
            <Icon size={21} />
        </button>
    );
}

export function NavRail() {
    const pageVisibility = useUiPrefsStore((s) => s.pageVisibility);
    const visible = ITEMS.filter((i) => ALWAYS_VISIBLE.includes(i.id) || pageVisibility[i.id] !== false);

    return (
        <nav className="q-rail shrink-0">
            <div className="q-rail-group q-rail-scroll">
                {visible.map((item) => <NavBtn key={item.id} item={item} />)}
            </div>
            <div className="q-rail-group q-rail-bottom">
                <NavBtn item={{ id: 'settings', label: 'Settings', icon: SettingsIcon }} />
            </div>
        </nav>
    );
}
