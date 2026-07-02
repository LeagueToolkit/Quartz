import { FlaskConical } from 'lucide-react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FormGroup, Button } from '../primitives';
import { log } from '@/lib/util/logger';

/* Dev-only panel. Gated behind import.meta.env.DEV in Settings so it never
   ships in a release build. The first-run download flows (hash LMDBs, upscale
   binary + models) moved to External Tools so they're available in release
   builds too. */

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

            <FormGroup label="Design Lab" icon={<FlaskConical size={15} />}>
                <Button icon={<FlaskConical size={16} />} variant="secondary" onClick={() => openDesignLab().catch((e) => log.error('openDesignLab failed', String(e)))}>
                    Open Design Lab
                </Button>
            </FormGroup>
        </div>
    );
}
