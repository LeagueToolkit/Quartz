import { useState } from 'react';
import { Github, Link, RefreshCw } from 'lucide-react';
import { FormGroup, Input, InputWithToggle, Button } from '../primitives';
import { useUiPrefsStore } from '@/lib/stores';

type Status = { type: 'success' | 'warning' | 'error'; message: string } | null;

export function GitHubSection() {
    const username = useUiPrefsStore((s) => s.githubUsername);
    const token = useUiPrefsStore((s) => s.githubToken);
    const repo = useUiPrefsStore((s) => s.githubRepoUrl);
    const showToken = useUiPrefsStore((s) => s.showGithubToken);
    const set = useUiPrefsStore((s) => s.set);

    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    // Verifies the token against the GitHub API, then optionally checks repo access.
    const testConnection = async () => {
        setTesting(true);
        setStatus(null);
        try {
            const userRes = await fetch('https://api.github.com/user', {
                headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
            });
            if (!userRes.ok) {
                setStatus({ type: 'error', message: `Connection failed: HTTP ${userRes.status}` });
                return;
            }
            const userData = await userRes.json();
            if (username && userData.login && userData.login.toLowerCase() !== username.toLowerCase()) {
                setStatus({ type: 'warning', message: `Token belongs to '${userData.login}', not '${username}'.` });
                return;
            }

            const match = repo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
            if (match) {
                const repoRes = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
                    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
                });
                if (!repoRes.ok) {
                    setStatus({ type: 'warning', message: `Connected as '${userData.login}' but couldn't access the repository (HTTP ${repoRes.status}).` });
                    return;
                }
            }
            setStatus({ type: 'success', message: `Successfully connected to GitHub as '${userData.login}'.` });
        } catch (e) {
            setStatus({ type: 'error', message: `Connection failed: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormGroup label="Username" description="Your GitHub username">
                <Input value={username} onChange={(e) => set('githubUsername', e.target.value)} placeholder="e.g., frogcslol" />
            </FormGroup>

            <FormGroup label="Personal Access Token" description="Token with repo permissions">
                <InputWithToggle
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => set('githubToken', e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    showValue={showToken}
                    onToggle={() => set('showGithubToken', !showToken)}
                />
            </FormGroup>

            <FormGroup label="Repository URL" description="VFX Hub repository">
                <Input value={repo} onChange={(e) => set('githubRepoUrl', e.target.value)} placeholder="https://github.com/..." icon={<Link size={16} />} />
            </FormGroup>

            {status && (
                <div style={{
                    padding: '12px',
                    background: status.type === 'success' ? 'rgba(74,222,128,0.1)' : status.type === 'warning' ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${status.type === 'success' ? 'rgba(74,222,128,0.3)' : status.type === 'warning' ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: '6px', fontSize: '13px',
                    color: status.type === 'success' ? '#4ade80' : status.type === 'warning' ? '#fbbf24' : '#ef4444',
                }}>
                    {status.message}
                </div>
            )}

            <Button
                icon={testing ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Github size={16} />}
                fullWidth variant="secondary"
                onClick={testConnection}
                disabled={testing || !username || !token}
            >
                {testing ? 'Testing...' : 'Test Connection'}
            </Button>
        </div>
    );
}
