import React, { useEffect, useMemo, useState } from 'react';
import ModelViewport from './ModelViewport.js';
import { FolderOpen, ChevronRight, ChevronLeft, Settings2, ChevronDown, Info, Box, Palette, Image, Play } from 'lucide-react';
import {
  buildSubmeshTextureMap,
  evaluateSkinningMatrices,
  evaluateSkeletonSegments,
  loadAnmClip,
  loadSknModelBundle,
} from '../../services/modelInspectViewerService.js';

/* ── tiny reusable inline components ── */

function CollapsibleSection({ title, icon: Icon, children, storageKey, defaultOpen = true, style }) {
  const [isOpen, setIsOpen] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`model_inspect_section_${storageKey}`);
      if (saved !== null) return saved === 'true';
    }
    return defaultOpen;
  });

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (storageKey) {
      localStorage.setItem(`model_inspect_section_${storageKey}`, String(next));
    }
  };

  return (
    <div style={{
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)', marginBottom: 8,
      position: 'relative',
      zIndex: style?.zIndex || undefined,
      ...style,
    }}>
      <button
        type="button"
        onClick={toggleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.01)', border: 'none', padding: '10px 12px',
          cursor: 'pointer', transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={14} style={{ color: 'var(--accent2)', opacity: 0.8 }} />}
          <div style={{
            fontSize: '0.68rem', color: 'var(--accent2)', textTransform: 'uppercase',
            letterSpacing: '0.06em', fontWeight: 700,
          }}>
            {title}
          </div>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: 'rgba(255,255,255,0.3)',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>
      <div style={{
        maxHeight: isOpen ? '2000px' : '0',
        overflow: isOpen ? 'visible' : 'hidden',
        transition: 'all 0.4s cubic-bezier(0, 1, 0, 1)',
        opacity: isOpen ? 1 : 0,
        position: 'relative',
        zIndex: isOpen ? 10 : 1,
      }}>
        <div style={{ padding: '0 12px 12px 12px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.76rem', color: 'rgba(255,255,255,0.88)' }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: 34, height: 18, borderRadius: 9, position: 'relative',
        background: checked ? 'var(--accent2)' : 'rgba(255,255,255,0.1)',
        boxShadow: checked ? '0 0 10px color-mix(in srgb, var(--accent2), transparent 60%)' : 'none',
        transition: 'all 0.2s ease', flexShrink: 0,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', position: 'absolute', top: 2,
          left: checked ? 18 : 2, transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.73rem', color: 'rgba(255,255,255,0.82)', padding: '2px 0' }}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: checked ? 'var(--accent2)' : 'rgba(255,255,255,0.06)',
        border: checked ? '1px solid var(--accent2)' : '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
        boxShadow: checked ? '0 0 8px color-mix(in srgb, var(--accent2), transparent 70%)' : 'none',
      }}>
        {checked && <span style={{ fontSize: 11, color: '#fff', lineHeight: 1, marginTop: -1 }}>{'\u2713'}</span>}
      </div>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </label>
  );
}

function CustomDropdown({ value, options, onChange, placeholder = '(None)', style }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = () => setOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div style={{ position: 'relative', zIndex: open ? 100 : 1, ...style }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--accent2), transparent 45%)' : 'rgba(255,255,255,0.1)'}`,
          color: 'var(--text)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: '0.74rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: open ? '0 0 14px color-mix(in srgb, var(--accent2), transparent 75%)' : 'none',
          transition: 'all 0.18s ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
          {selectedLabel}
        </span>
        <span style={{ opacity: 0.8 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 9999,
            backgroundColor: '#0a0910',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            maxHeight: 280,
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,1)',
            opacity: 1,
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value || '__none__'}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  backgroundColor: active ? '#2d2a45' : '#0a0910',
                  color: active ? 'var(--accent2)' : 'rgba(255,255,255,0.88)',
                  padding: '10px 12px',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  display: 'block',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = '#1a1826';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.backgroundColor = '#0a0910';
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
      letterSpacing: '0.04em', fontWeight: 600, marginBottom: 8, marginTop: 4
    }}>
      {children}
    </div>
  );
}


