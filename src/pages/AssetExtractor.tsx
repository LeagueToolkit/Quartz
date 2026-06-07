import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderInput, Search, Loader2, FolderOpen } from 'lucide-react';
import { PageHeader, Card, Button } from '@/components/ui';
import { discoverChampions, extractChampionAssets, type Champion } from '@/lib/api';
import { useConfigStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';

export function AssetExtractor() {
    const wadOutput = useConfigStore((s) => s.settings.wadOutputPath);
    const updateConfig = useConfigStore((s) => s.update);

    const [champions, setChampions] = useState<Champion[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Champion | null>(null);
    const [skinId, setSkinId] = useState(0);
    const [extracting, setExtracting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        discoverChampions()
            .then(setChampions)
            .catch((e) => log.error('discoverChampions', e))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(
        () => champions.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
        [champions, query],
    );

    const pickOutput = async () => {
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string') updateConfig({ wadOutputPath: dir });
    };

    const extract = async () => {
        if (!selected || !wadOutput) return;
        setExtracting(true);
        setMessage(null);
        try {
            const r = await extractChampionAssets(selected.id, skinId, wadOutput);
            setMessage(`Extracted ${selected.name} (skin ${skinId}) → ${r.outputDir} [stub]`);
        } catch (e) {
            log.error('extractChampionAssets', e);
            setMessage('Extraction failed. See logs.');
        } finally {
            setExtracting(false);
        }
    };

    return (
        <div className="mx-auto flex h-full max-w-6xl flex-col">
            <PageHeader
                icon={FolderInput}
                title="Asset Extractor"
                subtitle="Extract champion assets from game WADs"
                actions={
                    <Button onClick={pickOutput} variant="ghost">
                        <FolderOpen size={15} />
                        {wadOutput ? 'Change output' : 'Set output folder'}
                    </Button>
                }
            />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                <Card className="flex min-h-0 flex-col">
                    <div className="relative mb-3">
                        <Search size={15} className="absolute left-3 top-2.5 text-white/35" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search champions…"
                            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white/90"
                        />
                    </div>

                    {loading ? (
                        <div className="flex flex-1 items-center justify-center text-white/40">
                            <Loader2 className="animate-spin" size={20} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                            {filtered.map((c) => {
                                const active = selected?.id === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => { setSelected(c); setSkinId(0); }}
                                        className={`rounded-lg border p-3 text-left transition ${
                                            active ? 'border-[color:var(--accent)] bg-white/5' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'
                                        }`}
                                    >
                                        <div className="truncate font-medium text-white/90">{c.name}</div>
                                        <div className="text-xs text-white/40">{c.skinCount} skins</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card className="flex flex-col">
                    <h3 className="mb-3 text-sm font-medium text-white/70">Extraction</h3>
                    {selected ? (
                        <div className="space-y-4">
                            <div>
                                <div className="text-xs uppercase tracking-wide text-white/40">Champion</div>
                                <div className="text-lg font-semibold text-white">{selected.name}</div>
                            </div>
                            <label className="block space-y-1">
                                <span className="text-xs uppercase tracking-wide text-white/40">Skin ID</span>
                                <input
                                    type="number" min={0} max={selected.skinCount} value={skinId}
                                    onChange={(e) => setSkinId(Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/90"
                                />
                            </label>
                            <div>
                                <div className="text-xs uppercase tracking-wide text-white/40">Output</div>
                                <div className="truncate text-sm text-white/55">{wadOutput ?? 'Not set'}</div>
                            </div>
                            <Button onClick={extract} variant="accent" disabled={!wadOutput || extracting} className="w-full justify-center">
                                {extracting ? <Loader2 size={15} className="animate-spin" /> : <FolderInput size={15} />}
                                {extracting ? 'Extracting…' : 'Extract'}
                            </Button>
                            {!wadOutput && <p className="text-xs text-amber-400/80">Set an output folder first.</p>}
                            {message && <p className="text-xs text-white/55">{message}</p>}
                        </div>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-center text-sm text-white/35">
                            Select a champion to begin.
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
