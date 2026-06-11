import ParticleSystemItem from './ParticleSystemItem';
import type { VfxSystem } from '../../utils/vfxEmitterParser';
import type { ListSharedProps } from './types';

interface ParticleSystemListProps extends ListSharedProps {
    systems: VfxSystem[];
    isTarget: boolean;
}

export default function ParticleSystemList({ systems, isTarget, ...otherProps }: ParticleSystemListProps) {
    if (!systems || systems.length === 0) {
        return (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent)' }}>{isTarget ? 'No target bin loaded' : 'No donor bin loaded'}</div>
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
