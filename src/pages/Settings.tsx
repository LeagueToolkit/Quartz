import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Palette, Terminal, HardDrive, Eye, Github, FlaskConical, type LucideIcon } from 'lucide-react';
import { useNavigationStore } from '@/lib/stores';
import { GeneralSection } from '@/components/settings/sections/GeneralSection';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';
import { ToolsSection } from '@/components/settings/sections/ToolsSection';
import { WindowsIntegrationSection } from '@/components/settings/sections/WindowsIntegrationSection';
import { PageVisibilitySection } from '@/components/settings/sections/PageVisibilitySection';
import { GitHubSection } from '@/components/settings/sections/GitHubSection';
import { DevSection } from '@/components/settings/sections/DevSection';

type SectionId = 'general' | 'appearance' | 'tools' | 'windowsIntegration' | 'pages' | 'github' | 'dev';

// The Dev section is only surfaced in development builds.
const SECTIONS: { id: SectionId; name: string; icon: LucideIcon }[] = [
    { id: 'general', name: 'General', icon: SettingsIcon },
    { id: 'appearance', name: 'Appearance', icon: Palette },
    { id: 'tools', name: 'External Tools', icon: Terminal },
    { id: 'windowsIntegration', name: 'Windows Integration', icon: HardDrive },
    { id: 'pages', name: 'Page Visibility', icon: Eye },
    { id: 'github', name: 'GitHub Integration', icon: Github },
    ...(import.meta.env.DEV ? [{ id: 'dev' as const, name: 'Dev', icon: FlaskConical }] : []),
];

function SectionContent({ id }: { id: SectionId }) {
    switch (id) {
        case 'general': return <GeneralSection />;
        case 'appearance': return <AppearanceSection />;
        case 'tools': return <ToolsSection />;
        case 'windowsIntegration': return <WindowsIntegrationSection />;
        case 'pages': return <PageVisibilitySection />;
        case 'github': return <GitHubSection />;
        case 'dev': return <DevSection />;
    }
}

export function Settings() {
    const target = useNavigationStore((s) => s.settingsTarget);
    const [selected, setSelected] = useState<SectionId>(
        (target?.section as SectionId) ?? 'general',
    );

    // If we were navigated here with a deep-link target, open its section. The
    // highlight flag stays in the store for the section to consume; clear it once
    // it's had a chance to fire.
    useEffect(() => {
        if (target?.section) setSelected(target.section as SectionId);
    }, [target?.section]);

    return (
        <div style={{ width: '100%', minHeight: '100%', color: 'var(--text-primary)', fontFamily: "var(--app-font, 'var(--font-mono)', monospace)" }}>
            <div style={{ display: 'flex', gap: '24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
                {/* Section sidebar — Celestial-style rail: brand-tinted active state with
                   inset accent edge + glow, subtle hover lift on inactive items. */}
                <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {SECTIONS.map(({ id, name, icon: Icon }) => {
                        const active = selected === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setSelected(id)}
                                style={{
                                    position: 'relative',
                                    transformOrigin: 'left',
                                    padding: '8px 12px',
                                    background: active ? 'color-mix(in oklab, var(--accent-primary) 16%, transparent)' : 'transparent',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                    transition: 'transform var(--motion-base), background-color var(--motion-base), color var(--motion-base), opacity var(--motion-base)',
                                    textAlign: 'left',
                                    opacity: active ? 1 : 0.75,
                                    transform: active ? 'scale(1.02)' : 'scale(1)',
                                    boxShadow: active
                                        ? 'inset 2px 0 0 var(--accent-primary), 0 0 24px -4px color-mix(in srgb, var(--accent-primary) 60%, transparent)'
                                        : 'none',
                                }}
                                onMouseEnter={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                        e.currentTarget.style.opacity = '1';
                                        e.currentTarget.style.transform = 'scale(1.03)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                        e.currentTarget.style.opacity = '0.75';
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }
                                }}
                            >
                                <Icon size={16} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Content — Celestial-style open scroll area: no card chrome, centered
                   column with generous horizontal padding. */}
                <div style={{ flex: 1, minWidth: 0, padding: '4px 48px 40px' }}>
                    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
                        <SectionContent id={selected} />
                    </div>
                </div>
            </div>
        </div>
    );
}
