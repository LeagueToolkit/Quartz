import { useEffect, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { Download, RefreshCw, Plug, PanelLeftClose, FolderOpen, ListTree, SlidersHorizontal } from 'lucide-react';
import { FormGroup, Button, CardRow, Switch, cardSurface } from '../primitives';
import { useConfigStore, useUiPrefsStore } from '@/lib/stores';
import { getAppInfo } from '@/lib/api';
import { checkForUpdate, installUpdate } from '@/lib/api/updater';
import { log } from '@/lib/util/logger';

export function GeneralSection() {
    const autoUpdateEnabled = useConfigStore((s) => s.settings.autoUpdateEnabled);
    const updateSettings = useConfigStore((s) => s.update);
    const communicateWithJade = useUiPrefsStore((s) => s.communicateWithJade);
    const useNative = useUiPrefsStore((s) => s.useNativeFileBrowser);
    const sidebarCollapsed = useUiPrefsStore((s) => s.sidebarCollapsed);
    const expand = useUiPrefsStore((s) => s.expandSystemsOnLoad);
    const set = useUiPrefsStore((s) => s.set);

    const [version, setVersion] = useState('');
    const [checking, setChecking] = useState(false);
    const [pending, setPending] = useState<Update | null>(null);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);

    useEffect(() => {
        getAppInfo().then((i) => setVersion(i.version)).catch(() => {});
    }, []);

    const checkUpdate = async () => {
        setChecking(true); setUpdateMessage('Checking…');
        try {
            const { info, update } = await checkForUpdate();
            setPending(update);
            setUpdateMessage(info.available ? `Update available: v${info.version}` : 'You are up to date.');
        } catch (e) { log.error('checkForUpdate', e); setUpdateMessage('Update check failed.'); }
        finally { setChecking(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Preferences" icon={<SlidersHorizontal size={15} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <CardRow
                        icon={<Plug size={18} />}
                        label="Communicate with Jade"
                        description="Talk to a running Jade instance"
                        onActivate={() => set('communicateWithJade', !communicateWithJade)}
                        control={<Switch checked={communicateWithJade} onChange={(c) => set('communicateWithJade', c)} />}
                    />
                    <CardRow
                        icon={<PanelLeftClose size={18} />}
                        label="Collapse Sidebar"
                        description="Hide the navigation rail"
                        onActivate={() => set('sidebarCollapsed', !sidebarCollapsed)}
                        control={<Switch checked={sidebarCollapsed} onChange={(c) => set('sidebarCollapsed', c)} />}
                    />
                    <CardRow
                        icon={<FolderOpen size={18} />}
                        label="Use native file dialog"
                        description="Use the Windows file browser"
                        onActivate={() => set('useNativeFileBrowser', !useNative)}
                        control={<Switch checked={useNative} onChange={(c) => set('useNativeFileBrowser', c)} />}
                    />
                    <CardRow
                        icon={<ListTree size={18} />}
                        label="Expand VFX Systems When Loading Bins"
                        description="Auto-expand VFX trees on open"
                        onActivate={() => set('expandSystemsOnLoad', !expand)}
                        control={<Switch checked={expand} onChange={(c) => set('expandSystemsOnLoad', c)} />}
                    />
                </div>
            </FormGroup>

            <FormGroup label="App Updates" icon={<RefreshCw size={15} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <CardRow
                        icon={<Download size={18} />}
                        label="Automatic Updates"
                        description="Install updates automatically before Quartz opens"
                        onActivate={() => void updateSettings({ autoUpdateEnabled: !autoUpdateEnabled })}
                        control={<Switch checked={autoUpdateEnabled} onChange={(checked) => void updateSettings({ autoUpdateEnabled: checked })} />}
                    />
                    <div style={{ ...cardSurface, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {version && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Version: {version}</div>}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button icon={<RefreshCw size={16} style={checking ? { animation: 'spin 1s linear infinite' } : undefined} />} variant="secondary" onClick={checkUpdate} disabled={checking}>
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
                </div>
            </FormGroup>
        </div>
    );
}
