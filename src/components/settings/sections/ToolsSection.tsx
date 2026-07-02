import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Download, FolderOpen, Search, FolderTree, Terminal, Database, ImageUpscale, PackageOpen } from 'lucide-react';
import { desktopDir } from '@tauri-apps/api/path';
import { FormGroup, StatusBadge, Button, InputWithButton, cardSurface } from '../primitives';
import { useUiPrefsStore, useConfigStore, useNavigationStore } from '@/lib/stores';
import {
    getHashStatus, downloadHashes, getLeaguePath, type HashStatus,
    upscaleCheckStatus, upscaleDownloadAll, type UpscaleStatus,
} from '@/lib/api';
import { log } from '@/lib/util/logger';

export function ToolsSection() {
    const jadePath = useUiPrefsStore((s) => s.jadeExecutablePath);
    const set = useUiPrefsStore((s) => s.set);

    const leaguePath = useConfigStore((s) => s.settings.leaguePath) || '';
    const wadOutputPath = useConfigStore((s) => s.settings.wadOutputPath) || '';
    const update = useConfigStore((s) => s.update);

    // Deep-link highlight: when arriving from the Upscaler's "Install in Settings",
    // scroll the AI models card into view and briefly flash it.
    const highlightTarget = useNavigationStore((s) => s.settingsTarget?.highlight);
    const clearTarget = useNavigationStore((s) => s.clearSettingsTarget);
    const upscaleCardRef = useRef<HTMLDivElement>(null);
    const [flashUpscale, setFlashUpscale] = useState(false);

    useEffect(() => {
        if (highlightTarget !== 'upscale') return;
        upscaleCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFlashUpscale(true);
        const off = setTimeout(() => setFlashUpscale(false), 2000);
        clearTarget();
        return () => clearTimeout(off);
    }, [highlightTarget, clearTarget]);

    const [detectStatus, setDetectStatus] = useState<null | 'loading' | 'success' | 'error'>(null);
    const [detectMessage, setDetectMessage] = useState('');

    const [hashStatus, setHashStatus] = useState<HashStatus | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [hashMessage, setHashMessage] = useState<string | null>(null);

    const refreshHashes = () => getHashStatus().then(setHashStatus).catch((e) => log.error('getHashStatus', e));
    useEffect(() => { refreshHashes(); }, []);

    const autoDetect = async () => {
        setDetectStatus('loading'); setDetectMessage('Scanning…');
        try {
            const detected = await getLeaguePath();
            if (detected) {
                await update({ leaguePath: detected });
                setDetectStatus('success'); setDetectMessage('Found!');
            } else {
                setDetectStatus('error'); setDetectMessage('Could not find League folder');
            }
        } catch (e) {
            log.error('autoDetectLeaguePath', e);
            setDetectStatus('error'); setDetectMessage('Detection failed');
        }
        setTimeout(() => { setDetectStatus(null); setDetectMessage(''); }, 3000);
    };

    const browseLeague = async () => {
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string' && dir) await update({ leaguePath: dir });
    };

    const browseJade = async () => {
        const picked = await open({ multiple: false, filters: [{ name: 'Jade', extensions: ['exe'] }] });
        if (typeof picked === 'string') set('jadeExecutablePath', picked);
    };

    const browseWadOutput = async () => {
        const dir = await open({ directory: true, multiple: false });
        if (typeof dir === 'string' && dir) await update({ wadOutputPath: dir });
    };

    // Default the extraction output to the user's Desktop when it's still unset,
    // so the Asset Extractor has a valid target out of the box.
    useEffect(() => {
        if (wadOutputPath) return;
        let cancelled = false;
        desktopDir()
            .then((dir) => { if (!cancelled && dir) void update({ wadOutputPath: dir }); })
            .catch((e) => log.error('desktopDir default', e));
        return () => { cancelled = true; };
    }, [wadOutputPath, update]);

    const doDownloadHashes = async () => {
        setDownloading(true); setHashMessage(null);
        try {
            const r = await downloadHashes(false);
            setHashMessage(`${r.downloaded} downloaded, ${r.skipped} up to date${r.errors ? `, ${r.errors} failed` : ''}.`);
            await refreshHashes();
        } catch (e) { log.error('downloadHashes', e); setHashMessage('Download failed.'); }
        finally { setDownloading(false); }
    };

    const statusColor = detectStatus === 'success'
        ? 'var(--color-success)'
        : detectStatus === 'error' ? 'var(--color-danger)' : 'var(--text-secondary)';

    const hashCountLabel = hashStatus
        ? hashStatus.present
            ? `Hash databases present (~${hashStatus.loadedCount.toLocaleString()} entries)`
            : 'Hash databases not downloaded yet'
        : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormGroup label="League Install Path" icon={<FolderTree size={15} />}>
                <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <InputWithButton
                        value={leaguePath}
                        onChange={(e) => update({ leaguePath: e.target.value })}
                        placeholder="C:\\Riot Games\\League of Legends"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseLeague}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Button icon={<Search size={16} />} variant="secondary" onClick={autoDetect} disabled={detectStatus === 'loading'}>
                            {detectStatus === 'loading' ? 'Scanning…' : 'Auto Detect'}
                        </Button>
                        {detectMessage && detectStatus !== 'loading' && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor }}>{detectMessage}</span>
                        )}
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="WAD Extraction Output Path" icon={<PackageOpen size={15} />}>
                <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <InputWithButton
                        value={wadOutputPath}
                        onChange={(e) => update({ wadOutputPath: e.target.value })}
                        placeholder="C:\\Users\\<user>\\Desktop"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseWadOutput}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Where the Asset Extractor writes extracted skins. Defaults to your Desktop.
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="Jade Executable Path" icon={<Terminal size={15} />}>
                <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <InputWithButton
                        value={jadePath}
                        onChange={(e) => set('jadeExecutablePath', e.target.value)}
                        placeholder="C:\\Users\\<user>\\AppData\\Local\\Jade\\Jade.exe"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseJade}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Leave empty to use auto-detection.
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="Hash Files" icon={<Database size={15} />}>
                <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {hashStatus && (
                        <div>
                            <StatusBadge
                                status={hashStatus.present ? 'success' : 'warning'}
                                text={hashCountLabel}
                            />
                            {hashStatus.lastUpdated && (
                                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    Updated {new Date(hashStatus.lastUpdated).toLocaleString()}
                                </div>
                            )}
                        </div>
                    )}
                    <Button icon={<Download size={16} />} fullWidth variant="secondary" onClick={doDownloadHashes} disabled={downloading}>
                        {downloading ? 'Downloading...' : 'Download / Update Hashes'}
                    </Button>
                    {hashMessage && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{hashMessage}</div>}
                </div>
            </FormGroup>

            <div ref={upscaleCardRef} className={flashUpscale ? 'settings-flash' : undefined}>
                <FormGroup label="AI Upscale Models" icon={<ImageUpscale size={15} />}>
                    <UpscaleCard />
                </FormGroup>
            </div>
        </div>
    );
}

