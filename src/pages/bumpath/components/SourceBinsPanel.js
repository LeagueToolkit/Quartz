import React from 'react';
import { Box, Button, Checkbox, InputAdornment, List, ListItem, Typography } from '@mui/material';
import { FormatListBulleted as FormatListBulletedIcon, Search as SearchIcon } from '@mui/icons-material';
import DebouncedTextField from './DebouncedTextField';

const SourceBinsPanel = React.memo(function SourceBinsPanel({
  binFilter,
  setBinFilter,
  filteredBins,
  selectedBinCount,
  totalBinCount,
  handleBinSelect,
}) {
  return (
    <Box
      sx={{
        width: '350px',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-bumpath-bin-list>
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
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
                {selectedBinCount} / {totalBinCount} selected
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DebouncedTextField
              placeholder="Filter BIN files..."
              value={binFilter}
              onValueChange={setBinFilter}
              debounceMs={150}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'var(--accent2)', fontSize: '1rem' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg-2)',
                  borderRadius: '6px',
                  '& fieldset': {
                    borderColor: 'var(--glass-border)',
                    borderWidth: '1px'
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--accent-muted)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--accent)',
                  },
                },
                '& .MuiInputBase-input': {
                  fontSize: '0.8rem',
                  fontFamily: 'JetBrains Mono, monospace'
                }
              }}
            />
            {binFilter && (
              <Button
                size="small"
                onClick={() => setBinFilter('')}
                sx={{
                  minWidth: 'auto',
                  px: 1,
                  py: 0.5,
                  color: 'var(--accent2)',
                  '&:hover': { color: 'var(--accent)' }
                }}
              >
                x
              </Button>
            )}
          </Box>

          {binFilter && (
            <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.7rem', mt: 0.5 }}>
              Showing {filteredBins.length} of {totalBinCount} BINs
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 0.5,
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'var(--bg-2)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--accent2)',
              borderRadius: '4px',
              '&:hover': {
                background: 'var(--accent)',
              },
            },
            minHeight: '200px'
          }}
        >
          <List dense sx={{ py: 0 }}>
            {filteredBins.map(([unifyPath, data]) => {
              const pathToUse = data?.rel_path || data?.path || unifyPath || '';
              const fileName = pathToUse.split('/').pop() || pathToUse.split('\\').pop() || pathToUse;
              const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : '';
              const pathWithoutFile = pathToUse.replace(fileName, '');

              return (
                <ListItem
                  key={unifyPath}
                  sx={{
                    px: 1,
                    py: 0.75,
                    minHeight: 'auto',
                    backgroundColor: 'transparent',
                    borderRadius: '4px',
                    mb: 0.25,
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    },
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <Checkbox
                    checked={data.selected}
                    onChange={(e) => handleBinSelect(unifyPath, e.target.checked)}
                    sx={{
                      color: 'var(--text-2)',
                      '&.Mui-checked': {
                        color: 'var(--accent)',
                      },
                      p: 0.25,
                      mr: 1,
                      '& .MuiSvgIcon-root': {
                        fontSize: '1.1rem'
                      },
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'var(--text-2)',
                          fontSize: '0.65rem',
                          opacity: 0.7,
                          fontFamily: 'JetBrains Mono, monospace'
                        }}
                      >
                        {pathWithoutFile}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'var(--text)',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          fontFamily: 'JetBrains Mono, monospace'
                        }}
                      >
                        {fileName.replace(`.${fileExtension}`, '')}
                      </Typography>
                      {fileExtension && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'var(--accent)',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            fontFamily: 'JetBrains Mono, monospace',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            px: 0.5,
                            py: 0.25,
                            borderRadius: '3px'
                          }}
                        >
                          .{fileExtension}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Box>
    </Box>
  );
});

export default SourceBinsPanel;
