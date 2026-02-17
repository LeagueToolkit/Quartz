
import React from 'react';
import FireflyEffect from './FireflyEffect';
import StarfieldEffect from './StarfieldEffect';
import ConstellationEffect from './ConstellationEffect';
import DivineStarfieldEffect from './DivineStarfieldEffect';

const GlobalBackgroundEffect = ({ enabled, type = 'fireflies' }) => {
    if (!enabled) return null;

    switch (type) {
        case 'starfield':
            return <StarfieldEffect enabled={enabled} />;
        case 'constellation':
            return <ConstellationEffect enabled={enabled} />;
        case 'divine':
            return <DivineStarfieldEffect enabled={enabled} />;
        case 'fireflies':
        default:
            return <FireflyEffect enabled={enabled} />;
    }
};

export default GlobalBackgroundEffect;