/* The Upscayl binary + models downloader. Lives here (External Tools) so it's
   available in release builds — the AI Image Upscaler links users here when the
   binary isn't installed. */
function UpscaleCard() {
    const [status, setStatus] = useState<UpscaleStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [pct, setPct] = useState(0);
    const [step, setStep] = useState('');
    const [message, setMessage] = useState<string | null>(null);

    const refresh = () => upscaleCheckStatus().then(setStatus).catch((e) => log.error('upscaleCheckStatus', e));
    useEffect(() => { refresh(); }, []);

    const run = async () => {
        setBusy(true); setMessage(null); setPct(0); setStep('starting…');
        const unlisten = await listen<{ step: string; message: string; progress: number }>('upscale:progress', (e) => {
            setPct(Math.round(e.payload.progress));
            setStep(e.payload.message || e.payload.step);
        });
        try {
            await upscaleDownloadAll();
            setMessage('Components installed.');
            await refresh();
        } catch (e) {
            setMessage(`Download failed: ${String((e as Error)?.message || e)}`);
            log.error('upscaleDownloadAll', e);
        } finally { unlisten(); setBusy(false); }
    };

    const binOk = !!status?.binary.installed;
    const allModels = binOk && (status?.models.installed.length ?? 0) === (status?.models.total ?? 0);
    const modelLabel = status
        ? binOk
            ? `Upscayl ready (${status.models.installed.length}/${status.models.total} models)`
            : 'Upscayl binary not downloaded yet'
        : '';

    return (
        <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {status && <StatusBadge status={binOk ? 'success' : 'warning'} text={modelLabel} />}
            {busy && (
                <div>
                    <div className="dl-progress"><div className="dl-progress__fill" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} /></div>
                    {step && <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{step}</div>}
                </div>
            )}
            <Button icon={<Download size={16} />} fullWidth variant="secondary" onClick={run} disabled={busy || allModels}>
                {busy ? `Downloading… ${pct}%` : binOk ? 'Update Components' : 'Download Components (~200MB)'}
            </Button>
            {message && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{message}</div>}
        </div>
    );
}
