import { useEffect, useState } from 'react';
import { getHashStatus, downloadHashes, type HashStatus } from '@/lib/api';
import { log } from '@/lib/util/logger';

function formatSize(bytes: number): string {
    if (bytes <= 0) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function HashManager() {
    const [status, setStatus] = useState<HashStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = () => getHashStatus().then(setStatus).catch((e) => log.error('getHashStatus', e));

    useEffect(() => {
        refresh();
    }, []);

    const download = async (force: boolean) => {
        setBusy(true);
        setMessage('Downloading hash files…');
        try {
            const r = await downloadHashes(force);
            setMessage(`Done — ${r.downloaded} downloaded, ${r.skipped} up to date${r.errors.length ? `, ${r.errors.length} failed` : ''}.`);
            await refresh();
        } catch (e) {
            log.error('downloadHashes', e);
            setMessage('Download failed. See logs.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-medium text-white/70">Hashes</h2>
            <p className="text-xs text-white/40">
                League asset hash lists from CommunityDragon. Required for WAD extraction and repathing.
            </p>

            {status && (
                <div className="space-y-1 rounded border border-white/10 bg-black/20 p-3">
                    {status.files.map((f) => (
                        <div key={f.name} className="flex items-center justify-between text-xs">
                            <span className={f.present ? 'text-white/70' : 'text-white/40'}>
                                {f.present ? '✓' : '○'} {f.name}
                            </span>
                            <span className="text-white/40">{formatSize(f.size)}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button
                    onClick={() => download(false)}
                    disabled={busy}
                    className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
                >
                    Download missing
                </button>
                <button
                    onClick={() => download(true)}
                    disabled={busy}
                    className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                    Re-download all
                </button>
            </div>
            {message && <p className="text-xs text-white/50">{message}</p>}
        </section>
    );
}
