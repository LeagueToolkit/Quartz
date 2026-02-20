import { useCallback, useMemo, useState } from 'react';

export default function useVfxHubFilters({ targetSystems, donorSystems }) {
  const [targetFilter, setTargetFilter] = useState('');
  const [donorFilter, setDonorFilter] = useState('');

  const filterTargetParticles = useCallback((filterText) => {
    setTargetFilter(filterText);
  }, []);

  const filterDonorParticles = useCallback((filterText) => {
    setDonorFilter(filterText);
  }, []);

  const getShortSystemName = useCallback((fullPath) => {
    if (!fullPath) return 'Unknown System';
    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];

    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);
    if (match) {
      shortName = shortName.substring(match[0].length);
    }
    if (shortName.length > 45) {
      return `${shortName.substring(0, 42)}...`;
    }
    return shortName;
  }, []);

  const getSystemPriorityTs = useCallback((system) => {
    if (!system) return 0;
    return Number(system.createdAt || system.portedAt || system.downloadedAt || 0);
  }, []);

  const sortSystemsByPriority = useCallback((systems) => {
    return [...systems].sort((a, b) => {
      const bt = getSystemPriorityTs(b);
      const at = getSystemPriorityTs(a);
      if (bt !== at) return bt - at;
      return 0;
    });
  }, [getSystemPriorityTs]);

  const filteredTargetSystems = useMemo(() => {
    const term = (targetFilter || '').toLowerCase();
    const filtered = Object.values(targetSystems).filter((system) => {
      if (!term) return true;
      const name = (system.particleName || system.name || system.key || '').toLowerCase();
      return name.includes(term);
    });
    return sortSystemsByPriority(filtered);
  }, [targetFilter, targetSystems, sortSystemsByPriority]);

  const filteredDonorSystems = useMemo(() => {
    const term = (donorFilter || '').toLowerCase();
    const filtered = Object.values(donorSystems).filter((system) => {
      if (!term) return true;
      const name = (system.particleName || system.name || system.key || '').toLowerCase();
      return name.includes(term);
    });
    return sortSystemsByPriority(filtered);
  }, [donorFilter, donorSystems, sortSystemsByPriority]);

  return {
    targetFilter,
    donorFilter,
    filterTargetParticles,
    filterDonorParticles,
    getShortSystemName,
    filteredTargetSystems,
    filteredDonorSystems,
  };
}
