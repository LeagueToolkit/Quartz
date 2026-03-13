
import React from 'react';
import FireflyEffect from './FireflyEffect';
import StarfieldEffect from './StarfieldEffect';
import ConstellationEffect from './ConstellationEffect';
import DivineStarfieldEffect from './DivineStarfieldEffect';
import BubbleEffect from './BubbleEffect';
import FallingLeavesEffect from './FallingLeavesEffect';
import SakuraLeavesEffect from './SakuraLeavesEffect';
import RainEffect from './RainEffect';
import SparkleSymbolEffect from './SparkleSymbolEffect';

const GlobalBackgroundEffect = ({ enabled, type = 'fireflies' }) => {
    if (!enabled) return null;

    switch (type) {
        case 'starfield':
            return <StarfieldEffect enabled={enabled} />;
        case 'constellation':
            return <ConstellationEffect enabled={enabled} />;
        case 'divine':
            return <DivineStarfieldEffect enabled={enabled} />;
        case 'bubbles':
            return <BubbleEffect enabled={enabled} />;
        case 'leaves':
            return <FallingLeavesEffect enabled={enabled} />;
        case 'sakuraLeaves':
            return <SakuraLeavesEffect enabled={enabled} />;
        case 'rain':
            return <RainEffect enabled={enabled} />;
        case 'sparkleSymbol':
            return <SparkleSymbolEffect enabled={enabled} />;
        case 'fireflies':
        default:
            return <FireflyEffect enabled={enabled} />;
    }
};

export default GlobalBackgroundEffect;
