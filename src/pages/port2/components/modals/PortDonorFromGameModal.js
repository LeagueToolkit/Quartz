import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-window';
import { Youtube } from 'lucide-react';
import { api, fetchAllChromaData } from '../../../frogchanger/services/communityDragonApi.js';
import { getChampionIconUrl } from '../../../frogchanger/services/mediaService.js';

const CHAMPION_ROW_HEIGHT = 42;
const SKIN_ROW_HEIGHT = 52;
const SKIN_SEARCH_ROW_HEIGHT = 56;
const HUD_LISTING_CACHE = new Map();

function openExternalUrl(url) {
  try {
    if (window?.require) {
      const { shell } = window.require('electron');
      if (shell?.openExternal) {
        shell.openExternal(url);
        return;
      }
    }
  } catch (_) { }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (_) { }
}

function openYouTubeSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  openExternalUrl(url);
}

function toCdragonRaw(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return '';
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  const normalized = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return `https://raw.communitydragon.org/latest${normalized}`;
}

function getSkinCircleCandidates(alias, skinId, tilePath) {
  const tileAbs = toCdragonRaw(tilePath);
  return tileAbs ? [tileAbs] : [];
}

function skinMatchesSearch(skin, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;

  const skinName = String(skin?.name || '').toLowerCase();
  const normalizedSkinName = skinName.replace(/[^a-z0-9]/g, '');
  const normalizedQuery = q.replace(/[^a-z0-9]/g, '');
  const skinId = String(skin?.id ?? '');

  return (
    skinName.includes(q) ||
    (normalizedQuery && normalizedSkinName.includes(normalizedQuery)) ||
    skinId.includes(q)
  );
}

function skinMatchesByMode(skin, query, mode) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;

  if (mode === 'skinline') {
    const skinName = String(skin?.name || '').toLowerCase();
    const normalizedSkinName = skinName.replace(/[^a-z0-9]/g, '');
    const normalizedQuery = q.replace(/[^a-z0-9]/g, '');
    const skinlineIds = Array.isArray(skin?.skinLines) ? skin.skinLines.map((id) => String(id)) : [];
    const rarityLower = String(skin?.rarity || '').toLowerCase();
    const rarityNameMap = {
      kepic: 'epic',
      klegendary: 'legendary',
      kmythic: 'mythic',
      kultimate: 'ultimate',
      kexalted: 'exalted',
      ktranscendent: 'transcendent',
      knorarity: 'base',
    };
    const rarityName = rarityNameMap[rarityLower] || '';
    return (
      skinName.includes(q) ||
      (normalizedQuery && normalizedSkinName.includes(normalizedQuery)) ||
      skinlineIds.some((id) => id.includes(q)) ||
      rarityLower.includes(q) ||
      rarityName.includes(q)
    );
  }

  return skinMatchesSearch(skin, q);
}

function parseHudListingPngNames(htmlText) {
  const names = [];
  const seen = new Set();
  const regex = /href="([^"]+\.png)"/gi;
  let m;
  while ((m = regex.exec(String(htmlText || ''))) != null) {
    const raw = String(m[1] || '');
    const fileName = decodeURIComponent(raw.split('/').pop() || '').trim();
    if (!fileName || seen.has(fileName)) continue;
    seen.add(fileName);
    names.push(fileName);
  }
  return names;
}

async function getHudPngNames(aliasLower) {
  if (!aliasLower) return [];
  if (HUD_LISTING_CACHE.has(aliasLower)) {
    return HUD_LISTING_CACHE.get(aliasLower);
  }
  const promise = (async () => {
    try {
      const url = `https://raw.communitydragon.org/latest/game/assets/characters/${aliasLower}/hud/`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const text = await response.text();
      return parseHudListingPngNames(text);
    } catch (_) {
      return [];
    }
  })();
  HUD_LISTING_CACHE.set(aliasLower, promise);
  return promise;
}

