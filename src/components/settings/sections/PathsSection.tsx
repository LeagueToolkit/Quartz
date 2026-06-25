import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Search } from 'lucide-react';
import { FormGroup, InputWithButton, Button } from '../primitives';
import { useConfigStore } from '@/lib/stores';
import { getLeaguePath } from '@/lib/api';
import { log } from '@/lib/util/logger';

/* Centralized League path config. Panels that pull assets from the live game
   (Port, Sound Banks) read leaguePath from the shared Quartz settings
   (configStore → settings.json). */
export function PathsSection() {
    const leaguePath = useConfigStore((s) => s.settings.leaguePath) || '';
    const update = useConfigStore((s) => s.update);

    const [detectStatus, setDetectStatus] = useState<null | 'loading' | 'success' | 'error'>(null);
    const [detectMessage, setDetectMessage] = useState('');

    const pickDirectory = async (): Promise<string> => {
        const dir = await open({ directory: true, multiple: false });
        return typeof dir === 'string' ? dir : '';
    };

    const autoDetect = async () => {
        setDetectStatus('loading');
        setDetectMessage('Scanning…');
        try {
            const detected = await getLeaguePath();
            if (detected) {
                await update({ leaguePath: detected });
                setDetectStatus('success');
                setDetectMessage('Found!');
            } else {
                setDetectStatus('error');
                setDetectMessage('Could not find League folder');
            }
        } catch (e) {
            log.error('autoDetectLeaguePath', e);
            setDetectStatus('error');
            setDetectMessage('Detection failed');
        }
        setTimeout(() => { setDetectStatus(null); setDetectMessage(''); }, 3000);
    };

    const browseLeague = async () => {
        const dir = await pickDirectory();
        if (dir) await update({ leaguePath: dir });
    };

    const statusColor = detectStatus === 'success'
        ? 'var(--color-success)'
        : detectStatus === 'error' ? 'var(--color-danger)' : 'var(--text-secondary)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup
                label="League Install Path"
                description="Your League of Legends install folder — used to locate game WADs when pulling assets from the live game."
            >
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <Button icon={<Search size={16} />} variant="secondary" onClick={autoDetect} disabled={detectStatus === 'loading'}>
                            {detectStatus === 'loading' ? 'Scanning…' : 'Auto Detect'}
                        </Button>
                        {detectMessage && detectStatus !== 'loading' && (
                            <span style={{ alignSelf: 'center', fontSize: '12px', fontWeight: 600, color: statusColor }}>{detectMessage}</span>
                        )}
                    </div>
                    <InputWithButton
                        value={leaguePath}
                        onChange={(e) => update({ leaguePath: e.target.value })}
                        placeholder="C:\\Riot Games\\League of Legends"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseLeague}
                    />
                </div>
            </FormGroup>

            <FormGroup label="Hash Tables Path" description="Managed automatically by Quartz.">
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Hash files are downloaded and kept up to date automatically. See External Tools → Hash Files.
                </div>
            </FormGroup>
        </div>
    );
}
