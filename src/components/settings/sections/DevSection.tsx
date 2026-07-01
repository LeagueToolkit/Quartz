import { useEffect, useState } from 'react';
import { FlaskConical, Download, RefreshCw, Database, ImageUpscale, CheckCircle2, XCircle } from 'lucide-react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { FormGroup, Button } from '../primitives';
import {
    getHashStatus, downloadHashes, type HashStatus,
    upscaleCheckStatus, upscaleDownloadAll, type UpscaleStatus,
} from '@/lib/api';
import { log } from '@/lib/util/logger';

/* Dev-only panel. Gated behind import.meta.env.DEV in Settings so it never
   ships in a release build. Bundles the Design Lab launcher plus manual
   triggers for the one-time download flows (hash LMDBs, upscale binary +
   models) so they can be tested on demand without waiting for the automatic
   first-run prompts. */

async function openDesignLab() {
    const existing = await WebviewWindow.getByLabel('design-lab');
    if (existing) { await existing.setFocus(); return; }
    const win = new WebviewWindow('design-lab', {
        url: 'index.html?lab',
        title: 'Quartz — Design Lab',
        width: 1180,
        height: 860,
        resizable: true,
    });
    win.once('tauri://error', (e) => log.error('Design Lab window failed', String(e)));
}

const card: React.CSSProperties = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '16px',
    display: 'flex', flexDirection: 'column', gap: '12px',
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
            background: ok ? 'color-mix(in oklab, var(--color-success) 15%, transparent)' : 'color-mix(in oklab, var(--text-muted) 15%, transparent)',
            color: ok ? 'var(--color-success)' : 'var(--text-muted)',
            border: `1px solid ${ok ? 'color-mix(in oklab, var(--color-success) 35%, transparent)' : 'var(--border)'}`,
        }}>
            {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {label}
        </span>
    );
}

// Thin animated bar reused by both download triggers.
function ProgressLine({ pct, label }: { pct: number; label?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div className="dl-progress"><div className="dl-progress__fill" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} /></div>
            {label && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>}
        </div>
    );
}

function HashCard() {
    const [status, setStatus] = useState<HashStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const refresh = () => getHashStatus().then(setStatus).catch((e) => log.error('getHashStatus failed', String(e)));
    useEffect(() => { refresh(); }, []);

    const run = async (force: boolean) => {
        setBusy(true); setResult(null);
        try {
            const r = await downloadHashes(force);
            setResult(`downloaded ${r.downloaded}, skipped ${r.skipped}, errors ${r.errors}`);
            await refresh();
        } catch (e) {
            setResult(`failed: ${String((e as Error)?.message || e)}`);
            log.error('downloadHashes failed', String(e));
        } finally { setBusy(false); }
    };

    return (
        <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--accent-primary)', display: 'inline-flex' }}><Database size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Hash Databases</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {status ? `~${status.loadedCount.toLocaleString()} entries · ${status.dir}` : 'checking…'}
                    </div>
                </div>
                <StatusPill ok={!!status?.present} label={status?.present ? 'Installed' : 'Missing'} />
            </div>
            {busy && <ProgressLine pct={100} label="downloading LMDBs…" />}
            {result && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{result}</span>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button icon={<Download size={16} />} variant="primary" disabled={busy} onClick={() => run(false)}>
                    {busy ? 'Downloading…' : 'Download / Sync'}
                </Button>
                <Button icon={<RefreshCw size={16} />} variant="secondary" disabled={busy} onClick={() => run(true)}>Force Re-download</Button>
            </div>
        </div>
    );
}

function UpscaleCard() {
    const [status, setStatus] = useState<UpscaleStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [pct, setPct] = useState(0);
    const [step, setStep] = useState('');
    const [result, setResult] = useState<string | null>(null);

    const refresh = () => upscaleCheckStatus().then(setStatus).catch((e) => log.error('upscaleCheckStatus failed', String(e)));
    useEffect(() => { refresh(); }, []);

    const run = async () => {
        setBusy(true); setResult(null); setPct(0); setStep('starting…');
        const unlisten = await listen<{ step: string; message: string; progress: number }>('upscale:progress', (e) => {
            setPct(Math.round(e.payload.progress));
            setStep(e.payload.message || e.payload.step);
        });
        try {
            const msg = await upscaleDownloadAll();
            setResult(msg);
            await refresh();
        } catch (e) {
            setResult(`failed: ${String((e as Error)?.message || e)}`);
            log.error('upscaleDownloadAll failed', String(e));
        } finally { unlisten(); setBusy(false); }
    };

    const binOk = !!status?.binary.installed;
    const modelsOk = (status?.models.installed.length ?? 0) > 0;

    return (
        <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--accent-primary)', display: 'inline-flex' }}><ImageUpscale size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Upscale Binary + Models</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {status ? `${status.models.installed.length}/${status.models.total} models` : 'checking…'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <StatusPill ok={binOk} label={binOk ? 'Binary' : 'No binary'} />
                    <StatusPill ok={modelsOk} label={modelsOk ? 'Models' : 'No models'} />
                </div>
            </div>
            {busy && <ProgressLine pct={pct} label={step} />}
            {result && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{result}</span>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button icon={<Download size={16} />} variant="primary" disabled={busy} onClick={run}>
                    {busy ? `Downloading… ${pct}%` : 'Download All'}
                </Button>
            </div>
        </div>
    );
}

export function DevSection() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--color-warning)',
                background: 'color-mix(in oklab, var(--color-warning) 12%, transparent)',
                border: '1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)',
            }}>
                Development build only — this panel is hidden in release builds.
            </div>

            <FormGroup label="Design Lab" description="Window showcasing every standardized UI element (buttons, inputs, sliders, toggles, modals)">
                <Button icon={<FlaskConical size={16} />} variant="secondary" onClick={() => openDesignLab().catch((e) => log.error('openDesignLab failed', String(e)))}>
                    Open Design Lab
                </Button>
            </FormGroup>

            <FormGroup label="First-run Downloads" description="Manually trigger the one-time download flows to test them">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <HashCard />
                    <UpscaleCard />
                </div>
            </FormGroup>
        </div>
    );
}
