import {
    Brush, ArrowLeftRight, Code, Image, PackageOpen,
    Waypoints, Shuffle, Maximize, Pipette, FileDigit, Wrench, Music, Sparkles, Dices,
    Settings as SettingsIcon, type LucideIcon,
} from 'lucide-react';
import { useNavigationStore, useUiPrefsStore, type Page } from '@/lib/stores';

// Paint and Port always appear, like the original Quartz nav.
export const ALWAYS_VISIBLE: Page[] = ['paint', 'port'];

export interface NavItem {
    id: Page;
    label: string;
    icon: LucideIcon;
}

// Order + icons mirror the original Quartz nav rail.
export const ITEMS: NavItem[] = [
    { id: 'paint', label: 'Paint', icon: Brush },
    { id: 'port', label: 'Port', icon: ArrowLeftRight },
    { id: 'bineditor', label: 'Bin Editor', icon: Code },
    { id: 'assetextractor', label: 'Asset Extractor', icon: PackageOpen },
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

// Settings is always the bottom-anchored item, shared by the rail and the
// collapsed topbar so both surfaces expose it identically.
export const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Settings', icon: SettingsIcon };

// The rail's resolved visible list (honoring pageVisibility) — reused by the
// collapsed topbar so both surfaces show the exact same items in the same order.
export function visibleNavItems(pageVisibility: Partial<Record<Page, boolean>>): NavItem[] {
    return ITEMS.filter((i) => ALWAYS_VISIBLE.includes(i.id) || pageVisibility[i.id] !== false);
}

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
    const visible = visibleNavItems(pageVisibility);

    return (
        <nav className="q-rail shrink-0">
            <div className="q-rail-group q-rail-scroll">
                {visible.map((item) => <NavBtn key={item.id} item={item} />)}
            </div>
            <div className="q-rail-group q-rail-bottom">
                <NavBtn item={SETTINGS_ITEM} />
            </div>
        </nav>
    );
}
