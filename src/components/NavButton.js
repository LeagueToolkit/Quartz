import React, { useState } from 'react';

const NavButton = ({ 
  children, 
  isActive = false, 
  isSubpage = false, 
  onClick, 
  className = '',
  title 
}) => {
  const [suppressTooltip, setSuppressTooltip] = useState(false);

  const handleClick = (e) => {
    if (onClick) onClick();
    setSuppressTooltip(true);
    e.currentTarget.blur();
  };

  const handleMouseLeave = () => {
    if (suppressTooltip) setSuppressTooltip(false);
  };

  const handleBlur = () => {
    if (suppressTooltip) setSuppressTooltip(false);
  };

  return (
    <button
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
      aria-label={title}
      data-tooltip={!suppressTooltip ? title : undefined}
      className={`nav-button ${isActive ? 'active' : ''} ${isSubpage ? 'subpage-active' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

export default NavButton;




