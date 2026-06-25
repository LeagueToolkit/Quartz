import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { Update } from '@tauri-apps/plugin-updater';
import { Download, RefreshCw, FolderOpen } from 'lucide-react';
import { FormGroup, StatusBadge, Button, ToggleSwitch, InputWithButton } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';
import { getHashStatus, downloadHashes, getAppInfo, type HashStatus } from '@/lib/api';
import { checkForUpdate, installUpdate } from '@/lib/api/updater';
import { log } from '@/lib/util/logger';

export function ToolsSection() {
    const communicateWithJade = useUiPrefsStore((s) => s.communicateWithJade);
    const jadePath = useUiPrefsStore((s) => s.jadeExecutablePath);
    const useNative = useUiPrefsStore((s) => s.useNativeFileBrowser);
    const set = useUiPrefsStore((s) => s.set);

    const [hashStatus, setHashStatus] = useState<HashStatus | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [hashMessage, setHashMessage] = useState<string | null>(null);

    const [checking, setChecking] = useState(false);
    const [pending, setPending] = useState<Update | null>(null);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);

    const [version, setVersion] = useState('');

    const refreshHashes = () => getHashStatus().then(setHashStatus).catch((e) => log.error('getHashStatus', e));
    useEffect(() => {
        refreshHashes();
        getAppInfo().then((i) => setVersion(i.version)).catch(() => {});
    }, []);

    const browseJade = async () => {
        const picked = await open({ multiple: false, filters: [{ name: 'Jade', extensions: ['exe'] }] });
        if (typeof picked === 'string') set('jadeExecutablePath', picked);
    };

    const doDownloadHashes = async () => {
        setDownloading(true); setHashMessage(null);
        try {
            const r = await downloadHashes(false);
            setHashMessage(`${r.downloaded} downloaded, ${r.skipped} up to date${r.errors ? `, ${r.errors} failed` : ''}.`);
            await refreshHashes();
        } catch (e) { log.error('downloadHashes', e); setHashMessage('Download failed.'); }
        finally { setDownloading(false); }
    };

    const checkUpdate = async () => {
        setChecking(true); setUpdateMessage('Checking…');
        try {
            const { info, update } = await checkForUpdate();
            setPending(update);
            setUpdateMessage(info.available ? `Update available: v${info.version}` : 'You are up to date.');
        } catch (e) { log.error('checkForUpdate', e); setUpdateMessage('Update check failed.'); }
        finally { setChecking(false); }
    };

    const hashCountLabel = hashStatus
        ? hashStatus.present
            ? `Hash databases present (~${hashStatus.loadedCount.toLocaleString()} entries)`
            : 'Hash databases not downloaded yet'
        : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Jade Interop" description="Control whether Quartz communicates with Jade">
                <ToggleSwitch label="Communicate with Jade" checked={communicateWithJade} onChange={(c) => set('communicateWithJade', c)} />
            </FormGroup>

            <FormGroup label="Jade Executable Path" description="Optional override for Jade location (select Jade.exe)">
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    <InputWithButton
                        value={jadePath}
                        onChange={(e) => set('jadeExecutablePath', e.target.value)}
                        placeholder="C:\\Users\\<user>\\AppData\\Local\\Jade\\Jade.exe"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseJade}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Leave empty to use auto-detection.
                    </div>
                </div>
            </FormGroup>

            <FormGroup label="File Browser" description="Choose between custom or native Windows file browser">
                <label className="dl-check">
                    <input type="checkbox" checked={useNative} onChange={(e) => set('useNativeFileBrowser', e.target.checked)} />
                    <span className="dl-check__box">
                        <span className="dl-check__tick">
                            <span className="dl-icon">
                                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-6" /></svg>
                            </span>
                        </span>
                    </span>
                    <span>Use native Windows file dialog instead of custom explorer</span>
                </label>
            </FormGroup>

            <FormGroup label="Hash Files" description="Manage hash file downloads and updates">
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    {hashStatus && (
                        <div style={{ marginBottom: '12px' }}>
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
                    {hashMessage && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>{hashMessage}</div>}
                </div>
            </FormGroup>

            <FormGroup label="Updates" description="Check for new Quartz versions">
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {version && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Version: {version}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button icon={checking ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />} variant="secondary" onClick={checkUpdate} disabled={checking}>
                            {checking ? 'Checking...' : 'Check for Updates'}
                        </Button>
                        {pending && (
                            <Button icon={<Download size={16} />} variant="primary" onClick={() => installUpdate(pending).catch((e) => { log.error('installUpdate', e); setUpdateMessage('Install failed.'); })}>
                                Install & Restart
                            </Button>
                        )}
                    </div>
                    {updateMessage && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{updateMessage}</div>}
                </div>
            </FormGroup>
        </div>
    );
}
