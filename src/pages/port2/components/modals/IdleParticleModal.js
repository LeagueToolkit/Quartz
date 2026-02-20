import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Select, MenuItem, FormControl } from '@mui/material';
import { Warning as WarningIcon, Add as AddIcon } from '@mui/icons-material';
import { BONE_NAMES } from '../../../../utils/vfx/mutations/idleParticlesManager.js';

const IdleParticleModal = ({
  showIdleParticleModal,
  setShowIdleParticleModal,
  selectedSystemForIdle,
  setSelectedSystemForIdle,
  isEditingIdle,
  setIsEditingIdle,
  idleBonesList,
  setIdleBonesList,
  existingIdleBones,
  setExistingIdleBones,
  handleConfirmIdleParticles,
}) => {
  return (
    <Dialog
  open={showIdleParticleModal}
  onClose={() => {
    setShowIdleParticleModal(false);
    setSelectedSystemForIdle(null);
    setIsEditingIdle(false);
    setExistingIdleBones([]);
    setIdleBonesList([{ id: Date.now(), boneName: 'head', customBoneName: '' }]);
  }}
  maxWidth="sm"
  fullWidth
  PaperProps={{
    sx: {
      background: 'transparent',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      borderRadius: 3,
      overflow: 'hidden',
    }
  }}
>
  <Box
    sx={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '4px',
      background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
      backgroundSize: '200% 100%',
      animation: 'shimmer 3s ease-in-out infinite',
      '@keyframes shimmer': {
        '0%': { backgroundPosition: '200% 0' },
        '100%': { backgroundPosition: '-200% 0' },
      },
    }}
  />
  <DialogTitle sx={{
    color: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    pb: 1.5,
    pt: 2.5,
    px: 3,
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  }}>
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <WarningIcon sx={{ color: 'var(--accent)', fontSize: '1.5rem' }} />
    </Box>
    <Typography variant="h6" sx={{
      fontWeight: 600,
      color: 'var(--accent)',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '1rem',
    }}>
      {isEditingIdle ? 'Edit Idle Particles' : 'Add Idle Particles'}
    </Typography>
  </DialogTitle>
  <DialogContent sx={{ px: 3, py: 2.5 }}>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" sx={{
        color: 'var(--accent2)',
        lineHeight: 1.6,
        fontSize: '0.875rem',
      }}>
        VFX System: <strong style={{ color: 'var(--accent)' }}>{selectedSystemForIdle?.name}</strong>
      </Typography>

      <Typography variant="body2" sx={{
        color: 'var(--accent2)',
        fontSize: '0.875rem',
        fontWeight: 600,
      }}>
        {isEditingIdle ? `Edit idle particles (${idleBonesList.length}):` : 'Add idle particles:'}
      </Typography>

      {idleBonesList.length === 0 && (
        <Box sx={{
          backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
          border: '1px dashed rgba(255, 255, 255, 0.06)',
          borderRadius: 1.5,
          p: 3,
          textAlign: 'center',
        }}>
          <Typography variant="body2" sx={{
            color: 'var(--accent2)',
            fontSize: '0.8rem',
          }}>
            No idle particles yet. Click "Add Another Bone" below to add one.
          </Typography>
        </Box>
      )}

      {idleBonesList.map((item, index) => (
        <Box key={item.id} sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2,
          backgroundColor: 'rgba(var(--accent-rgb), 0.03)',
          borderRadius: 1.5,
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{
              color: 'var(--accent)',
              fontSize: '0.8rem',
              fontWeight: 600,
              minWidth: '60px',
            }}>
              Bone #{index + 1}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                const newList = idleBonesList.filter(bone => bone.id !== item.id);
                setIdleBonesList(newList);
              }}
              sx={{
                minWidth: 'auto',
                padding: '2px 8px',
                fontSize: '0.7rem',
                color: '#ff6b6b',
                borderColor: '#ff6b6b',
                '&:hover': {
                  backgroundColor: 'rgba(255, 107, 107, 0.1)',
                  borderColor: '#ff6b6b',
                },
              }}
              variant="outlined"
            >
              Remove
            </Button>
          </Box>

          <Box>
            <Typography variant="body2" sx={{
              color: 'var(--accent2)',
              mb: 0.5,
              fontSize: '0.75rem',
            }}>
              Select bone:
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={item.boneName}
                onChange={(e) => {
                  const newList = idleBonesList.map(bone =>
                    bone.id === item.id ? { ...bone, boneName: e.target.value } : bone
                  );
                  setIdleBonesList(newList);
                }}
                sx={{
                  color: 'var(--accent)',
                  backgroundColor: 'var(--surface)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.06)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--accent)',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--accent)',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'var(--accent)',
                  },
                }}
              >
                {BONE_NAMES.map(bone => (
                  <MenuItem key={bone} value={bone} sx={{ color: 'var(--accent2)' }}>
                    {bone}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="body2" sx={{
              color: 'var(--accent2)',
              mb: 0.5,
              fontSize: '0.75rem',
            }}>
              Or custom bone name:
            </Typography>
            <input
              type="text"
              value={item.customBoneName}
              onChange={(e) => {
                const newList = idleBonesList.map(bone =>
                  bone.id === item.id ? { ...bone, customBoneName: e.target.value } : bone
                );
                setIdleBonesList(newList);
              }}
              placeholder="e.g., r_weapon, C_Head_Jnt"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </Box>
        </Box>
      ))}

      <Button
        onClick={() => {
          setIdleBonesList([...idleBonesList, { id: Date.now(), boneName: 'head', customBoneName: '' }]);
        }}
        variant="outlined"
        startIcon={<AddIcon />}
        sx={{
          color: 'var(--accent)',
          borderColor: 'rgba(255, 255, 255, 0.06)',
          textTransform: 'none',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.75rem',
          '&:hover': {
            borderColor: 'var(--accent)',
            backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
          },
        }}
      >
        Add Another Bone
      </Button>
    </Box>
  </DialogContent>
  <DialogActions sx={{
    p: 2.5,
    pt: 2,
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    gap: 1.5,
  }}>
    <Button
      onClick={() => {
        setShowIdleParticleModal(false);
        setSelectedSystemForIdle(null);
        setIsEditingIdle(false);
        setExistingIdleBones([]);
        setIdleBonesList([]);
      }}
      variant="outlined"
      sx={{
        color: 'var(--accent2)',
        borderColor: 'rgba(255, 255, 255, 0.06)',
        textTransform: 'none',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.8rem',
        px: 2,
        '&:hover': {
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
        },
      }}
    >
      Cancel
    </Button>
    <Button
      onClick={handleConfirmIdleParticles}
      variant="contained"
      sx={{
        backgroundColor: 'var(--accent)',
        color: 'var(--surface)',
        textTransform: 'none',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.8rem',
        fontWeight: 600,
        px: 2.5,
        '&:hover': {
          backgroundColor: 'var(--accent2)',
        },
      }}
    >
      {isEditingIdle ? `Add ${idleBonesList.length} More` : `Add ${idleBonesList.length} Idle Particle${idleBonesList.length > 1 ? 's' : ''}`}
    </Button>
  </DialogActions>
</Dialog>
  );
};

export default IdleParticleModal;
