/**
 * Flint - Center Panel Component
 */

import React from 'react';
import { useAppState } from '../lib/state';
import { WelcomeScreen } from './WelcomeScreen';
import { PreviewPanel } from './PreviewPanel';
import { CheckpointTimeline } from './CheckpointTimeline';
import { WadPreviewPanel } from './WadPreviewPanel';
import { getIcon, icons } from '../lib/fileIcons';

interface QuickActionCardProps {
    icon: keyof typeof icons;
    title: string;
    description: string;
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({ icon, title, description }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <div
            className="quick-action-card"
            style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '20px',
                borderRadius: '8px',
                border: `1px solid ${isHovered ? 'var(--accent-primary)' : 'var(--border)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div style={{ marginBottom: '12px' }} dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{description}</div>
        </div>
    );
};

const ProjectView: React.FC = () => {
    const { state } = useAppState();

    // Get project from active tab
    const activeTab = state.activeTabId
        ? state.openTabs.find(t => t.id === state.activeTabId)
        : null;
    const project = activeTab?.project || null;

    return (
        <div className="project-view" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '16px' }}>
                {project ? `${project.champion} - ${project.display_name || project.name}` : 'Project'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Select a file from the tree on the left to preview or edit it.
            </p>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                }}
            >
                <QuickActionCard icon="picture" title="Textures" description="View and replace textures" />
                <QuickActionCard icon="bin" title="BIN Files" description="Edit particle and data files" />
                <QuickActionCard icon="file" title="Audio" description="Preview and replace sounds" />
                <QuickActionCard icon="package" title="Export" description="Build your mod package" />
            </div>
        </div>
    );
};

export const CenterPanel: React.FC = () => {
    const { state } = useAppState();

    const renderView = () => {
        switch (state.currentView) {
            case 'welcome':
                return <WelcomeScreen />;
            case 'preview':
            case 'editor':
                return <PreviewPanel />;
            case 'project':
                return <ProjectView />;
            case 'checkpoints':
                return <CheckpointTimeline />;
            case 'extract':
                return <WadPreviewPanel />;
            default:
                return <WelcomeScreen />;
        }
    };

    return (
        <main className="center-panel" id="center-panel">
            {renderView()}
        </main>
    );
};
