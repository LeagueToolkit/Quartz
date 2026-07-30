import React from 'react';
import ParticleSystemItem from './ParticleSystemItem';
import type { VfxSystem } from '../../model';
import type { ListSharedProps } from './types';

interface ParticleSystemListProps extends ListSharedProps {
    systems: VfxSystem[];
    isTarget: boolean;
}

function ParticleSystemList({ systems, isTarget, collapsedSystems, ...otherProps }: ParticleSystemListProps) {
    if (!systems || systems.length === 0) {
        // Reached only when a bin is loaded but the filter matches nothing —
        // the no-bin empty state lives in the column components.
        return (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No matching particles</div>
        );
    }

    return (
        <>
            {systems.map((system) => (
                /* collapsedSystems (a Set) is resolved to a per-row boolean here so
                   ParticleSystemItem's React.memo isn't broken by the Set's new
                   identity on every collapse toggle. */
                <ParticleSystemItem
                    key={system.key}
                    system={system}
                    isTarget={isTarget}
                    isCollapsed={collapsedSystems.has(system.key)}
                    {...otherProps}
                />
            ))}
        </>
    );
}

export default React.memo(ParticleSystemList);
