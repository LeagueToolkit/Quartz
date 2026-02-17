import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Alert,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import {
  Brush as PaintIcon,
  ArrowLeftRight as PortIcon,
  Github as VFXHubIcon,
  Pipette as RGBAIcon,
  Image as FrogImgIcon,
  Code as BinEditorIcon,
  Wrench as ToolsIcon,
  Settings as SettingsIcon,
  Maximize as UpscaleIcon,
  FileDigit as FileHandlerIcon,
  Waypoints as BumpathIcon,
  Shuffle as AniPortIcon,
  FolderInput as AssetExtractorIcon,
  Music as BnkExtractIcon,
  Sparkles as FakeGearIcon,
  Dices as ParticleRandIcon,
  Rocket as LaunchIcon,
} from 'lucide-react';
import CelestialWelcome from '../components/CelestialWelcome';
import CelestiaGuide from '../components/CelestiaGuide';

const MainPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const [particles, setParticles] = useState([]);
  const [showWelcome, setShowWelcome] = useState(() => {
    const hasShown = localStorage.getItem('celestialShown');
    return !hasShown;
  });
  const [showGuide, setShowGuide] = useState(false);
  const [renderKey, setRenderKey] = useState(0);


  const logThemeVars = (label) => {
    try {
      const root = getComputedStyle(document.documentElement);
      const keys = ['--accent', '--accent2', '--accent-muted', '--bg', '--bg-2', '--surface', '--surface-2'];
      const out = {};
      keys.forEach(k => { out[k] = root.getPropertyValue(k).trim(); });
      // eslint-disable-next-line no-console
      console.log('[ThemeVars]', label, out);
    } catch { }
  };

  const debugCardHover = (event, title) => {
    try {
      const el = event.currentTarget;
      logThemeVars(`Card Hover Enter: ${title}`);
      const dump = (when) => {
        const cs = getComputedStyle(el);
        // eslint-disable-next-line no-console
        console.log('[CardStyles]', title, when, {
          background: cs.backgroundImage || cs.backgroundColor,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow
        });
      };
      dump('now');
      requestAnimationFrame(() => dump('raf1'));
      requestAnimationFrame(() => requestAnimationFrame(() => dump('raf2')));
      setTimeout(() => dump('+100ms'), 100);
    } catch { }
  };

  const debugCardLeave = (event, title) => {
    try {
      const el = event.currentTarget;
      const cs = getComputedStyle(el);
      // eslint-disable-next-line no-console
      console.log('[CardLeave]', title, {
        background: cs.backgroundImage || cs.backgroundColor,
        borderColor: cs.borderTopColor,
        boxShadow: cs.boxShadow
      });
    } catch { }
  };

  useEffect(() => {
    if (!showWelcome) {
      try {
        const hasSeen = localStorage.getItem('celestiaGuideSeen:main-tour') === '1';
        if (!hasSeen) setShowGuide(true);
      } catch {
        setShowGuide(true);
      }
    }
  }, [showWelcome]);

  useEffect(() => {
    if (showWelcome) localStorage.setItem('celestialShown', '1');
    const count = isMobile ? 10 : 20;
    setParticles(Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.1,
      animationDuration: Math.random() * 10 + 10,
    })));
    return () => { };
  }, [isMobile]);

  const toolCards = [
    // Row 1 — core creative tools
    { title: 'Paint', description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.', icon: <PaintIcon size={18} />, path: '/paint' },
    { title: 'Port', description: 'Bring particles from different champions or skins into your own custom skin!', icon: <PortIcon size={18} />, path: '/port' },
    { title: 'VFX Hub', description: 'Community-powered VFX sharing exclusively for Divine members.', icon: <VFXHubIcon size={18} />, path: '/vfx-hub' },
    { title: 'RGBA', description: 'League-supported tool to select a color and seamlessly integrate it into your code.', icon: <RGBAIcon size={18} />, path: '/rgba' },
    // Row 2 — file & image tools
    { title: 'Img Recolor', description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking "Batch Apply".', icon: <FrogImgIcon size={18} />, path: '/img-recolor' },
    { title: 'Bin Editor', description: 'Primarily designed for editing parameters like birthscale directly within Quartz.', icon: <BinEditorIcon size={18} />, path: '/bineditor' },
    { title: 'Asset Extractor', description: 'Extract and decompose League of Legends game assets from WAD files.', icon: <AssetExtractorIcon size={18} />, path: '/frogchanger' },
    { title: 'Sound Banks', description: 'Extract, edit, and repack audio bank files for custom sound mods.', icon: <BnkExtractIcon size={18} />, path: '/bnk-extract' },
    // Row 3 — advanced VFX & animation
    { title: 'Upscale', description: 'AI-powered image upscaling for DDS and PNG texture files.', icon: <UpscaleIcon size={18} />, path: '/upscale' },
    { title: 'FakeGear', description: 'Enables a Ctrl+5 in-game toggle to swap between VFX variants on your custom skin.', icon: <FakeGearIcon size={18} />, path: '/fakegear' },
    { title: 'Randomizer', description: 'Randomize VFX particle parameters across your entire skin at once.', icon: <ParticleRandIcon size={18} />, path: '/particle-randomizer' },
    { title: 'AniPort', description: 'Port animations between different champions or skins.', icon: <AniPortIcon size={18} />, path: '/aniport', wip: true },
    // Row 4 — extraction, utility & system
    { title: 'Bumpath', description: 'Repath League of Legends file references across your skin files.', icon: <BumpathIcon size={18} />, path: '/bumpath' },
    { title: 'File Handler', description: 'Universal file processing and randomization utility for bulk operations.', icon: <FileHandlerIcon size={18} />, path: '/file-randomizer' },
    { title: 'Tools', description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.', icon: <ToolsIcon size={18} />, path: '/tools' },
    { title: 'Settings', description: 'Select your preferred font and configure the Ritobin CLI path.', icon: <SettingsIcon size={18} />, path: '/settings' },
  ];

  const guideSteps = [
    { title: 'Welcome to Quartz', text: 'Visit our Main Page to explore custom skins.', targetSelector: '[data-tour="hero-cta-website"]', padding: 14 },
    { title: 'Wiki', text: 'Or visit our wiki to learn more about custom skins.', targetSelector: '[data-tour="hero-cta-wiki"]', padding: 14 },
    ...toolCards.map((tool) => ({
      title: tool.title, text: tool.description,
      targetSelector: `[data-tour="card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
      padding: 10,
    })),
  ];

  const handleCardClick = (path) => navigate(path);

  const handleWebsiteClick = () => {
    if (window.require) window.require('electron').shell.openExternal('https://divineskins.gg');
    else window.open('https://divineskins.gg', '_blank');
  };

  const handleWikiClick = () => {
    if (window.require) window.require('electron').shell.openExternal('https://wiki.divineskins.gg');
    else window.open('https://wiki.divineskins.gg', '_blank');
  };

  const handleOpenGuide = () => {
    try { localStorage.removeItem('celestiaGuideSeen:main-tour'); } catch { }
    try { (document.scrollingElement || document.documentElement).scrollTo({ left: 0, top: 0, behavior: 'auto' }); } catch { }
    setShowGuide(true);
  };


  // ─── Shared notification style ─────────────────────────────────────────────
  const notifSx = {
    position: 'fixed',
    top: { xs: 60, sm: 70, md: 80 },
    left: { xs: 80, sm: 80, md: 80 },
    right: { xs: 16, sm: 20, md: 24 },
    zIndex: 10000,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  };
  const alertSx = {
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
    borderRadius: 2,
    '& .MuiAlert-message': { color: 'var(--text)', display: 'flex', alignItems: 'center' },
  };

  return (
    <Box
      key={renderKey}
      className="main-page-container"
      sx={{
        minHeight: '100%', height: '100%',
        background: 'var(--bg)',
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {showWelcome && <CelestialWelcome onClose={() => setShowWelcome(false)} />}
      {showGuide && (
        <CelestiaGuide
          id="main-tour"
          steps={guideSteps}
          onClose={() => { setShowGuide(false); setTimeout(() => setRenderKey((k) => k + 1), 0); }}
          onRestore={undefined}
          onSkipToTop={() => {
            try {
              const se = document.scrollingElement || document.documentElement;
              if (se) se.scrollTo({ left: 0, top: 0, behavior: 'auto' });
              if (document.documentElement) { document.documentElement.scrollLeft = 0; document.documentElement.scrollTop = 0; }
              if (document.body) { document.body.scrollLeft = 0; document.body.scrollTop = 0; }
              window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
            } catch { }
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════ HERO */}
      <Box sx={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        // ~40% of the available height
        minHeight: { xs: '36%', sm: '38%', md: '40%' },
        zIndex: 2,
      }}>
        {/* Primary glow orb — animates slowly */}
        <Box sx={{
          position: 'absolute',
          top: '55%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: 300, sm: 440, md: 580 },
          height: { xs: 160, sm: 220, md: 280 },
          background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 68%)',
          filter: 'blur(45px)',
          animation: 'glow-pulse 6s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        {/* Secondary cooler tint orb for depth */}
        <Box sx={{
          position: 'absolute',
          top: '45%', left: '52%',
          transform: 'translate(-50%, -50%)',
          width: { xs: 200, sm: 300, md: 380 },
          height: { xs: 100, sm: 150, md: 190 },
          background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent2) 7%, transparent) 0%, transparent 70%)',
          filter: 'blur(55px)',
          animation: 'glow-pulse 6s ease-in-out infinite 1.5s',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* QUARTZ */}
        <Typography variant="h1" sx={{
          position: 'relative', zIndex: 1,
          fontSize: { xs: '3.8rem', sm: '5.5rem', md: '7rem' },
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          background: 'linear-gradient(to right, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'shimmer-text 5s linear infinite',
          willChange: 'background-position',
          textAlign: 'center',
          textShadow: '0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)',
          mb: 1.25,
          userSelect: 'none',
        }}>
          Quartz
        </Typography>

        {/* Tagline */}
        <Typography sx={{
          position: 'relative', zIndex: 1,
          color: 'var(--text-2)',
          fontSize: { xs: '0.6rem', sm: '0.68rem', md: '0.73rem' },
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          opacity: 0.55,
          mb: { xs: 2.5, sm: 3, md: 3.5 },
          textAlign: 'center',
          userSelect: 'none',
        }}>
          League of Legends Toolkit
        </Typography>

        {/* CTA buttons */}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', gap: { xs: 1, sm: 1.5 } }}>
          <Button
            onClick={handleWebsiteClick}
            data-tour="hero-cta-website"
            startIcon={<PlayIcon sx={{ fontSize: '0.9rem !important' }} />}
            sx={{
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
              color: 'var(--accent)',
              fontWeight: 600,
              px: { xs: 2, sm: 2.5 }, py: { xs: 0.7, sm: 0.9 },
              borderRadius: '8px',
              fontSize: { xs: '0.75rem', sm: '0.82rem' },
              textTransform: 'none',
              letterSpacing: '0.03em',
              transition: 'all 0.22s ease',
              '&:hover': {
                background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                borderColor: 'var(--accent)',
                boxShadow: '0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            Website
          </Button>
          <Button
            onClick={handleWikiClick}
            data-tour="hero-cta-wiki"
            endIcon={<ArrowIcon sx={{ fontSize: '0.9rem !important' }} />}
            sx={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.45)',
              px: { xs: 2, sm: 2.5 }, py: { xs: 0.7, sm: 0.9 },
              borderRadius: '8px',
              fontSize: { xs: '0.75rem', sm: '0.82rem' },
              textTransform: 'none',
              letterSpacing: '0.03em',
              transition: 'all 0.22s ease',
              '&:hover': {
                background: 'rgba(255,255,255,0.06)',
                borderColor: 'rgba(255,255,255,0.28)',
                color: 'var(--text)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            Wiki
          </Button>
        </Box>
      </Box>

      {/* Separator line */}
      <Box sx={{
        flexShrink: 0,
        mx: { xs: 2, sm: 3, md: 4 },
        height: '1px',
        background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 30%, transparent) 40%, color-mix(in srgb, var(--accent) 30%, transparent) 60%, transparent)',
        opacity: 0.4,
        zIndex: 2,
      }} />

      {/* ═══════════════════════════════════════════════════════════ TOOL GRID */}
      <Box sx={{
        flex: 1, minHeight: 0,
        px: { xs: 1.5, sm: 2.5, md: 3.5 },
        pt: { xs: 1.25, sm: 1.5, md: 2 },
        pb: { xs: 1.5, sm: 2, md: 2.5 },
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: { xs: 1, sm: 1.25, md: 1.5 },
        position: 'relative',
        zIndex: 2,
      }}>
        {toolCards.map((tool) => (
          <Tooltip
            key={tool.title}
            title={
              <Box sx={{ maxWidth: 230 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.4 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: tool.wip ? 'rgba(255,255,255,0.45)' : 'var(--accent)' }}>
                    {tool.title}
                  </Typography>
                  {tool.wip && (
                    <Box sx={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: '4px', px: 0.6, py: 0.1 }}>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgb(239,68,68)', lineHeight: 1.4, letterSpacing: '0.04em' }}>BUGGY</Typography>
                    </Box>
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--text-2)', opacity: 0.85 }}>
                  {tool.description}
                </Typography>
                {tool.wip && (
                  <Typography sx={{ fontSize: '0.68rem', mt: 0.75, color: 'rgb(239,68,68)', opacity: 0.9, lineHeight: 1.4 }}>
                    ⚠ This tool is incomplete and may have bugs.
                  </Typography>
                )}
              </Box>
            }
            placement="top"
            arrow
            enterDelay={400}
            componentsProps={{
              tooltip: {
                sx: {
                  background: 'var(--surface)',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  borderRadius: '10px',
                  p: 1.5,
                  '& .MuiTooltip-arrow': {
                    color: 'var(--surface)',
                    '&::before': { border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' },
                  },
                },
              },
            }}
          >
            <Box
              onClick={() => handleCardClick(tool.path)}
              className="main-page-card"
              data-tour={`card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              onMouseEnter={(e) => debugCardHover(e, tool.title)}
              onMouseLeave={(e) => debugCardLeave(e, tool.title)}
              sx={{
                background: 'rgba(255,255,255,0.026)',
                border: tool.wip ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.055)',
                borderRadius: '12px',
                cursor: 'pointer',
                p: { xs: 1.25, sm: 1.5, md: 2 },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                opacity: tool.wip ? 0.55 : 1,
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease, opacity 0.2s ease',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0, left: '20%', right: '20%', height: '1px',
                  background: tool.wip
                    ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.15), transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
                  pointerEvents: 'none',
                },
                '&:hover': {
                  background: 'rgba(255,255,255,0.055)',
                  borderColor: tool.wip ? 'rgba(239,68,68,0.45)' : 'color-mix(in srgb, var(--accent) 55%, transparent)',
                  transform: 'translateY(-3px)',
                  opacity: tool.wip ? 0.75 : 1,
                  boxShadow: tool.wip
                    ? '0 8px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(239,68,68,0.15)'
                    : '0 8px 28px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)',
                },
              }}
            >
              {/* WIP red dot */}
              {tool.wip && (
                <Box sx={{
                  position: 'absolute', top: 8, right: 8,
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'rgb(239,68,68)',
                  boxShadow: '0 0 6px rgba(239,68,68,0.7)',
                }} />
              )}

              {/* Icon */}
              <Box sx={{
                color: 'var(--accent)',
                mb: { xs: 0.75, sm: 1 },
                display: 'flex',
                '& .MuiSvgIcon-root': {
                  fontSize: { xs: '1.1rem', sm: '1.3rem', md: '1.5rem' },
                  filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 40%, transparent))',
                },
              }}>
                {tool.icon}
              </Box>

              {/* Title */}
              <Typography sx={{
                color: 'var(--text)',
                fontWeight: 700,
                fontSize: { xs: '0.75rem', sm: '0.82rem', md: '0.88rem' },
                lineHeight: 1.2,
                mb: { xs: 0.4, sm: 0.5 },
              }}>
                {tool.title}
              </Typography>

              {/* Description */}
              <Typography sx={{
                color: 'var(--text-2)',
                fontSize: { xs: '0.58rem', sm: '0.63rem', md: '0.67rem' },
                lineHeight: 1.4,
                opacity: 0.72,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {tool.description}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>

      {/* Celestia guide trigger */}
      {!showGuide && (
        <>
          {/* Test Welcome Trigger */}
          <Tooltip title="Test Welcome Screen" placement="left" arrow>
            <IconButton
              onClick={() => setShowWelcome(true)}
              sx={{
                position: 'fixed', top: 120, right: 24,
                width: 36, height: 36, borderRadius: '50%',
                zIndex: 4500,
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
                  color: 'var(--accent)',
                  boxShadow: '0 0 16px color-mix(in srgb, var(--accent) 22%, transparent)',
                },
              }}
            >
              <LaunchIcon size={18} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Celestia guide" placement="left" arrow>
            <IconButton
              onClick={handleOpenGuide}
              aria-label="Open Celestia guide"
              sx={{
                position: 'fixed', top: 72, right: 24,
                width: 36, height: 36, borderRadius: '50%',
                zIndex: 4500,
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
                  color: 'var(--accent)',
                  boxShadow: '0 0 16px color-mix(in srgb, var(--accent) 22%, transparent)',
                },
              }}
            >
              <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>?</Box>
            </IconButton>
          </Tooltip>
        </>
      )}

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }
        @keyframes shimmer-text {
          from { background-position: 0% center; }
          to { background-position: 200% center; }
        }
      `}</style>
    </Box>
  );
};

export default MainPage;