function getHudCircleNameById(fileNames, aliasLower, skinNum) {
  if (!Array.isArray(fileNames) || !aliasLower || !Number.isFinite(skinNum)) return '';
  const lower = fileNames.map((n) => ({ raw: n, lower: String(n).toLowerCase() }));

  // 1) Prefer alias-specific matches when available.
  if (skinNum === 0) {
    const aliasBaseZero = lower.find((x) => x.lower === `${aliasLower}_circle_0.png`);
    if (aliasBaseZero) return aliasBaseZero.raw;
    const aliasBase = lower.find((x) => x.lower === `${aliasLower}_circle.png`);
    if (aliasBase) return aliasBase.raw;
  } else {
    const aliasPrefix = `${aliasLower}_circle_${skinNum}`.toLowerCase();
    const aliasExact = lower.find((x) => x.lower === `${aliasPrefix}.png`);
    if (aliasExact) return aliasExact.raw;
    const aliasPrefixed = lower.find((x) => x.lower.startsWith(aliasPrefix) && x.lower.endsWith('.png'));
    if (aliasPrefixed) return aliasPrefixed.raw;
  }

  // 2) Fallback: any prefix, still id-precise.
  if (skinNum === 0) {
    const anyBaseZero = lower.find((x) => /_circle_0(?:\.|_|$)/i.test(x.lower) && x.lower.endsWith('.png'));
    if (anyBaseZero) return anyBaseZero.raw;
    const anyBase = lower.find((x) => /_circle\.png$/i.test(x.lower));
    if (anyBase) return anyBase.raw;
    return '';
  }

  const idRegex = new RegExp(`_circle_${skinNum}(?:\\.|_|$)`, 'i');
  const anyById = lower.find((x) => idRegex.test(x.lower) && x.lower.endsWith('.png'));
  return anyById ? anyById.raw : '';
}

const LeftSkinSearchRow = memo(function LeftSkinSearchRow({
  index,
  style,
  results,
  selectedChampionId,
  selectedSkinId,
  onSelect,
  onYouTubeSkin,
}) {
  const entry = results[index];
  if (!entry) return null;
  const selected = selectedChampionId === entry.champion.id && Number(selectedSkinId) === Number(entry.skin.id);

  return (
    <div style={{ ...style, padding: '0 4px', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => onSelect(entry)}
        style={{
          width: '100%',
          height: SKIN_SEARCH_ROW_HEIGHT - 6,
          borderRadius: 8,
          border: selected ? '1px solid var(--accent2)' : '1px solid transparent',
          background: selected
            ? 'color-mix(in srgb, var(--accent2), transparent 82%)'
            : 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: selected ? 'var(--accent2)' : 'rgba(255,255,255,0.84)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.7rem',
          cursor: 'pointer',
          padding: '0 10px',
          textAlign: 'left',
          overflow: 'hidden',
        }}
      >
        <SkinIcon
          alias={entry.champion.alias || ''}
          skinId={entry.skin.id}
          skinName={entry.skin.name}
          tilePath={entry.skin.tilePath}
        />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entry.skin.name}
          </span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.72 }}>
            {entry.champion.name} (ID {entry.skin.id})
          </span>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onYouTubeSkin?.(entry.champion, entry.skin);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onYouTubeSkin?.(entry.champion, entry.skin);
            }
          }}
          title="Search skin on YouTube"
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 24,
            borderRadius: 6,
            border: '1px solid rgba(255, 77, 77, 0.55)',
            background: 'color-mix(in srgb, #ff2c2c, transparent 84%)',
            color: '#ff2c2c',
            fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(255, 46, 46, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
          }}
        >
          <Youtube size={14} color="#ff2c2c" />
        </span>
      </button>
    </div>
  );
});

const SkinIcon = memo(function SkinIcon({ alias, skinId, skinName, tilePath }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const aliasLower = String(alias || '').trim().toLowerCase();
      const numericId = Number(skinId);
      const skinNum = Number.isFinite(numericId) ? (numericId % 1000) : null;
      if (aliasLower && skinNum != null) {
        try {
          const names = await getHudPngNames(aliasLower);
          if (cancelled) return;
          const match = getHudCircleNameById(names, aliasLower, skinNum);
          if (match) {
            setSrc(`https://raw.communitydragon.org/latest/game/assets/characters/${aliasLower}/hud/${encodeURIComponent(match)}`);
            return;
          }
        } catch (_) { }
      }
      if (cancelled) return;
      const fallback = getSkinCircleCandidates(alias, skinId, tilePath)[0] || '';
      setSrc(fallback);
    })();
    return () => { cancelled = true; };
  }, [alias, skinId, tilePath]);

  if (!src) {
    return (
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={skinName}
      width={38}
      height={38}
      loading="lazy"
      onError={() => setSrc(toCdragonRaw(tilePath) || '')}
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.14)',
      }}
    />
  );
});

