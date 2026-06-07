import { useEffect, useState } from 'react';
import { getAppInfo } from '@/lib/api';
import type { AppInfo } from '@/lib/types';

export function Home() {
    const [info, setInfo] = useState<AppInfo | null>(null);

    useEffect(() => {
        getAppInfo().then(setInfo).catch(() => {});
    }, []);

    return (
        <div className="space-y-2">
            <h1 className="text-xl font-semibold">Quartz</h1>
            <p className="text-sm text-white/60">
                League of Legends Modding Suite — Tauri rebuild.
            </p>
            {info && (
                <p className="text-xs text-white/40">
                    {info.name} v{info.version}
                </p>
            )}
        </div>
    );
}
