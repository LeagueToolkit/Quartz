import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    THEMES,
    SYNTAX_THEME_OPTIONS,
    getTheme,
    getSyntaxColors,
    getBracketColors,
    type ThemeColors
} from '../lib/themes';
import { applyTheme, applyRoundedCorners, applyModernUI } from '../lib/themeApplicator';
import './ThemesDialog.css';

interface ThemesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onThemeApplied?: (themeId: string) => void;
}

interface CustomTheme {
    windowBg: string;
    editorBg: string;
    titleBar: string;
    statusBar: string;
    text: string;
    tabBg: string;
    selectedTab: string;
}

type NavSection = 'ui' | 'syntax' | 'preview' | 'options';

const NAV_ITEMS: { id: NavSection; label: string; icon: string }[] = [
    { id: 'ui',      label: 'UI Theme',       icon: '🎨' },
    { id: 'syntax',  label: 'Syntax Colors',  icon: '✦'  },
    { id: 'preview', label: 'Live Preview',   icon: '👁'  },
    { id: 'options', label: 'Options',        icon: '⚙'  },
];

export default function ThemesDialog({ isOpen, onClose, onThemeApplied }: ThemesDialogProps) {
    const [activeSection, setActiveSection] = useState<NavSection>('ui');
    const [selectedTheme, setSelectedTheme] = useState('Default');
    const [selectedSyntaxTheme, setSelectedSyntaxTheme] = useState('Default');
    const [useCustomTheme, setUseCustomTheme] = useState(false);
    const [overrideSyntax, setOverrideSyntax] = useState(false);
    const [roundedCorners, setRoundedCorners] = useState(true);
    const [modernUI, setModernUI] = useState(true);
    const [cigaretteMode, setCigaretteMode] = useState(false);

    const [customTheme, setCustomTheme] = useState<CustomTheme>({
        windowBg: '#0F1928',
        editorBg: '#141E2D',
        titleBar: '#0F1928',
        statusBar: '#005A9E',
        text: '#D4D4D4',
        tabBg: '#1E1E1E',
        selectedTab: '#007ACC'
    });

    useEffect(() => {
        if (isOpen) loadPreferences();
    }, [isOpen]);

    const loadPreferences = async () => {
        try {
            const theme      = await invoke<string>('get_preference', { key: 'Theme',         defaultValue: 'Default' });
            const syntaxTheme= await invoke<string>('get_preference', { key: 'SyntaxTheme',   defaultValue: 'Default' });
            const override   = await invoke<string>('get_preference', { key: 'OverrideSyntax',defaultValue: 'false'   });
            const useCustom  = await invoke<string>('get_preference', { key: 'UseCustomTheme',defaultValue: 'false'   });
            const rounded    = await invoke<string>('get_preference', { key: 'RoundedCorners',  defaultValue: 'true'  });
            const modern     = await invoke<string>('get_preference', { key: 'ModernUI',        defaultValue: 'true'  });
            const cigarette  = await invoke<string>('get_preference', { key: 'CigaretteMode',   defaultValue: 'false' });

            setSelectedTheme(theme);
            setSelectedSyntaxTheme(syntaxTheme);
            setOverrideSyntax(override === 'true');
            setUseCustomTheme(useCustom === 'true');
            setRoundedCorners(rounded === 'true');
            setModernUI(modern !== 'false');
            setCigaretteMode(cigarette === 'true');

            if (useCustom === 'true') {
                const customBg          = await invoke<string>('get_preference', { key: 'Custom_Bg',          defaultValue: '#0F1928' });
                const customEditorBg    = await invoke<string>('get_preference', { key: 'Custom_EditorBg',    defaultValue: '#141E2D' });
                const customTitleBar    = await invoke<string>('get_preference', { key: 'Custom_TitleBar',    defaultValue: '#0F1928' });
                const customStatusBar   = await invoke<string>('get_preference', { key: 'Custom_StatusBar',   defaultValue: '#005A9E' });
                const customText        = await invoke<string>('get_preference', { key: 'Custom_Text',        defaultValue: '#D4D4D4' });
                const customTabBg       = await invoke<string>('get_preference', { key: 'Custom_TabBg',       defaultValue: '#1E1E1E' });
                const customSelectedTab = await invoke<string>('get_preference', { key: 'Custom_SelectedTab', defaultValue: '#007ACC' });
                setCustomTheme({ windowBg: customBg, editorBg: customEditorBg, titleBar: customTitleBar,
                    statusBar: customStatusBar, text: customText, tabBg: customTabBg, selectedTab: customSelectedTab });
            }
        } catch (error) {
            console.error('Failed to load theme preferences:', error);
        }
    };

    const handleApply = async () => {
        try {
            if (useCustomTheme) {
                await invoke('set_preference', { key: 'Custom_Bg',          value: customTheme.windowBg    });
                await invoke('set_preference', { key: 'Custom_EditorBg',    value: customTheme.editorBg    });
                await invoke('set_preference', { key: 'Custom_TitleBar',    value: customTheme.titleBar    });
                await invoke('set_preference', { key: 'Custom_StatusBar',   value: customTheme.statusBar   });
                await invoke('set_preference', { key: 'Custom_Text',        value: customTheme.text        });
                await invoke('set_preference', { key: 'Custom_TabBg',       value: customTheme.tabBg       });
                await invoke('set_preference', { key: 'Custom_SelectedTab', value: customTheme.selectedTab });
                await invoke('set_preference', { key: 'UseCustomTheme',     value: 'true'                  });
                await invoke('set_preference', { key: 'Theme',              value: 'Custom'                });
                applyTheme('Custom', customTheme);
            } else {
                await invoke('set_preference', { key: 'Theme',          value: selectedTheme  });
                await invoke('set_preference', { key: 'UseCustomTheme', value: 'false'        });
                applyTheme(selectedTheme);
            }

            await invoke('set_preference', { key: 'SyntaxTheme',   value: selectedSyntaxTheme        });
            await invoke('set_preference', { key: 'OverrideSyntax', value: overrideSyntax.toString() });
            await invoke('set_preference', { key: 'RoundedCorners', value: roundedCorners.toString()  });
            await invoke('set_preference', { key: 'ModernUI',       value: modernUI.toString()         });
            await invoke('set_preference', { key: 'CigaretteMode',  value: cigaretteMode.toString()    });

            applyRoundedCorners(roundedCorners);
            applyModernUI(modernUI);
            window.dispatchEvent(new CustomEvent('cigarette-mode-changed', { detail: cigaretteMode }));

            onThemeApplied?.(useCustomTheme ? 'Custom' : selectedTheme);
            alert('Theme applied successfully!');
        } catch (error) {
            console.error('Failed to save theme preferences:', error);
            alert('Failed to apply theme. Please try again.');
        }
    };

    const handleThemeSelect = (themeId: string) => {
        setSelectedTheme(themeId);
        if (!overrideSyntax) setSelectedSyntaxTheme(themeId);
    };

    const handleCustomThemeToggle = (checked: boolean) => {
        setUseCustomTheme(checked);
        if (checked && customTheme.windowBg === '#0F1928') {
            const theme = getTheme(selectedTheme);
            if (theme) {
                setCustomTheme({
                    windowBg: theme.windowBg, editorBg: theme.editorBg,
                    titleBar: theme.titleBar, statusBar: theme.statusBar,
                    text: theme.text, tabBg: theme.tabBg, selectedTab: theme.selectedTab
                });
            }
        }
    };

    const getCurrentDisplayTheme = (): ThemeColors | CustomTheme =>
        useCustomTheme ? customTheme : (getTheme(selectedTheme) || THEMES[0]);

    const currentTheme  = getCurrentDisplayTheme();
    const currentSyntax = getSyntaxColors(selectedSyntaxTheme);
    const currentBrackets = getBracketColors(selectedSyntaxTheme);

    if (!isOpen) return null;

    /* ── Section renderers ── */
    const renderUI = () => (
        <>
            <p className="current-theme">
                Current: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {useCustomTheme ? 'Custom Theme' : (getTheme(selectedTheme)?.displayName || 'Unknown')}
                </strong>
            </p>

            <div className="section-header">
                <h4>Select Theme</h4>
                <label className="checkbox-label">
                    <input type="checkbox" checked={useCustomTheme}
                        onChange={e => handleCustomThemeToggle(e.target.checked)} />
                    Custom
                </label>
            </div>

            {!useCustomTheme ? (
                <div className="theme-list">
                    {THEMES.map(theme => (
                        <div
                            key={theme.id}
                            className={`theme-item${selectedTheme === theme.id ? ' selected' : ''}`}
                            onClick={() => handleThemeSelect(theme.id)}
                        >
                            <span>{theme.displayName}</span>
                            <div className="theme-preview-dots">
                                <div className="preview-dot" style={{ backgroundColor: theme.windowBg }} />
                                <div className="preview-dot" style={{ backgroundColor: theme.statusBar }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="custom-theme-editor">
                    {([
                        ['Window Background', 'windowBg'],
                        ['Editor Background', 'editorBg'],
                        ['Title Bar',         'titleBar'],
                        ['Status Bar',        'statusBar'],
                        ['Foreground Text',   'text'],
                        ['Tab Background',    'tabBg'],
                        ['Selected Tab',      'selectedTab'],
                    ] as [string, keyof CustomTheme][]).map(([label, key]) => (
                        <div key={key} className="color-input-group">
                            <label>{label}</label>
                            <input type="color" value={customTheme[key]}
                                onChange={e => setCustomTheme({ ...customTheme, [key]: e.target.value })} />
                            <input type="text" value={customTheme[key]}
                                onChange={e => setCustomTheme({ ...customTheme, [key]: e.target.value })} />
                        </div>
                    ))}
                </div>
            )}
        </>
    );

    const renderSyntax = () => (
        <>
            <div className="section-header">
                <h4>Syntax Color Scheme</h4>
                <label className="checkbox-label">
                    <input type="checkbox" checked={overrideSyntax}
                        onChange={e => setOverrideSyntax(e.target.checked)} />
                    Override
                </label>
            </div>

            <div className="theme-list">
                {SYNTAX_THEME_OPTIONS.map(theme => (
                    <div
                        key={theme.id}
                        className={`theme-item${selectedSyntaxTheme === theme.id ? ' selected' : ''}`}
                        onClick={() => setSelectedSyntaxTheme(theme.id)}
                    >
                        <span>{theme.displayName}</span>
                        <div className="theme-preview-dots">
                            <div className="preview-dot" style={{ backgroundColor: getBracketColors(theme.id).color1 }} />
                            <div className="preview-dot" style={{ backgroundColor: getBracketColors(theme.id).color2 }} />
                        </div>
                    </div>
                ))}
            </div>
        </>
    );

    const renderPreview = () => (
        <div className="preview-column">
            <h4>Color Palette</h4>
            <div className="color-palette">
                {([
                    ['Window Background', 'windowBg'],
                    ['Editor Background', 'editorBg'],
                    ['Title Bar',         'titleBar'],
                    ['Status Bar',        'statusBar'],
                    ['Foreground Text',   'text'],
                    ['Tab Background',    'tabBg'],
                    ['Selected Tab',      'selectedTab'],
                ] as [string, keyof typeof currentTheme][]).map(([label, key]) => (
                    <div key={key} className="palette-item">
                        <div className="palette-color" style={{ backgroundColor: currentTheme[key] as string }} />
                        <span>{label}</span>
                    </div>
                ))}
            </div>

            <h5>Syntax Preview</h5>
            <div className="syntax-preview" style={{ backgroundColor: currentTheme.editorBg, color: currentTheme.text }}>
                <pre>
                    <code>
                        <span style={{ color: currentBrackets.color1 }}>{'{'}</span>{'\n'}
                        {'  '}<span style={{ color: currentSyntax.comment }}># This is a comment</span>{'\n'}
                        {'  '}<span style={{ color: currentSyntax.propertyColor }}>skinScale</span> : <span style={{ color: currentSyntax.keyword }}>f32</span> = <span style={{ color: currentSyntax.number }}>1.0</span>{'\n'}
                        {'  '}<span style={{ color: currentSyntax.propertyColor }}>name</span> : <span style={{ color: currentSyntax.keyword }}>string</span> = <span style={{ color: currentSyntax.stringColor }}>"Example"</span>{'\n'}
                        {'  '}<span style={{ color: currentBrackets.color2 }}>{'['}</span>{'\n'}
                        {'    '}<span style={{ color: currentSyntax.number }}>i32</span> <span style={{ color: currentBrackets.color3 }}>(</span> <span style={{ color: currentSyntax.stringColor }}>"value"</span> <span style={{ color: currentBrackets.color3 }}>)</span>{'\n'}
                        {'  '}<span style={{ color: currentBrackets.color2 }}>{']'}</span>{'\n'}
                        <span style={{ color: currentBrackets.color1 }}>{'}'}</span>
                    </code>
                </pre>
            </div>
        </div>
    );

    const renderOptions = () => (
        <>
            <h2 className="themes-section-title">Display Options</h2>
            <p className="themes-section-subtitle">Control the visual style of the application.</p>

            <div className="themes-options" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                <label className="checkbox-label">
                    <input type="checkbox" checked={modernUI}
                        onChange={e => setModernUI(e.target.checked)} />
                    <span>
                        <strong>Modern UI</strong>
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.5, fontWeight: 400 }}>
                            Quartz-inspired glass morphism — frosted panels, glows and gradients
                        </span>
                    </span>
                </label>
                <label className="checkbox-label">
                    <input type="checkbox" checked={roundedCorners}
                        onChange={e => setRoundedCorners(e.target.checked)} />
                    <span>
                        <strong>Rounded Corners</strong>
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.5, fontWeight: 400 }}>
                            Apply rounded corners to panels and buttons
                        </span>
                    </span>
                </label>
                <label className="checkbox-label">
                    <input type="checkbox" checked={cigaretteMode}
                        onChange={e => setCigaretteMode(e.target.checked)} />
                    <span>
                        <strong>Cigarette Mode</strong>
                    </span>
                </label>
            </div>
        </>
    );

    const sectionContent: Record<NavSection, () => React.ReactElement> = {
        ui:      renderUI,
        syntax:  renderSyntax,
        preview: renderPreview,
        options: renderOptions,
    };

    return (
        <div className="themes-dialog-overlay" onClick={onClose}>
            <div className="themes-dialog" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="themes-dialog-header">
                    <h2>Jade Themes</h2>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>

                {/* Body */}
                <div className="themes-body">
                    {/* Sidebar */}
                    <nav className="themes-sidebar">
                        {NAV_ITEMS.map(item => (
                            <div
                                key={item.id}
                                className={`themes-nav-item${activeSection === item.id ? ' active' : ''}`}
                                onClick={() => setActiveSection(item.id)}
                            >
                                <span className="themes-nav-icon">{item.icon}</span>
                                {item.label}
                            </div>
                        ))}
                    </nav>

                    {/* Content */}
                    <div className="themes-content">
                        {sectionContent[activeSection]()}
                    </div>
                </div>

                {/* Footer */}
                <div className="themes-dialog-footer">
                    <button className="btn-apply" onClick={handleApply}>Apply</button>
                    <button className="btn-close" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
