import React from 'react';
import ParticleSystemItem from './ParticleSystemItem';

const ParticleSystemList = ({
    systems,
    isTarget,
    ...otherProps
}) => {
    if (!systems || systems.length === 0) {
        return (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent)' }}>
                {isTarget ? 'No target bin loaded' : 'No donor bin loaded'}
            </div>
        );
    }

    return (
        <>
            {systems.map(system => (
                <ParticleSystemItem
                    key={system.key}
                    system={system}
                    isTarget={isTarget}
                    {...otherProps}
                />
            ))}
        </>
    );
};

export default ParticleSystemList;
