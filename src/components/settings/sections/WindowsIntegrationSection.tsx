import { useEffect, useState } from 'react';
import { FolderCog, MousePointer2, Info } from 'lucide-react';
import { FormGroup, CardRow, Switch, cardSurface } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';
import { contextMenuIsEnabled, contextMenuEnable, contextMenuDisable } from '@/lib/api';
import { log } from '@/lib/util/logger';

export function WindowsIntegrationSection() {
    const enabled = useUiPrefsStore((s) => s.contextMenuEnabled);
    const set = useUiPrefsStore((s) => s.set);
    const [busy, setBusy] = useState(false);

    // Sync the toggle with the actual registry state on mount.
    useEffect(() => {
        contextMenuIsEnabled().then((on) => set('contextMenuEnabled', on)).catch((e) => log.error('contextMenuIsEnabled', e));
    }, [set]);

    const toggle = async (on: boolean) => {
        setBusy(true);
        try {
            if (on) await contextMenuEnable(); else await contextMenuDisable();
            set('contextMenuEnabled', on);
        } catch (e) { log.error('toggle context menu', e); }
        finally { setBusy(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Windows Explorer Context Menu" icon={<MousePointer2 size={15} />}>
                <CardRow
                    icon={<FolderCog size={18} />}
                    label="Explorer Integration"
                    description={busy ? 'Updating registry…' : enabled ? 'Right-click menu is active' : 'Right-click menu is disabled'}
                    onActivate={() => { if (!busy) toggle(!enabled); }}
                    control={<Switch checked={enabled} onChange={(c) => { if (!busy) toggle(c); }} />}
                />

                {enabled && (
                    <div style={{ padding: '12px', background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Available Actions:</div>
                        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                            <li><strong>.bin:</strong> Convert to .py, sort VFX by ability, Separate/Combine VFX, Separate/Combine Animations, Combine Linked, SkinLite, Batch Split VFX, Extract hashes.</li>
                            <li><strong>.py:</strong> Convert to .bin.</li>
                            <li><strong>Textures:</strong> .tex / .dds / .png conversions.</li>
                            <li><strong>Models:</strong> .mesh / .xps / .ascii and .pmx to .fbx.</li>
                            <li><strong>.wad / .wad.client:</strong> Extract hashes, Unpack, Extract + Unpack.</li>
                            <li><strong>Folders:</strong> Convert all BIN↔PY, extract hashes, pyntex missing/junk, batch texture conversions, pack to .wad.client.</li>
                        </ul>
                    </div>
                )}
            </FormGroup>

            <FormGroup label="About Windows Integration" icon={<Info size={15} />}>
                <div className="settings-card" style={{ ...cardSurface, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent-primary)' }}>What it does:</strong> Adds a Quartz submenu to your Windows Explorer right-click menu. Conversions run with the Quartz app itself — no separate helper is installed.</p>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent-primary)' }}>Privacy:</strong> Only modifies your user registry (HKCU). No admin rights required.</p>
                    <p style={{ margin: 0 }}><strong style={{ color: 'var(--accent-primary)' }}>Uninstall:</strong> Toggle off to remove all registry entries.</p>
                </div>
            </FormGroup>
        </div>
    );
}
