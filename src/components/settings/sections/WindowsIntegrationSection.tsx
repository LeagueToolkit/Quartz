import { useEffect, useState } from 'react';
import { FormGroup, ToggleSwitch } from '../primitives';
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
            <FormGroup
                label="Windows Explorer Context Menu"
                description="Add Quartz to the right-click menu for BIN/PY, texture, and folder workflows"
            >
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>Explorer Integration</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {busy ? 'Updating registry…' : enabled ? 'Right-click menu is active' : 'Right-click menu is disabled'}
                            </div>
                        </div>
                        <ToggleSwitch label="" checked={enabled} onChange={(c) => { if (!busy) toggle(c); }} />
                    </div>

                    {enabled && (
                        <div style={{ padding: '12px', background: 'color-mix(in oklab, var(--accent-primary) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Available Actions:</div>
                            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                                <li><strong>.bin:</strong> Convert to .py, Separate VFX, Batch Split VFX.</li>
                                <li><strong>.py:</strong> Convert to .bin.</li>
                                <li><strong>Textures:</strong> .tex / .dds / .png conversions.</li>
                                <li><strong>Folders:</strong> Convert all BIN↔PY and batch texture conversions.</li>
                            </ul>
                        </div>
                    )}
                </div>
            </FormGroup>

            <FormGroup label="About Windows Integration" description="How the context menu works">
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent-primary)' }}>What it does:</strong> Adds a Quartz submenu to your Windows Explorer right-click menu. Conversions run with the Quartz app itself — no separate helper is installed.</p>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent-primary)' }}>Privacy:</strong> Only modifies your user registry (HKCU). No admin rights required.</p>
                    <p style={{ margin: 0 }}><strong style={{ color: 'var(--accent-primary)' }}>Uninstall:</strong> Toggle off to remove all registry entries.</p>
                </div>
            </FormGroup>
        </div>
    );
}
