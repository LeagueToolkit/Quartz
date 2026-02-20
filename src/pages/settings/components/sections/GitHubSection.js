import React from 'react';
import { Github, Link, RefreshCw } from 'lucide-react';
import { FormGroup, Input, InputWithToggle, Button } from '../SettingsPrimitives';

const GitHubSection = ({
  settings,
  updateSetting,
  setSettings,
  connectionStatus,
  isTestingConnection,
  handleTestGitHubConnection
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <FormGroup label="Username" description="Your GitHub username">
        <Input
          value={settings.githubUsername}
          onChange={(e) => updateSetting('githubUsername', e.target.value)}
          placeholder="e.g., frogcslol"
        />
      </FormGroup>

      <FormGroup label="Personal Access Token" description="Token with repo permissions">
        <InputWithToggle
          type={settings.showGithubToken ? 'text' : 'password'}
          value={settings.githubToken}
          onChange={(e) => updateSetting('githubToken', e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          showValue={settings.showGithubToken}
          onToggle={() => setSettings(prev => ({ ...prev, showGithubToken: !prev.showGithubToken }))}
        />
      </FormGroup>

      <FormGroup label="Repository URL" description="VFX Hub repository">
        <Input
          value={settings.githubRepoUrl}
          onChange={(e) => updateSetting('githubRepoUrl', e.target.value)}
          placeholder="https://github.com/..."
          icon={<Link size={16} />}
        />
      </FormGroup>

      {connectionStatus && (
        <div
          style={{
            padding: '12px',
            background: connectionStatus.type === 'success'
              ? 'rgba(74, 222, 128, 0.1)'
              : connectionStatus.type === 'warning'
                ? 'rgba(251, 191, 36, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${connectionStatus.type === 'success'
              ? 'rgba(74, 222, 128, 0.3)'
              : connectionStatus.type === 'warning'
                ? 'rgba(251, 191, 36, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: '6px',
            fontSize: '13px',
            color: connectionStatus.type === 'success'
              ? '#4ade80'
              : connectionStatus.type === 'warning'
                ? '#fbbf24'
                : '#ef4444'
          }}
        >
          {connectionStatus.message}
        </div>
      )}

      <Button
        icon={isTestingConnection ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Github size={16} />}
        fullWidth
        onClick={handleTestGitHubConnection}
        disabled={isTestingConnection || !settings.githubUsername || !settings.githubToken}
      >
        {isTestingConnection ? 'Testing...' : 'Test Connection'}
      </Button>
    </div>
  );
};

export default GitHubSection;
