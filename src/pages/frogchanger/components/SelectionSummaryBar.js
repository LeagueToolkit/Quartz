import React from 'react';

const SelectionSummaryBar = ({
  selectedSkins,
  isExtracting,
  isRepathing,
  isSetupValid,
  onExtract,
  onRepath,
  onInspectModel,
  onClearAll,
}) => {
  if (selectedSkins.length === 0) {
    return null;
  }

  const disabledAction = isExtracting || isRepathing || !isSetupValid || selectedSkins.length === 0;

  const baseButton = {
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: '0.76rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    border: '1px solid rgba(255,255,255,0.14)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 98,
  };

  const actionButtonStyle = (kind, disabled) => {
    if (disabled) {
      return {
        ...baseButton,
        opacity: 0.5,
        cursor: 'not-allowed',
        background: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.14)',
        boxShadow: 'none',
      };
    }

    if (kind === 'extract') {
      return {
        ...baseButton,
        background: 'color-mix(in srgb, var(--accent-green), transparent 70%)',
        color: 'var(--accent-green)',
        borderColor: 'color-mix(in srgb, var(--accent-green), transparent 40%)',
        boxShadow: '0 0 16px color-mix(in srgb, var(--accent-green), transparent 68%)',
      };
    }

    if (kind === 'repath') {
      return {
        ...baseButton,
        background: 'color-mix(in srgb, #3d7dff, transparent 72%)',
        color: '#b7cbff',
        borderColor: 'color-mix(in srgb, #5f91ff, transparent 42%)',
        boxShadow: '0 0 16px color-mix(in srgb, #3d7dff, transparent 70%)',
      };
    }

    if (kind === 'inspect') {
      return {
        ...baseButton,
        background: 'color-mix(in srgb, var(--accent2), transparent 72%)',
        color: 'var(--accent2)',
        borderColor: 'color-mix(in srgb, var(--accent2), transparent 44%)',
        boxShadow: '0 0 16px color-mix(in srgb, var(--accent2), transparent 70%)',
      };
    }

    return {
      ...baseButton,
      background: 'rgba(255,255,255,0.03)',
      color: 'rgba(255,255,255,0.82)',
      borderColor: 'rgba(255,255,255,0.12)',
      boxShadow: 'none',
    };
  };

  const HoverActionButton = ({ kind, disabled, onClick, children }) => {
    const [hovered, setHovered] = React.useState(false);
    const isInteractive = !disabled;
    const baseStyle = actionButtonStyle(kind, disabled);

    const hoverStyle = !isInteractive || !hovered ? {} : {
      transform: 'translateY(-1px) scale(1.045)',
      boxShadow: kind === 'extract'
        ? '0 0 18px color-mix(in srgb, var(--accent-green), transparent 58%)'
        : kind === 'repath'
          ? '0 0 18px color-mix(in srgb, #3d7dff, transparent 58%)'
          : kind === 'inspect'
            ? '0 0 18px color-mix(in srgb, var(--accent2), transparent 58%)'
            : '0 0 12px rgba(255,255,255,0.18)',
      borderColor: kind === 'extract'
        ? 'color-mix(in srgb, var(--accent-green), transparent 26%)'
        : kind === 'repath'
          ? 'color-mix(in srgb, #5f91ff, transparent 28%)'
          : kind === 'inspect'
            ? 'color-mix(in srgb, var(--accent2), transparent 30%)'
            : 'rgba(255,255,255,0.24)',
    };

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...baseStyle,
          ...hoverStyle,
          transition: 'transform 0.16s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease',
        }}
      >
        {children}
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        right: 14,
        zIndex: 50,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(12, 14, 24, 0.68)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.03), 0 18px 44px rgba(0,0,0,0.46)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 62%)',
          opacity: 0.28,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '-25% -35%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0) 56%)',
          transform: 'translateX(-25%)',
          animation: 'liquidSheen 11s ease-in-out infinite',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.14,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            minWidth: 220,
            flex: '1 1 320px',
            padding: '2px 2px',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Selected Skins ({selectedSkins.length})
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.97)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedSkins.map((skin, index) => (
              <span key={index}>
                {typeof skin === 'string'
                  ? skin
                  : `${skin.name}${skin.champion?.name ? ` (${skin.champion.name})` : ''}`}
                {index < selectedSkins.length - 1 && ', '}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HoverActionButton
            kind="extract"
            onClick={onExtract}
            disabled={disabledAction}
          >
            {isExtracting && (
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            )}
            {isExtracting ? 'Extracting...' : 'Extract WAD'}
          </HoverActionButton>
          <HoverActionButton
            kind="repath"
            onClick={onRepath}
            disabled={disabledAction}
          >
            {isRepathing && (
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            )}
            {isRepathing ? 'Repathing...' : 'Repath'}
          </HoverActionButton>
          <HoverActionButton
            kind="inspect"
            onClick={onInspectModel}
            disabled={disabledAction}
          >
            Inspect Model
          </HoverActionButton>
          <HoverActionButton
            kind="ghost"
            onClick={onClearAll}
            disabled={isExtracting || isRepathing}
          >
            Clear All
          </HoverActionButton>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes liquidSheen {
          0% { transform: translateX(-24%); opacity: 0.2; }
          50% { transform: translateX(24%); opacity: 0.34; }
          100% { transform: translateX(-24%); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
};

export default SelectionSummaryBar;
