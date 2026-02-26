import { useState } from 'react';
import './MenuBar.css';
import { SearchIcon, ReplaceIcon, EditIcon, SparklesIcon, ChevronRightIcon } from './Icons';

interface MenuBarProps {
    findActive?: boolean;
    replaceActive?: boolean;
    generalEditActive?: boolean;
    particlePanelActive?: boolean;
    onOpenFile: () => void;
    onSaveFile: () => void;
    onSaveFileAs: () => void;
    onOpenLog: () => void;
    onExit: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onCut: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onFind: () => void;
    onReplace: () => void;
    onCompareFiles: () => void;
    onSelectAll: () => void;
    onGeneralEdit: () => void;
    onParticlePanel: () => void;
    onThemes: () => void;
    onSettings: () => void;
    onAbout: () => void;
    recentFiles?: string[];
    onOpenRecentFile?: (path: string) => void;
}

export default function MenuBar({
    findActive = false,
    replaceActive = false,
    generalEditActive = false,
    particlePanelActive = false,
    onOpenFile,
    onSaveFile,
    onSaveFileAs,
    onOpenLog,
    onExit,
    onUndo,
    onRedo,
    onCut,
    onCopy,
    onPaste,
    onFind,
    onReplace,
    onCompareFiles,
    onSelectAll,
    onGeneralEdit,
    onParticlePanel,
    onThemes,
    onSettings,
    onAbout,
    recentFiles = [],
    onOpenRecentFile,
}: MenuBarProps) {
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    const toggleMenu = (menu: string) => {
        setActiveMenu(activeMenu === menu ? null : menu);
    };

    const closeMenu = () => {
        setActiveMenu(null);
    };

    const handleMenuClick = (callback: () => void) => {
        callback();
        closeMenu();
    };

    return (
        <div className="menu-bar">
            {/* File Menu */}
            <div className="menu-item">
                <button
                    className={`menu-trigger ${activeMenu === 'file' ? 'active' : ''}`}
                    onClick={() => toggleMenu('file')}
                >
                    File
                </button>
                {activeMenu === 'file' && (
                    <div className="menu-dropdown">
                        <button className="menu-option" onClick={() => handleMenuClick(onOpenFile)}>
                            <span>Open...</span>
                        </button>

                        <div className="menu-item-with-submenu">
                            <button className="menu-option">
                                <span>Recent Files</span>
                                <span className="submenu-arrow"><ChevronRightIcon size={12} /></span>
                            </button>
                            {recentFiles.length > 0 && (
                                <div className="menu-submenu">
                                    {recentFiles.slice(0, 10).map((filePath, index) => {
                                        const fileName = filePath.split(/[\\/]/).pop() || filePath;
                                        return (
                                            <button
                                                key={index}
                                                className="menu-option recent-file-option"
                                                onClick={() => onOpenRecentFile && handleMenuClick(() => onOpenRecentFile(filePath))}
                                                title={filePath}
                                            >
                                                <span className="recent-file-name">{fileName}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onSaveFile)}>
                            <span>Save</span>
                            <span className="shortcut">Ctrl+S</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onSaveFileAs)}>
                            <span>Save As...</span>
                            <span className="shortcut">Ctrl+Shift+S</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onOpenLog)}>
                            <span>Open Log File</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onExit)}>
                            <span>Exit</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Edit Menu */}
            <div className="menu-item">
                <button
                    className={`menu-trigger ${activeMenu === 'edit' ? 'active' : ''}`}
                    onClick={() => toggleMenu('edit')}
                >
                    Edit
                </button>
                {activeMenu === 'edit' && (
                    <div className="menu-dropdown">
                        <button className="menu-option" onClick={() => handleMenuClick(onUndo)}>
                            <span>Undo</span>
                            <span className="shortcut">Ctrl+Z</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onRedo)}>
                            <span>Redo</span>
                            <span className="shortcut">Ctrl+Y</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onCut)}>
                            <span>Cut</span>
                            <span className="shortcut">Ctrl+X</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onCopy)}>
                            <span>Copy</span>
                            <span className="shortcut">Ctrl+C</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onPaste)}>
                            <span>Paste</span>
                            <span className="shortcut">Ctrl+V</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onFind)}>
                            <span>Find...</span>
                            <span className="shortcut">Ctrl+F</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onReplace)}>
                            <span>Replace...</span>
                            <span className="shortcut">Ctrl+H</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onCompareFiles)}>
                            <span>Compare Files...</span>
                            <span className="shortcut">Ctrl+D</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onSelectAll)}>
                            <span>Select All</span>
                            <span className="shortcut">Ctrl+A</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Tools Menu */}
            <div className="menu-item">
                <button
                    className={`menu-trigger ${activeMenu === 'tools' ? 'active' : ''}`}
                    onClick={() => toggleMenu('tools')}
                >
                    Tools
                </button>
                {activeMenu === 'tools' && (
                    <div className="menu-dropdown">
                        <button className="menu-option" onClick={() => handleMenuClick(onGeneralEdit)}>
                            <span>General Editing...</span>
                            <span className="shortcut">Ctrl+O</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onParticlePanel)}>
                            <span>Particle Editing...</span>
                            <span className="shortcut">Ctrl+P</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onThemes)}>
                            <span>Themes...</span>
                        </button>
                        <button className="menu-option" onClick={() => handleMenuClick(onSettings)}>
                            <span>Settings...</span>
                        </button>
                        <div className="menu-separator" />
                        <button className="menu-option" onClick={() => handleMenuClick(onAbout)}>
                            <span>About Jade</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Spacer to push buttons to right */}
            <div style={{ flex: 1 }} />

            {/* Quick Find/Replace/Edit Buttons */}
            <button
                className={`menu-icon-btn ${findActive ? 'active' : ''}`}
                title="Find (Ctrl+F)"
                onClick={onFind}
            >
                <SearchIcon size={16} />
            </button>
            <button
                className={`menu-icon-btn ${replaceActive ? 'active' : ''}`}
                title="Replace (Ctrl+H)"
                onClick={onReplace}
            >
                <ReplaceIcon size={16} />
            </button>
            <button
                className={`menu-icon-btn ${generalEditActive ? 'active' : ''}`}
                title="General Editing (Ctrl+O)"
                onClick={onGeneralEdit}
            >
                <EditIcon size={16} />
            </button>
            <button
                className={`menu-icon-btn ${particlePanelActive ? 'active' : ''}`}
                title="Particle Editing (Ctrl+P)"
                onClick={onParticlePanel}
            >
                <SparklesIcon size={16} />
            </button>
        </div>
    );
}
