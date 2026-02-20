import React, { useState, useEffect, useRef } from 'react';
import { Check, AlertTriangle, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

const SettingsCard = ({ title, icon, expanded, onToggle, children, hasWallpaper = false }) => (
  <div style={{
    background: hasWallpaper ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    overflow: 'visible',
    transition: 'all 0.2s ease',
    height: 'fit-content',
    maxHeight: 'none',
    backdropFilter: hasWallpaper ? 'blur(16px) saturate(180%)' : 'none',
    WebkitBackdropFilter: hasWallpaper ? 'blur(16px) saturate(180%)' : 'none',
    zIndex: expanded ? 10 : 1,
    position: 'relative', // Ensure z-index works
    boxShadow: hasWallpaper ? '0 4px 30px rgba(0, 0, 0, 0.3)' : 'none'
  }}>
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onToggle) {
          onToggle();
        }
      }}
      type="button"
      style={{
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        color: 'var(--accent)',
        fontFamily: 'inherit',
        fontSize: '16px',
        fontWeight: 'bold'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <span>{title}</span>
      </div>
      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
    {expanded && (
      <div style={{
        padding: '0 20px 20px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'visible'
      }}>
        {children}
      </div>
    )}
  </div>
);

const FormGroup = ({ label, description, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div>
      <label style={{
        fontSize: '13px',
        fontWeight: '600',
        color: 'var(--accent2)',
        display: 'block'
      }}>
        {label}
      </label>
      {description && (
        <span style={{
          fontSize: '11px',
          color: 'var(--text)',
          opacity: 0.5,
          display: 'block',
          marginTop: '2px'
        }}>
          {description}
        </span>
      )}
    </div>
    {children}
  </div>
);

const Input = ({ icon, wrapperStyle, ...props }) => (
  <div style={{ position: 'relative', ...wrapperStyle }}>
    {icon && (
      <div style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--accent2)',
        pointerEvents: 'none'
      }}>
        {icon}
      </div>
    )}
    <input
      {...props}
      style={{
        width: '100%',
        padding: icon ? '10px 12px 10px 36px' : '10px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--accent)',
        fontSize: '13px',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'all 0.2s ease',
        ...props.style
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--accent)';
        e.target.style.background = 'rgba(255, 255, 255, 0.05)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        e.target.style.background = 'rgba(255, 255, 255, 0.03)';
      }}
    />
  </div>
);

