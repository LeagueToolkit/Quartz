import { FormGroup, ToggleSwitch } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';
import type { Page } from '@/lib/stores';

const PAGES: { id: Page; label: string }[] = [
    { id: 'vfxhub', label: 'VFX Hub' },
    { id: 'bineditor', label: 'Bin Editor' },
    { id: 'imgrecolor', label: 'Image Recolor' },
    { id: 'upscale', label: 'Upscale' },
    { id: 'rgba', label: 'RGBA' },
    { id: 'tools', label: 'Tools' },
    { id: 'filehandler', label: 'File Handler' },
    { id: 'bumpath', label: 'Bumpath' },
    { id: 'aniport', label: 'AniPort' },
    { id: 'extractor', label: 'Asset Extractor' },
    { id: 'wadexplorer', label: 'WAD Explorer' },
];

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
                                checked={pageVisibility[p.id] !== false}
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