const AutoSizer = memo(function AutoSizer({ children }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      {size.height > 0 ? children(size) : null}
    </div>
  );
});

const ChampionRow = memo(function ChampionRow({
  index,
  style,
  champions,
  selectedChampionId,
  onSelect,
  onYouTubeChampion,
}) {
  const champ = champions[index];
  if (!champ) return null;
  const selected = selectedChampionId === champ.id;

  return (
    <div style={{ ...style, padding: '0 4px', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => onSelect(champ)}
        style={{
          width: '100%',
          height: CHAMPION_ROW_HEIGHT - 6,
          borderRadius: 8,
          border: selected ? '1px solid var(--accent2)' : '1px solid transparent',
          background: selected
            ? 'color-mix(in srgb, var(--accent2), transparent 82%)'
            : 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: selected ? 'var(--accent2)' : 'rgba(255,255,255,0.84)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.76rem',
          cursor: 'pointer',
          padding: '0 10px',
          textAlign: 'left',
          overflow: 'hidden',
        }}
      >
        <img
          src={getChampionIconUrl(champ.id)}
          alt={champ.name}
          width={26}
          height={26}
          loading="lazy"
          style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{champ.name}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onYouTubeChampion?.(champ);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onYouTubeChampion?.(champ);
            }
          }}
          title="Search champion skins on YouTube"
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 24,
            borderRadius: 6,
            border: '1px solid rgba(255, 77, 77, 0.55)',
            background: 'color-mix(in srgb, #ff2c2c, transparent 84%)',
            color: '#ff2c2c',
            fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(255, 46, 46, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
          }}
        >
          <Youtube size={14} color="#ff2c2c" />
        </span>
      </button>
    </div>
  );
});

const SkinRow = memo(function SkinRow({
  index,
  style,
  skins,
  alias,
  championName,
  selectedSkinId,
  onSelect,
  onYouTubeSkin,
}) {
  const skin = skins[index];
  if (!skin) return null;
  const selected = selectedSkinId === skin.id;

  return (
    <div style={{ ...style, padding: '0 4px', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => onSelect(skin)}
        style={{
          width: '100%',
          height: SKIN_ROW_HEIGHT - 6,
          borderRadius: 8,
          border: selected ? '1px solid var(--accent2)' : '1px solid transparent',
          background: selected
            ? 'color-mix(in srgb, var(--accent2), transparent 82%)'
            : 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: selected ? 'var(--accent2)' : 'rgba(255,255,255,0.84)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.72rem',
          cursor: 'pointer',
          padding: '0 10px',
          textAlign: 'left',
          overflow: 'hidden',
        }}
      >
        <SkinIcon alias={alias || ''} skinId={skin.id} skinName={skin.name} tilePath={skin.tilePath} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {skin.name} (ID {skin.id})
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onYouTubeSkin?.({ name: championName || '' }, skin);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onYouTubeSkin?.({ name: championName || '' }, skin);
            }
          }}
          title="Search skin on YouTube"
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 24,
            borderRadius: 6,
            border: '1px solid rgba(255, 77, 77, 0.55)',
            background: 'color-mix(in srgb, #ff2c2c, transparent 84%)',
            color: '#ff2c2c',
            fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(255, 46, 46, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
          }}
        >
          <Youtube size={14} color="#ff2c2c" />
        </span>
      </button>
    </div>
  );
});

