import { useState, useCallback } from 'react';

const useGitHubSettings = (settings) => {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const handleTestGitHubConnection = useCallback(async () => {
    if (!settings.githubUsername || !settings.githubToken) {
      setConnectionStatus({
        type: 'error',
        message: 'Please enter both GitHub username and personal access token.'
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${settings.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VFXHub-App'
        }
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub API Error: ${userResponse.status} ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();

      if (userData.login.toLowerCase() !== settings.githubUsername.toLowerCase()) {
        throw new Error(`Username mismatch. Token belongs to '${userData.login}', but you entered '${settings.githubUsername}'.`);
      }

      if (settings.githubRepoUrl) {
        try {
          const repoMatch = settings.githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
              headers: {
                Authorization: `token ${settings.githubToken}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'VFXHub-App'
              }
            });

            if (repoResponse.ok) {
              setConnectionStatus({
                type: 'success',
                message: `Successfully connected! Authenticated as '${userData.login}' with access to repository.`
              });
            } else if (repoResponse.status === 404) {
              setConnectionStatus({
                type: 'warning',
                message: `Connected to GitHub as '${userData.login}', but repository access is limited (private repo or no access).`
              });
            } else {
              throw new Error(`Repository access error: ${repoResponse.status}`);
            }
          } else {
            setConnectionStatus({
              type: 'success',
              message: `Successfully connected to GitHub as '${userData.login}'!`
            });
          }
        } catch (repoError) {
          setConnectionStatus({
            type: 'warning',
            message: `Connected to GitHub as '${userData.login}', but couldn't verify repository access: ${repoError.message}`
          });
        }
      } else {
        setConnectionStatus({
          type: 'success',
          message: `Successfully connected to GitHub as '${userData.login}'!`
        });
      }
    } catch (error) {
      console.error('GitHub connection test failed:', error);
      setConnectionStatus({
        type: 'error',
        message: `Connection failed: ${error.message}`
      });
    } finally {
      setIsTestingConnection(false);
    }
  }, [settings.githubRepoUrl, settings.githubToken, settings.githubUsername]);

  return {
    isTestingConnection,
    connectionStatus,
    setConnectionStatus,
    handleTestGitHubConnection
  };
};

export default useGitHubSettings;
