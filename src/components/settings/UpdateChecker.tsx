import { useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { useConfigStore } from '@/lib/stores';
import { checkForUpdate, installUpdate } from '@/lib/api/updater';
import { log } from '@/lib/util/logger';

export function UpdateChecker() {
    const settings = useConfigStore((s) => s.settings);
    const update = useConfigStore((s) => s.update);

    const [checking, setChecking] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [pending, setPending] = useState<Update | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const check = async () => {
        setChecking(true);
        setMessage('Checking for updates…');
        try {
            const { info, update: upd } = await checkForUpdate();
            setPending(upd);
            setMessage(info.available ? `Update available: v${info.version}` : 'You are up to date.');
        } catch (e) {
            log.error('checkForUpdate', e);
            setMessage('Update check failed. See logs.');
        } finally {
            setChecking(false);
        }
    };

    const install = async () => {
        if (!pending) return;
        setInstalling(true);
        setMessage('Downloading and installing…');
        try {
            await installUpdate(pending);
        } catch (e) {
            log.error('installUpdate', e);
            setMessage('Install failed. See logs.');
            setInstalling(false);
        }
    };

    return (
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

            <div className="flex items-center gap-2">
                <button
                    onClick={check}
                    disabled={checking || installing}
                    className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
                >
                    Check now
                </button>
                {pending && (
                    <button
                        onClick={install}
                        disabled={installing}
                        className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                    >
                        Install & restart
                    </button>
                )}
            </div>
            {message && <p className="text-xs text-white/50">{message}</p>}
        </section>
    );
}