function GhostButton({ children, onClick, style, accent }) {
  const [hovered, setHovered] = useState(false);
  const accentVar = accent ? 'var(--accent)' : null;
  const accent2Var = accent === 2 ? 'var(--accent2)' : null;
  const colorVar = accent2Var || accentVar;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
        border: colorVar
          ? `1px solid ${hovered ? `color-mix(in srgb, ${colorVar}, transparent 40%)` : `color-mix(in srgb, ${colorVar}, transparent 70%)`}`
          : `1px solid ${hovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
        background: colorVar
          ? `color-mix(in srgb, ${colorVar}, transparent ${hovered ? '75%' : '88%'})`
          : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        color: colorVar || 'rgba(255,255,255,0.85)',
        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hovered && colorVar ? `0 0 14px color-mix(in srgb, ${colorVar}, transparent 65%)` : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ── main component ── */

export default function ModelInspectModal({
  open,
  loading,
  error,
  progressMessage,
  manifest,
  onSelectChroma,
  onClose,
  inline = false,
}) {
  const shortName = (p) => {
    const parts = String(p || '').split(/[\\/]/);
    return parts[parts.length - 1] || String(p || '');
  };
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [selectedSkn, setSelectedSkn] = useState('');
  const [selectedCharacterFolder, setSelectedCharacterFolder] = useState('');
  const [modelData, setModelData] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [wireframe, setWireframe] = useState(false);
  const [flatLighting, setFlatLighting] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showGroundTexture, setShowGroundTexture] = useState(() => {
    try {
      const saved = window.localStorage.getItem('modelInspect:showGroundTexture');
      return saved == null ? true : saved === '1';
    } catch (_) {
      return true;
    }
  });
  const [showSkybox, setShowSkybox] = useState(() => {
    try {
      const saved = window.localStorage.getItem('modelInspect:showSkybox');
      return saved == null ? true : saved === '1';
    } catch (_) {
      return true;
    }
  });
  const [visibleSubmeshes, setVisibleSubmeshes] = useState(new Set());
  const [textureDebugRows, setTextureDebugRows] = useState([]);
  const [selectedAnm, setSelectedAnm] = useState('');
  const [externalAnmFiles, setExternalAnmFiles] = useState([]);
  const [anmClip, setAnmClip] = useState(null);
  const [anmError, setAnmError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playRate, setPlayRate] = useState(1);
  const [closeHover, setCloseHover] = useState(false);
  const [manualTextures, setManualTextures] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = window.localStorage.getItem('modelInspect:sidebarCollapsed');
      return saved === '1';
    } catch (_) {
      return false;
    }
  });
  const [showFloatControls, setShowFloatControls] = useState(() => {
    try {
      const saved = window.localStorage.getItem('modelInspect:showFloatControls');
      return saved == null ? true : saved === '1';
    } catch (_) {
      return true;
    }
  });

  useEffect(() => {
    if (!inline && !open) return;
    setSelectedCharacterFolder(manifest?.defaultCharacterFolder || manifest?.characterFolders?.[0] || '');
    setSelectedSkn('');
    setModelData(null);
    setModelError('');
    setModelLoading(false);
    setWireframe(false);
    setFlatLighting(true);
    setShowSkeleton(false);
    setVisibleSubmeshes(new Set());
    setTextureDebugRows([]);
    setSelectedAnm('');
    setExternalAnmFiles([]);
    setAnmClip(null);
    setAnmError('');
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayRate(1);
    setManualTextures({});
  }, [open, manifest]);

  useEffect(() => {
    try {
      window.localStorage.setItem('modelInspect:showGroundTexture', showGroundTexture ? '1' : '0');
    } catch (_) {
      // ignore storage issues
    }
  }, [showGroundTexture]);

  useEffect(() => {
    try {
      window.localStorage.setItem('modelInspect:showSkybox', showSkybox ? '1' : '0');
    } catch (_) {
      // ignore storage issues
    }
  }, [showSkybox]);

  useEffect(() => {
    try {
      window.localStorage.setItem('modelInspect:sidebarCollapsed', sidebarCollapsed ? '1' : '0');
    } catch (_) {
      // ignore storage issues
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem('modelInspect:showFloatControls', showFloatControls ? '1' : '0');
    } catch (_) {
      // ignore storage issues
    }
  }, [showFloatControls]);

  const selectedCharacterPrefix = useMemo(() => {
    const folder = String(selectedCharacterFolder || '').toLowerCase().trim();
    if (!folder) return '';
    return `/characters/${folder}/`;
  }, [selectedCharacterFolder]);

  const filteredSknFiles = useMemo(() => {
    const all = manifest?.sknFiles || [];
    if (!selectedCharacterPrefix) return all;
    return all.filter((f) => String(f).toLowerCase().includes(selectedCharacterPrefix));
  }, [manifest?.sknFiles, selectedCharacterPrefix]);

  const filteredAnmFiles = useMemo(() => {
    const all = manifest?.anmFiles || [];
    if (!selectedCharacterPrefix) return all;
    return all.filter((f) => String(f).toLowerCase().includes(selectedCharacterPrefix));
  }, [manifest?.anmFiles, selectedCharacterPrefix]);

  const anmOptions = useMemo(() => {
    const unique = new Set([...(filteredAnmFiles || []), ...(externalAnmFiles || [])]);
    return [
      { value: '', label: '(None)' },
      ...Array.from(unique).map((f) => ({ value: f, label: shortName(f) })),
    ];
  }, [filteredAnmFiles, externalAnmFiles]);

  useEffect(() => {
    if (!inline && !open) return;
    const candidates = filteredSknFiles;
    const keepCurrent = candidates.includes(selectedSkn);
    setSelectedSkn(keepCurrent ? selectedSkn : (candidates[0] || ''));
    setSelectedAnm('');
    setAnmClip(null);
    setAnmError('');
    setCurrentTime(0);
    setIsPlaying(false);
  }, [open, filteredSknFiles, selectedCharacterFolder, selectedSkn]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!manifest?.filesDir || !selectedSkn) return;
      setModelLoading(true);
      setModelError('');
      setModelData(null);
      try {
        const perFolderHints = manifest.materialTextureHintsByCharacterFolder || {};
        const activeFolderHints = perFolderHints[selectedCharacterFolder] || {};
        const perFolderDefaultBySkn = manifest.defaultTextureBySknByCharacterFolder || {};
        const activeFolderDefaultBySkn = perFolderDefaultBySkn[selectedCharacterFolder] || {};
        const hasSelectedFolder = Boolean(selectedCharacterFolder);
        const materialHints = hasSelectedFolder
          ? activeFolderHints
          : (manifest.materialTextureHints || {});
        const defaultTextureBySkn = hasSelectedFolder
          ? activeFolderDefaultBySkn
          : (manifest.defaultTextureBySkn || {});
        const data = await loadSknModelBundle({
          filesDir: manifest.filesDir,
          sknRelativePath: selectedSkn,
        });
        const mappingResult = buildSubmeshTextureMap({
          filesDir: manifest.filesDir,
          submeshes: data.submeshes || [],
          textureFiles: manifest.textureFiles || [],
          materialTextureHints: materialHints,
          defaultTextureBySkn,
          selectedSkn,
        });
        const submeshTextureMap = mappingResult.textureMap || {};
        setTextureDebugRows(mappingResult.debugRows || []);
        if (!alive) return;
        setModelData({
          ...data,
          submeshTextureMap,
        });
        setVisibleSubmeshes(new Set((data.submeshes || []).map((s) => s.id)));
      } catch (err) {
        if (!alive) return;
        setModelError(err.message || 'Failed to load SKN model');
      } finally {
        if (alive) setModelLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [manifest, selectedSkn, selectedCharacterFolder]);

  // Merge manual texture overrides into modelData
  const patchedModelData = useMemo(() => {
    if (!modelData) return null;
    const nextMap = { ...(modelData.submeshTextureMap || {}) };
    let hasChanges = false;
    for (const [submeshId, url] of Object.entries(manualTextures)) {
      if (nextMap[submeshId] !== url) {
        nextMap[submeshId] = url;
        hasChanges = true;
      }
    }

    if (!hasChanges) return modelData;
    return { ...modelData, submeshTextureMap: nextMap };
  }, [modelData, manualTextures]);

  const handlePickMaterialTexture = async (submeshId) => {
    try {
      if (!(window && window.require)) return;
      const ipcRenderer = window.require('electron')?.ipcRenderer;
      const nodePath = window.require('path');
      if (!ipcRenderer || !nodePath) return;

      // Default path based on SKN location
      const selectedSknAbs = selectedSkn
        ? nodePath.join(String(manifest?.filesDir || ''), String(selectedSkn || ''))
        : '';
      const defaultPath = selectedSknAbs
        ? nodePath.dirname(selectedSknAbs)
        : String(manifest?.filesDir || '');

      const result = await ipcRenderer.invoke('dialog:openFile', {
        title: `Select Texture for ${submeshId}`,
        properties: ['openFile'],
        filters: [{ name: 'Texture Files', extensions: ['tex', 'dds', 'png', 'jpg', 'jpeg', 'tga'] }],
        defaultPath,
      });

      if (result?.canceled || !result?.filePaths?.length) return;
      const picked = result.filePaths[0];
      const uri = `local-file:///${picked.replace(/\\/g, '/')}`;

      setManualTextures((prev) => ({
        ...prev,
        [submeshId]: uri,
      }));
    } catch (_) {}
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!manifest?.filesDir || !selectedAnm) {
        setAnmClip(null);
        setAnmError('');
        return;
      }
      try {
        const clip = await loadAnmClip({
          filesDir: manifest.filesDir,
          anmRelativePath: selectedAnm,
        });
        if (!alive) return;
        setAnmClip(clip);
        setAnmError('');
        setCurrentTime(0);
      } catch (err) {
        if (!alive) return;
        setAnmClip(null);
        setAnmError(err.message || 'Failed to load ANM');
      }
    };
    load();
    return () => { alive = false; };
  }, [manifest, selectedAnm]);

  useEffect(() => {
    if (!isPlaying || !anmClip) return;
    let raf = null;
    let last = 0;

    const tick = (ts) => {
      if (!last) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      setCurrentTime((prev) => {
        const next = prev + dt * playRate;
        return anmClip.durationSeconds > 0 ? (next % anmClip.durationSeconds) : 0;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isPlaying, anmClip, playRate]);

  const animatedSegments = useMemo(() => {
    if (!modelData?.skeleton || !anmClip) return null;
    return evaluateSkeletonSegments({
      skeleton: modelData.skeleton,
      animation: anmClip,
      timeSeconds: currentTime,
    });
  }, [modelData?.skeleton, anmClip, currentTime]);

  const skinningMatrices = useMemo(() => {
    if (!modelData?.skeleton || !anmClip) return null;
    return evaluateSkinningMatrices({
      skeleton: modelData.skeleton,
      animation: anmClip,
      timeSeconds: currentTime,
    });
  }, [modelData?.skeleton, anmClip, currentTime]);

  const submeshCount = modelData?.submeshes?.length || 0;
  const compact = inline ? false : viewportWidth < 1180;
  const viewportHeight = inline ? '100%' : compact ? 'clamp(240px, 42vh, 420px)' : '100%';
  const viewportMinHeight = inline ? 200 : compact ? 320 : 560;
  const gridHeight = inline ? '100%' : compact ? 'auto' : 'calc(100vh - 32px - 128px)';
  const viewportReady = Boolean(manifest && modelData && !loading && !modelLoading);
  const allVisible = useMemo(() => {
    if (!modelData?.submeshes?.length) return false;
    return modelData.submeshes.every((s) => visibleSubmeshes.has(s.id));
  }, [modelData, visibleSubmeshes]);

  const toggleSubmesh = (id) => {
    setVisibleSubmeshes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addExternalAnimation = async () => {
    try {
      if (!(window && window.require)) return;
      const ipcRenderer = window.require('electron')?.ipcRenderer;
      const nodePath = window.require('path');
      if (!ipcRenderer || !nodePath) return;

      const selectedSknAbs = selectedSkn
        ? nodePath.join(String(manifest?.filesDir || ''), String(selectedSkn || ''))
        : '';
      const defaultPath = selectedSknAbs
        ? nodePath.dirname(selectedSknAbs)
        : String(manifest?.filesDir || '');

      const result = await ipcRenderer.invoke('dialog:openFile', {
        title: 'Select Animation File',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Animation Files', extensions: ['anm'] }],
        defaultPath,
      });

      const picked = Array.isArray(result?.filePaths) ? result.filePaths.map((p) => String(p || '')).filter(Boolean) : [];
      if (result?.canceled || picked.length === 0) return;
      setExternalAnmFiles((prev) => {
        const next = new Set(prev);
        for (const p of picked) next.add(p);
        return Array.from(next);
      });
      setSelectedAnm(picked[0]);
      setIsPlaying(false);
      setCurrentTime(0);
    } catch (_) {
      // ignore picker errors
    }
  };

  if (!open && !inline) return null;


  const renderAllControls = (isOverlay = false) => (
    <>
      {/* info section */}
      <CollapsibleSection title="Info" icon={Info} storageKey="info" defaultOpen={!isOverlay} style={{ zIndex: 50 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
            Champion
            <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.76rem', marginTop: 2 }}>{manifest?.championName || '—'}</div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
            Skin
            <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.76rem', marginTop: 2 }}>{manifest?.skinKey || '—'}</div>
          </div>
        </div>
        {(manifest?.characterFolders || []).length > 0 && (
          <div style={{ marginTop: 8 }}>
            <SectionTitle>Character</SectionTitle>
            <CustomDropdown
              value={selectedCharacterFolder}
              onChange={setSelectedCharacterFolder}
              options={(manifest?.characterFolders || []).map((folder) => ({ value: folder, label: folder }))}
            />
          </div>
        )}
        {Array.isArray(manifest?.chromaOptions) && manifest.chromaOptions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <SectionTitle>Chroma</SectionTitle>
            <CustomDropdown
              value={manifest?.selectedChromaId != null ? String(manifest.selectedChromaId) : ''}
              onChange={(value) => {
                const parsed = value === '' ? null : Number(value);
                onSelectChroma?.(parsed);
              }}
              options={[
                { value: '', label: '(Base)' },
                ...manifest.chromaOptions.map((c) => ({
                  value: String(c.id),
                  label: c.name || `Chroma ${c.id}`,
                })),
              ]}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* model section */}
      <CollapsibleSection title="Model" icon={Box} storageKey="model" defaultOpen={!isOverlay} style={{ zIndex: 40 }}>
        {filteredSknFiles.length > 1 && (
          <div style={{ marginBottom: 8 }}>
            <CustomDropdown
              value={selectedSkn}
              onChange={setSelectedSkn}
              options={filteredSknFiles.map((f) => ({ value: f, label: shortName(f) }))}
            />
          </div>
        )}

        {modelLoading && (
          <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)', padding: '4px 0' }}>
            Loading model...
          </div>
        )}

        {modelError && (
          <div style={{ fontSize: '0.74rem', color: '#f87171', padding: '4px 0' }}>
            {modelError}
          </div>
        )}

        {modelData && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Vertices', modelData.vertexCount?.toLocaleString()],
              ['Triangles', modelData.triangleCount?.toLocaleString()],
              ['Submeshes', submeshCount],
              ['Joints', modelData.skeleton ? modelData.skeleton.jointCount : '—'],
            ].map(([label, val]) => (
              <div key={label} style={{
                borderRadius: 6, padding: '6px 8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* render options */}
      <CollapsibleSection title="Render" icon={Palette} storageKey="render" defaultOpen={!isOverlay} style={{ zIndex: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle checked={flatLighting} onChange={setFlatLighting} label="Flat Lighting" />
          <Toggle checked={wireframe} onChange={setWireframe} label="Wireframe" />
          <Toggle checked={showSkeleton} onChange={setShowSkeleton} label="Show Skeleton" />
          <Toggle checked={showGroundTexture} onChange={setShowGroundTexture} label="Ground Texture" />
          <Toggle checked={showSkybox} onChange={setShowSkybox} label="Skybox" />
        </div>
      </CollapsibleSection>

      {/* materials */}
      <CollapsibleSection title={`Materials (${submeshCount})`} icon={Image} storageKey="materials" defaultOpen={!isOverlay} style={{ zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <GhostButton
            accent={2}
            onClick={() => {
              if (!modelData?.submeshes?.length) return;
              if (allVisible) setVisibleSubmeshes(new Set());
              else setVisibleSubmeshes(new Set(modelData.submeshes.map((s) => s.id)));
            }}
            style={{ padding: '3px 14px', fontSize: '0.68rem', width: '100%' }}
          >
            {allVisible ? 'Hide All Submeshes' : 'Show All Submeshes'}
          </GhostButton>
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
          {(modelData?.submeshes || []).map((sm) => (
            <div
              key={sm.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 6,
                padding: '2px 6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <Checkbox
                checked={visibleSubmeshes.has(sm.id)}
                onChange={() => toggleSubmesh(sm.id)}
                label={sm.name}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePickMaterialTexture(sm.id); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: manualTextures[sm.id] ? 'var(--accent2)' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: 4,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent2)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = manualTextures[sm.id] ? 'var(--accent2)' : 'rgba(255,255,255,0.3)')}
                title="Change texture"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* animation */}
      <CollapsibleSection title="Animation" icon={Play} storageKey="animation" defaultOpen={!isOverlay} style={{ zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 8 }}>
          <CustomDropdown
            value={selectedAnm}
            onChange={setSelectedAnm}
            options={anmOptions}
          />
          <GhostButton
            onClick={addExternalAnimation}
            style={{ width: 34, minWidth: 34, height: 34, padding: 0, fontSize: '0.95rem', lineHeight: 1 }}
            title="Pick animation file"
          >
            {'\uD83D\uDCC1'}
          </GhostButton>
        </div>

        {anmError && (
          <div style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: 6 }}>
            {anmError}
          </div>
        )}

        {anmClip && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <GhostButton accent={1} onClick={() => setIsPlaying((v) => !v)} style={{ flex: 1 }}>
                {isPlaying ? 'Pause' : 'Play'}
              </GhostButton>
              <GhostButton onClick={() => { setIsPlaying(false); setCurrentTime(0); }} style={{ flex: 1 }}>
                Reset
              </GhostButton>
            </div>

            <div style={{ marginBottom: 12 }}>
              <SectionTitle>Play Rate</SectionTitle>
              <CustomDropdown
                value={String(playRate)}
                onChange={(value) => setPlayRate(Number(value))}
                options={[
                  { value: '0.25', label: '0.25x' },
                  { value: '0.5', label: '0.5x' },
                  { value: '1', label: '1x' },
                  { value: '1.5', label: '1.5x' },
                  { value: '2', label: '2x' },
                ]}
              />
            </div>

            <input
              type="range"
              min={0}
              max={anmClip.durationSeconds || 1}
              step={Math.max(0.001, 1 / Math.max(1, anmClip.fps || 30))}
              value={Math.min(currentTime, anmClip.durationSeconds || 1)}
              onChange={(e) => { setIsPlaying(false); setCurrentTime(Number(e.target.value)); }}
              style={{ width: '100%', accentColor: 'var(--accent2)', marginBottom: 6 }}
            />
            <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>
              {currentTime.toFixed(2)}s / {(anmClip.durationSeconds || 0).toFixed(2)}s
              {' \u00B7 '}
              {Math.round((anmClip.fps || 0) * 100) / 100} fps
            </div>
          </>
        )}
      </CollapsibleSection>
    </>
  );

  const gridContent = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact || sidebarCollapsed ? '1fr' : 'minmax(0, 1fr) 340px',
        gap: sidebarCollapsed ? 0 : 14,
        alignItems: 'stretch',
        height: gridHeight,
        overflow: compact ? 'auto' : 'hidden',
        flex: inline ? 1 : undefined,
        minHeight: 0,
        position: 'relative',
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
        {viewportReady ? (
          <ModelViewport
            modelData={patchedModelData}
            visibleSubmeshes={visibleSubmeshes}
            wireframe={wireframe}
            flatLighting={flatLighting}
            showSkeleton={showSkeleton}
            showGroundTexture={showGroundTexture}
            showSkybox={showSkybox}
            skeletonSegments={animatedSegments}
            skinningMatrices={skinningMatrices}
            height={viewportHeight}
            minHeight={viewportMinHeight}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: viewportHeight,
              minHeight: viewportMinHeight,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(12,10,18,0.55)',
            }}
          />
        )}
        {!viewportReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: 'rgba(8,8,14,0.62)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                color: 'rgba(255,255,255,0.92)',
                fontSize: '0.8rem',
                textShadow: '0 1px 10px rgba(0,0,0,0.55)',
              }}
            >
              <div style={{ width: 24, height: 24, border: '3px solid rgba(255,255,255,0.28)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.9)' }}>
                {progressMessage || (modelLoading ? 'Loading model...' : 'Preparing assets...')}
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Collapse Toggle */}
        {!compact && (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(20,18,30,0.85)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--accent2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            {sidebarCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        )}

        {/* Floating Controls Overlay */}
        {(sidebarCollapsed || compact) && viewportReady && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              width: showFloatControls ? 300 : 44,
              maxHeight: 'calc(100% - 60px)',
              background: 'rgba(15,13,24,0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: showFloatControls ? 14 : 22,
              padding: showFloatControls ? 4 : 0,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 90,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {!showFloatControls ? (
              <button
                onClick={() => setShowFloatControls(true)}
                style={{
                  width: 44,
                  height: 44,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent2)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Settings2 size={22} />
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '450px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px 14px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Controls
                  </div>
                  <button
                    onClick={() => setShowFloatControls(false)}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px 8px' }}>
                  {renderAllControls(true)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── sidebar ── */}
      {!sidebarCollapsed && (
        <div style={{
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          overflowY: 'auto',
          minHeight: 0, padding: '14px 8px 14px 14px',
          opacity: 1,
          transition: 'opacity 0.2s ease',
        }}>
          {renderAllControls(false)}

          {/* debug section (sidebar only) */}
          <CollapsibleSection title="Texture Debug" icon={Settings2} storageKey="debug" defaultOpen={false}>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>
              {textureDebugRows.map((row) => (
                <div key={row.submeshId} style={{ marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                  <div style={{ color: 'var(--accent2)', fontWeight: 600 }}>{row.submeshName}</div>
                  <div>hint: {row.hintPath || '(none)'}</div>
                  <div>resolved: {row.resolvedTexturePath || '(none)'}</div>
                  <div>reason: {row.reason}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0 }}>
        {error ? (
          <div style={{ color: '#f87171', fontSize: '0.82rem', padding: '8px 12px' }}>{error}</div>
        ) : (
          gridContent
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 32, left: 60, right: 0, bottom: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)' }} />

      {/* modal container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: compact ? 'min(96%, 880px)' : 'calc(100% - 32px)',
          maxHeight: 'calc(100% - 32px)',
          overflow: 'hidden',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px color-mix(in srgb, var(--accent2), transparent 82%)',
        }}
      >
        {/* accent bar */}
        <div style={{
          height: 3, borderRadius: '16px 16px 0 0',
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0 16px' }}>
          <h2 style={{ margin: 0, fontSize: '0.92rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text)' }}>
            Model Inspect
          </h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            style={{
              width: 28, height: 28, borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.08)',
              background: closeHover ? 'color-mix(in srgb, var(--accent2), transparent 75%)' : 'rgba(255,255,255,0.04)',
              color: closeHover ? 'var(--accent2)' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: closeHover ? '0 0 12px color-mix(in srgb, var(--accent2), transparent 70%)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '12px 16px 16px 16px', position: 'relative' }}>
          {error && (
            <div style={{ color: '#f87171', fontSize: '0.82rem', padding: '8px 0' }}>
              {error}
            </div>
          )}

          {!error && gridContent}
        </div>
      </div>
    </div>
  );
}
