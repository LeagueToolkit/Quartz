import React from 'react';
import { Box, Checkbox, IconButton, List, ListItem, Typography } from '@mui/material';
import { ChevronRight as ChevronRightIcon, FormatListBulleted as FormatListBulletedIcon } from '@mui/icons-material';

const simulatedBins = [
  { path: 'data\\characters\\aatrox\\skins\\skin0', ext: 'bin', animateClick: true },
  { path: 'data\\characters\\aatrox\\skins\\skin1', ext: 'bin', animateClick: false },
  { path: 'data\\characters\\aatrox\\skins\\skin3', ext: 'bin', animateClick: false },
];

const simulatedEntries = [
  { id: '00276f1a', prefix: 'bum' },
  { id: '012770ad', prefix: 'bum' },
  { id: '1bb05ac9', prefix: 'bum' },
  { id: '1fb3af50', prefix: 'bum' },
  { id: '21b3b276', prefix: 'bum' },
  { id: '22b3b409', prefix: 'bum' },
  { id: '23ac426b', prefix: 'bum' },
  { id: '27f20d91', prefix: 'bum' },
  { id: '2822d7b8', prefix: 'bum' },
  { id: '2c0d8728', prefix: 'bum' },
];

const CelestiaTutorialOverlays = React.memo(function CelestiaTutorialOverlays({
  showCelestiaGuide,
  celestiaStepIndex,
  binListHighlightRect,
  panelStyle,
  simulatedBinSelected,
  setSimulatedBinSelected,
}) {
  return (
    <>
      {showCelestiaGuide && celestiaStepIndex === 1 && binListHighlightRect && (
        <>
          <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 }}>
            <Box
              sx={{
                position: 'fixed',
                left: `${binListHighlightRect.left}px`,
                top: `${binListHighlightRect.top}px`,
                width: `${binListHighlightRect.width}px`,
                height: `${binListHighlightRect.height}px`,
                ...panelStyle,
                opacity: 0.95,
                pointerEvents: 'none',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FormatListBulletedIcon sx={{ color: 'var(--accent)', fontSize: '1.2rem' }} />
                      <Typography variant="h6" sx={{ color: 'var(--accent)', fontSize: '1rem' }}>
                        Source BINs:
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 1,
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        border: '1px solid rgba(139, 92, 246, 0.2)'
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#8b5cf6', fontSize: '0.7rem', fontWeight: '600' }}>
                        {simulatedBinSelected ? '1' : '0'} / 3 selected
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, overflow: 'auto', p: 0.5 }}>
                  <List dense sx={{ py: 0 }}>
                    {simulatedBins.map((bin, idx) => (
                      <ListItem
                        key={idx}
                        sx={{
                          px: 1,
                          py: 0.75,
                          minHeight: 'auto',
                          backgroundColor: idx % 2 === 0 ? 'rgba(139, 92, 246, 0.02)' : 'transparent',
                          borderRadius: '4px',
                          mb: 0.25,
                          position: 'relative',
                        }}
                      >
                        {bin.animateClick && !simulatedBinSelected && (
                          <Box
                            sx={{
                              position: 'absolute',
                              left: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(139, 92, 246, 0.3)',
                              border: '2px solid var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              animation: 'clickPulse 1.5s ease-in-out infinite',
                              zIndex: 1,
                              '@keyframes clickPulse': {
                                '0%, 100%': { transform: 'translateY(-50%) scale(1)', opacity: 1 },
                                '50%': { transform: 'translateY(-50%) scale(1.3)', opacity: 0.6 },
                              },
                            }}
                          >
                            <Box sx={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
                          </Box>
                        )}
                        <Checkbox
                          checked={bin.animateClick ? simulatedBinSelected : false}
                          sx={{
                            color: '#8b5cf6',
                            '&.Mui-checked': { color: '#7c3aed' },
                            p: 0.25,
                            mr: 1,
                            position: 'relative',
                            zIndex: 2,
                            '& .MuiSvgIcon-root': { fontSize: '1.1rem' },
                            transition: 'all 0.3s ease',
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.65rem', opacity: 0.7, fontFamily: 'JetBrains Mono, monospace' }}>
                              {bin.path.split('\\').slice(0, -1).join('\\')}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'JetBrains Mono, monospace' }}>
                              {bin.path.split('\\').pop()}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#06b6d4', fontSize: '0.7rem', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', backgroundColor: 'rgba(6, 182, 212, 0.1)', px: 0.5, py: 0.25, borderRadius: '3px' }}>
                              .{bin.ext}
                            </Typography>
                          </Box>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Box>
            </Box>
          </Box>

          {celestiaStepIndex === 1 && !simulatedBinSelected && binListHighlightRect && (
            <Box
              sx={{
                position: 'fixed',
                left: `${binListHighlightRect.left + 4 + 8}px`,
                top: `${binListHighlightRect.top + 64 + 6 + 11}px`,
                width: '20px',
                height: '20px',
                pointerEvents: 'none',
                zIndex: 1001,
                animation: 'autoClick 2s ease-in-out 1',
                '@keyframes autoClick': {
                  '0%': { opacity: 0, transform: 'scale(0.8)' },
                  '30%': { opacity: 1, transform: 'scale(1.2)' },
                  '50%': { opacity: 1, transform: 'scale(0.9)' },
                  '100%': { opacity: 0, transform: 'scale(1)' },
                },
              }}
              onAnimationEnd={() => {
                setTimeout(() => setSimulatedBinSelected(true), 200);
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(139, 92, 246, 0.6)',
                  border: '2px solid var(--accent)',
                  boxShadow: '0 0 10px rgba(139, 92, 246, 0.8)',
                }}
              />
            </Box>
          )}
        </>
      )}

      {showCelestiaGuide && celestiaStepIndex === 2 && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 }}>
          <Box
            sx={{
              position: 'absolute',
              left: '414px',
              right: 0,
              top: '60px',
              bottom: 0,
              ...panelStyle,
              p: 1,
              opacity: 0.95,
              pointerEvents: 'none',
              border: '2px solid var(--accent)',
              boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <List dense sx={{ py: 0 }}>
              {simulatedEntries.map((entry, idx) => (
                <ListItem
                  key={idx}
                  sx={{
                    px: 1,
                    py: 0.5,
                    borderBottom: '1px solid var(--glass-border)',
                    '&:hover': { backgroundColor: 'color-mix(in srgb, var(--accent2), transparent 95%)' }
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <IconButton
                        size="small"
                        sx={{
                          color: '#06b6d4',
                          backgroundColor: 'rgba(6, 182, 212, 0.1)',
                          borderRadius: '6px',
                          width: 24,
                          height: 24,
                          p: 0.5,
                        }}
                      >
                        <ChevronRightIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>

                      <Checkbox
                        checked
                        sx={{
                          color: '#10b981',
                          '&.Mui-checked': { color: '#059669' },
                          p: 0.25,
                          mr: 1,
                          '& .MuiSvgIcon-root': { fontSize: '1.1rem' },
                        }}
                      />

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ color: 'var(--accent)', fontSize: '0.7rem', fontWeight: '600', fontFamily: 'JetBrains Mono, monospace', flex: '1 1 auto', minWidth: 0 }}>
                            {entry.id}
                          </Typography>
                          <Box sx={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '3px', px: 0.5, py: 0.25, display: 'inline-flex', alignItems: 'center', flex: '0 0 auto' }}>
                            <Typography variant="body2" sx={{ color: '#06b6d4', fontSize: '0.65rem', fontWeight: '600', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>
                              {entry.prefix}
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace', opacity: 0.7, display: 'block', width: '100%' }}>
                          ID: {entry.id}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      )}
    </>
  );
});

export default CelestiaTutorialOverlays;
