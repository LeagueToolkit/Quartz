import {
    Home, Palette, ArrowLeftRight, Cloud, PackageOpen, FolderTree,
    SlidersHorizontal, Image, Maximize2, Pipette, Film, Wrench, Files, Route,
    Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import { useNavigationStore, type Page } from '@/lib/stores';

interface NavItem {
    id: Page;
    label: string;
    icon: LucideIcon;
}

const ITEMS: NavItem[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'paint', label: 'Paint', icon: Palette },
    { id: 'port', label: 'Port', icon: ArrowLeftRight },
    { id: 'vfxhub', label: 'VfxHub', icon: Cloud },
    { id: 'extractor', label: 'Asset Extractor', icon: PackageOpen },
    { id: 'wadexplorer', label: 'WAD Explorer', icon: FolderTree },
    { id: 'bineditor', label: 'Bineditor', icon: SlidersHorizontal },
    { id: 'imgrecolor', label: 'Image Recolor', icon: Image },
    { id: 'upscale', label: 'Upscale', icon: Maximize2 },
    { id: 'rgba', label: 'RGBA', icon: Pipette },
    { id: 'aniport', label: 'AniPort', icon: Film },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'filehandler', label: 'File Handler', icon: Files },
    { id: 'bumpath', label: 'Bumpath', icon: Route },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
    const page = useNavigationStore((s) => s.page);
    const setPage = useNavigationStore((s) => s.setPage);

    return (
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 bg-[#101016] p-2">
            {ITEMS.map(({ id, label, icon: Icon }) => {
                const active = page === id;
                return (
                    <button
                        key={id}
                        onClick={() => setPage(id)}
                        className={`flex items-center gap-2.5 rounded px-3 py-2 text-left text-sm ${
                            active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                        }`}
                    >
                        <Icon size={16} className="shrink-0" />
                        <span className="truncate">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
