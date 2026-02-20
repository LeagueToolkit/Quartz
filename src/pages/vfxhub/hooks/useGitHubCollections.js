import { useCallback, useEffect, useMemo, useState } from 'react';
import githubApi from '../services/githubApi.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default function useGitHubCollections({ setStatusMessage, isProcessing }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [vfxCollections, setVfxCollections] = useState([]);
  const [allVfxSystems, setAllVfxSystems] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubAuthenticated, setGithubAuthenticated] = useState(false);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const systemsPerPage = 8;

  const loadVFXCollections = useCallback(async () => {
    try {
      setIsLoadingCollections(true);
      setStatusMessage('Connecting to GitHub and loading VFX collections...');

      let connectionTest = await githubApi.testConnection();
      if (!connectionTest.success) {
        connectionTest = {
          success: true,
          user: 'public',
          repository: 'public',
          permissions: { read: true, write: false },
        };
      }

      setGithubConnected(true);
      setGithubAuthenticated(connectionTest.user !== 'public');
      setStatusMessage(
        connectionTest.user === 'public'
          ? 'Connected to GitHub (Public Access) - Loading collections...'
          : 'Connected to GitHub - Loading collections...'
      );

      let collections;
      try {
        const result = await githubApi.getVFXCollections();
        collections = result.collections;
      } catch (authError) {
        if (
          /rate\s*limit/i.test(authError.message) ||
          /429/.test(authError.message) ||
          authError.status === 429
        ) {
          const resetTime = authError.headers?.['x-ratelimit-reset'] || Date.now() + 3600000;
          const minutesUntilReset = Math.ceil((resetTime * 1000 - Date.now()) / 60000);
          setStatusMessage(
            `GitHub rate limit exceeded. Please authenticate in Settings or wait ${minutesUntilReset} minutes.`
          );
          throw new Error(
            `Rate limited. Try authenticating in Settings or wait ${minutesUntilReset} minutes.`
          );
        }

        const result = await githubApi.getVFXCollectionsPublic();
        collections = result.collections;
      }

      setVfxCollections(collections);

      const flattenedSystems = [];
      collections.forEach((collection) => {
        collection.systems.forEach((system) => {
          flattenedSystems.push({
            ...system,
            collection: collection.name,
            category: collection.category,
          });
        });
      });

      setAllVfxSystems(flattenedSystems);
      setStatusMessage(
        `VFX Hub loaded - ${flattenedSystems.length} effects available from ${collections.length} collections`
      );
    } catch (error) {
      setGithubConnected(false);
      setStatusMessage(`Error loading VFX Hub: ${error.message}`);
    } finally {
      setIsLoadingCollections(false);
    }
  }, [setStatusMessage]);

  const handleOpenVFXHub = useCallback(async () => {
    if (isProcessing) return;

    setShowDownloadModal(true);
    setStatusMessage('Opening VFX Hub - Loading collections...');

    try {
      const connectionTest = await githubApi.testConnection();
      if (!connectionTest.success) {
        setStatusMessage(`GitHub connection failed: ${connectionTest.error}`);
        setShowDownloadModal(false);
        return;
      }
    } catch (error) {
      setStatusMessage(`GitHub connection error: ${error.message}`);
      setShowDownloadModal(false);
      return;
    }

    if (vfxCollections.length === 0) {
      await loadVFXCollections();
    }
  }, [isProcessing, loadVFXCollections, setStatusMessage, vfxCollections.length]);

  const handleRefreshCollections = useCallback(async () => {
    try {
      setStatusMessage('Refreshing VFX collections...');
      await loadVFXCollections();
      setStatusMessage('Collections refreshed successfully');
    } catch (error) {
      setStatusMessage('Failed to refresh collections');
    }
  }, [loadVFXCollections, setStatusMessage]);

  const handleCloseDownloadModal = useCallback(() => {
    setShowDownloadModal(false);
    setStatusMessage('VFX Hub closed');
  }, [setStatusMessage]);

  const filteredVfxSystems = useMemo(() => {
    let filtered = allVfxSystems;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(
        (system) =>
          typeof system.category === 'string' &&
          new RegExp(`^${escapeRegex(selectedCategory)}$`, 'i').test(system.category)
      );
    }

    if (searchTerm) {
      const pattern = new RegExp(escapeRegex(searchTerm), 'i');
      filtered = filtered.filter((system) => {
        const name = system.displayName || system.name || '';
        const description = system.description || '';
        return pattern.test(name) || pattern.test(description);
      });
    }

    return filtered;
  }, [allVfxSystems, searchTerm, selectedCategory]);

  const getPaginatedVFXSystems = useCallback(() => {
    const startIndex = (currentPage - 1) * systemsPerPage;
    const endIndex = startIndex + systemsPerPage;
    return filteredVfxSystems.slice(startIndex, endIndex);
  }, [currentPage, filteredVfxSystems]);

  const getTotalPages = useCallback(
    () => Math.ceil(filteredVfxSystems.length / systemsPerPage),
    [filteredVfxSystems.length]
  );

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const credentials = await githubApi.getCredentials();
        setGithubAuthenticated(!credentials.isPublicOnly);
      } catch (error) {
        setGithubAuthenticated(false);
      }
    };
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (showDownloadModal) {
      setCurrentPage(1);
    }
  }, [searchTerm, selectedCategory, showDownloadModal]);

  return {
    showDownloadModal,
    setShowDownloadModal,
    vfxCollections,
    setVfxCollections,
    allVfxSystems,
    setAllVfxSystems,
    selectedCollection,
    setSelectedCollection,
    githubConnected,
    githubAuthenticated,
    isLoadingCollections,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    currentPage,
    setCurrentPage,
    systemsPerPage,
    filteredVfxSystems,
    loadVFXCollections,
    handleOpenVFXHub,
    handleRefreshCollections,
    handleCloseDownloadModal,
    getPaginatedVFXSystems,
    getTotalPages,
  };
}
