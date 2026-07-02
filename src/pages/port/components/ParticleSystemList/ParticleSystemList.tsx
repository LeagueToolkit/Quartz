import ParticleSystemItem from './ParticleSystemItem';
import type { VfxSystem } from '../../model';
import type { ListSharedProps } from './types';

interface ParticleSystemListProps extends ListSharedProps {
    systems: VfxSystem[];
    isTarget: boolean;
}

export default function ParticleSystemList({ systems, isTarget, ...otherProps }: ParticleSystemListProps) {
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
                <ParticleSystemItem key={system.key} system={system} isTarget={isTarget} {...otherProps} />
            ))}
        </>
    );
}
