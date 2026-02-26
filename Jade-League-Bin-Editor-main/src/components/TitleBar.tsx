import { useState, useEffect } from 'react';
import './TitleBar.css';
import { CrystalBallIcon, PaletteIcon, PencilIcon, SettingsIcon, HelpIcon, MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from './Icons';

interface TitleBarProps {
    appIcon?: string;
    isMaximized?: boolean;
    onThemes: () => void;
    onPreferences: () => void;
    onSettings: () => void;
    onAbout: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
    onClose: () => void;
    onParticleEditor?: () => void;
}

export default function TitleBar({
    appIcon = '/jade.ico',
    isMaximized = false,
    onThemes,
    onPreferences,
    onSettings,
    onAbout,
    onMinimize,
    onMaximize,
    onClose,
    onParticleEditor,
}: TitleBarProps) {
    const [currentIcon, setCurrentIcon] = useState(appIcon);

    useEffect(() => {
        setCurrentIcon(appIcon);
    }, [appIcon]);

    return (
        <div className="title-bar" data-tauri-drag-region>
            <div className="title-bar-content">
                {/* Left: Icon + Title */}
                <div className="title-section">
                    <img src={currentIcon} alt="Jade" className="title-icon" />
                    <span className="title-text">Jade - BIN Editor</span>
                </div>

                {/* Center: Spacer */}
                <div className="title-spacer" data-tauri-drag-region />

                {/* Right: Toolbar */}
                <div className="title-toolbar">
                    {/* Editing Tools */}
                    <button
                        className="toolbar-btn"
                        title="Particle Editor (Full Window)"
                        onClick={() => onParticleEditor?.()}
                    >
                        <CrystalBallIcon size={16} />
                    </button>

                    <div className="toolbar-separator" />

                    {/* Settings */}
                    <button className="toolbar-btn" title="Themes" onClick={onThemes}>
                        <PaletteIcon size={16} />
                    </button>
                    <button className="toolbar-btn" title="Preferences" onClick={onPreferences}>
                        <PencilIcon size={16} />
                    </button>
                    <button className="toolbar-btn" title="Settings" onClick={onSettings}>
                        <SettingsIcon size={16} />
                    </button>
                    <button className="toolbar-btn" title="About Jade" onClick={onAbout}>
                        <HelpIcon size={16} />
                    </button>
                </div>

                {/* Window Controls */}
                <div className="window-controls">
                    <div className="controls-separator" />
                    <button className="control-btn minimize-btn" onClick={onMinimize}>
                        <MinimizeIcon size={14} />
                    </button>
                    <button className="control-btn maximize-btn" onClick={onMaximize}>
                        {isMaximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={14} />}
                    </button>
                    <button className="control-btn close-btn" onClick={onClose}>
                        <CloseIcon size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
