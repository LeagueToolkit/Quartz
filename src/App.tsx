import { useNavigationStore } from '@/lib/stores';
import { getAppInfo } from '@/lib/api';
import { useEffect, useState } from 'react';
import type { AppInfo } from '@/lib/types';

const PAGES = ['Home', 'Settings'] as const;

export function App() {
    const page = useNavigationStore((s) => s.page);
    const setPage = useNavigationStore((s) => s.setPage);
    const [info, setInfo] = useState<AppInfo | null>(null);

    useEffect(() => {
        getAppInfo().then(setInfo).catch((e) => console.error(e));
    }, []);

    return (
        <div className="flex h-full">
            <nav className="w-48 shrink-0 border-r border-white/10 p-3 space-y-1">
                {PAGES.map((p) => (
                    <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`block w-full text-left px-3 py-2 rounded ${
                            page === p ? 'bg-white/15' : 'hover:bg-white/5'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </nav>
            <main className="flex-1 p-6">
                <h1 className="text-xl font-semibold">{page}</h1>
                <p className="mt-2 text-sm text-white/60">
                    Quartz-Rust scaffold. Backend says:{' '}
                    {info ? `${info.name} v${info.version}` : '…'}
                </p>
            </main>
        </div>
    );
}
