import React from 'react';

interface CelestiaTriggerButtonProps {
    showCelestiaGuide: boolean;
    setShowCelestiaGuide: (value: boolean) => void;
    settingsExpanded: boolean;
}

const CelestiaTriggerButton = React.memo(function CelestiaTriggerButton({
    showCelestiaGuide,
    setShowCelestiaGuide,
    settingsExpanded,
}: CelestiaTriggerButtonProps) {
    if (showCelestiaGuide) return null;

    return (
        <button
            type="button"
            className="dl-btn dl-btn--icon dl-btn--secondary"
            onClick={() => setShowCelestiaGuide(true)}
            aria-label="Open Celestia guide"
            title="Celestia guide"
            style={{
                position: 'fixed',
                bottom: settingsExpanded ? 150 : 90,
                right: 24,
                width: 40,
                height: 40,
                borderRadius: '50%',
                zIndex: 4500,
                fontWeight: 800,
                fontSize: 18,
            }}
        >
            <span>!</span>
        </button>
    );
});

export default CelestiaTriggerButton;
