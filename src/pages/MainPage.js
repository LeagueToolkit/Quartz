import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Container,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Alert,
  CircularProgress,
  Collapse,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  ArrowForward as ArrowIcon,
  Brush as PaintIcon,
  CompareArrows as PortIcon,
  GitHub as VFXHubIcon,
  FormatColorFill as RGBAIcon,
  Image as FrogImgIcon,
  Code as BinEditorIcon,
  Build as ToolsIcon,
  Settings as SettingsIcon,
  SystemUpdateAlt as UpdateIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import CelestialWelcome from '../components/CelestialWelcome';
import CelestiaGuide from '../components/CelestiaGuide';

const MainPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const [particles, setParticles] = useState([]);
  const [showWelcome, setShowWelcome] = useState(() => {
    // Only show on first app boot in this session
    const hasShown = sessionStorage.getItem('celestialShown');
    return !hasShown;
  });
  const [showGuide, setShowGuide] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Update notification state
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [updateProgress, setUpdateProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [updateError, setUpdateError] = useState('');
  const [showUpdateNotification, setShowUpdateNotification] = useState(true);
  const [showUpToDateMessage, setShowUpToDateMessage] = useState(false);
  // Debug helpers to trace hover color flashes
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
  // No longer tracking original scroll; using explicit top jump on Skip/X

  useEffect(() => {
    // Show guide after the welcome bubble disappears, only if not seen before
    if (!showWelcome) {
      try {
        const hasSeen = localStorage.getItem('celestiaGuideSeen:main-tour') === '1';
        if (!hasSeen) setShowGuide(true);
      } catch {
        setShowGuide(true);
      }
    }
  }, [showWelcome]);

  // Setup update listeners and check version on mount
  useEffect(() => {
    const setupUpdateListeners = async () => {
      if (!window.require) return;

      const { ipcRenderer } = window.require('electron');

      // Get current version
      try {
        const versionResult = await ipcRenderer.invoke('update:get-version');
        if (versionResult.success) {
          setCurrentVersion(versionResult.version);
        }
      } catch (error) {
        console.error('Error getting version:', error);
      }

      // Listen for update events from main process
      ipcRenderer.on('update:checking', () => {
        setUpdateStatus('checking');
        setUpdateError('');
      });

      // Trigger immediate update check on mount
      try {
        setUpdateStatus('checking'); // Show loading state immediately
        ipcRenderer.invoke('update:check').catch(err => {
          console.error('Error triggering update check:', err);
          setUpdateStatus('idle');
        });
      } catch (error) {
        console.error('Error checking for updates:', error);
        setUpdateStatus('idle');
      }

      ipcRenderer.on('update:available', (event, data) => {
        setUpdateStatus('available');
        setNewVersion(data.version);
        setUpdateError('');
        setShowUpdateNotification(true); // Show notification when update is available
        // Don't show downloading/downloaded states on main page
      });

      ipcRenderer.on('update:not-available', (event, data) => {
        setUpdateStatus('not-available'); // Keep status to show message
        setNewVersion(data.version);
        setUpdateError('');
        setShowUpdateNotification(false);
        setShowUpToDateMessage(true); // Show "up to date" message

        // Hide message after 3 seconds
        setTimeout(() => {
          setShowUpToDateMessage(false);
          setUpdateStatus('idle'); // Reset to idle after message is hidden
        }, 3000);
      });

      ipcRenderer.on('update:error', (event, data) => {
        setUpdateStatus('idle'); // Hide loading state on error
        setUpdateError(data.message || 'Unknown error');
      });

      ipcRenderer.on('update:download-progress', (event, data) => {
        // Hide notification on main page during download (user should be in Settings)
        setShowUpdateNotification(false);
      });

      ipcRenderer.on('update:downloaded', (event, data) => {
        // Hide notification on main page when downloaded (user should be in Settings)
        setShowUpdateNotification(false);
      });

      // Cleanup listeners on unmount
      return () => {
        ipcRenderer.removeAllListeners('update:checking');
        ipcRenderer.removeAllListeners('update:available');
        ipcRenderer.removeAllListeners('update:not-available');
        ipcRenderer.removeAllListeners('update:error');
        ipcRenderer.removeAllListeners('update:download-progress');
        ipcRenderer.removeAllListeners('update:downloaded');
      };
    };

    setupUpdateListeners();
  }, []);

  // Cleaner minimalistic panel style
  const glassPanelSx = {
    background: 'transparent',
    // Removed border and shadows for cleaner look
    borderRadius: 3,
    p: { xs: 1.5, sm: 2, md: 3 },
  };

  // Generate floating particles
  useEffect(() => {
    if (showWelcome) {
      sessionStorage.setItem('celestialShown', '1');
    }
    const generateParticles = () => {
      const newParticles = [];
      const particleCount = isMobile ? 10 : 20;
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.5 + 0.1,
          animationDuration: Math.random() * 10 + 10,
        });
      }
      setParticles(newParticles);
    };

    generateParticles();
    return () => { };
  }, [isMobile]);

  const toolCards = [
    {
      title: 'Paint',
      description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.',
      icon: <PaintIcon />,
      path: '/paint',
      featured: true,
    },
    {
      title: 'Port',
      description: 'Bring particles from different champions or skins into your own custom skin!',
      icon: <PortIcon />,
      path: '/port',
      featured: true,
    },
    {
      title: 'VFX Hub',
      description: 'Community-powered VFX sharing exclusively for Divine members.',
      icon: <VFXHubIcon />,
      path: '/vfx-hub',
      featured: true,
    },
    {
      title: 'RGBA',
      description: 'League-supported tool to select a color and seamlessly integrate it into your code.',
      icon: <RGBAIcon />,
      path: '/rgba',
      featured: true,
    },
    {
      title: 'FrogImg',
      description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking “Batch Apply".',
      icon: <FrogImgIcon />,
      path: '/frogimg',
      featured: true,
    },
    {
      title: 'Bin Editor',
      description: 'Primarily designed for editing parameters like birthscale directly within Quartz.',
      icon: <BinEditorIcon />,
      path: '/bineditor',
      featured: true,
    },
    {
      title: 'Tools',
      description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.',
      icon: <ToolsIcon />,
      path: '/tools',
      featured: true,
    },
    {
      title: 'Settings',
      description: 'Select your preferred font and configure the Ritobin CLI path.',
      icon: <SettingsIcon />,
      path: '/settings',
      featured: true,
    },
  ];

  const guideSteps = [
    {
      title: 'Welcome to Quartz',
      text: 'Visit our Main Page to explore custom skins.',
      targetSelector: '[data-tour="hero-cta-website"]',
      padding: 14,
    },
    {
      title: 'Wiki',
      text: 'Or visit our wiki to learn more about how to create your own custom skins.',
      targetSelector: '[data-tour="hero-cta-wiki"]',
      padding: 14,
    },
    // Tool cards are appended below
    ...toolCards.map((tool) => ({
      title: tool.title,
      text: tool.description,
      targetSelector: `[data-tour="card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
      padding: 10,
    })),
  ];

  const handleCardClick = (path) => {
    navigate(path);
  };

  const handleWebsiteClick = () => {
    if (window.require) {
      const { shell } = window.require('electron');
      shell.openExternal('https://divineskins.gg');
    } else {
      window.open('https://divineskins.gg', '_blank');
    }
  };

  const handleWikiClick = () => {
    if (window.require) {
      const { shell } = window.require('electron');
      shell.openExternal('https://wiki.divineskins.gg');
    } else {
      window.open('https://wiki.divineskins.gg', '_blank');
    }
  };

  const handleOpenGuide = () => {
    try { localStorage.removeItem('celestiaGuideSeen:main-tour'); } catch { }
    // Snap to very top of the main content before starting tour
    try {
      const scrollingElement = document.scrollingElement || document.documentElement;
      scrollingElement.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } catch { }
    setShowGuide(true);
  };

  // Update handlers
  const handleDismissUpdate = () => {
    setShowUpdateNotification(false);
  };

  return (
    <Box
      key={renderKey}
      sx={{
        minHeight: '100%',
        height: '100%', // Use 100% of parent container instead of 100vh to account for title bar
        background: 'var(--bg)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Background lights - Removed for minimalistic look */}
      {showWelcome && (<CelestialWelcome onClose={() => setShowWelcome(false)} />)}
      {showGuide && (
        <CelestiaGuide
          id="main-tour"
          steps={guideSteps}
          onClose={() => {
            setShowGuide(false);
            // Defer key bump to the next tick to ensure unmount completes first
            setTimeout(() => setRenderKey((k) => k + 1), 0);
          }}
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
      {/* Floating Particles */}
      {/* Floating Particles - Removed for minimalistic look */}

      {/* Update Notification Banner - Centered (loading state) */}
      <Collapse in={updateStatus === 'checking'}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 60, sm: 70, md: 80 }, // Moved down to avoid title bar
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 16, sm: 20, md: 24 },
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Alert
            severity="info"
            icon={<CircularProgress size={20} sx={{ color: 'var(--accent2)' }} />}
            sx={{
              background: 'var(--surface)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              borderRadius: 2,
              maxWidth: 'fit-content',
              '& .MuiAlert-icon': {
                color: 'var(--accent2)',
                alignItems: 'center',
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                color: 'var(--text)',
              }}
            >
              Checking for updates...
            </Typography>
          </Alert>
        </Box>
      </Collapse>

      {/* Update Notification Banner - Centered (up to date message) */}
      <Collapse in={showUpToDateMessage}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 60, sm: 70, md: 80 }, // Moved down to avoid title bar
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 16, sm: 20, md: 24 },
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Alert
            severity="success"
            icon={<CheckCircleIcon sx={{ color: 'var(--accent)' }} />}
            sx={{
              background: 'var(--surface)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              borderRadius: 2,
              maxWidth: 'fit-content',
              '& .MuiAlert-icon': {
                color: 'var(--accent)',
                alignItems: 'center',
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                color: 'var(--text)',
              }}
            >
              Version is up to date
            </Typography>
          </Alert>
        </Box>
      </Collapse>

      {/* Update Notification Banner - Fixed at top (update available) */}
      <Collapse in={showUpdateNotification && updateStatus === 'available'}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 60, sm: 70, md: 80 }, // Moved down to avoid title bar
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 12, sm: 16, md: 20 },
            zIndex: 10000,
          }}
        >
          <Alert
            severity="info"
            icon={<UpdateIcon />}
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'nowrap' }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    // Set flag in localStorage to highlight update section
                    try {
                      localStorage.setItem('settings:highlight-update', 'true');
                    } catch (e) {
                      console.error('Error setting highlight flag:', e);
                    }
                    navigate('/settings');
                  }}
                  startIcon={<SettingsIcon />}
                  sx={{
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    fontSize: { xs: '0.7rem', sm: '0.75rem' },
                    px: { xs: 1, sm: 1.5 },
                    py: 0.5,
                    minWidth: 'auto',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      background: 'color-mix(in srgb, var(--accent) 90%, black)',
                    }
                  }}
                >
                  Go to Settings
                </Button>
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={handleDismissUpdate}
                  sx={{
                    color: 'inherit',
                    flexShrink: 0,
                    ml: 0.5,
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
            sx={{
              background: 'var(--surface)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              borderRadius: 2,
              '& .MuiAlert-icon': {
                color: 'var(--accent2)',
                alignItems: 'flex-start',
                mt: 0.5,
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                flex: 1,
                overflow: 'hidden',
                pr: 1,
              },
              '& .MuiAlert-action': {
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 0.5,
                flexShrink: 0,
              }
            }}
          >
            <Box sx={{ overflow: 'hidden' }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  mb: 0.5,
                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Update Available: Quartz {newVersion}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  opacity: 0.8,
                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                  color: 'var(--text)',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                A new version is available. Go to Settings to download and install.
              </Typography>
            </Box>
          </Alert>
        </Box>
      </Collapse>

      <Container
        key={renderKey}
        maxWidth="lg"
        sx={{
          position: 'relative',
          zIndex: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          py: { xs: 1.5, sm: 2, md: 3 },
          px: { xs: 1.5, sm: 2, md: 3 },
          pt: { xs: 1.5, sm: 2, md: 3 }, // Fixed padding - notification is fixed overlay, doesn't push content
        }}
      >
        <Box sx={{ ...glassPanelSx, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Hero Section */}
          <Box
            sx={{
              textAlign: 'center',
              flexShrink: 0,
              mb: { xs: 2, sm: 3, md: 4 },
              pt: { xs: 1, sm: 2 },
            }}
          >
            {/* Title */}
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.5rem', sm: '3rem', md: '3.8rem', lg: '4.2rem' },
                fontWeight: 'bold',
                color: 'var(--accent)',
                mb: { xs: 1.5, sm: 2 },
              }}
            >
              Quartz
            </Typography>

            {/* Golden Underline */}
            <Box
              sx={{
                width: { xs: '120px', sm: '150px', md: '180px' },
                height: '2px',
                background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                margin: '0 auto',
                mb: { xs: 2, sm: 2.5, md: 3 },
              }}
            />

            {/* Call-to-Action Buttons */}
            <Box sx={{
              display: 'flex',
              gap: { xs: 1, sm: 1.5 },
              justifyContent: 'center',
              flexWrap: 'wrap',
              mb: 0,
            }}>
              <Button
                variant="contained"
                startIcon={<PlayIcon />}
                onClick={handleWebsiteClick}
                data-tour="hero-cta-website"
                sx={{
                  background: 'transparent',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  px: { xs: 1.5, sm: 2.5, md: 3 },
                  py: { xs: 0.8, sm: 1.2 },
                  borderRadius: '6px',
                  fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  textTransform: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                  '&:hover': {
                    background: 'rgba(255, 255, 255, 0.05)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)',
                    borderColor: 'var(--accent)'
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                Website
              </Button>
              <Button
                variant="outlined"
                endIcon={<ArrowIcon />}
                onClick={handleWikiClick}
                data-tour="hero-cta-wiki"
                sx={{
                  background: 'transparent',
                  border: '1px solid var(--accent-muted)',
                  color: 'var(--text)',
                  px: { xs: 1.5, sm: 2.5, md: 3 },
                  py: { xs: 0.8, sm: 1.2 },
                  borderRadius: '6px',
                  fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
                  textTransform: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                  '&:hover': {
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'var(--text)',
                    color: 'var(--text)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 0 10px rgba(255,255,255,0.1)'
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                Wiki
              </Button>
            </Box>
          </Box>

          {/* Tool Cards Grid */}
          <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            mt: { xs: 7, sm: 8, md: 9 },
          }}>
            <Grid
              container
              spacing={{ xs: 1, sm: 1.5, md: 2 }}
              sx={{
                flex: 1,
                alignContent: 'flex-start',
                justifyContent: 'center',
              }}
            >
              {toolCards.map((tool) => (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={3}
                  lg={3}
                  key={tool.title}
                  sx={{
                    display: 'flex',
                    minHeight: { xs: '80px', sm: '90px', md: '100px' },
                  }}
                >
                  <Card
                    onClick={() => handleCardClick(tool.path)}
                    data-tour={`card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onMouseEnter={(e) => debugCardHover(e, tool.title)}
                    onMouseLeave={(e) => debugCardLeave(e, tool.title)}
                    sx={{
                      background: 'transparent !important', // Force override
                      border: tool.featured
                        ? '1px solid color-mix(in srgb, var(--accent), transparent 70%) !important'
                        : '1px solid color-mix(in srgb, var(--accent-muted), transparent 70%) !important',
                      borderRadius: 2,
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        background: 'rgba(255, 255, 255, 0.03) !important',
                        borderColor: 'var(--accent) !important',
                        boxShadow: tool.featured
                          ? '0 0 15px color-mix(in srgb, var(--accent), transparent 70%)'
                          : '0 4px 12px rgba(0,0,0,0.3)',
                      }
                    }}
                  >
                    {/* Status Indicator */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 10,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#4CAF50',
                        boxShadow: '0 0 0 2px rgba(0,0,0,0.35), 0 0 8px rgba(76,175,80,0.6)',
                        zIndex: 1,
                      }}
                    />

                    <CardContent sx={{
                      p: { xs: 1, sm: 1.5, md: 2 },
                      height: '%',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                    }}>
                      {/* Icon */}
                      <Box
                        sx={{
                          color: tool.featured ? 'var(--accent)' : 'var(--accent-muted)',
                          fontSize: { xs: '1.2rem', sm: '1.4rem', md: '1.8rem' },
                          mb: { xs: 0.5, sm: 0.8, md: 1 },
                          display: 'flex',
                          alignItems: 'center',
                          '& .MuiSvgIcon-root': {
                            filter: 'drop-shadow(0 6px 16px rgba(236,185,106,0.25))'
                          }
                        }}
                      >
                        {tool.icon}
                      </Box>

                      {/* Title */}
                      <Typography
                        variant="h6"
                        sx={{
                          color: tool.featured ? 'var(--accent)' : 'var(--text)',
                          fontWeight: 'bold',
                          mb: { xs: 0.2, sm: 0.3 },
                          fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.9rem' },
                        }}
                      >
                        {tool.title}
                      </Typography>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'var(--text-2)',
                          opacity: 0.8,
                          lineHeight: 1.2,
                          flex: 1,
                          fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        }}
                      >
                        {tool.description}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Container>

      {/* Floating Celestia trigger */}
      {!showGuide && (
        <Tooltip title="Celestia guide" placement="left" arrow>
          <IconButton
            onClick={handleOpenGuide}
            aria-label="Open Celestia guide"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: 'var(--bg-2)',
              color: 'var(--text)',
              border: '1px solid var(--accent-muted)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              '&:hover': {
                background: 'var(--surface-2)',
                borderColor: 'var(--accent)',
                boxShadow: '0 0 15px color-mix(in srgb, var(--accent), transparent 60%)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>!</Box>
          </IconButton>
        </Tooltip>
      )}

      {/* Global CSS for animations */}
      <style>
        {`
          @keyframes float {
            0%, 100% {
              transform: translateY(0px) translateX(0px);
            }
            25% {
              transform: translateY(-20px) translateX(10px);
            }
            50% {
              transform: translateY(-10px) translateX(-10px);
            }
            75% {
              transform: translateY(-30px) translateX(5px);
            }
          }
        `}
      </style>
    </Box>
  );
};

export default MainPage; 