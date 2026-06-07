import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useConfigStore } from '@/lib/stores';
import { getAppHome } from '@/lib/api';
import { log } from '@/lib/util/logger';
import type { QuartzSettings } from '@/lib/types';

function PathField({
    label, value, onPick, onClear,
}: {
    label: string;
    value: string | null;
    onPick: () => void;
    onClear: () => void;
}) {
    return (
        <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/40">{label}</label>
            <div className="flex gap-2">
                <input
                    readOnly
                    value={value ?? ''}
                    placeholder="Not set"
                    className="flex-1 rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white/80"
                />
                <button onClick={onPick} className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
                    Browse
                </button>
                {value && (
                    <button onClick={onClear} className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}

export function Settings() {
    const settings = useConfigStore((s) => s.settings);
    const update = useConfigStore((s) => s.update);
    const [home, setHome] = useState<string | null>(null);

    const pickFolder = async (key: 'leaguePath' | 'championsPath' | 'wadOutputPath') => {
        const picked = await open({ directory: true, multiple: false });
        if (typeof picked === 'string') update({ [key]: picked } as Partial<QuartzSettings>);
    };

    const showHome = async () => {
        try {
            setHome(await getAppHome());
        } catch (e) {
            log.error('getAppHome failed', e);
        }
    };

    return (
        <div className="max-w-2xl space-y-6">
            <h1 className="text-xl font-semibold">Settings</h1>

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-white/70">Creator</h2>
                <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-white/40">Name</label>
                    <input
                        value={settings.creatorName ?? ''}
                        onChange={(e) => update({ creatorName: e.target.value || null })}
                        placeholder="Your name"
                        className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white/80"
                    />
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-white/70">Paths</h2>
                <PathField
                    label="League of Legends"
                    value={settings.leaguePath}
                    onPick={() => pickFolder('leaguePath')}
                    onClear={() => update({ leaguePath: null })}
                />
                <PathField
                    label="Champions Folder"
                    value={settings.championsPath}
                    onPick={() => pickFolder('championsPath')}
                    onClear={() => update({ championsPath: null })}
                />
                <PathField
                    label="WAD Output"
                    value={settings.wadOutputPath}
                    onPick={() => pickFolder('wadOutputPath')}
                    onClear={() => update({ wadOutputPath: null })}
                />
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-white/70">Updates</h2>
                <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                        type="checkbox"
                        checked={settings.autoUpdateEnabled}
                        onChange={(e) => update({ autoUpdateEnabled: e.target.checked })}
                    />
                    Check for updates automatically
                </label>
            </section>

            <section className="space-y-2">
                <button onClick={showHome} className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
                    Show app data folder
                </button>
                {home && <p className="break-all text-xs text-white/50">{home}</p>}
            </section>
        </div>
    );
}
