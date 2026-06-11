import './GlowingSpinner.css';

interface GlowingSpinnerProps {
    text?: string;
}

function GlowingSpinner({ text = 'Loading...' }: GlowingSpinnerProps) {
    return (
        <div className="glow-spinner-overlay">
            <div className="glow-spinner-container">
                <div className="glow-spinner-ring" />
                <div className="glow-spinner-text">{text}</div>
            </div>
        </div>
    );
}

export default GlowingSpinner;
