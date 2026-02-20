import React from 'react';

// Memoized input that defers onChange to blur to avoid re-renders while typing
const MemoizedInput = React.memo(({
  value,
  onChange,
  type = 'text',
  placeholder = '',
  min,
  max,
  style = {},
  onKeyPress,
}) => {
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

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    valueRef.current = newValue;
  };

  const handleFocus = () => { isFocusedRef.current = true; };
  const handleBlur = () => {
    isFocusedRef.current = false;
    if (valueRef.current !== value) {
      onChange({ target: { value: valueRef.current } });
    }
  };
  const handleKeyPress = (e) => {
    if (onKeyPress) onKeyPress(e);
    if (e.key === 'Enter') handleBlur();
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyPress={handleKeyPress}
      placeholder={placeholder}
      min={min}
      max={max}
      style={style}
    />
  );
});

const PersistentEffectsModal = ({
  showPersistentModal,
  setShowPersistentModal,
  persistentPreset,
  setPersistentPreset,
  typeOptions,
  typeDropdownOpen,
  setTypeDropdownOpen,
  typeDropdownRef,
  persistentShowSubmeshes,
  setPersistentShowSubmeshes,
  persistentHideSubmeshes,
  setPersistentHideSubmeshes,
  availableSubmeshes,
  customShowSubmeshInput,
  setCustomShowSubmeshInput,
  handleAddCustomShowSubmesh,
  customHideSubmeshInput,
  setCustomHideSubmeshInput,
  handleAddCustomHideSubmesh,
  handleRemoveCustomSubmesh,
  persistentVfx,
  setPersistentVfx,
  effectKeyOptions,
  vfxSearchTerms,
  setVfxSearchTerms,
  vfxDropdownOpen,
  setVfxDropdownOpen,
  existingConditions,
  showExistingConditions,
  setShowExistingConditions,
  handleLoadExistingCondition,
  editingConditionIndex,
  handleApplyPersistent,
}) => {
  if (!showPersistentModal) return null;
  return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          // backdropFilter: 'blur(4px)',
          // WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          paddingLeft: '100px' // Account for left navbar
        }}
      >
        <div
          className="persistent-modal"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            width: '90%',
            maxWidth: 1000,
            height: '80%',
            maxHeight: 700,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)'
          }}>
            <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.5rem', fontWeight: 600 }}>Persistent Effects</h2>
            <button
              onClick={() => setShowPersistentModal(false)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                color: 'var(--accent)',
                cursor: 'pointer',
                // backdropFilter: 'saturate(180%) blur(12px)',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              overflow: 'hidden'
            }}
            onClick={() => {
              setVfxDropdownOpen({}); // Close all dropdowns when clicking in content area
              setShowExistingConditions(false); // Close existing conditions dropdown
            }}
          >
            {/* Left Panel - Condition */}
            <div style={{
              flex: '0 0 380px',
              padding: '1.5rem',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              overflow: 'auto'
            }}>
              <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Condition</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Type:</span>
                  <div style={{ position: 'relative' }} ref={typeDropdownRef}>
                    <button
                      onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 8,
                        color: 'var(--accent)',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))';
                        e.target.style.borderColor = 'rgba(255,255,255,0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))';
                        e.target.style.borderColor = 'rgba(255,255,255,0.15)';
                      }}
                    >
                      <span>{typeOptions.find(opt => opt.value === persistentPreset.type)?.label || persistentPreset.type}</span>
                      <span style={{
                        transform: typeDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        fontSize: '0.8rem'
                      }}>▼</span>
                    </button>

                    {typeDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.75))',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: 8,
                        marginTop: 4,
                        zIndex: 1000,
                        // backdropFilter: 'blur(20px)',
                        // WebkitBackdropFilter: 'blur(20px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        overflow: 'hidden'
                      }}>
                        {typeOptions.map((option) => (
                          <div
                            key={option.value}
                            onClick={() => {
                              setPersistentPreset(p => ({ ...p, type: option.value }));
                              setTypeDropdownOpen(false);
                            }}
                            style={{
                              padding: '12px 16px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              borderBottom: '1px solid rgba(255,255,255,0.1)',
                              color: persistentPreset.type === option.value ? '#ffffff' : 'rgba(255,255,255,0.9)',
                              background: persistentPreset.type === option.value ? 'rgba(255,255,255,0.15)' : 'transparent'
                            }}
                            onMouseEnter={(e) => {
                              if (persistentPreset.type !== option.value) {
                                e.target.style.background = 'rgba(255,255,255,0.1)';
                                e.target.style.color = '#ffffff';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (persistentPreset.type !== option.value) {
                                e.target.style.background = 'transparent';
                                e.target.style.color = 'rgba(255,255,255,0.9)';
                              }
                            }}
                          >
                            <div style={{ fontWeight: persistentPreset.type === option.value ? 600 : 400 }}>
                              {option.label}
                            </div>
                            {option.description && (
                              <div style={{
                                fontSize: '0.75rem',
                                color: 'rgba(255,255,255,0.8)',
                                marginTop: 2
                              }}>
                                {option.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {persistentPreset.type === 'IsAnimationPlaying' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Animation:</span>
                    <MemoizedInput
                      value={persistentPreset.animationName || ''}
                      onChange={e => setPersistentPreset(p => ({ ...p, animationName: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                )}

                {persistentPreset.type === 'HasBuffScript' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Script Name:</span>
                    <MemoizedInput
                      value={persistentPreset.scriptName || ''}
                      onChange={e => setPersistentPreset(p => ({ ...p, scriptName: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                )}

                {persistentPreset.type === 'LearnedSpell' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Slot (0-3):</span>
                    <MemoizedInput
                      type="number"
                      min={0}
                      max={3}
                      value={persistentPreset.slot ?? 3}
                      onChange={e => setPersistentPreset(p => ({ ...p, slot: Number(e.target.value) }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                )}

                {persistentPreset.type === 'HasGear' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Index:</span>
                    <MemoizedInput
                      type="number"
                      min={0}
                      value={persistentPreset.index ?? 0}
                      onChange={e => setPersistentPreset(p => ({ ...p, index: Number(e.target.value) }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                )}

                {persistentPreset.type === 'FloatComparison' && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell Slot:</span>
                      <MemoizedInput
                        type="number"
                        min={0}
                        max={3}
                        value={persistentPreset.slot ?? 3}
                        onChange={e => setPersistentPreset(p => ({ ...p, slot: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Operator:</span>
                      <MemoizedInput
                        type="number"
                        value={persistentPreset.operator ?? 3}
                        onChange={e => setPersistentPreset(p => ({ ...p, operator: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Value:</span>
                      <MemoizedInput
                        type="number"
                        value={persistentPreset.value ?? 1}
                        onChange={e => setPersistentPreset(p => ({ ...p, value: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  </>
                )}

                {persistentPreset.type === 'BuffCounterFloatComparison' && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell Hash:</span>
                      <MemoizedInput
                        type="text"
                        placeholder="Characters/Ezreal/Spells/EzrealPassiveAbility/EzrealPassiveStacks"
                        value={persistentPreset.spellHash ?? ''}
                        onChange={e => setPersistentPreset(p => ({ ...p, spellHash: e.target.value }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Operator:</span>
                      <MemoizedInput
                        type="number"
                        value={persistentPreset.operator ?? 2}
                        onChange={e => setPersistentPreset(p => ({ ...p, operator: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Value:</span>
                      <MemoizedInput
                        type="number"
                        value={persistentPreset.value ?? 5}
                        onChange={e => setPersistentPreset(p => ({ ...p, value: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  </>
                )}

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay On:</span>
                  <MemoizedInput
                    type="number"
                    min={0}
                    value={persistentPreset.delay?.on ?? 0}
                    onChange={e => setPersistentPreset(p => ({ ...p, delay: { ...(p.delay || {}), on: Number(e.target.value) } }))}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      color: 'var(--accent)',
                      fontSize: '0.9rem'
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay Off:</span>
                  <MemoizedInput
                    type="number"
                    min={0}
                    value={persistentPreset.delay?.off ?? 0}
                    onChange={e => setPersistentPreset(p => ({ ...p, delay: { ...(p.delay || {}), off: Number(e.target.value) } }))}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      color: 'var(--accent)',
                      fontSize: '0.9rem'
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Right Panel - Effects */}
            <div style={{
              flex: 1,
              padding: '1.5rem',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}>
              <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Effects</div>

              {/* Submeshes To Show */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To Show</div>

                {/* Custom input for adding new submeshes */}
                <div style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8
                }}>
                  <MemoizedInput
                    type="text"
                    value={customShowSubmeshInput}
                    onChange={e => setCustomShowSubmeshInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddCustomShowSubmesh()}
                    placeholder="Type custom submesh name to show..."
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      color: 'var(--accent)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    onClick={handleAddCustomShowSubmesh}
                    disabled={!customShowSubmeshInput.trim()}
                    style={{
                      padding: '6px 12px',
                      background: customShowSubmeshInput.trim() ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid ' + (customShowSubmeshInput.trim() ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'),
                      borderRadius: 4,
                      color: customShowSubmeshInput.trim() ? 'rgba(34,197,94,1)' : 'rgba(255,255,255,0.4)',
                      fontSize: '0.85rem',
                      cursor: customShowSubmeshInput.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Add
                  </button>
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  maxHeight: 140,
                  overflow: 'auto',
                  padding: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  {availableSubmeshes.map(s => (
                    <label key={`show-${s}`} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: persistentShowSubmeshes.includes(s) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                      borderRadius: 4,
                      border: '1px solid ' + (persistentShowSubmeshes.includes(s) ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'),
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={persistentShowSubmeshes.includes(s)}
                        onChange={e => setPersistentShowSubmeshes(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                        style={{ margin: 0 }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                    </label>
                  ))}

                  {/* Display custom submeshes that are not in availableSubmeshes */}
                  {persistentShowSubmeshes.filter(s => !availableSubmeshes.includes(s)).map(s => (
                    <div key={`custom-show-${s}`} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: 'rgba(34,197,94,0.15)',
                      borderRadius: 4,
                      border: '1px solid rgba(34,197,94,0.3)',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{ color: 'rgba(34,197,94,1)' }}>✓</span>
                      <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                      <button
                        onClick={() => handleRemoveCustomSubmesh(s, 'show')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(239,68,68,0.8)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '0.8rem',
                          borderRadius: 2
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submeshes To Hide */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To Hide</div>

                {/* Custom input for adding new submeshes */}
                <div style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8
                }}>
                  <MemoizedInput
                    type="text"
                    value={customHideSubmeshInput}
                    onChange={e => setCustomHideSubmeshInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddCustomHideSubmesh()}
                    placeholder="Type custom submesh name to hide..."
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      color: 'var(--accent)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    onClick={handleAddCustomHideSubmesh}
                    disabled={!customHideSubmeshInput.trim()}
                    style={{
                      padding: '6px 12px',
                      background: customHideSubmeshInput.trim() ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid ' + (customHideSubmeshInput.trim() ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'),
                      borderRadius: 4,
                      color: customHideSubmeshInput.trim() ? 'rgba(239,68,68,1)' : 'rgba(255,255,255,0.4)',
                      fontSize: '0.85rem',
                      cursor: customHideSubmeshInput.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Add
                  </button>
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  maxHeight: 140,
                  overflow: 'auto',
                  padding: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  {availableSubmeshes.map(s => (
                    <label key={`hide-${s}`} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: persistentHideSubmeshes.includes(s) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                      borderRadius: 4,
                      border: '1px solid ' + (persistentHideSubmeshes.includes(s) ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'),
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={persistentHideSubmeshes.includes(s)}
                        onChange={e => setPersistentHideSubmeshes(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                        style={{ margin: 0 }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                    </label>
                  ))}

                  {/* Display custom submeshes that are not in availableSubmeshes */}
                  {persistentHideSubmeshes.filter(s => !availableSubmeshes.includes(s)).map(s => (
                    <div key={`custom-hide-${s}`} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: 'rgba(239,68,68,0.15)',
                      borderRadius: 4,
                      border: '1px solid rgba(239,68,68,0.3)',
                      fontSize: '0.85rem'
                    }}>
                      <span style={{ color: 'rgba(239,68,68,1)' }}>✓</span>
                      <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                      <button
                        onClick={() => handleRemoveCustomSubmesh(s, 'hide')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(239,68,68,0.8)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '0.8rem',
                          borderRadius: 2
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Persistent VFX */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Persistent VFX</div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  flex: 1,
                  overflow: 'auto',
                  padding: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  {persistentVfx.map((v, idx) => (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr auto',
                      gap: 12,
                      alignItems: 'start',
                      padding: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      {/* Effect Selection */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Effect Key:</span>
                        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder="Search or select effect key..."
                            value={vfxSearchTerms[idx] || (v.id ? (effectKeyOptions.find(o => o.id === v.id)?.label || '').split(' → ')[0].split(' - ')[0] || '' : '')}
                            onChange={e => {
                              const newValue = e.target.value;
                              setVfxSearchTerms(prev => ({ ...prev, [idx]: newValue }));
                              setVfxDropdownOpen(prev => ({ ...prev, [idx]: true }));
                            }}
                            onFocus={() => setVfxDropdownOpen(prev => ({ ...prev, [idx]: true }))}
                            style={{
                              padding: '8px 12px',
                              paddingRight: '32px',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: 4,
                              color: 'var(--accent)',
                              fontSize: '0.85rem',
                              width: '100%'
                            }}
                          />
                          <button
                            onClick={() => setVfxDropdownOpen(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255,255,255,0.6)',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            {vfxDropdownOpen[idx] ? '▲' : '▼'}
                          </button>

                          {vfxDropdownOpen[idx] && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              background: 'rgba(20,20,20,0.98)',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 4,
                              maxHeight: '120px',
                              overflow: 'auto',
                              zIndex: 9999,
                              // backdropFilter: 'blur(15px)',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                            }}>
                              {effectKeyOptions
                                .filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase()))
                                .slice(0, 50) // Limit to first 50 results
                                .map(o => (
                                  <div
                                    key={o.id}
                                    onClick={() => {
                                      setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, id: o.id, key: o.key, value: o.value } : x));
                                      setVfxSearchTerms(prev => ({ ...prev, [idx]: o.label.split(' → ')[0].split(' - ')[0] }));
                                      setVfxDropdownOpen(prev => ({ ...prev, [idx]: false }));
                                    }}
                                    style={{
                                      padding: '8px 12px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                      color: 'rgba(255,255,255,0.9)',
                                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                                      transition: 'background 0.1s ease'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                  >
                                    {o.label.split(' → ')[0].split(' - ')[0]}
                                  </div>
                                ))}
                              {effectKeyOptions.filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase())).length === 0 && (
                                <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                                  No effects found
                                </div>
                              )}
                              {effectKeyOptions.filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase())).length > 50 && (
                                <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                  Showing first 50 results. Type to search...
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bone Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Bone Name:</span>
                        <input
                          placeholder="C_Buffbone_Glb_Layout_Loc"
                          value={v.boneName || ''}
                          onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, boneName: e.target.value } : x))}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 4,
                            color: 'var(--accent)',
                            fontSize: '0.85rem'
                          }}
                        />
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => setPersistentVfx(list => list.filter((_, i) => i !== idx))}
                        style={{
                          background: 'rgba(239,68,68,0.15)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 4,
                          color: '#ff6b6b',
                          cursor: 'pointer',
                          padding: '8px',
                          fontSize: '16px',
                          width: '36px',
                          height: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(239,68,68,0.25)'}
                        onMouseLeave={(e) => e.target.style.background = 'rgba(239,68,68,0.15)'}
                      >
                        🗑
                      </button>

                      {/* Options */}
                      <div style={{
                        gridColumn: '1 / -1',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={!!v.ownerOnly}
                            onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, ownerOnly: e.target.checked } : x))}
                          />
                          <span style={{ color: 'rgba(255,255,255,0.8)' }}>Owner Only</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={!!v.attachToCamera}
                            onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, attachToCamera: e.target.checked } : x))}
                          />
                          <span style={{ color: 'rgba(255,255,255,0.8)' }}>Attach to Camera</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={!!v.forceRenderVfx}
                            onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, forceRenderVfx: e.target.checked } : x))}
                          />
                          <span style={{ color: 'rgba(255,255,255,0.8)' }}>Force Render VFX</span>
                        </label>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setPersistentVfx(list => [...list, {}])}
                    style={{
                      padding: '12px',
                      background: 'rgba(34,197,94,0.15)',
                      border: '2px dashed rgba(34,197,94,0.3)',
                      borderRadius: 6,
                      color: '#4ade80',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(34,197,94,0.2)';
                      e.target.style.borderColor = 'rgba(34,197,94,0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(34,197,94,0.15)';
                      e.target.style.borderColor = 'rgba(34,197,94,0.3)';
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>＋</span>
                    Add VFX
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '1.5rem',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.02)'
          }}>
            {/* Left side - Load Existing */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExistingConditions(!showExistingConditions)}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 8,
                  color: '#60a5fa',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(59,130,246,0.2)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(59,130,246,0.15)'}
              >
                📂 Load Existing ({existingConditions.length})
              </button>

              {showExistingConditions && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: '8px',
                  background: 'rgba(20,20,20,0.98)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  minWidth: '300px',
                  maxHeight: '200px',
                  overflow: 'auto',
                  zIndex: 10000,
                  // backdropFilter: 'blur(15px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}>
                  {existingConditions.length === 0 ? (
                    <div style={{ padding: '12px', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                      No existing conditions found
                    </div>
                  ) : (
                    existingConditions.map((condition, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleLoadExistingCondition(condition)}
                        style={{
                          padding: '12px 16px',
                          cursor: 'pointer',
                          borderBottom: idx < existingConditions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          transition: 'background 0.1s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                      >
                        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', fontWeight: 500 }}>
                          {condition.label}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: '2px' }}>
                          {condition.vfx.length} VFX • {condition.submeshesShow.length} Show • {condition.submeshesHide.length} Hide
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Right side - Action buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              {editingConditionIndex !== null && (
                <div style={{
                  padding: '10px 16px',
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 8,
                  color: '#fbbf24',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  ✏️ Editing Condition {editingConditionIndex + 1}
                </div>
              )}
              <button
                onClick={() => setShowPersistentModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 8,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.06)'}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyPersistent}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
                  border: '1px solid rgba(34,197,94,0.32)',
                  borderRadius: 8,
                  color: '#eaffef',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.3), rgba(22,163,74,0.25)'}
                onMouseLeave={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18)'}
              >
                {editingConditionIndex !== null ? 'Update' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
};

export default PersistentEffectsModal;
