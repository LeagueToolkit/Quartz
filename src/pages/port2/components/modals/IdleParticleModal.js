import React from 'react';
import { Add as AddIcon } from '@mui/icons-material';
import { BONE_NAMES } from '../../../../utils/vfx/mutations/idleParticlesManager.js';

/* ── shared button tokens ── */
const btnBase = {
  padding: '7px 18px',
  borderRadius: 6,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.22s ease',
  outline: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontFamily: 'JetBrains Mono, monospace',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
};

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
  if (!showIdleParticleModal) return null;

  const handleClose = () => {
    setShowIdleParticleModal(false);
    setSelectedSystemForIdle(null);
    setIsEditingIdle(false);
    setExistingIdleBones([]);
    setIdleBonesList([{ id: Date.now(), boneName: 'head', customBoneName: '' }]);
  };

  const handleInputFocus = (e) => {
    e.target.style.borderColor = 'var(--accent2)';
    e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent2), transparent 80%)';
  };
  const handleInputBlur = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      {/* backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={handleClose}
      />

      {/* modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 520,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 30px rgba(var(--accent-rgb),0.08)',
          overflow: 'hidden',
        }}
      >
        {/* shimmer bar */}
        <div style={{
          height: 3, flexShrink: 0,
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        {/* header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.95rem', letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 700,
            color: 'var(--text)',
          }}>
            {isEditingIdle ? 'Edit Idle Particles' : 'Add Idle Particles'}
          </h2>
          <button
            onClick={handleClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer', transition: 'all 0.22s ease', outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
              e.currentTarget.style.color = 'var(--accent2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
            }}
          >{'\u2715'}</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* system name info */}
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.45)',
          }}>
            VFX System: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{selectedSystemForIdle?.name}</span>
          </div>

          {/* section label */}
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {isEditingIdle ? `Edit idle particles (${idleBonesList.length})` : 'Idle particle bones'}
          </div>

          {/* empty state */}
          {idleBonesList.length === 0 && (
            <div style={{
              padding: '28px 16px',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 8,
              textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.78rem',
              color: 'rgba(255,255,255,0.3)',
            }}>
              No bones yet. Click "Add Bone" below to get started.
            </div>
          )}

          {/* bone entries */}
          {idleBonesList.map((item, index) => (
            <div key={item.id} style={{
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* row header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.75rem', fontWeight: 700,
                  color: 'var(--accent2)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>Bone #{index + 1}</span>
                <button
                  onClick={() => setIdleBonesList(idleBonesList.filter(b => b.id !== item.id))}
                  style={{
                    padding: '3px 10px', borderRadius: 5,
                    fontSize: '0.7rem', fontWeight: 700,
                    color: '#ff6b6b',
                    border: '1px solid rgba(255,107,107,0.3)',
                    background: 'rgba(255,107,107,0.08)',
                    cursor: 'pointer', transition: 'all 0.18s ease', outline: 'none',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,107,107,0.18)';
                    e.currentTarget.style.borderColor = 'rgba(255,107,107,0.55)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,107,107,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255,107,107,0.3)';
                  }}
                >Remove</button>
              </div>

              {/* bone select */}
              <div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)',
                  marginBottom: 6,
                }}>Select bone</div>
                <select
                  value={item.boneName}
                  onChange={(e) => setIdleBonesList(idleBonesList.map(b =>
                    b.id === item.id ? { ...b, boneName: e.target.value } : b
                  ))}
                  style={selectStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                >
                  {BONE_NAMES.map(bone => (
                    <option key={bone} value={bone} style={{ background: '#1a1825', color: '#e0e0e0' }}>
                      {bone}
                    </option>
                  ))}
                </select>
              </div>

              {/* custom bone input */}
              <div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)',
                  marginBottom: 6,
                }}>Or custom bone name</div>
                <input
                  type="text"
                  value={item.customBoneName}
                  onChange={(e) => setIdleBonesList(idleBonesList.map(b =>
                    b.id === item.id ? { ...b, customBoneName: e.target.value } : b
                  ))}
                  placeholder="e.g., r_weapon, C_Head_Jnt"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>
          ))}

          {/* add bone button */}
          <button
            onClick={() => setIdleBonesList([...idleBonesList, { id: Date.now(), boneName: 'head', customBoneName: '' }])}
            style={{
              ...btnBase,
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(255,255,255,0.12)',
              color: 'var(--accent)',
              justifyContent: 'center',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent), transparent 88%)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent), transparent 55%)';
              e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--accent), transparent 70%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            Add Bone
          </button>
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
        }}>
          <button
            onClick={handleConfirmIdleParticles}
            style={{
              ...btnBase,
              background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
              borderColor: 'color-mix(in srgb, var(--accent2), transparent 55%)',
              color: 'var(--accent2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 75%)';
              e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--accent2), transparent 60%)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 35%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent2), transparent 88%)';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent2), transparent 55%)';
            }}
          >
            {isEditingIdle
              ? `Add ${idleBonesList.length} More`
              : `Add ${idleBonesList.length} Idle Particle${idleBonesList.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IdleParticleModal;
