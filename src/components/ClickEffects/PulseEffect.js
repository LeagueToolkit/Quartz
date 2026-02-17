import React, { useState, useEffect, useCallback } from 'react';

const PulseEffect = ({ enabled = true }) => {
    const [pulses, setPulses] = useState([]);

    const createPulse = useCallback((x, y) => {
        const id = Date.now();
        setPulses(prev => [...prev, { id, x, y }]);
        setTimeout(() => {
            setPulses(prev => prev.filter(p => p.id !== id));
        }, 600);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const handleMouseDown = (e) => createPulse(e.clientX, e.clientY);
        window.addEventListener('mousedown', handleMouseDown);

        return () => window.removeEventListener('mousedown', handleMouseDown);
    }, [enabled, createPulse]);

    if (!enabled) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 999999 }}>
            {pulses.map(pulse => (
                <div
                    key={pulse.id}
                    style={{
                        position: 'absolute',
                        left: pulse.x,
                        top: pulse.y,
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.6)',
                        transform: 'translate(-50%, -50%)',
                        animation: 'pulse-expand 0.6s ease-out forwards',
                        boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)'
                    }}
                />
            ))}
            <style>{`
        @keyframes pulse-expand {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `}</style>
        </div>
    );
};

export default PulseEffect;
