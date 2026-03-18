import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-window';
import { Youtube } from 'lucide-react';
import { api, fetchAllChromaData } from '../../frogchanger/services/communityDragonApi.js';
import { getChampionIconUrl } from '../../frogchanger/services/mediaService.js';

const CHAMPION_ROW_HEIGHT = 42;
const SKIN_ROW_HEIGHT = 52;
const SKIN_SEARCH_ROW_HEIGHT = 56;
const HUD_LISTING_CACHE = new Map();
const BANK_OPTIONS_STORAGE_KEY = 'bnk-game-banks-options';

function makeSelectionKey(championId, skinId) {
  return `${String(championId)}:${Number(skinId)}`;
}

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
  selectedSkinKeys,
  onSelect,
  onYouTubeSkin,
}) {
  const entry = results[index];
  if (!entry) return null;
  const selected = selectedSkinKeys.has(makeSelectionKey(entry.champion.id, entry.skin.id));

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
  selectedSkinIds,
  onToggle,
  onYouTubeSkin,
}) {
  const skin = skins[index];
  if (!skin) return null;
  const selected = selectedSkinIds.has(Number(skin.id));

  return (
    <div style={{ ...style, padding: '0 4px', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => onToggle(skin.id)}
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

function BnkGameBanksModal({
  open,
  loading = false,
  progressText = '',
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
  const [selectedSkinIds, setSelectedSkinIds] = useState(new Set());
  const [selectedSkinByChampion, setSelectedSkinByChampion] = useState(() => new Map());
  const [includeVoiceover, setIncludeVoiceover] = useState(() => {
    try {
      const raw = localStorage.getItem(BANK_OPTIONS_STORAGE_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      return parsed?.includeVoiceover !== false;
    } catch (_) {
      return true;
    }
  });
  const [includeSfx, setIncludeSfx] = useState(() => {
    try {
      const raw = localStorage.getItem(BANK_OPTIONS_STORAGE_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      return parsed?.includeSfx !== false;
    } catch (_) {
      return true;
    }
  });
  const [errorText, setErrorText] = useState('');
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 980 : false));

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
        const championKey = String(selectedChampion.id);
        const selectedForChampion = selectedSkinByChampion.get(championKey) || new Set();
        const allowed = new Set(nextSkins.map((s) => Number(s.id)));
        const next = new Set();
        selectedForChampion.forEach((id) => {
          const num = Number(id);
          if (allowed.has(num)) next.add(num);
        });
        setSelectedSkinIds(next);
      } catch (e) {
        if (cancelled) return;
        setErrorText(`Failed to load skins: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingSkins(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedChampion, champions, selectedSkinByChampion]);

  useEffect(() => {
    if (!open) {
      setLeftSearchMode('champion');
      setSearch('');
      setSkinSearch('');
      setSelectedChampion(null);
      setSelectedSkinIds(new Set());
      setSelectedSkinByChampion(new Map());
      setSkins([]);
      setErrorText('');
    }
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(BANK_OPTIONS_STORAGE_KEY, JSON.stringify({
        includeVoiceover,
        includeSfx,
      }));
    } catch (_) { }
  }, [includeVoiceover, includeSfx]);

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

  const selectedSkinKeys = useMemo(() => {
    const keys = new Set();
    selectedSkinByChampion.forEach((skinSet, championId) => {
      if (!(skinSet instanceof Set)) return;
      skinSet.forEach((skinId) => keys.add(makeSelectionKey(championId, skinId)));
    });
    return keys;
  }, [selectedSkinByChampion]);

  const selectedSkinTotal = useMemo(() => {
    let total = 0;
    selectedSkinByChampion.forEach((skinSet) => {
      if (skinSet instanceof Set) total += skinSet.size;
    });
    return total;
  }, [selectedSkinByChampion]);

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
    const championKey = String(champion?.id || '');
    const existing = selectedSkinByChampion.get(championKey) || new Set();
    setSelectedSkinIds(new Set(existing));
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
    const entryChampion = entry?.champion || null;
    const nextId = Number(entry?.skin?.id);
    if (!entryChampion || !Number.isFinite(nextId)) return;

    const championKey = String(entryChampion.id);
    const nextSet = new Set(selectedSkinByChampion.get(championKey) || []);
    if (nextSet.has(nextId)) nextSet.delete(nextId);
    else nextSet.add(nextId);

    setSelectedSkinByChampion((prev) => {
      const next = new Map(prev);
      if (nextSet.size === 0) next.delete(championKey);
      else next.set(championKey, nextSet);
      return next;
    });

    setSelectedChampion(entryChampion);
    setSelectedSkinIds(new Set(nextSet));
  };

  const championRowProps = useMemo(() => ({
    champions: filteredChampions,
    selectedChampionId: selectedChampion?.id || null,
    onSelect: handleChampionSelect,
    onYouTubeChampion: handleYouTubeChampion,
  }), [filteredChampions, selectedChampion, handleChampionSelect, handleYouTubeChampion]);

  const leftSkinSearchRowProps = useMemo(() => ({
    results: filteredLeftSkinResults,
    selectedSkinKeys,
    onSelect: handleLeftSkinResultSelect,
    onYouTubeSkin: handleYouTubeSkin,
  }), [filteredLeftSkinResults, selectedSkinKeys, handleLeftSkinResultSelect, handleYouTubeSkin]);

  const filteredSkins = useMemo(() => (
    skins.filter((skin) => skinMatchesSearch(skin, skinSearch))
  ), [skins, skinSearch]);

  const skinRowProps = useMemo(() => ({
    skins: filteredSkins,
    alias: selectedChampion?.alias || '',
    championName: selectedChampion?.name || '',
    selectedSkinIds,
    onToggle: (skinId) => {
      const id = Number(skinId);
      setSelectedSkinIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (selectedChampion?.id != null) {
          const championKey = String(selectedChampion.id);
          setSelectedSkinByChampion((prevMap) => {
            const nextMap = new Map(prevMap);
            if (next.size === 0) nextMap.delete(championKey);
            else nextMap.set(championKey, new Set(next));
            return nextMap;
          });
        }
        return next;
      });
    },
    onYouTubeSkin: handleYouTubeSkin,
  }), [filteredSkins, selectedChampion, selectedSkinIds, handleYouTubeSkin]);

  const canConfirm = Boolean(
    ((leftSearchMode === 'skin' && selectedSkinTotal > 0) || (selectedChampion && selectedSkinIds.size > 0))
    && (includeVoiceover || includeSfx)
    && !loading
    && !loadingChampions
    && !loadingSkins
  );

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
            Load Sound Banks From Game
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

        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setIncludeVoiceover((value) => !value)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: includeVoiceover ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.2)',
              background: includeVoiceover ? 'color-mix(in srgb, var(--accent2), transparent 84%)' : 'rgba(255,255,255,0.03)',
              color: includeVoiceover ? 'var(--accent2)' : 'rgba(255,255,255,0.65)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            Extract VO
          </button>
          <button
            type="button"
            onClick={() => setIncludeSfx((value) => !value)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: includeSfx ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
              background: includeSfx ? 'color-mix(in srgb, var(--accent), transparent 84%)' : 'rgba(255,255,255,0.03)',
              color: includeSfx ? 'var(--accent)' : 'rgba(255,255,255,0.65)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            Extract SFX
          </button>
          <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.65)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}>
            {leftSearchMode === 'skin'
              ? `${selectedSkinTotal} skin(s) selected across ${selectedSkinByChampion.size} champion(s)`
              : (selectedChampion ? `${selectedChampion.name} - ${selectedSkinIds.size} skin(s) selected` : 'Select a champion first')}
          </div>
        </div>

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
              {leftSearchMode === 'skin' ? 'Skinline Search' : 'Champions'}
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={leftSearchMode === 'skin' ? 'Search skins or skinlines...' : 'Search champion...'}
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
                title={leftSearchMode === 'skin' ? 'Skinline search mode' : 'Champion search mode'}
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                value={skinSearch}
                onChange={(e) => setSkinSearch(e.target.value)}
                placeholder="Filter selected champion skins..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
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
              <button
                type="button"
                onClick={() => {
                  const next = new Set(filteredSkins.map((skin) => Number(skin.id)));
                  setSelectedSkinIds(next);
                  if (selectedChampion?.id != null) {
                    const championKey = String(selectedChampion.id);
                    setSelectedSkinByChampion((prevMap) => {
                      const nextMap = new Map(prevMap);
                      if (next.size === 0) nextMap.delete(championKey);
                      else nextMap.set(championKey, new Set(next));
                      return nextMap;
                    });
                  }
                }}
                style={{ padding: '0 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', cursor: 'pointer' }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSkinIds(new Set());
                  if (selectedChampion?.id != null) {
                    const championKey = String(selectedChampion.id);
                    setSelectedSkinByChampion((prevMap) => {
                      const nextMap = new Map(prevMap);
                      nextMap.delete(championKey);
                      return nextMap;
                    });
                  }
                }}
                style={{ padding: '0 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', cursor: 'pointer' }}
              >
                None
              </button>
            </div>
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
            onClick={() => {
              if (leftSearchMode === 'skin') {
                const selections = [];
                selectedSkinByChampion.forEach((skinSet, championId) => {
                  const champion = championById.get(String(championId));
                  if (!champion || !(skinSet instanceof Set) || skinSet.size === 0) return;
                  selections.push({
                    champion,
                    skinIds: Array.from(skinSet).map((id) => Number(id)),
                  });
                });
                onConfirm({
                  selections,
                  includeVoiceover,
                  includeSfx,
                });
                return;
              }
              onConfirm({
                champion: selectedChampion,
                skinIds: Array.from(selectedSkinIds),
                includeVoiceover,
                includeSfx,
              });
            }}
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
            {loading ? 'Extracting...' : 'Load Banks'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(BnkGameBanksModal);