const CustomSelect = ({ value, onChange, options, icon, disabled, placeholder = "Select..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', opacity: disabled ? 0.6 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: icon ? '10px 32px 10px 36px' : '10px 32px 10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: isOpen ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          color: 'var(--accent)',
          fontSize: '13px',
          fontFamily: 'inherit',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          position: 'relative'
        }}
      >
        {icon && (
          <div style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent2)',
            pointerEvents: 'none'
          }}>
            {icon}
          </div>
        )}
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : placeholder}
        </span>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent2)',
            pointerEvents: 'none',
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)'
          }}
        />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#121212', // Opaque background
          border: '1px solid var(--accent)',
          borderRadius: '6px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          maxHeight: '250px',
          overflowY: 'auto'
        }}
          className="theme-scrollbar"
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: value === option.value ? 'var(--accent)' : 'var(--text)',
                background: value === option.value ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                transition: 'background 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: option.fontFamily || 'inherit', // Preview font if available
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>{option.label || option.value}</span>
              {value === option.value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const InputWithButton = ({ buttonIcon, buttonText, onButtonClick, ...props }) => (
  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
    <Input {...props} wrapperStyle={{ flex: 1 }} />
    <Button icon={buttonIcon} variant="secondary" onClick={onButtonClick}>
      {buttonText}
    </Button>
  </div>
);

const InputWithToggle = ({ showValue, onToggle, ...props }) => (
  <div style={{ position: 'relative' }}>
    <Input {...props} />
    <button
      onClick={onToggle}
      style={{
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        padding: '4px',
        cursor: 'pointer',
        color: 'var(--accent2)',
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.2s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent2)'}
    >
      {showValue ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
);

const Button = ({ icon, children, variant = 'primary', fullWidth, hasWallpaper = false, ...props }) => {
  // Check if parent has wallpaper by checking if we're inside a SettingsCard with hasWallpaper
  // For now, we'll use the hasWallpaper prop directly
  const isInWallpaperContext = hasWallpaper;

  return (
    <button
      {...props}
      style={{
        padding: '10px 16px',
        background: variant === 'primary'
          ? 'var(--accent)'
          : isInWallpaperContext
            ? 'rgba(0, 0, 0, 0.6)'
            : 'rgba(255, 255, 255, 0.03)',
        color: variant === 'primary' ? 'var(--bg)' : 'var(--accent2)',
        border: variant === 'primary' ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
        opacity: props.disabled ? 0.6 : 1,
        pointerEvents: props.disabled ? 'none' : 'auto',
        backdropFilter: isInWallpaperContext ? 'blur(12px) saturate(180%)' : 'none',
        WebkitBackdropFilter: isInWallpaperContext ? 'blur(12px) saturate(180%)' : 'none',
        boxShadow: isInWallpaperContext ? '0 2px 12px rgba(0, 0, 0, 0.4)' : 'none',
        ...(props.style || {})
      }}
      onMouseEnter={(e) => {
        if (variant === 'primary') {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 90%, black)';
        } else {
          e.currentTarget.style.background = isInWallpaperContext ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'var(--accent)';
        }
      }}
      onMouseLeave={(e) => {
        if (variant === 'primary') {
          e.currentTarget.style.background = 'var(--accent)';
        } else {
          e.currentTarget.style.background = isInWallpaperContext ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }}
    >
      {icon}
      {children}
    </button>
  );
};

const ToggleSwitch = ({ label, checked, onChange, compact }) => (
  <label style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    cursor: 'pointer',
    padding: compact ? '6px 0' : '10px 0',
    userSelect: 'none'
  }}>
    <span style={{
      fontSize: compact ? '12px' : '13px',
      color: 'var(--text)',
      fontWeight: '400',
      flex: 1
    }}>
      {label}
    </span>
    <div
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{
        width: '44px',
        height: '24px',
        background: checked
          ? 'var(--accent)'
          : 'rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        position: 'relative',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
        border: checked
          ? 'none'
          : '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: checked
          ? '0 0 0 2px rgba(139, 92, 246, 0.2), 0 2px 8px rgba(139, 92, 246, 0.3)'
          : 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        if (!checked) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!checked) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        background: checked ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
        borderRadius: '50%',
        position: 'absolute',
        top: '3px',
        left: checked ? '23px' : '3px',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: checked
          ? '0 2px 6px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
          : '0 1px 3px rgba(0, 0, 0, 0.2)'
      }} />
    </div>
  </label>
);

const ThemeCard = ({ theme, selected, onClick }) => {
  // Handle both object format { id, name, desc } and string format
  const themeId = typeof theme === 'string' ? theme : theme.id;
  const themeName = typeof theme === 'string' ? theme : theme.name;
  const themeDesc = typeof theme === 'string' ? 'Custom Theme' : theme.desc;
  const isCustom = typeof themeId === 'string' && themeId.startsWith('custom:');

  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px',
        background: selected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        border: `2px solid ${selected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        fontFamily: 'inherit'
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        }
      }}
    >
      <div style={{
        fontSize: '13px',
        fontWeight: 'bold',
        color: 'var(--accent)',
        marginBottom: '4px'
      }}>
        {themeName}
      </div>
      <div style={{
        fontSize: '11px',
        color: 'var(--accent2)',
        opacity: 0.7
      }}>
        {themeDesc}
      </div>
    </button>
  );
};

const StatusBadge = ({ status, text }) => (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: status === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
    border: `1px solid ${status === 'success' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
    borderRadius: '6px',
    fontSize: '12px',
    color: status === 'success' ? '#4ade80' : '#fbbf24'
  }}>
    {status === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
    {text}
  </div>
);

export {
  SettingsCard,
  FormGroup,
  Input,
  CustomSelect,
  InputWithButton,
  InputWithToggle,
  Button,
  ToggleSwitch,
  ThemeCard,
  StatusBadge
};

