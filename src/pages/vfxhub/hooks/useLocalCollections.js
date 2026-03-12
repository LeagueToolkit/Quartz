import { useCallback, useEffect, useMemo, useState } from 'react';
import localHubService from '../services/localHubService.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const categoryLabelFromFilename = (filename) =>
  String(filename || '').replace(/\.py$/i, '');

export default function useLocalCollections({ setStatusMessage, isProcessing }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [allVfxSystems, setAllVfxSystems] = useState([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryFiles, setCategoryFiles] = useState([]);
  const systemsPerPage = 8;

  const loadLocalCollections = useCallback(async () => {
    try {
      setIsLoadingCollections(true);
      setStatusMessage('Loading Local Hub collections...');
      const result = await localHubService.getVFXCollections();
      const collections = result.collections || [];
      setCategoryFiles(collections.map((collection) => collection.name));

      const flattened = [];
      collections.forEach((collection) => {
        collection.systems.forEach((system) => {
          flattened.push({
            ...system,
            collection: collection.name,
            category: collection.category,
          });
        });
      });
      setAllVfxSystems(flattened);
      setStatusMessage(`Local Hub loaded - ${flattened.length} effects available`);
    } catch (error) {
      setStatusMessage(`Error loading Local Hub: ${error.message}`);
    } finally {
      setIsLoadingCollections(false);
    }
  }, [setStatusMessage]);

  const handleOpenLocalHub = useCallback(async () => {
    if (isProcessing) return;
    setShowDownloadModal(true);
    await loadLocalCollections();
  }, [isProcessing, loadLocalCollections]);

  const handleRefreshCollections = useCallback(async () => {
    await loadLocalCollections();
  }, [loadLocalCollections]);

  const handleCloseDownloadModal = useCallback(() => {
    setShowDownloadModal(false);
    setStatusMessage('Local Hub closed');
  }, [setStatusMessage]);

  const handleCreateCategory = useCallback(async (input) => {
    const normalizedInput = String(input || '').trim();
    if (!normalizedInput) {
      setStatusMessage('Please enter a category filename (example: customvfx.py)');
      return false;
    }
    try {
      await localHubService.createCategory(normalizedInput);
      await loadLocalCollections();
      setStatusMessage(`Created category: ${normalizedInput}`);
      return true;
    } catch (error) {
      setStatusMessage(`Failed to create category: ${error.message}`);
      return false;
    }
  }, [loadLocalCollections, setStatusMessage]);

  const handleDeleteSystem = useCallback(async (system) => {
    if (!system?.name || !system?.collection) return false;
    try {
      const result = await localHubService.deleteVFXSystem(system.name, system.collection);
      await loadLocalCollections();
      const deletedAssets = Number(result?.deletedAssets || 0);
      const deletedPreviews = Number(result?.deletedPreviews || 0);
      const resolverRemoved = Number(result?.resolverEntriesRemoved || 0);
      setStatusMessage(
        `Deleted ${system.displayName || system.name} (assets: ${deletedAssets}, previews: ${deletedPreviews}, resolver: ${resolverRemoved})`
      );
      return true;
    } catch (error) {
      setStatusMessage(`Delete failed: ${error.message}`);
      return false;
    }
  }, [loadLocalCollections, setStatusMessage]);

  const handleDeleteCategory = useCallback(async (categoryLabel) => {
    const normalizedCategory = String(categoryLabel || '')
      .trim()
      .toLowerCase()
      .replace(/\.py$/i, '');
    if (!normalizedCategory || normalizedCategory === 'all') return false;
    const matches = (categoryFiles || []).filter(
      (file) => categoryLabelFromFilename(file).toLowerCase() === normalizedCategory
    );
    if (matches.length === 0) {
      setStatusMessage(`No category file found for ${categoryLabel}`);
      return false;
    }
    try {
      for (const file of matches) {
        await localHubService.deleteCategory(file);
      }
      if (String(selectedCategory || '').trim().toLowerCase() === normalizedCategory) {
        setSelectedCategory('All');
      }
      await loadLocalCollections();
      setStatusMessage(`Deleted category: ${categoryLabel}`);
      return true;
    } catch (error) {
      setStatusMessage(`Failed to delete category: ${error.message}`);
      return false;
    }
  }, [categoryFiles, loadLocalCollections, selectedCategory, setStatusMessage]);

  const filteredVfxSystems = useMemo(() => {
    let filtered = allVfxSystems;
    if (selectedCategory !== 'All') {
      const selected = String(selectedCategory || '').trim().toLowerCase();
      filtered = filtered.filter(
        (system) => categoryLabelFromFilename(system.collection).toLowerCase() === selected
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
    const start = (currentPage - 1) * systemsPerPage;
    return filteredVfxSystems.slice(start, start + systemsPerPage);
  }, [currentPage, filteredVfxSystems]);

  const getTotalPages = useCallback(
    () => Math.ceil(filteredVfxSystems.length / systemsPerPage),
    [filteredVfxSystems.length]
  );

  const categoryOptions = useMemo(() => {
    return ['All', ...(categoryFiles || []).map((file) => categoryLabelFromFilename(file)).filter(Boolean)];
  }, [allVfxSystems, categoryFiles]);

  useEffect(() => {
    if (showDownloadModal) setCurrentPage(1);
  }, [showDownloadModal, searchTerm, selectedCategory]);

  return {
    showDownloadModal,
    setShowDownloadModal,
    isLoadingCollections,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    currentPage,
    setCurrentPage,
    filteredVfxSystems,
    getPaginatedVFXSystems,
    getTotalPages,
    categoryOptions,
    categoryFiles,
    loadLocalCollections,
    handleOpenLocalHub,
    handleRefreshCollections,
    handleCloseDownloadModal,
    handleCreateCategory,
    handleDeleteCategory,
    handleDeleteSystem,
  };
}
