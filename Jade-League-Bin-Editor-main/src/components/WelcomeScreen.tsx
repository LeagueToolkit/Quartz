import './WelcomeScreen.css';

interface WelcomeScreenProps {
    onOpenFile: () => void;
}

export default function WelcomeScreen({ onOpenFile }: WelcomeScreenProps) {
    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <h1 className="welcome-title">Jade BIN Editor</h1>
                <p className="welcome-subtitle">Open a bin file to start editing</p>
                
                <button className="welcome-open-btn" onClick={onOpenFile}>
                    <span>Open File</span>
                    <span className="shortcut">Ctrl+O</span>
                </button>

                <div className="welcome-hints">
                    <div className="hint">
                        <span className="hint-key">Ctrl+O</span>
                        <span className="hint-desc">Open file</span>
                    </div>
                    <div className="hint">
                        <span className="hint-key">Ctrl+S</span>
                        <span className="hint-desc">Save file</span>
                    </div>
                    <div className="hint">
                        <span className="hint-key">Ctrl+F</span>
                        <span className="hint-desc">Find</span>
                    </div>
                    <div className="hint">
                        <span className="hint-key">Ctrl+H</span>
                        <span className="hint-desc">Replace</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
