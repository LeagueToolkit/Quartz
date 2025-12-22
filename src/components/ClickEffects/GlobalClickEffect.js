import React from 'react';
import ClickRippleEffect from './ClickRippleEffect';
import ParticlesEffect from './ParticlesEffect';
import PulseEffect from './PulseEffect';
import SparkleEffect from './SparkleEffect';
import GlitchEffect from './GlitchEffect';
import GalaxyEffect from './GalaxyEffect';
import FireworkEffect from './FireworkEffect';

const GlobalClickEffect = ({ enabled, type = 'water' }) => {
    if (!enabled) return null;

    switch (type) {
        case 'particles':
            return <ParticlesEffect enabled={enabled} />;
        case 'pulse':
            return <PulseEffect enabled={enabled} />;
        case 'sparkle':
            return <SparkleEffect enabled={enabled} />;
        case 'glitch':
            return <GlitchEffect enabled={enabled} />;
        case 'galaxy':
            return <GalaxyEffect enabled={enabled} />;
        case 'firework':
            return <FireworkEffect enabled={enabled} />;
        case 'water':
        default:
            return <ClickRippleEffect enabled={enabled} />;
    }
};

export default GlobalClickEffect;