function PortDonorFromGameModal({
  open,
  loading = false,
  progressText = '',
  recentDonors = [],
  onClose,
  onConfirm,
}) {
  const [champions, setChampions] = useState([]);
  const [skins, setSkins] = useState([]);
  const [loadingChampions, setLoadingChampions] = useState(false);
  const [loadingSkins, setLoadingSkins] = useState(false);
  const [loadingGlobalSkins, setLoadingGlobalSkins] = useState(false);
  const [globalSkinData, setGlobalSkinData] = useState(null);
  const [leftSearchMode, setLeftSearchMode] = useState('champion');
  const [search, setSearch] = useState('');
  const [skinSearch, setSkinSearch] = useState('');
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [selectedSkin, setSelectedSkin] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false));
  const pendingSkinSelectionIdRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingChampions(true);
      setErrorText('');
      try {
        const list = await api.getChampions();
        if (cancelled) return;
        setChampions(Array.isArray(list) ? list : []);
      } catch (e) {
        if (cancelled) return;
        setErrorText(`Failed to load champions: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingChampions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || leftSearchMode !== 'skin' || globalSkinData) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingGlobalSkins(true);
      try {
        const data = await fetchAllChromaData();
        if (cancelled) return;
        setGlobalSkinData(data && typeof data === 'object' ? data : {});
      } catch (e) {
        if (cancelled) return;
        setErrorText(`Failed to load global skins: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingGlobalSkins(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, leftSearchMode, globalSkinData]);

  useEffect(() => {
    if (!open || !selectedChampion) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingSkins(true);
      setErrorText('');
      try {
        const list = await api.getChampionSkins(selectedChampion.name, champions);
        if (cancelled) return;
        const nextSkins = Array.isArray(list) ? list : [];
        setSkins(nextSkins);

        const pendingSkinId = pendingSkinSelectionIdRef.current;
        if (pendingSkinId != null) {
          const found = nextSkins.find((s) => Number(s.id) === Number(pendingSkinId));
          setSelectedSkin(found || null);
          pendingSkinSelectionIdRef.current = null;
        } else {
          setSelectedSkin((prev) => {
            if (!prev) return null;
            const found = nextSkins.find((s) => Number(s.id) === Number(prev.id));
            return found || null;
          });
        }
      } catch (e) {
        if (cancelled) return;
        setErrorText(`Failed to load skins: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingSkins(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedChampion, champions]);

  useEffect(() => {
    if (!open) {
      pendingSkinSelectionIdRef.current = null;
      setLeftSearchMode('champion');
      setSearch('');
      setSkinSearch('');
      setSelectedChampion(null);
      setSelectedSkin(null);
      setSkins([]);
      setErrorText('');
    }
  }, [open]);

  const filteredChampions = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return champions;
    return champions.filter((c) =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.alias || '').toLowerCase().includes(q)
    );
  }, [champions, search]);

  const championById = useMemo(() => {
    const map = new Map();
    for (const champ of champions) {
      map.set(String(champ.id), champ);
    }
    return map;
  }, [champions]);

  const filteredLeftSkinResults = useMemo(() => {
    if (leftSearchMode !== 'skin' || !globalSkinData) return [];
    const q = String(search || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (const [fullId, skinData] of Object.entries(globalSkinData)) {
      const championId = String(fullId).slice(0, -3);
      const champion = championById.get(championId);
      if (!champion) continue;
      const skinNum = Number.parseInt(String(fullId).slice(-3), 10);
      if (!Number.isFinite(skinNum)) continue;
      const candidateSkin = {
        id: skinNum,
        name: skinData?.name || `Skin ${skinNum}`,
        rarity: skinData?.rarity || '',
        skinLines: Array.isArray(skinData?.skinLines)
          ? skinData.skinLines
            .map((line) => Number(line?.id))
            .filter((id) => Number.isFinite(id))
          : [],
        tilePath: typeof skinData?.tilePath === 'string' ? skinData.tilePath : null,
      };
      if (q && !skinMatchesByMode(candidateSkin, q, 'skinline') && !skinMatchesSearch(candidateSkin, q)) {
        continue;
      }
      results.push({ champion, skin: candidateSkin });
    }
    results.sort((a, b) => {
      const byChampion = a.champion.name.localeCompare(b.champion.name);
      if (byChampion !== 0) return byChampion;
      return Number(a.skin.id) - Number(b.skin.id);
    });
    return results;
  }, [leftSearchMode, globalSkinData, championById, search]);

  const handleChampionSelect = (champion) => {
    pendingSkinSelectionIdRef.current = null;
    setSelectedSkin(null);
    setSelectedChampion(champion);
  };

  const handleYouTubeChampion = (champion) => {
    const championName = String(champion?.name || '').trim();
    if (!championName) return;
    openYouTubeSearch(`ALL ${championName} SKINS SPOTLIGHT 2025 League of Legends SUPO`);
  };

  const handleYouTubeSkin = (champion, skin) => {
    const championName = String(champion?.name || '').trim();
    const skinName = String(skin?.name || '').trim();
    if (!championName && !skinName) return;
    openYouTubeSearch(`${championName} ${skinName} skin spotlight League of Legends`);
  };

  const handleLeftSkinResultSelect = (entry) => {
    pendingSkinSelectionIdRef.current = entry?.skin?.id ?? null;
    setSelectedChampion(entry?.champion || null);
    setSelectedSkin(entry?.skin || null);
  };

  const championRowProps = useMemo(() => ({
    champions: filteredChampions,
    selectedChampionId: selectedChampion?.id || null,
    onSelect: handleChampionSelect,
    onYouTubeChampion: handleYouTubeChampion,
  }), [filteredChampions, selectedChampion, handleChampionSelect, handleYouTubeChampion]);

  const leftSkinSearchRowProps = useMemo(() => ({
    results: filteredLeftSkinResults,
    selectedChampionId: selectedChampion?.id || null,
    selectedSkinId: selectedSkin?.id || null,
    onSelect: handleLeftSkinResultSelect,
    onYouTubeSkin: handleYouTubeSkin,
  }), [filteredLeftSkinResults, selectedChampion, selectedSkin, handleLeftSkinResultSelect, handleYouTubeSkin]);

  const filteredSkins = useMemo(() => (
    skins.filter((skin) => skinMatchesSearch(skin, skinSearch))
  ), [skins, skinSearch]);

  const skinRowProps = useMemo(() => ({
    skins: filteredSkins,
    alias: selectedChampion?.alias || '',
    championName: selectedChampion?.name || '',
    selectedSkinId: selectedSkin?.id || null,
    onSelect: setSelectedSkin,
    onYouTubeSkin: handleYouTubeSkin,
  }), [filteredSkins, selectedChampion, selectedSkin, handleYouTubeSkin]);

  const canConfirm = Boolean(selectedChampion && selectedSkin && !loading && !loadingChampions && !loadingSkins);

  const handleSelectRecent = (recentItem) => {
    if (!recentItem) return;
    const matchedChampion = champions.find((c) => String(c.id) === String(recentItem.championId));
    const championNext = matchedChampion || {
      id: String(recentItem.championId || ''),
      name: String(recentItem.championName || ''),
      alias: String(recentItem.championAlias || ''),
    };
    setLeftSearchMode('champion');
    setSearch('');
    setSelectedChampion(championNext);
    setSelectedSkin({
      id: Number(recentItem.skinId),
      name: String(recentItem.skinName || `Skin ${recentItem.skinId}`),
      tilePath: recentItem.tilePath || null,
      rarity: '',
      skinLines: [],
    });
    pendingSkinSelectionIdRef.current = Number(recentItem.skinId);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 32,
        left: 60,
        right: 0,
        bottom: 0,
        zIndex: 5300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={loading ? undefined : onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(980px, calc(100% - 16px))',
          height: 'min(760px, calc(100% - 16px))',
          maxHeight: 'calc(100% - 16px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
            flexShrink: 0,
          }}
        />

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{
            margin: 0,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--text)',
          }}>
            Load Donor From Game
          </h2>
          <button
            onClick={loading ? undefined : onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.25s ease',
            }}
            type="button"
          >
            {'\u2715'}
          </button>
        </div>

        {Array.isArray(recentDonors) && recentDonors.length > 0 ? (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 0,
            }}
          >
            <div style={{ color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              Recent
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
              {recentDonors.map((item) => {
                const isActive = String(selectedChampion?.id) === String(item.championId) && Number(selectedSkin?.id) === Number(item.skinId);
                return (
                  <button
                    key={`${item.championId}_${item.skinId}`}
                    type="button"
                    onClick={() => handleSelectRecent(item)}
                    title={`${item.championName} - ${item.skinName} (ID ${item.skinId})`}
                    style={{
                      width: 42,
                      height: 42,
                      padding: 0,
                      borderRadius: '50%',
                      border: isActive ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.14)',
                      background: isActive
                        ? 'color-mix(in srgb, var(--accent2), transparent 80%)'
                        : 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <SkinIcon
                      alias={String(item.championAlias || '').toLowerCase()}
                      skinId={Number(item.skinId)}
                      skinName={String(item.skinName || '')}
                      tilePath={item.tilePath || null}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
            gap: 14,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ marginBottom: 8, color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {leftSearchMode === 'skin' ? 'Skin Search' : 'Champions'}
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={leftSearchMode === 'skin' ? 'Search skins...' : 'Search champion...'}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 112px 8px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(0,0,0,0.28)',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setLeftSearchMode((prev) => (prev === 'skin' ? 'champion' : 'skin'))}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '5px 9px',
                  borderRadius: 7,
                  border: leftSearchMode === 'skin'
                    ? '1px solid color-mix(in srgb, var(--accent2), transparent 45%)'
                    : '1px solid color-mix(in srgb, var(--accent), transparent 45%)',
                  background: leftSearchMode === 'skin'
                    ? 'color-mix(in srgb, var(--accent2), transparent 84%)'
                    : 'color-mix(in srgb, var(--accent), transparent 84%)',
                  color: leftSearchMode === 'skin' ? 'var(--accent2)' : 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  boxShadow: leftSearchMode === 'skin'
                    ? '0 0 10px color-mix(in srgb, var(--accent2), transparent 70%)'
                    : '0 0 10px color-mix(in srgb, var(--accent), transparent 70%)',
                }}
                title={leftSearchMode === 'skin' ? 'Skin search mode' : 'Champion search mode'}
              >
                {leftSearchMode === 'skin' ? 'Skin' : 'Champion'}
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {(loadingChampions || (leftSearchMode === 'skin' && loadingGlobalSkins)) ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                  {leftSearchMode === 'skin' ? 'Loading skins...' : 'Loading champions...'}
                </div>
              ) : leftSearchMode === 'skin' ? (
                filteredLeftSkinResults.length > 0 ? (
                  <AutoSizer>
                    {({ width, height }) => (
                      <List
                        width={width}
                        height={height}
                        rowCount={filteredLeftSkinResults.length}
                        rowHeight={SKIN_SEARCH_ROW_HEIGHT}
                        rowComponent={LeftSkinSearchRow}
                        rowProps={leftSkinSearchRowProps}
                      />
                    )}
                  </AutoSizer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                    {search.trim() ? 'No skins match this search' : 'Type to search skins'}
                  </div>
                )
              ) : (
                <AutoSizer>
                  {({ width, height }) => (
                    <List
                      width={width}
                      height={height}
                      rowCount={filteredChampions.length}
                      rowHeight={CHAMPION_ROW_HEIGHT}
                      rowComponent={ChampionRow}
                      rowProps={championRowProps}
                    />
                  )}
                </AutoSizer>
              )}
            </div>
          </div>

          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ marginBottom: 8, color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {selectedChampion ? `Skins: ${selectedChampion.name}` : 'Skins'}
            </div>
            <input
              value={skinSearch}
              onChange={(e) => setSkinSearch(e.target.value)}
              placeholder="Filter selected champion skins..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.28)',
                color: 'var(--accent)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
            <div style={{ flex: 1, minHeight: 0 }}>
              {loadingSkins ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                  Loading skins...
                </div>
              ) : selectedChampion ? (
                filteredSkins.length > 0 ? (
                  <AutoSizer>
                    {({ width, height }) => (
                      <List
                        width={width}
                        height={height}
                        rowCount={filteredSkins.length}
                        rowHeight={SKIN_ROW_HEIGHT}
                        rowComponent={SkinRow}
                        rowProps={skinRowProps}
                      />
                    )}
                  </AutoSizer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                    No skins match this search
                  </div>
                )
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
                  Select a champion first
                </div>
              )}
            </div>
          </div>
        </div>

        {(errorText || progressText) ? (
          <div style={{ padding: '0 16px 10px', color: errorText ? '#ff7a7a' : 'rgba(255,255,255,0.78)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.74rem' }}>
            {errorText || progressText}
          </div>
        ) : null}

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '7px 12px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.78)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.74rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ champion: selectedChampion, skin: selectedSkin })}
            disabled={!canConfirm}
            style={{
              padding: '7px 12px',
              borderRadius: 7,
              border: '1px solid color-mix(in srgb, var(--accent2), transparent 65%)',
              background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
              color: 'var(--accent2)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? 'Preparing...' : 'Use As Donor'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(PortDonorFromGameModal);
