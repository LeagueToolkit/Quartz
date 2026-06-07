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
                description="Add Quartz to the right-click menu for BIN/PY, model, texture, WAD, and folder workflows"
            >
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>Explorer Integration</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-2)', opacity: 0.7 }}>
                                {busy ? 'Updating registry…' : enabled ? 'Right-click menu is active' : 'Right-click menu is disabled'}
                            </div>
                        </div>
                        <ToggleSwitch label="" checked={enabled} onChange={(c) => { if (!busy) toggle(c); }} />
                    </div>

                    {enabled && (
                        <div style={{ padding: '12px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent-2)' }}>
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Available Actions:</div>
                            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                                <li><strong>BIN tools:</strong> Convert to .py, Separate VFX, Combine Linked, NoSkinLite.</li>
                                <li><strong>Model tools:</strong> Convert XPS / PMX to .fbx.</li>
                                <li><strong>Texture tools:</strong> .tex/.dds/.png conversions, single and batch.</li>
                                <li><strong>WAD tools:</strong> Extract hashes, Unpack WAD.</li>
                            </ul>
                        </div>
                    )}
                </div>
            </FormGroup>

            <FormGroup label="About Windows Integration" description="How the context menu works">
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent)' }}>What it does:</strong> Adds Quartz to your Windows Explorer right-click menu.</p>
                    <p style={{ margin: '0 0 8px 0' }}><strong style={{ color: 'var(--accent)' }}>Privacy:</strong> Only modifies your user registry (HKCU). No admin rights required.</p>
                    <p style={{ margin: 0 }}><strong style={{ color: 'var(--accent)' }}>Uninstall:</strong> Toggle off to remove all registry entries.</p>
                </div>
            </FormGroup>
        </div>
    );
}
