import React from 'react';
import CustomCursor from './CustomCursor';

const GlobalCursorEffect = ({ enabled, path = '', size = 32 }) => {
    if (!enabled || !path) return null;
    return <CustomCursor path={path} size={size} />;
};

export default GlobalCursorEffect;
