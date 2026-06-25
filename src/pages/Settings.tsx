import { useState } from 'react';
import { Palette, Terminal, HardDrive, Eye, Github, FolderTree, type LucideIcon } from 'lucide-react';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';
import { PathsSection } from '@/components/settings/sections/PathsSection';
import { ToolsSection } from '@/components/settings/sections/ToolsSection';
import { WindowsIntegrationSection } from '@/components/settings/sections/WindowsIntegrationSection';
import { PageVisibilitySection } from '@/components/settings/sections/PageVisibilitySection';
import { ThemeCreatorSection } from '@/components/settings/sections/ThemeCreatorSection';
import { GitHubSection } from '@/components/settings/sections/GitHubSection';

type SectionId = 'appearance' | 'paths' | 'tools' | 'windowsIntegration' | 'pages' | 'themeCreator' | 'github';

const SECTIONS: { id: SectionId; name: string; icon: LucideIcon }[] = [
    { id: 'appearance', name: 'Appearance', icon: Palette },
    { id: 'paths', name: 'League Path', icon: FolderTree },
    { id: 'tools', name: 'External Tools', icon: Terminal },
    { id: 'windowsIntegration', name: 'Windows Integration', icon: HardDrive },
    { id: 'pages', name: 'Page Visibility', icon: Eye },
    { id: 'themeCreator', name: 'Custom Theme Creator', icon: Palette },
    { id: 'github', name: 'GitHub Integration', icon: Github },
];

function SectionContent({ id }: { id: SectionId }) {
    switch (id) {
        case 'appearance': return <AppearanceSection />;
        case 'paths': return <PathsSection />;
        case 'tools': return <ToolsSection />;
        case 'windowsIntegration': return <WindowsIntegrationSection />;
        case 'pages': return <PageVisibilitySection />;
        case 'themeCreator': return <ThemeCreatorSection />;
        case 'github': return <GitHubSection />;
    }
}

export function Settings() {
    const [selected, setSelected] = useState<SectionId>('appearance');

    return (
        <div style={{ width: '100%', minHeight: '100%', color: 'var(--text-primary)', fontFamily: "var(--app-font, 'JetBrains Mono', monospace)" }}>
            <div style={{ display: 'flex', gap: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
                {/* Section sidebar */}
                <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {SECTIONS.map(({ id, name, icon: Icon }) => {
                        const active = selected === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setSelected(id)}
                                style={{
                                    padding: '12px 16px',
                                    background: active ? 'color-mix(in oklab, var(--accent-primary) 12%, transparent)' : 'transparent',
                                    border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    fontSize: '14px', fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                                    transition: 'all var(--motion-fast)', textAlign: 'left',
                                }}
                                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; } }}
                                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; } }}
                            >
                                <Icon size={18} />
                                <span>{name}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
                    <SectionContent id={selected} />
                </div>
            </div>
        </div>
    );
}
