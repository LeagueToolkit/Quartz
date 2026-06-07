import {
    Brush, ArrowLeftRight, Github, Code, Image, FolderInput, FolderSearch,
    Waypoints, Shuffle, Maximize, Pipette, FileDigit, Wrench,
    Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import { useNavigationStore, type Page } from '@/lib/stores';

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
    { id: 'extractor', label: 'Asset Extractor', icon: FolderInput },
    { id: 'wadexplorer', label: 'WAD Explorer', icon: FolderSearch },
    { id: 'aniport', label: 'AniPort', icon: Shuffle },
    { id: 'bumpath', label: 'Bumpath', icon: Waypoints },
    { id: 'upscale', label: 'Upscale', icon: Maximize },
    { id: 'rgba', label: 'RGBA', icon: Pipette },
    { id: 'filehandler', label: 'File Handler', icon: FileDigit },
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
    return (
        <nav className="q-rail shrink-0 py-3">
            <div className="q-rail-group">
                {ITEMS.map((item) => <NavBtn key={item.id} item={item} />)}
            </div>
            <div className="q-rail-group">
                <NavBtn item={{ id: 'settings', label: 'Settings', icon: SettingsIcon }} />
            </div>
        </nav>
    );
}
