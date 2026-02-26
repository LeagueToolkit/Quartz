import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './AboutDialog.css';

interface AboutDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
    const [appIcon, setAppIcon] = useState<string>('/jade.ico');
    const [version, setVersion] = useState<string>('1.0.0');

    useEffect(() => {
        if (isOpen) {
            loadAppIcon();
            loadVersion();
        }
    }, [isOpen]);

    const loadAppIcon = async () => {
        try {
            const iconData = await invoke<string | null>('get_custom_icon_data');
            if (iconData) {
                setAppIcon(iconData);
            }
        } catch (error) {
            console.error('Failed to load custom icon:', error);
        }
    };

    const loadVersion = async () => {
        try {
            const ver = await invoke<string>('get_app_version');
            setVersion(ver);
        } catch (error) {
            console.error('Failed to load version:', error);
        }
    };

    const handleIconClick = async () => {
        try {
            const filePath = await open({
                filters: [{
                    name: 'Icon Files',
                    extensions: ['ico', 'png']
                }],
                multiple: false,
            });

            if (filePath) {
                await invoke('set_custom_icon', { iconPath: filePath });
                // Get the icon as base64 data URL
                const iconData = await invoke<string | null>('get_custom_icon_data');
                if (iconData) {
                    setAppIcon(iconData);
                    // Notify parent to update title bar icon
                    window.dispatchEvent(new CustomEvent('icon-changed', { detail: iconData }));
                }
            }
        } catch (error) {
            console.error('Failed to change icon:', error);
        }
    };

    const handleDocumentationClick = () => {
        invoke('open_url', { url: 'https://github.com/LeagueToolkit/Jade-League-Bin-Editor' });
    };

    if (!isOpen) return null;

    return (
        <div className="about-overlay" onClick={onClose}>
            <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
                {/* Title Bar */}
                <div className="about-title-bar" data-tauri-drag-region>
                    <div className="about-title-content">
                        <span className="about-title-text">About Jade</span>
                    </div>
                    <button className="about-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Content */}
                <div className="about-content">
                    {/* Left Column: App Info */}
                    <div className="about-column">
                        <div className="about-app-info">
                            <button
                                className="about-icon-button"
                                onClick={handleIconClick}
                                title="Click to change application icon"
                            >
                                <img src={appIcon} alt="Jade" className="about-app-icon" />
                                <div className="about-icon-edit-badge">✎</div>
                            </button>
                            <h1 className="about-app-name">Jade</h1>
                            <p className="about-app-subtitle">BIN Editor for League of Legends</p>
                        </div>

                        <div className="about-info-card">
                            <div className="about-info-label">Version</div>
                            <div className="about-info-value">{version}</div>
                        </div>

                        <div className="about-info-card">
                            <div className="about-info-label">Created by</div>
                            <div className="about-info-value">budlibu500</div>
                        </div>
                    </div>

                    {/* Middle Column: Support */}
                    <div className="about-column about-section-card">
                        <h2 className="about-section-title">Support</h2>
                        <p className="about-section-text">
                            Thank you to all the supporters who helped make this project possible!
                        </p>
                        <div className="about-section-label">Special Thanks</div>
                        <div className="about-supporters-list">
                            <div className="about-supporter highlighted">konradosj</div>
                            <div className="about-supporter highlighted">hellgoat2</div>
                        </div>
                    </div>

                    {/* Right Column: Project */}
                    <div className="about-column about-section-card">
                        <h2 className="about-section-title">Project</h2>
                        <button
                            className="about-doc-button"
                            onClick={handleDocumentationClick}
                        >
                            Documentation
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
