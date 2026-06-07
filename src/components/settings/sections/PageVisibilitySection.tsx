import { FormGroup, ToggleSwitch } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';
import { PAGE_LABELS, PAGE_DEFAULTS } from '@/lib/stores/uiPrefsStore';

const PAGES = PAGE_LABELS.map((p) => ({ id: p.page, label: p.label }));

const Divider = () => <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />;

export function PageVisibilitySection() {
    const pageVisibility = useUiPrefsStore((s) => s.pageVisibility);
    const setPageVisible = useUiPrefsStore((s) => s.setPageVisible);
    const autoLoad = useUiPrefsStore((s) => s.autoLoadEnabled);
    const expand = useUiPrefsStore((s) => s.expandSystemsOnLoad);
    const set = useUiPrefsStore((s) => s.set);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Navigation">
                <ToggleSwitch label="Auto-Load Last Bin Files" checked={autoLoad} onChange={(c) => set('autoLoadEnabled', c)} />
                <Divider />
                <ToggleSwitch label="Expand VFX Systems When Loading Bins" checked={expand} onChange={(c) => set('expandSystemsOnLoad', c)} />
            </FormGroup>

            <FormGroup label="Available Pages">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {PAGES.map((p, i) => (
                        <div key={p.id}>
                            {i > 0 && <Divider />}
                            <ToggleSwitch
                                label={p.label}
                                checked={pageVisibility[p.id] ?? PAGE_DEFAULTS[p.id] ?? true}
                                onChange={(c) => setPageVisible(p.id, c)}
                                compact
                            />
                        </div>
                    ))}
                </div>
            </FormGroup>
        </div>
    );
}
