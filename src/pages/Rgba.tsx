import { useMemo, useState } from 'react';
import { Pipette, Copy, Check } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }
function hex2(n: number) { return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'); }

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function Rgba() {
    const [rgb, setRgb] = useState({ r: 236, g: 185, b: 106 });
    const [alpha, setAlpha] = useState(1);
    const [copied, setCopied] = useState<string | null>(null);

    const hex = useMemo(() => `#${hex2(rgb.r)}${hex2(rgb.g)}${hex2(rgb.b)}`, [rgb]);
    const vec4 = useMemo(() => {
        const f = (n: number) => (n / 255).toFixed(3);
        return `{ ${f(rgb.r)}, ${f(rgb.g)}, ${f(rgb.b)}, ${alpha.toFixed(3)} }`;
    }, [rgb, alpha]);

    const copy = (label: string, value: string) => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(label);
            setTimeout(() => setCopied(null), 1200);
        }).catch(() => {});
    };

    const setChannel = (k: 'r' | 'g' | 'b', v: string) =>
        setRgb((p) => ({ ...p, [k]: clamp(parseInt(v || '0', 10) || 0, 0, 255) }));

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader icon={Pipette} title="RGBA" subtitle="Convert colors to League vec4 codes" />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
                <Card className="flex flex-col items-center gap-4">
                    <div
                        className="h-40 w-40 rounded-2xl border border-white/10 shadow-inner"
                        style={{
                            background: `linear-gradient(135deg, rgba(${rgb.r},${rgb.g},${rgb.b},${alpha}), rgba(${rgb.r},${rgb.g},${rgb.b},${alpha}))`,
                        }}
                    />
                    <input
                        type="color"
                        value={hex}
                        onChange={(e) => { const c = hexToRgb(e.target.value); if (c) setRgb(c); }}
                        className="h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                </Card>

                <Card className="space-y-4">
                    <Field label="Hex">
                        <input
                            value={hex}
                            onChange={(e) => { const c = hexToRgb(e.target.value); if (c) setRgb(c); }}
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/90"
                        />
                    </Field>

                    <div className="grid grid-cols-3 gap-3">
                        {(['r', 'g', 'b'] as const).map((k) => (
                            <Field key={k} label={k.toUpperCase()}>
                                <input
                                    type="number" min={0} max={255} value={rgb[k]}
                                    onChange={(e) => setChannel(k, e.target.value)}
                                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/90"
                                />
                            </Field>
                        ))}
                    </div>

                    <Field label={`Alpha — ${alpha.toFixed(3)}`}>
                        <input
                            type="range" min={0} max={1} step={0.001} value={alpha}
                            onChange={(e) => setAlpha(parseFloat(e.target.value))}
                            className="w-full accent-[color:var(--accent)]"
                        />
                    </Field>

                    <div>
                        <div className="mb-1 text-xs uppercase tracking-wide text-white/40">League vec4</div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-[color:var(--accent)]">
                                {vec4}
                            </code>
                            <button
                                onClick={() => copy('vec4', vec4)}
                                className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-white/70 hover:bg-white/10"
                                title="Copy"
                            >
                                {copied === 'vec4' ? <Check size={15} className="text-[color:var(--accent-green)]" /> : <Copy size={15} />}
                            </button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/40">{label}</span>
            {children}
        </label>
    );
}
