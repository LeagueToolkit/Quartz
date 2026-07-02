import { FormGroup, CardList, CardRow, Switch } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';
import { PAGE_DEFAULTS } from '@/lib/stores/uiPrefsStore';
import { ITEMS, ALWAYS_VISIBLE } from '@/components/layout/NavRail';

// Use the nav rail's order + icons so this list mirrors the main nav exactly.
// Paint/Port are always-visible, so they lead and can't be toggled off.
const ALWAYS = new Set<string>(ALWAYS_VISIBLE);
const PAGES = [
    ...ITEMS.filter((i) => ALWAYS.has(i.id)),
    ...ITEMS.filter((i) => !ALWAYS.has(i.id)),
];

export function PageVisibilitySection() {
    const pageVisibility = useUiPrefsStore((s) => s.pageVisibility);
    const setPageVisible = useUiPrefsStore((s) => s.setPageVisible);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Available Pages">
                <CardList>
                    {PAGES.map(({ id, label, icon: Icon }) => {
                        const locked = ALWAYS.has(id);
                        const on = locked || (pageVisibility[id] ?? PAGE_DEFAULTS[id] ?? true);
                        return (
                            <CardRow
                                key={id}
                                icon={<Icon size={17} />}
                                label={label}
                                onActivate={locked ? undefined : () => setPageVisible(id, !on)}
                                control={<Switch
                                    checked={on}
                                    disabled={locked}
                                    onChange={(c) => setPageVisible(id, c)} />}
                            />
                        );
                    })}
                </CardList>
            </FormGroup>
        </div>
    );
}
