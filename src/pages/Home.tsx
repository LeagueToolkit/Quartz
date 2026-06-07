import { useEffect, useState } from 'react';
import {
    Brush, ArrowLeftRight, FolderInput, Pipette, Code, FolderSearch,
    type LucideIcon,
} from 'lucide-react';
import { getAppInfo } from '@/lib/api';
import { useNavigationStore, useConfigStore, type Page } from '@/lib/stores';
import type { AppInfo } from '@/lib/types';

interface Tile { id: Page; label: string; desc: string; icon: LucideIcon; }

const TILES: Tile[] = [
    { id: 'paint', label: 'Paint', desc: 'Recolor particle effects', icon: Brush },
    { id: 'port', label: 'Port', desc: 'Transfer VFX between skins', icon: ArrowLeftRight },
    { id: 'extractor', label: 'Asset Extractor', desc: 'Pull assets from WADs', icon: FolderInput },
    { id: 'bineditor', label: 'Bin Editor', desc: 'Scale & tweak parameters', icon: Code },
    { id: 'wadexplorer', label: 'WAD Explorer', desc: 'Browse game files', icon: FolderSearch },
    { id: 'rgba', label: 'RGBA', desc: 'League color codes', icon: Pipette },
];

export function Home() {
    const setPage = useNavigationStore((s) => s.setPage);
    const leaguePath = useConfigStore((s) => s.settings.leaguePath);
    const [info, setInfo] = useState<AppInfo | null>(null);

    useEffect(() => { getAppInfo().then(setInfo).catch(() => {}); }, []);

    return (
        <div className="mx-auto max-w-5xl">
            <section className="q-glass relative overflow-hidden p-8">
                <div
                    className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
                    style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
                />
                <div className="relative">
                    <p className="text-xs font-medium uppercase tracking-[0.3em] text-[color:var(--accent)]">
                        League of Legends Modding Suite
                    </p>
                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Quartz</h1>
                    <p className="mt-2 max-w-md text-sm text-white/50">
                        Recolor, port, and edit VFX — rebuilt on Tauri + Rust.
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-xs text-white/40">
                        {info && <span>v{info.version}</span>}
                        <span className="flex items-center gap-1.5">
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: leaguePath ? 'var(--accent-green)' : '#6b7280' }}
                            />
                            {leaguePath ? 'League path set' : 'League path not set'}
                        </span>
                    </div>
                </div>
            </section>

            <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wide text-white/40">Quick launch</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TILES.map(({ id, label, desc, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setPage(id)}
                        className="q-glass group flex items-start gap-3 p-4 text-left transition hover:-translate-y-0.5"
                    >
                        <div
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition group-hover:scale-105"
                            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                        >
                            <Icon size={19} />
                        </div>
                        <div className="min-w-0">
                            <div className="font-medium text-white/90">{label}</div>
                            <div className="truncate text-xs text-white/45">{desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
