import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Search } from 'lucide-react';
import { FormGroup, InputWithButton, Button } from '../primitives';
import { useConfigStore } from '@/lib/stores';
import { getLeaguePath } from '@/lib/api';
import { log } from '@/lib/util/logger';

/* Centralized League / extraction paths, moved here from the Asset Extractor's
   own modal so they're configurable in one discoverable place. Persists to the
   shared Quartz settings (configStore → settings.json), the same store the
   Asset Extractor and WAD Explorer already read from. */
export function AssetExtractorSection() {
    const leaguePath = useConfigStore((s) => s.settings.leaguePath) || '';
    const wadOutputPath = useConfigStore((s) => s.settings.wadOutputPath) || '';
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

    const browseOutput = async () => {
        const dir = await pickDirectory();
        if (dir) await update({ wadOutputPath: dir });
    };

    const statusColor = detectStatus === 'success'
        ? 'var(--accent-green)'
        : detectStatus === 'error' ? '#ef4444' : 'var(--text-2)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup
                label="League Install Path"
                description="Your League of Legends install folder — used by the Asset Extractor and WAD Explorer to locate game WADs."
            >
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
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

            <FormGroup label="WAD Output Path" description="Where extracted WAD files are saved.">
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                    <InputWithButton
                        value={wadOutputPath}
                        onChange={(e) => update({ wadOutputPath: e.target.value })}
                        placeholder="No path selected"
                        buttonIcon={<FolderOpen size={16} />}
                        buttonText="Browse"
                        onButtonClick={browseOutput}
                    />
                </div>
            </FormGroup>

            <FormGroup label="Hash Tables Path" description="Managed automatically by Quartz.">
                <div style={{ fontSize: '11px', color: 'var(--text-2)', opacity: 0.75 }}>
                    Hash files are downloaded and kept up to date automatically. See External Tools → Hash Files.
                </div>
            </FormGroup>
        </div>
    );
}
