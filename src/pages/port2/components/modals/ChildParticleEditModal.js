import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Select, MenuItem, FormControl, FormControlLabel, Checkbox } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

// Memoized input — defers onChange to blur to avoid re-renders while typing
const MemoizedInput = React.memo(({ value, onChange, type = 'text', placeholder = '', min, max, style = {}, step }) => {
  const [localValue, setLocalValue] = React.useState(value || '');
  const valueRef = React.useRef(value || '');
  const isFocusedRef = React.useRef(false);
  React.useEffect(() => {
    const propValue = value || '';
    if (propValue !== valueRef.current && !isFocusedRef.current) {
      setLocalValue(propValue);
      valueRef.current = propValue;
    }
  }, [value]);
  const handleChange = (e) => { const v = e.target.value; setLocalValue(v); valueRef.current = v; };
  const handleFocus = () => { isFocusedRef.current = true; };
  const handleBlur = () => {
    isFocusedRef.current = false;
    if (valueRef.current !== value) onChange({ target: { value: valueRef.current } });
  };
  return <input type={type} value={localValue} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} placeholder={placeholder} min={min} max={max} step={step} style={style} />;
});


const ChildParticleEditModal = ({
  showChildEditModal,
  setShowChildEditModal,
  editingChildEmitter,
  setEditingChildEmitter,
  editingChildSystem,
  setEditingChildSystem,
  selectedChildSystem,
  setSelectedChildSystem,
  childParticleRate,
  setChildParticleRate,
  childParticleLifetime,
  setChildParticleLifetime,
  childParticleBindWeight,
  setChildParticleBindWeight,
  childParticleTimeBeforeFirstEmission,
  setChildParticleTimeBeforeFirstEmission,
  childParticleTranslationOverrideX,
  setChildParticleTranslationOverrideX,
  childParticleTranslationOverrideY,
  setChildParticleTranslationOverrideY,
  childParticleTranslationOverrideZ,
  setChildParticleTranslationOverrideZ,
  childParticleIsSingle,
  setChildParticleIsSingle,
  availableVfxSystems,
  setAvailableVfxSystems,
  handleConfirmChildParticleEdit,
}) => {
  return (
    <Dialog
  open={showChildEditModal}
  onClose={() => {
    setShowChildEditModal(false);
    setEditingChildEmitter(null);
    setEditingChildSystem(null);
    setSelectedChildSystem('');
    setChildParticleRate('1');
    setChildParticleLifetime('9999');
    setChildParticleBindWeight('1');
    setChildParticleIsSingle(true);
    setChildParticleTimeBeforeFirstEmission('0');
    setAvailableVfxSystems([]);
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
      Edit Child Particle
    </Typography>
  </DialogTitle>
  <DialogContent sx={{ px: 3, py: 2.5 }}>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" sx={{
        color: 'var(--accent2)',
        lineHeight: 1.6,
        fontSize: '0.875rem',
      }}>
        VFX System: <strong style={{ color: 'var(--accent)' }}>{editingChildSystem?.name}</strong>
      </Typography>
      <Typography variant="body2" sx={{
        color: 'var(--accent2)',
        lineHeight: 1.6,
        fontSize: '0.875rem',
      }}>
        Emitter: <strong style={{ color: 'var(--accent)' }}>{editingChildEmitter}</strong>
      </Typography>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
        }}>
          Child VFX System:
        </Typography>
        <FormControl fullWidth size="small">
          <Select
            value={selectedChildSystem || ''}
            onChange={(e) => setSelectedChildSystem(e.target.value)}
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
            <MenuItem value="" sx={{ color: 'var(--accent2)' }}>
              Select a VFX System...
            </MenuItem>
            {availableVfxSystems.map(system => (
              <MenuItem key={system.key} value={system.key} sx={{ color: 'var(--accent2)' }}>
                {system.name} {system.key.startsWith('0x') ? `(${system.key})` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
        }}>
          Rate:
        </Typography>
        <MemoizedInput
          type="number"
          value={childParticleRate}
          onChange={(e) => setChildParticleRate(e.target.value)}
          step="0.1"
          min="0"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
        }}>
          Lifetime:
        </Typography>
        <MemoizedInput
          type="number"
          value={childParticleLifetime}
          onChange={(e) => setChildParticleLifetime(e.target.value)}
          min="0"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
        }}>
          Bind Weight:
        </Typography>
        <MemoizedInput
          type="number"
          value={childParticleBindWeight}
          onChange={(e) => setChildParticleBindWeight(e.target.value)}
          step="0.1"
          min="0"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          Time Before First Emission:
        </Typography>
        <MemoizedInput
          type="number"
          value={childParticleTimeBeforeFirstEmission}
          onChange={(e) => setChildParticleTimeBeforeFirstEmission(e.target.value)}
          step="0.01"
          min="0"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--surface)',
            color: 'var(--accent)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </Box>

      <Box>
        <Typography variant="body2" sx={{
          color: 'var(--accent2)',
          mb: 1,
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          Translation Override:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{
              color: 'var(--accent2)',
              mb: 0.5,
              fontSize: '0.75rem',
            }}>
              X:
            </Typography>
            <MemoizedInput
              type="number"
              value={childParticleTranslationOverrideX}
              onChange={(e) => setChildParticleTranslationOverrideX(e.target.value)}
              step="0.1"
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{
              color: 'var(--accent2)',
              mb: 0.5,
              fontSize: '0.75rem',
            }}>
              Y:
            </Typography>
            <MemoizedInput
              type="number"
              value={childParticleTranslationOverrideY}
              onChange={(e) => setChildParticleTranslationOverrideY(e.target.value)}
              step="0.1"
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{
              color: 'var(--accent2)',
              mb: 0.5,
              fontSize: '0.75rem',
            }}>
              Z:
            </Typography>
            <MemoizedInput
              type="number"
              value={childParticleTranslationOverrideZ}
              onChange={(e) => setChildParticleTranslationOverrideZ(e.target.value)}
              step="0.1"
              style={{
                width: '100%',
                padding: '6px 8px',
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
      </Box>

      <FormControlLabel
        control={
          <Checkbox
            checked={childParticleIsSingle}
            onChange={(e) => setChildParticleIsSingle(e.target.checked)}
            sx={{
              color: 'var(--accent2)',
              '&.Mui-checked': {
                color: 'var(--accent)',
              },
            }}
          />
        }
        label={
          <Typography variant="body2" sx={{
            color: 'var(--accent2)',
            fontSize: '0.875rem',
          }}>
            Is Single Particle
          </Typography>
        }
      />
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
        setShowChildEditModal(false);
        setEditingChildEmitter(null);
        setEditingChildSystem(null);
        setSelectedChildSystem('');
        setChildParticleRate('1');
        setChildParticleLifetime('9999');
        setChildParticleBindWeight('1');
        setChildParticleIsSingle(true);
        setChildParticleTimeBeforeFirstEmission('0');
        setAvailableVfxSystems([]);
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
      onClick={handleConfirmChildParticleEdit}
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
      Update
    </Button>
  </DialogActions>
</Dialog>
  );
};

export default ChildParticleEditModal;
